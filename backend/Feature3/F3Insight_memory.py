import chromadb
import requests
import uuid

# ================= CONFIG =================

OLLAMA_URL = "http://localhost:11434/api/embed"

EMBED_MODEL = "mxbai-embed-large"
# EMBED_MODEL = "nomic-embed-text"

client = chromadb.PersistentClient(path="./F3memory_db")

collection = client.get_or_create_collection(
    name="portfolio_memory"
)

# ================= BATCH EMBEDDINGS =================

def generate_embeddings(texts):

    try:
        response = requests.post(
            OLLAMA_URL,
            json={
                "model": EMBED_MODEL,
                "input": texts
            },
            timeout=30,
        )
    except requests.exceptions.ConnectionError as e:
        raise RuntimeError(
            f"Ollama is not reachable at {OLLAMA_URL}. "
            "Start it with `ollama serve` (or launch the Ollama app)."
        ) from e

    if response.status_code == 404 or (
        response.status_code >= 400
        and "not found" in response.text.lower()
        and "model" in response.text.lower()
    ):
        raise RuntimeError(
            f"Embedding model '{EMBED_MODEL}' is not installed in Ollama. "
            f"Run: `ollama pull {EMBED_MODEL}`"
        )

    response.raise_for_status()

    data = response.json()

    if "embeddings" in data:
        return data["embeddings"]

    print("[memory] Unexpected embedding response:")
    print(data)

    return []

# ================= SINGLE EMBEDDING =================

def generate_embedding(text):

    embeddings = generate_embeddings([text])

    if embeddings and len(embeddings) > 0:
        return embeddings[0]

    return []

# ================= BATCH STORE =================

def store_memories_batch(memories):

    documents = []
    metadatas = []
    ids = []

    for memory in memories:

        memory_text = f"""
USER:
{memory['user']}

ASSISTANT:
{memory['assistant']}
""".strip()

        documents.append(memory_text)

        metadatas.append({
            "type": "portfolio_memory",
            "section": memory["section"]
        })

        ids.append(str(uuid.uuid4()))

    # ONE embedding request
    embeddings = generate_embeddings(documents)

    if not embeddings:
        print("[memory] Failed to generate embeddings")
        return

    # ONE database insert
    collection.add(
        ids=ids,
        embeddings=embeddings,
        documents=documents,
        metadatas=metadatas
    )

    print(f"[memory] Stored {len(documents)} memories")
    total = collection.count()
    print(f"[memory] Total memories in DB: {total}")

# ================= FILTERED RETRIEVAL =================

def retrieve_memories_by_intent(query, intent="general", n_results=5):

    print("\n=== MEMORY SEARCH (FILTERED) ===")
    print("Query:", query)
    print("Intent:", intent)

    query_embedding = generate_embedding(query)

    if not query_embedding:
        print("[memory] Empty query embedding")
        return []

    query_embedding = [float(x) for x in query_embedding]

    where_filter = (
        {"section": intent}
        if intent != "general"
        else None
    )

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=n_results,
        where=where_filter
    )

    docs = results.get("documents", [[]])

    return docs[0] if docs and docs[0] else []