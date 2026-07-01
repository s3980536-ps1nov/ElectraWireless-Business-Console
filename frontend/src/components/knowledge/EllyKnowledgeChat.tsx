import { useRef, useEffect, useState } from "react";
import {
  Send, Sparkles, RotateCcw, Loader2, User,
} from "lucide-react";
import { useKnowledgeStore } from "@/store/knowledgeStore";
import type { KnowledgeChatMessage } from "@/store/knowledgeStore";
import { C_PRIMARY, C_BORDER, C_ERROR } from "@/lib/colors";

const STARTERS = [
  "What is a burn rate and how do I improve mine?",
  "How do SaaS companies make money?",
  "What is the 50/30/20 budget rule?",
  "How do I diversify my investment portfolio?",
];

function EllyAvatar() {
  return (
    <div style={{
      width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
      background: `linear-gradient(135deg, ${C_PRIMARY}, #8b5cf6)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: `0 2px 8px ${C_PRIMARY}30`,
    }}>
      <Sparkles size={13} color="#fff" />
    </div>
  );
}

function UserAvatar() {
  return (
    <div style={{
      width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
      background: `${C_PRIMARY}12`, border: `1.5px solid ${C_PRIMARY}25`,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <User size={13} color={C_PRIMARY} />
    </div>
  );
}

// Renders markdown-style text: ## headers, - bullets, **bold**
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**")
          ? <strong key={i}>{part.slice(2, -2)}</strong>
          : <span key={i}>{part}</span>
      )}
    </>
  );
}

function RichText({ text }: { text: string }) {
  if (!text) return null;
  const nodes: React.ReactNode[] = [];
  const buf: string[] = [];

  const flushBuf = (key: string | number) => {
    if (!buf.length) return;
    nodes.push(
      <ul key={`ul-${key}`} style={{ margin: "3px 0 7px", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
        {buf.splice(0).map((item, i) => (
          <li key={i} style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
            <span style={{ color: C_PRIMARY, flexShrink: 0, fontWeight: 700, lineHeight: 1.65, fontSize: 12 }}>•</span>
            <span style={{ fontSize: 12.5, lineHeight: 1.65, color: "#3a3a3a" }}>{renderInline(item)}</span>
          </li>
        ))}
      </ul>
    );
  };

  text.split("\n").forEach((line, idx) => {
    if (line.startsWith("## ")) {
      flushBuf(idx);
      nodes.push(
        <div key={idx} style={{
          fontSize: 13.5, fontWeight: 700, color: C_PRIMARY,
          marginTop: nodes.length > 0 ? 16 : 0, marginBottom: 6,
          paddingBottom: 5, borderBottom: `1.5px solid ${C_PRIMARY}22`,
        }}>
          {renderInline(line.slice(3))}
        </div>
      );
    } else if (line.startsWith("### ")) {
      flushBuf(idx);
      nodes.push(
        <div key={idx} style={{ fontSize: 12.5, fontWeight: 700, color: "#444", marginTop: 10, marginBottom: 3 }}>
          {renderInline(line.slice(4))}
        </div>
      );
    } else if (/^[-*]\s/.test(line)) {
      buf.push(line.replace(/^[-*]\s/, ""));
    } else if (line.trim() === "") {
      flushBuf(idx);
      if (nodes.length > 0) nodes.push(<div key={idx} style={{ height: 5 }} />);
    } else {
      flushBuf(idx);
      nodes.push(
        <p key={idx} style={{ margin: "2px 0", fontSize: 13, lineHeight: 1.75, color: "#2d2d2d" }}>
          {renderInline(line)}
        </p>
      );
    }
  });

  flushBuf("end");
  return <div style={{ display: "flex", flexDirection: "column" }}>{nodes}</div>;
}

function MessageRow({ msg }: { msg: KnowledgeChatMessage }) {
  if (msg.role === "user") {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, alignItems: "flex-start" }}>
        <div style={{
          maxWidth: "74%", background: C_PRIMARY, color: "#fff",
          borderRadius: "16px 16px 4px 16px",
          padding: "10px 14px", fontSize: 13, lineHeight: 1.6,
        }}>
          {msg.text}
        </div>
        <UserAvatar />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
      <EllyAvatar />
      <div style={{
        flex: 1,
        background: "rgba(255,255,255,0.78)", backdropFilter: "blur(14px)",
        border: `1.5px solid ${C_BORDER}`,
        borderRadius: "4px 16px 16px 16px",
        padding: "12px 14px",
      }}>
        {msg.state === "loading" && (
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <Loader2 size={13} style={{ animation: "spin 1s linear infinite", color: C_PRIMARY }} />
            <span style={{ fontSize: 12, color: "#999" }}>Elly is thinking…</span>
          </div>
        )}
        {msg.state === "error" && (
          <span style={{ fontSize: 12.5, color: C_ERROR }}>{msg.error}</span>
        )}
        {msg.state === "done" && <RichText text={msg.text} />}
      </div>
    </div>
  );
}

interface Props {
  sending: boolean;
  onSend: (question: string) => void;
}

export function EllyKnowledgeChat({ sending, onSend }: Props) {
  const { messages, clearChat } = useKnowledgeStore();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSend(question: string) {
    const q = question.trim();
    if (!q || sending) return;
    setInput("");
    onSend(q);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  const canSend = !!input.trim() && !sending;

  return (
    <div style={{
      width: 360, flexShrink: 0,
      borderLeft: `1.5px solid ${C_BORDER}`,
      display: "flex", flexDirection: "column",
      background: "rgba(255,255,255,0.22)", backdropFilter: "blur(12px)",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        flexShrink: 0,
        padding: "14px 16px 12px",
        borderBottom: `1.5px solid ${C_BORDER}`,
        display: "flex", alignItems: "center", gap: 9,
      }}>
        <div style={{
          width: 30, height: 30, borderRadius: "50%",
          background: `linear-gradient(135deg, ${C_PRIMARY}, #8b5cf6)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: `0 4px 12px ${C_PRIMARY}35`,
        }}>
          <Sparkles size={13} color="#fff" />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C_PRIMARY }}>Ask Elly</div>
          <div style={{ fontSize: 10.5, color: "#999", marginTop: 1 }}>Knowledge & learning assistant</div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            title="Clear conversation"
            style={{
              marginLeft: "auto", background: "none", border: `1.5px solid ${C_BORDER}`,
              borderRadius: 7, padding: "4px 8px", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 4,
              fontSize: 10.5, color: "#aaa",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = C_ERROR; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#aaa"; }}
          >
            <RotateCcw size={11} /> Clear
          </button>
        )}
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: "auto",
        padding: "14px 14px 10px",
        display: "flex", flexDirection: "column", gap: 16,
      }}>
        {messages.length === 0 && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", flex: 1, gap: 20, padding: "20px 0",
          }}>
            <div style={{ textAlign: "center", maxWidth: 280 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: "#2d2d2d", marginBottom: 6 }}>
                Ask Elly anything
              </div>
              <div style={{ fontSize: 12, color: "#999", lineHeight: 1.6 }}>
                Financial concepts, business questions, or advice tailored to your data.
              </div>
            </div>
            <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 7 }}>
              {STARTERS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(s)}
                  disabled={sending}
                  style={{
                    background: "rgba(255,255,255,0.7)", border: `1.5px solid ${C_BORDER}`,
                    borderRadius: 9, padding: "9px 12px", fontSize: 12, color: "#555",
                    cursor: "pointer", textAlign: "left", lineHeight: 1.45,
                    fontFamily: "inherit", transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = `${C_PRIMARY}55`;
                    (e.currentTarget as HTMLButtonElement).style.color = C_PRIMARY;
                    (e.currentTarget as HTMLButtonElement).style.background = `${C_PRIMARY}08`;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = C_BORDER;
                    (e.currentTarget as HTMLButtonElement).style.color = "#555";
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.7)";
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <MessageRow key={msg.id} msg={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        flexShrink: 0,
        borderTop: `1.5px solid ${C_BORDER}`,
        padding: "12px 14px",
        display: "flex", flexDirection: "column", gap: 7,
      }}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend(input);
              }
            }}
            disabled={sending}
            placeholder="Ask a financial question… (Enter to send)"
            rows={2}
            style={{
              flex: 1, resize: "none", borderRadius: 10,
              border: `1.5px solid ${C_BORDER}`,
              padding: "9px 12px", fontSize: 12.5, lineHeight: 1.5,
              fontFamily: "inherit", outline: "none",
              background: "rgba(255,255,255,0.75)", color: "#333",
              transition: "border-color 0.15s", maxHeight: 100,
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = `${C_PRIMARY}55`)}
            onBlur={(e) => (e.currentTarget.style.borderColor = C_BORDER)}
          />
          <button
            onClick={() => handleSend(input)}
            disabled={!canSend}
            style={{
              width: 38, height: 38, borderRadius: 9, border: "none",
              cursor: canSend ? "pointer" : "not-allowed",
              background: canSend
                ? `linear-gradient(135deg, ${C_PRIMARY}, #8b5cf6)`
                : "#e8e8e8",
              color: canSend ? "#fff" : "#bbb",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, transition: "all 0.15s",
            }}
          >
            {sending
              ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
              : <Send size={14} />}
          </button>
        </div>
        <div style={{ fontSize: 10, color: "#ccc" }}>
          Shift+Enter for new line · Context-aware · Powered by Llama
        </div>
      </div>

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
