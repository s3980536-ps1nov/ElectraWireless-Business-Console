// SCAFFOLD — Feature 5: Knowledge & Learning — centralised type definitions.
// Re-exports all Feature 5 interfaces from their source modules so cross-feature
// consumers have a single import path. Inline types in knowledgeApi.ts remain
// the source of truth; update them there, not here.

// ── API types (runtime-used) ──────────────────────────────────────────────────

export type {
  KnowledgeChatPayload,
  KnowledgeChatResponse,
  GoalResponse,
  GoalCreatePayload,
  GoalUpdatePayload,
  ResourceItem,
  ConversationRecord,
  UserContext,
  NewsItem,
  NewsResponse,
} from "@/services/knowledgeApi";

// ── Store types ───────────────────────────────────────────────────────────────

export type {
  GoalStage,
  SourceFeature,
  KnowledgeChatMessage,
} from "@/store/knowledgeStore";

// ── Feature 5 domain types (proposed — confirm with team before using) ────────

/**
 * The three tabs that make up the Feature 5 dashboard.
 * Matches the TABS array in KnowledgePage.tsx.
 */
export type Feature5Tab = "overview" | "goals" | "resources";

/**
 * A curated resource item extended with a user-specific relevance score.
 * TODO: implement relevance scoring once goal-keyword filtering is agreed on.
 */
export interface RankedResource {
  /** The raw resource from the API */
  resource: import("@/services/knowledgeApi").ResourceItem;
  /**
   * Relevance score 0–1 derived from goal-keyword overlap with resource tags.
   * TODO: computed in useFeature5Context; currently always 1 (unfiltered).
   */
  relevanceScore: number;
}

/**
 * Shape of the cross-feature financial snapshot surfaced in UserContext.
 * Field names mirror the backend _aggregate_context() function in knowledge.py.
 * TODO: confirm `monthly_expenses` field name with backend — currently derived
 *       as payroll + marketing_spend inside _aggregate_context().
 */
export interface FinancialSnapshot {
  mrr?: number;                 // F1 — starting_mrr from ForecastConfig
  growth_rate?: number;         // F1 — growth_rate from ForecastConfig
  monthly_expenses?: number;    // F1 — payroll + marketing_spend (derived)
  health_score?: number;        // F2 — from latest PFSnapshot
  savings_rate?: number;        // F2 — from latest PFSnapshot
  cashflow_balance?: number;    // F2 — from latest PFSnapshot
  portfolio_value?: number;     // F3 — total_value from latest PortfolioSnapshot
  portfolio_return?: number;    // F3 — return_percentage from latest PortfolioSnapshot
  holding_count?: number;       // F3 — count of InvestmentHolding rows
}
