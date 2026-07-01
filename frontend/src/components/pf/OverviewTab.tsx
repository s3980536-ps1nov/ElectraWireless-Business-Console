import { useState, useEffect } from "react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from "recharts";
import { usePersonalFinanceStore, useFilteredTransactions, type Period } from "@/store/personalFinanceStore";
import { fetchSummary } from "@/services/personalFinanceApi";
import { NetWorthPanel } from "@/components/pf/NetWorthPanel";
import type { FinancialSummary } from "@/services/personalFinanceApi";
import { getCategoryColor } from "@/lib/categories";
import { C_PRIMARY, C_BORDER, C_SUCCESS, C_ERROR, C_WARNING } from "@/lib/colors";

// ── KPI card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        background: "rgba(255,255,255,0.55)",
        border: `1.5px solid ${C_BORDER}`,
        borderTop: `3px solid ${color}`,
        borderRadius: 12,
        padding: "18px 20px",
      }}
    >
      <div style={{ fontSize: 11, color: "hsl(247 20% 55%)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1.1, marginBottom: sub ? 6 : 0 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: "hsl(245 16% 55%)" }}>{sub}</div>
      )}
    </div>
  );
}

// ── Health score card ─────────────────────────────────────────────────────────

function healthColor(score: number): string {
  if (score >= 80) return C_SUCCESS;
  if (score >= 60) return "#3B82F6";
  if (score >= 40) return C_WARNING;
  return C_ERROR;
}

function HealthScoreCard({ score, grade }: { score: number; grade: string }) {
  const color = healthColor(score);
  const circumference = 2 * Math.PI * 36;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div
      style={{
        flex: 1,
        background: "rgba(255,255,255,0.55)",
        border: `1.5px solid ${C_BORDER}`,
        borderRadius: 12,
        padding: "20px 24px",
        display: "flex",
        alignItems: "center",
        gap: 20,
      }}
    >
      {/* Ring */}
      <svg width="88" height="88" style={{ flexShrink: 0 }}>
        <circle cx="44" cy="44" r="36" fill="none" stroke="hsl(244 25% 90%)" strokeWidth="7" />
        <circle
          cx="44"
          cy="44"
          r="36"
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 44 44)"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
        <text x="44" y="40" textAnchor="middle" style={{ fontSize: 20, fontWeight: 800, fill: color, fontFamily: "inherit" }}>
          {grade}
        </text>
        <text x="44" y="56" textAnchor="middle" style={{ fontSize: 10, fill: "hsl(245 16% 55%)", fontFamily: "inherit" }}>
          {score}/100
        </text>
      </svg>

      {/* Labels */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "hsl(245 16% 55%)", marginBottom: 6 }}>
          Financial Health
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color, marginBottom: 6 }}>
          {score >= 80 ? "Excellent" : score >= 60 ? "Good" : score >= 40 ? "Fair" : "Needs Work"}
        </div>
        <div style={{ fontSize: 11.5, color: "hsl(245 16% 49%)", lineHeight: 1.6, maxWidth: 200 }}>
          {score >= 80
            ? "You're saving well and keeping expenses in check."
            : score >= 60
            ? "On track — small tweaks could push you higher."
            : score >= 40
            ? "Expenses are high relative to income. Review your budget."
            : "Spending is outpacing income. Action recommended."}
        </div>
      </div>
    </div>
  );
}

// ── Spending donut chart ───────────────────────────────────────────────────────

interface DonutSlice { name: string; value: number; color: string }

function SpendingDonut({ data }: { data: DonutSlice[] }) {
  const [active, setActive] = useState<string | null>(null);
  const total = data.reduce((s, d) => s + d.value, 0);

  const CustomTooltip = ({ active: isActive, payload }: { active?: boolean; payload?: Array<{ payload: DonutSlice }> }) => {
    if (!isActive || !payload?.length) return null;
    const { name, value } = payload[0].payload;
    const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0";
    return (
      <div
        style={{
          background: "rgba(255,255,255,0.92)",
          border: `1px solid ${C_BORDER}`,
          borderRadius: 8,
          padding: "8px 12px",
          fontSize: 12,
          boxShadow: "0 4px 16px rgba(120,100,180,0.12)",
        }}
      >
        <div style={{ fontWeight: 700, color: "hsl(242 44% 28%)", marginBottom: 2 }}>{name}</div>
        <div style={{ color: "hsl(245 16% 49%)" }}>
          {value.toLocaleString("en-AU", { style: "currency", currency: "AUD" })} · {pct}%
        </div>
      </div>
    );
  };

  return (
    <div
      style={{
        flex: 1,
        background: "rgba(255,255,255,0.55)",
        border: `1.5px solid ${C_BORDER}`,
        borderRadius: 12,
        padding: "20px 24px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "hsl(245 16% 55%)", marginBottom: 16 }}>
        Spending by Category
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "center", flex: 1 }}>
        {/* Chart */}
        <div style={{ width: 180, height: 180, flexShrink: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={52}
                outerRadius={80}
                dataKey="value"
                paddingAngle={2}
                onMouseEnter={(_, i) => setActive(data[i]?.name ?? null)}
                onMouseLeave={() => setActive(null)}
              >
                {data.map((entry) => (
                  <Cell
                    key={entry.name}
                    fill={entry.color}
                    opacity={active === null || active === entry.name ? 1 : 0.45}
                    stroke="none"
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7, overflow: "hidden" }}>
          {data.slice(0, 8).map((d) => {
            const pct = total > 0 ? ((d.value / total) * 100).toFixed(0) : "0";
            return (
              <div
                key={d.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  opacity: active === null || active === d.name ? 1 : 0.4,
                  transition: "opacity 0.15s",
                  cursor: "default",
                }}
                onMouseEnter={() => setActive(d.name)}
                onMouseLeave={() => setActive(null)}
              >
                <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: d.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: "hsl(242 44% 30%)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {d.name}
                </span>
                <span style={{ fontSize: 11, color: "hsl(245 16% 55%)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                  {pct}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Income sources panel ──────────────────────────────────────────────────────

function IncomeSources({ sources }: { sources: Record<string, number> }) {
  const total = Object.values(sources).reduce((s, v) => s + v, 0);
  const entries = Object.entries(sources).sort(([, a], [, b]) => b - a);

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.55)",
        border: `1.5px solid ${C_BORDER}`,
        borderRadius: 12,
        padding: "20px 24px",
        minWidth: 200,
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "hsl(245 16% 55%)", marginBottom: 14 }}>
        Income Sources
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {entries.map(([source, amount]) => {
          const pct = total > 0 ? (amount / total) * 100 : 0;
          return (
            <div key={source}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 12 }}>
                <span style={{ color: "hsl(242 44% 30%)", fontWeight: 600 }}>{source}</span>
                <span style={{ color: C_SUCCESS, fontVariantNumeric: "tabular-nums" }}>
                  {amount.toLocaleString("en-AU", { style: "currency", currency: "AUD" })}
                </span>
              </div>
              <div style={{ height: 5, background: "hsl(244 25% 88%)", borderRadius: 3 }}>
                <div
                  style={{
                    height: "100%",
                    width: `${pct}%`,
                    background: C_SUCCESS,
                    borderRadius: 3,
                    transition: "width 0.4s ease",
                  }}
                />
              </div>
            </div>
          );
        })}
        {entries.length === 0 && (
          <div style={{ fontSize: 12, color: "hsl(245 16% 55%)", fontStyle: "italic" }}>No income recorded.</div>
        )}
      </div>
    </div>
  );
}

// ── Main Overview tab ─────────────────────────────────────────────────────────

const fmt = (n: number) =>
  n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

function BudgetNudge({ onGoToBudgets }: { onGoToBudgets: () => void }) {
  return (
    <div
      style={{
        background: "rgba(47,36,133,0.06)",
        border: "1.5px solid rgba(47,36,133,0.18)",
        borderLeft: `3px solid ${C_PRIMARY}`,
        borderRadius: 10,
        padding: "14px 18px",
        display: "flex",
        alignItems: "center",
        gap: 14,
      }}
    >
      <span style={{ fontSize: 20, flexShrink: 0 }}>🎯</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C_PRIMARY, marginBottom: 2 }}>
          No budgets set yet
        </div>
        <div style={{ fontSize: 12, color: "hsl(245 16% 49%)", lineHeight: 1.5 }}>
          Set monthly limits per category to track spending and unlock overspending alerts.
        </div>
      </div>
      <button
        onClick={onGoToBudgets}
        style={{
          background: C_PRIMARY,
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "7px 16px",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          flexShrink: 0,
          whiteSpace: "nowrap",
        }}
      >
        Set Budgets →
      </button>
    </div>
  );
}

export function OverviewTab() {
  const transactions    = useFilteredTransactions();
  const allTransactions = usePersonalFinanceStore((s) => s.transactions);
  const activePeriod    = usePersonalFinanceStore((s) => s.activePeriod);
  const setActivePeriod = usePersonalFinanceStore((s) => s.setActivePeriod);
  const budgets         = usePersonalFinanceStore((s) => s.budgets);
  const setActiveTab    = usePersonalFinanceStore((s) => s.setActiveTab);
  const [summary, setSummary] = useState<FinancialSummary | null>(null);

  useEffect(() => {
    if (transactions.length === 0) { setSummary(null); return; }
    fetchSummary(transactions).then(setSummary).catch(() => setSummary(null));
  }, [transactions]);

  if (!summary) {
    // Transactions exist in the store but the period filter excludes them all
    if (allTransactions.length > 0) {
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 200, gap: 12, color: "hsl(245 16% 55%)", fontSize: 13 }}>
          <div>No transactions in <strong style={{ color: "hsl(242 44% 30%)" }}>{activePeriod}</strong>.</div>
          <div style={{ display: "flex", gap: 8 }}>
            {(["All", "Last 6 months", "This year"] as const).filter((p) => p !== activePeriod).map((p) => (
              <button
                key={p}
                onClick={() => setActivePeriod(p)}
                style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6, border: "1px solid hsl(244 25% 80%)", background: "rgba(255,255,255,0.6)", cursor: "pointer", color: C_PRIMARY, fontWeight: 600 }}
              >
                {p === "All" ? "Show all" : `Try ${p}`}
              </button>
            ))}
          </div>
        </div>
      );
    }
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "hsl(245 16% 55%)", fontSize: 13 }}>
        Loading summary…
      </div>
    );
  }

  const netColor = summary.netCashFlow >= 0 ? C_SUCCESS : C_ERROR;

  const donutData: DonutSlice[] = Object.entries(summary.categoryTotals)
    .sort(([, a], [, b]) => b - a)
    .map(([name, value]) => ({ name, value, color: getCategoryColor(name) }));

  const noBudgets = Object.keys(budgets).length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Budget nudge */}
      {noBudgets && <BudgetNudge onGoToBudgets={() => setActiveTab("budgets")} />}

      {/* KPI row */}
      <div style={{ display: "flex", gap: 12 }}>
        <KpiCard
          label="Total Income"
          value={fmt(summary.totalIncome)}
          color={C_SUCCESS}
        />
        <KpiCard
          label="Total Expenses"
          value={fmt(summary.totalExpenses)}
          color={C_ERROR}
        />
        <KpiCard
          label="Net Cash Flow"
          value={fmt(summary.netCashFlow)}
          color={netColor}
        />
        <KpiCard
          label="Savings Rate"
          value={`${summary.savingsRate}%`}
          sub={summary.savingsRate >= 20 ? "On target (20%+ goal)" : "Below 20% target"}
          color={summary.savingsRate >= 20 ? C_SUCCESS : C_WARNING}
        />
      </div>

      {/* Charts row */}
      <div style={{ display: "flex", gap: 12 }}>
        <SpendingDonut data={donutData} />
        <HealthScoreCard score={summary.healthScore} grade={summary.healthGrade} />
      </div>

      {/* Income sources */}
      <IncomeSources sources={summary.incomeSources} />

      {/* Net worth */}
      <NetWorthPanel />
    </div>
  );
}
