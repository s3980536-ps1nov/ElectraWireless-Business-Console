import { useState, useEffect } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, AreaChart, Area,
} from "recharts";
import { useFilteredTransactions } from "@/store/personalFinanceStore";
import type { Transaction } from "@/store/personalFinanceStore";
import { fetchSummary } from "@/services/personalFinanceApi";
import type { FinancialSummary } from "@/services/personalFinanceApi";
import { getCategoryColor } from "@/lib/categories";
import { C_BORDER, C_SUCCESS, C_ERROR, C_PRIMARY, C_VIOLET } from "@/lib/colors";

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtAUD = (n: number) =>
  n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

const fmtMonth = (ym: string) => {
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1).toLocaleDateString("en-AU", { month: "short", year: "2-digit" });
};

// ── Shared tooltip ────────────────────────────────────────────────────────────

interface TooltipPayloadEntry { name: string; value: number; color: string }

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.96)",
        border: `1px solid ${C_BORDER}`,
        borderRadius: 8,
        padding: "10px 14px",
        fontSize: 12,
        boxShadow: "0 4px 16px rgba(120,100,180,0.12)",
        minWidth: 160,
      }}
    >
      {label && (
        <div style={{ fontWeight: 700, color: "hsl(242 44% 28%)", marginBottom: 6 }}>
          {fmtMonth(label)}
        </div>
      )}
      {payload.map((p) => (
        <div key={p.name} style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 2 }}>
          <span style={{ color: p.color, fontWeight: 600 }}>{p.name}</span>
          <span style={{ color: "hsl(245 16% 40%)", fontVariantNumeric: "tabular-nums" }}>
            {fmtAUD(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Panel wrapper ─────────────────────────────────────────────────────────────

function Panel({ title, children, height = 260 }: { title: string; children: React.ReactNode; height?: number }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.55)",
        border: `1.5px solid ${C_BORDER}`,
        borderRadius: 12,
        padding: "20px 24px",
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "hsl(245 16% 55%)", marginBottom: 16 }}>
        {title}
      </div>
      <div style={{ height }}>{children}</div>
    </div>
  );
}

// ── Cash flow chart (income vs expenses bars + running balance line) ───────────

function CashFlowChart({ data }: { data: FinancialSummary["monthlyBreakdown"] }) {
  const chartData = data.map((d) => ({
    month:    d.month,
    Income:   d.income,
    Expenses: d.expenses,
    Balance:  d.runningBalance,
  }));

  return (
    <Panel title="Monthly Cash Flow — Income vs Expenses" height={280}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(244 25% 90%)" vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={fmtMonth}
            tick={{ fontSize: 11, fill: "hsl(245 16% 55%)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
            tick={{ fontSize: 11, fill: "hsl(245 16% 55%)" }}
            axisLine={false}
            tickLine={false}
            width={44}
          />
          <Tooltip content={<ChartTooltip />} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
          <Bar dataKey="Income"   fill={C_SUCCESS} radius={[4, 4, 0, 0]} barSize={20} />
          <Bar dataKey="Expenses" fill={C_ERROR}   radius={[4, 4, 0, 0]} barSize={20} />
          <Line
            type="monotone"
            dataKey="Balance"
            stroke={C_PRIMARY}
            strokeWidth={2}
            dot={{ r: 3, fill: C_PRIMARY, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </Panel>
  );
}

// ── Running balance area chart ────────────────────────────────────────────────

function BalanceChart({ data }: { data: FinancialSummary["monthlyBreakdown"] }) {
  const chartData = data.map((d) => ({
    month:             d.month,
    "Running Balance": d.runningBalance,
  }));

  const min = Math.min(...data.map((d) => d.runningBalance));
  const color = min < 0 ? C_ERROR : C_VIOLET;

  return (
    <Panel title="Running Balance" height={200}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={color} stopOpacity={0.18} />
              <stop offset="95%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(244 25% 90%)" vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={fmtMonth}
            tick={{ fontSize: 11, fill: "hsl(245 16% 55%)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
            tick={{ fontSize: 11, fill: "hsl(245 16% 55%)" }}
            axisLine={false}
            tickLine={false}
            width={44}
          />
          <Tooltip content={<ChartTooltip />} />
          <Area
            type="monotone"
            dataKey="Running Balance"
            stroke={color}
            strokeWidth={2}
            fill="url(#balGrad)"
            dot={{ r: 3, fill: color, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </Panel>
  );
}

// ── Top category spend trend (grouped bars per month) ────────────────────────

function SpendTrendChart({ transactions, months }: { transactions: Transaction[]; months: string[] }) {
  // Top 5 expense categories overall
  const catTotals: Record<string, number> = {};
  for (const tx of transactions) {
    if (tx.amount < 0) catTotals[tx.category] = (catTotals[tx.category] ?? 0) + Math.abs(tx.amount);
  }
  const topCats = Object.entries(catTotals)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([c]) => c);

  const chartData = months.map((m) => {
    const row: Record<string, string | number> = { month: m };
    for (const cat of topCats) {
      row[cat] = transactions
        .filter((t) => t.date.startsWith(m) && t.amount < 0 && t.category === cat)
        .reduce((s, t) => s + Math.abs(t.amount), 0);
    }
    return row;
  });

  return (
    <Panel title="Top Category Spending Trend" height={220}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(244 25% 90%)" vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={fmtMonth}
            tick={{ fontSize: 11, fill: "hsl(245 16% 55%)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => `$${v}`}
            tick={{ fontSize: 11, fill: "hsl(245 16% 55%)" }}
            axisLine={false}
            tickLine={false}
            width={44}
          />
          <Tooltip content={<ChartTooltip />} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
          {topCats.map((cat) => (
            <Bar key={cat} dataKey={cat} fill={getCategoryColor(cat)} radius={[3, 3, 0, 0]} barSize={16} />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </Panel>
  );
}

// ── Main Cash Flow tab ────────────────────────────────────────────────────────

export function CashFlowTab() {
  const transactions = useFilteredTransactions();
  const [summary, setSummary] = useState<FinancialSummary | null>(null);

  useEffect(() => {
    if (transactions.length === 0) return;
    fetchSummary(transactions).then(setSummary);
  }, [transactions]);

  if (!summary) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "hsl(245 16% 55%)", fontSize: 13 }}>
        Loading…
      </div>
    );
  }

  const months = summary.monthlyBreakdown.map((d) => d.month);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <CashFlowChart data={summary.monthlyBreakdown} />
      <BalanceChart  data={summary.monthlyBreakdown} />
      <SpendTrendChart transactions={transactions} months={months} />
    </div>
  );
}
