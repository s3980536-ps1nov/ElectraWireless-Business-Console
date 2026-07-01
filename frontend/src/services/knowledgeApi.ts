import axios from "axios";

const BASE_URL =
  ((import.meta as unknown) as { env: Record<string, string> }).env
    .VITE_API_URL ?? "http://localhost:8000";

export const knowledgeApiClient = axios.create({ baseURL: BASE_URL });

// ── Chat ─────────────────────────────────────────────────────────────────────

export interface KnowledgeChatPayload {
  question: string;
  user_id?: string;
}

export interface KnowledgeChatResponse {
  answer: string;
  topics: string[];
}

export async function sendKnowledgeChat(
  payload: KnowledgeChatPayload,
): Promise<KnowledgeChatResponse> {
  const res = await knowledgeApiClient.post<KnowledgeChatResponse>(
    "/knowledge/chat",
    payload,
  );
  return res.data;
}

// ── Goals ────────────────────────────────────────────────────────────────────

export interface GoalResponse {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  source_feature: string;
  stage: string;
  next_step?: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface GoalCreatePayload {
  title: string;
  description?: string;
  source_feature?: string;
  stage?: string;
  next_step?: string;
}

export interface GoalUpdatePayload {
  title?: string;
  description?: string;
  stage?: string;
  next_step?: string;
}

export async function fetchGoals(): Promise<GoalResponse[]> {
  const res = await knowledgeApiClient.get<GoalResponse[]>("/knowledge/goals");
  return res.data;
}

export async function createGoal(
  payload: GoalCreatePayload,
): Promise<GoalResponse> {
  const res = await knowledgeApiClient.post<GoalResponse>(
    "/knowledge/goals",
    payload,
  );
  return res.data;
}

export async function updateGoal(
  id: string,
  patch: GoalUpdatePayload,
): Promise<GoalResponse> {
  const res = await knowledgeApiClient.put<GoalResponse>(
    `/knowledge/goals/${id}`,
    patch,
  );
  return res.data;
}

export async function deleteGoal(id: string): Promise<void> {
  await knowledgeApiClient.delete(`/knowledge/goals/${id}`);
}

// ── Resources ────────────────────────────────────────────────────────────────

export interface ResourceItem {
  id: string;
  title: string;
  description: string;
  category: "article" | "framework" | "video" | "tool";
  topic: string;
  read_time_min: number;
  tags: string[];
}

export async function fetchResources(): Promise<ResourceItem[]> {
  const res = await knowledgeApiClient.get<ResourceItem[]>(
    "/knowledge/resources",
  );
  return res.data;
}

// ── Conversations ─────────────────────────────────────────────────────────────

export interface ConversationRecord {
  id: string;
  question: string;
  answer: string;
  topics: string[];
  created_at: string | null;
}

export async function fetchConversations(): Promise<ConversationRecord[]> {
  const res = await knowledgeApiClient.get<ConversationRecord[]>(
    "/knowledge/conversations",
  );
  return res.data;
}

// ── UserContext ───────────────────────────────────────────────────────────────

export interface UserContext {
  userId: string;
  financialSnapshot: Record<string, number | undefined>;
  activeGoals: { title: string; stage: string; sourceFeature: string }[];
  importedDataCount: number;
}

export async function fetchUserContext(): Promise<UserContext> {
  const res = await knowledgeApiClient.get<UserContext>(
    "/knowledge/user-context",
  );
  return res.data;
}

// ── News ──────────────────────────────────────────────────────────────────────

export interface NewsItem {
  headline: string;
  summary: string;
  source: string;
  url: string;
  datetime: number;   // Unix timestamp (seconds)
  related: string;    // ticker symbol if company-specific, empty for market news
  image: string;
}

export interface NewsResponse {
  items: NewsItem[];
  symbols: string[];  // holdings symbols used to filter; empty when fallback
  fallback: boolean;  // true when no holdings exist and major indices were used
}

export async function fetchNews(): Promise<NewsResponse> {
  const res = await knowledgeApiClient.get<NewsResponse>("/knowledge/news");
  return res.data;
}
