// SCAFFOLD — Feature 5: Knowledge & Learning — cross-feature UserContext hook.
// Fetches the aggregated financial context from /knowledge/user-context and
// exposes named selectors so tab components don't reach into raw API shapes.
//
// HOW TO USE:
//   const { mrr, healthScore, activeGoals } = useFeature5Context();
//
// TODO comments below indicate fields that need confirmation with feature owners
// before being used in production logic.

import { useEffect, useState } from "react";
import { fetchUserContext } from "@/services/knowledgeApi";
import type { UserContext } from "@/services/knowledgeApi";

export interface Feature5ContextValue {
  /** Raw UserContext from the backend — null while loading */
  context: UserContext | null;
  loading: boolean;

  // ── Feature 1 — Business forecast ────────────────────────────────────────
  /** Monthly Recurring Revenue from ForecastConfig. Undefined if F1 not set up. */
  mrr: number | undefined;
  /** Monthly revenue growth rate (%). TODO: confirm field name is 'growth_rate'. */
  growthRate: number | undefined;
  /**
   * Combined monthly operating expenses (payroll + marketing_spend).
   * TODO: confirm field name — currently derived server-side as 'monthly_expenses'.
   */
  monthlyExpenses: number | undefined;

  // ── Feature 2 — Personal finance ─────────────────────────────────────────
  /** 0–100 financial health score from the latest PFSnapshot. */
  healthScore: number | undefined;
  /** Savings rate as a percentage. TODO: confirm field name is 'savings_rate'. */
  savingsRate: number | undefined;
  /** Net monthly cash flow (income − expenses). TODO: confirm field 'cashflow_balance'. */
  cashflowBalance: number | undefined;

  // ── Feature 3 — Investment portfolio ─────────────────────────────────────
  /** Total current market value of all holdings. */
  portfolioValue: number | undefined;
  /** Total return percentage across all holdings. TODO: confirm field 'portfolio_return'. */
  portfolioReturn: number | undefined;
  /** Number of distinct InvestmentHolding rows for the user. */
  holdingCount: number | undefined;

  // ── Cross-feature ─────────────────────────────────────────────────────────
  /** Active goals (stage != 'done') from all features, capped at 5 by the backend. */
  activeGoals: UserContext["activeGoals"];
  /**
   * Total count of imported data rows (PFTransactions + InvestmentHoldings).
   * Used to decide whether to show onboarding nudges.
   */
  importedDataCount: number;

  // TODO: proposed addition — 'business_stage' (e.g. idea/early/growth/scale).
  // Would come from a user onboarding step in Feature 1 that doesn't exist yet.
  // Agree field name with Feature 1 owner before adding to _aggregate_context().
}

export function useFeature5Context(): Feature5ContextValue {
  const [context, setContext] = useState<UserContext | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUserContext()
      .then(setContext)
      .catch(() => setContext(null))
      .finally(() => setLoading(false));
  }, []);

  const snap = context?.financialSnapshot ?? {};

  return {
    context,
    loading,

    // F1
    mrr:             snap.mrr             as number | undefined,
    growthRate:      snap.growth_rate     as number | undefined,
    monthlyExpenses: snap.monthly_expenses as number | undefined,

    // F2
    healthScore:      snap.health_score      as number | undefined,
    savingsRate:      snap.savings_rate      as number | undefined,
    cashflowBalance:  snap.cashflow_balance  as number | undefined,

    // F3
    portfolioValue:  snap.portfolio_value  as number | undefined,
    portfolioReturn: snap.portfolio_return as number | undefined,
    holdingCount:    snap.holding_count   as number | undefined,

    // Cross-feature
    activeGoals:      context?.activeGoals      ?? [],
    importedDataCount: context?.importedDataCount ?? 0,
  };
}
