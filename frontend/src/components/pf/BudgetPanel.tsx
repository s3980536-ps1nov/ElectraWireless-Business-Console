import { useState, useMemo } from "react";
import { usePersonalFinanceStore, useFilteredTransactions } from "@/store/personalFinanceStore";
import { CATEGORIES, getCategoryColor } from "@/lib/categories";
import { C_PRIMARY, C_BORDER, C_SUCCESS, C_ERROR, C_WARNING } from "@/lib/colors";
import { getPeriodMonths, getPeriodLabel } from "@/lib/periodFilter";

// Expense spend per category across the active period
function usePeriodSpend(): Record<string, number> {
  const filteredTxs = useFilteredTransactions();
  return useMemo(() => {
    const result: Record<string, number> = {};
    for (const tx of filteredTxs) {
      if (tx.amount < 0) {
        result[tx.category] = (result[tx.category] ?? 0) + Math.abs(tx.amount);
      }
    }
    return result;
  }, [filteredTxs]);
}

function progressColor(pct: number): string {
  if (pct >= 100) return C_ERROR;
  if (pct >= 80)  return C_WARNING;
  return C_SUCCESS;
}

// ── Budget Card ───────────────────────────────────────────────────────────────

function BudgetCard({
  category,
  limit,
  spent,
  periodMonths,
  periodLabel,
}: {
  category: string;
  limit: number;
  spent: number;
  periodMonths: number;
  periodLabel: string;
}) {
  const setBudget = usePersonalFinanceStore((s) => s.setBudget);
  const [editing, setEditing]   = useState(false);
  const [draft,   setDraft]     = useState(String(limit || ""));

  const periodBudget = limit * periodMonths;
  const pct = periodBudget > 0 ? Math.round((spent / periodBudget) * 100) : 0;
  const color = getCategoryColor(category);
  const barColor = progressColor(pct);

  const saveLimit = () => {
    const n = parseFloat(draft);
    if (!isNaN(n) && n > 0) setBudget(category, n);
    setEditing(false);
  };

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.55)",
        border: `1.5px solid ${C_BORDER}`,
        borderTop: `3px solid ${color}`,
        borderRadius: "10px",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: color }} />
          <span style={{ fontSize: "13px", fontWeight: 700, color: "hsl(242 44% 30%)" }}>{category}</span>
        </div>
        <button
          onClick={() => { setEditing(true); setDraft(String(limit || "")); }}
          style={{ fontSize: "11px", color: C_PRIMARY, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
        >
          {limit > 0 ? "Edit" : "Set limit"}
        </button>
      </div>

      {/* Limit editor */}
      {editing && (
        <div style={{ display: "flex", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", background: "rgba(255,255,255,0.70)", border: `1px solid ${C_BORDER}`, borderRadius: "6px", padding: "0 10px", flex: 1 }}>
            <span style={{ fontSize: "12px", color: "hsl(245 16% 55%)" }}>$</span>
            <input
              autoFocus
              type="number"
              min="1"
              step="50"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveLimit(); if (e.key === "Escape") setEditing(false); }}
              style={{ border: "none", outline: "none", background: "transparent", fontSize: "13px", width: "100%", padding: "6px 4px", color: "hsl(242 44% 30%)" }}
            />
          </div>
          <button onClick={saveLimit} style={{ background: C_PRIMARY, color: "#fff", border: "none", borderRadius: "6px", padding: "6px 12px", fontSize: "12px", cursor: "pointer" }}>Save</button>
          <button onClick={() => setEditing(false)} style={{ background: "transparent", color: "hsl(245 16% 55%)", border: `1px solid ${C_BORDER}`, borderRadius: "6px", padding: "6px 10px", fontSize: "12px", cursor: "pointer" }}>✕</button>
        </div>
      )}

      {/* Progress bar */}
      {limit > 0 && (
        <>
          <div style={{ height: "6px", background: "hsl(244 25% 88%)", borderRadius: "4px", overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${Math.min(pct, 100)}%`,
                background: barColor,
                borderRadius: "4px",
                transition: "width 0.3s ease",
              }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
            <span style={{ color: barColor, fontWeight: 600 }}>
              {pct}% used
              {pct >= 100 && " — over budget!"}
              {pct >= 80 && pct < 100 && " — approaching limit"}
            </span>
            <span style={{ color: "hsl(245 16% 55%)" }}>
              ${spent.toFixed(0)} / ${periodBudget.toFixed(0)}
              {periodMonths > 1 && (
                <span style={{ marginLeft: 3, opacity: 0.65 }}>({periodLabel})</span>
              )}
            </span>
          </div>
        </>
      )}

      {/* No limit set */}
      {!limit && !editing && (
        <div style={{ fontSize: "11px", color: "hsl(245 16% 60%)", fontStyle: "italic" }}>
          No budget set — click "Set limit" to track spending.
        </div>
      )}
    </div>
  );
}

// ── Budget Overview Panel ─────────────────────────────────────────────────────

export function BudgetPanel() {
  const budgets        = usePersonalFinanceStore((s) => s.budgets);
  const activePeriod   = usePersonalFinanceStore((s) => s.activePeriod);
  const spendMap       = usePeriodSpend();
  const periodMonths   = getPeriodMonths(activePeriod);
  const periodLabel    = getPeriodLabel(activePeriod);

  // Categories with any spend or any budget set, plus all default ones
  const activeCategories = CATEGORIES.filter(
    (c) => c !== "Income" && (spendMap[c] !== undefined || budgets[c] !== undefined)
  );
  const otherCategories  = CATEGORIES.filter(
    (c) => c !== "Income" && !activeCategories.includes(c)
  );

  const hasAnyBudget    = Object.keys(budgets).length > 0;
  const totalMonthly    = Object.values(budgets).reduce((a, b) => a + b, 0);
  const totalBudget     = totalMonthly * periodMonths;
  const totalSpent      = Object.values(spendMap).reduce((a, b) => a + b, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Nudge if no budgets */}
      {!hasAnyBudget && (
        <div
          style={{
            background: "rgba(47,36,133,0.07)",
            border: `1.5px solid rgba(47,36,133,0.18)`,
            borderRadius: "10px",
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            gap: "14px",
          }}
        >
          <span style={{ fontSize: "20px" }}>🎯</span>
          <div>
            <div style={{ fontSize: "13px", fontWeight: 700, color: C_PRIMARY, marginBottom: "3px" }}>
              Set your monthly spending limits
            </div>
            <div style={{ fontSize: "12px", color: "hsl(245 16% 49%)", lineHeight: 1.5 }}>
              Click "Set limit" on any category below to start tracking budget progress.
              ELLY will alert you when you're approaching or over your limit.
            </div>
          </div>
        </div>
      )}

      {/* Summary bar */}
      {hasAnyBudget && (
        <div
          style={{
            background: "rgba(255,255,255,0.55)",
            border: `1.5px solid ${C_BORDER}`,
            borderRadius: "10px",
            padding: "14px 18px",
            display: "flex",
            gap: "28px",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "hsl(245 16% 55%)", marginBottom: "4px" }}>
              Budget ({periodLabel})
            </div>
            <div style={{ fontSize: "20px", fontWeight: 700, color: "hsl(242 44% 30%)" }}>
              ${totalBudget.toLocaleString()}
            </div>
          </div>
          <div>
            <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "hsl(245 16% 55%)", marginBottom: "4px" }}>
              Total Spent
            </div>
            <div style={{ fontSize: "20px", fontWeight: 700, color: totalSpent > totalBudget ? C_ERROR : C_SUCCESS }}>
              ${totalSpent.toLocaleString()}
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "10px", color: "hsl(245 16% 55%)", marginBottom: "6px", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Overall Progress
            </div>
            <div style={{ height: "8px", background: "hsl(244 25% 88%)", borderRadius: "4px", overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${Math.min((totalSpent / totalBudget) * 100, 100)}%`,
                  background: progressColor((totalSpent / totalBudget) * 100),
                  borderRadius: "4px",
                  transition: "width 0.3s ease",
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Active categories */}
      {activeCategories.length > 0 && (
        <div>
          <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "hsl(245 16% 55%)", marginBottom: "12px" }}>
            Categories with Activity
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: "12px" }}>
            {activeCategories.map((cat) => (
              <BudgetCard
                key={cat}
                category={cat}
                limit={budgets[cat] ?? 0}
                spent={spendMap[cat] ?? 0}
                periodMonths={periodMonths}
                periodLabel={periodLabel}
              />
            ))}
          </div>
        </div>
      )}

      {/* Other categories */}
      <div>
        <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "hsl(245 16% 55%)", marginBottom: "12px" }}>
          {activeCategories.length > 0 ? "Other Categories" : "All Categories"}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: "12px" }}>
          {otherCategories.map((cat) => (
            <BudgetCard
              key={cat}
              category={cat}
              limit={budgets[cat] ?? 0}
              spent={spendMap[cat] ?? 0}
              periodMonths={periodMonths}
              periodLabel={periodLabel}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
