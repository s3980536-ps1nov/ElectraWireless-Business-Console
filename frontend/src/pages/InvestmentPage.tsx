import { useState, useEffect, useRef } from "react";
import {
  TrendingUp, TrendingDown, PieChart as PieIcon, BarChart2,
  Lightbulb, Sparkles, Upload, Plus, AlertTriangle, Trash2,
  X, Loader2, Bell,
} from "lucide-react";
import {
  PieChart, Pie, Cell, Tooltip as RechartTooltip, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  ScatterChart, Scatter, ZAxis,
} from "recharts";
import { C_PRIMARY, C_BORDER, C_SUCCESS, C_ERROR, C_WARNING } from "@/lib/colors";
import {
  fetchHoldings, addHolding, deleteHolding, clearAllHoldings, uploadHoldingsCsv,
  fetchInsights, fetchPrices, fetchSummary, fetchSnapshots, backfillSnapshots, fetchMarkowitz,
  fetchMarketMovers, fetchGeographicExposure, ASSET_TYPE_LABELS,
} from "@/services/investmentApi";
import type {
  InvestmentHolding, InvestmentInsight, NewHolding, AssetType,
  MarketPrice, PortfolioSummary, AssetPerformance, PortfolioSnapshot, MarkowitzPoint,
  MarketMover, MarketMovers, GeoExposureEntry,
} from "@/services/investmentApi";
import { InvestmentAIPanel } from "@/components/investment/InvestmentAIPanel";
import { RiskTab } from "@/components/investment/RiskTab";
import { InvestmentGoalsTab } from "@/components/investment/InvestmentGoalsTab";
import { EllyChat } from "@/components/investment/EllyChat";

// ── Constants ─────────────────────────────────────────────────────────────────

const TABS = [
  { key: "overview",  label: "Overview" },
  { key: "holdings",  label: "Holdings" },
  { key: "analytics", label: "Analytics" },
  { key: "risk",      label: "Risk & Protection" },
  { key: "goals",     label: "Goals" },
  { key: "ai",        label: "AI Scenarios" },
  { key: "chat",      label: "Ask Elly" },
];

const PIE_PALETTE = [
  "#6366f1","#f59e0b","#10b981","#ec4899",
  "#3b82f6","#f97316","#8b5cf6","#14b8a6","#ef4444","#84cc16",
];

const ASSET_TYPE_COLORS: Record<string, string> = {
  Stock: "#6366f1", Crypto: "#f59e0b", ETF: "#10b981",
  Fund: "#3b82f6", "Real Estate": "#f97316",
};

const GEO_COLORS: Record<string, string> = {
  "United States":   "#6366f1",
  "Crypto (Global)": "#f59e0b",
  "India":           "#10b981",
  "United Kingdom":  "#3b82f6",
  "China":           "#ef4444",
  "Hong Kong":       "#f97316",
  "Japan":           "#8b5cf6",
  "Germany":         "#14b8a6",
  "Canada":          "#84cc16",
  "Australia":       "#ec4899",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt$(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function formatSnapshotDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function groupHoldings(holdings: InvestmentHolding[], by: "type" | "symbol") {
  const map: Record<string, number> = {};
  for (const h of holdings) {
    const key = by === "type"
      ? (ASSET_TYPE_LABELS[h.asset_type] ?? h.asset_type)
      : h.symbol;
    map[key] = (map[key] ?? 0) + h.quantity * h.buy_price;
  }
  return Object.entries(map)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

// ── Shared UI ─────────────────────────────────────────────────────────────────

function PlaceholderCard({
  icon, title, description, owner, phase,
}: {
  icon: React.ReactNode; title: string; description: string;
  owner: "Frontend" | "Backend" | "AI / Insights" | "Shared"; phase: string;
}) {
  const ownerColor: Record<string, string> = {
    Frontend: "#6366f1", Backend: "#0ea5e9", "AI / Insights": "#8b5cf6", Shared: "#f59e0b",
  };
  return (
    <div style={{
      background: "rgba(255,255,255,0.55)", backdropFilter: "blur(14px)",
      border: `1.5px dashed ${C_BORDER}`, borderRadius: 12, padding: "18px 20px",
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: C_PRIMARY }}>
          {icon}
          <span style={{ fontWeight: 600, fontSize: 13 }}>{title}</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
            background: ownerColor[owner] + "18", color: ownerColor[owner], padding: "2px 7px", borderRadius: 4,
          }}>{owner}</span>
          <span style={{
            fontSize: 9, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase",
            background: "rgba(0,0,0,0.06)", color: "#888", padding: "2px 7px", borderRadius: 4,
          }}>{phase}</span>
        </div>
      </div>
      <p style={{ fontSize: 12, color: "#666", lineHeight: 1.5, margin: 0 }}>{description}</p>
    </div>
  );
}

function TabBar({ active, onChange }: { active: string; onChange: (k: string) => void }) {
  return (
    <div style={{ display: "flex", gap: 4, borderBottom: `1.5px solid ${C_BORDER}`, marginBottom: 24 }}>
      {TABS.map((t) => (
        <button key={t.key} onClick={() => onChange(t.key)} style={{
          background: "none", border: "none", cursor: "pointer", padding: "8px 14px",
          fontSize: 12.5, fontWeight: active === t.key ? 700 : 500,
          color: active === t.key ? C_PRIMARY : "#888",
          borderBottom: active === t.key ? `2px solid ${C_PRIMARY}` : "2px solid transparent",
          marginBottom: -1.5, transition: "all 0.15s",
        }}>{t.label}</button>
      ))}
    </div>
  );
}

function StatCard({
  label, value, sub, accent, muted,
}: {
  label: string; value: string; sub?: string; accent?: string; muted?: boolean;
}) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.6)", backdropFilter: "blur(16px)",
      border: `1.5px solid ${C_BORDER}`,
      borderTop: `3px solid ${accent ?? C_PRIMARY}`,
      borderRadius: 12, padding: "16px 20px", flex: 1, minWidth: 140,
    }}>
      <div style={{ fontSize: 11, color: "#888", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{
        fontSize: 24, fontWeight: 800, color: muted ? "#bbb" : (accent ?? C_PRIMARY),
        letterSpacing: "-0.5px",
      }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: "#999", marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

// ── Market alert banner ───────────────────────────────────────────────────────

function AlertBanner({ prices, holdingSymbols }: { prices: MarketPrice[]; holdingSymbols: Set<string> }) {
  const [dismissed, setDismissed] = useState(false);

  const notable = prices
    .filter((p) =>
      holdingSymbols.has(p.symbol.toUpperCase()) &&
      p.percentage_change !== null &&
      Math.abs(p.percentage_change!) >= 5
    )
    .sort((a, b) => (a.percentage_change ?? 0) - (b.percentage_change ?? 0));

  if (dismissed || notable.length === 0) return null;

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 16px", borderRadius: 10, marginBottom: 0,
      background: C_WARNING + "12", border: `1.5px solid ${C_WARNING}40`,
      flexWrap: "wrap", gap: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Bell size={14} color={C_WARNING} />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: C_WARNING }}>Price Alerts</span>
        {notable.map((p) => {
          const pct = p.percentage_change!;
          const color = pct < 0 ? C_ERROR : C_SUCCESS;
          return (
            <span key={p.symbol} style={{
              fontSize: 11.5, fontWeight: 700, color,
              background: color + "12", padding: "2px 8px", borderRadius: 6,
            }}>
              {p.symbol} {pct >= 0 ? "+" : ""}{pct.toFixed(1)}%
            </span>
          );
        })}
      </div>
      <button onClick={() => setDismissed(true)} style={{
        background: "none", border: "none", cursor: "pointer", color: "#bbb", padding: 4,
      }}><X size={14} /></button>
    </div>
  );
}

// ── Allocation pie chart ──────────────────────────────────────────────────────

function PieTooltipContent({
  active, payload, total,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number }>;
  total: number;
}) {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0";
  return (
    <div style={{
      background: "rgba(255,255,255,0.95)", backdropFilter: "blur(12px)",
      border: `1.5px solid ${C_BORDER}`, borderRadius: 8, padding: "10px 14px",
      fontSize: 12, boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
    }}>
      <div style={{ fontWeight: 700, color: C_PRIMARY, marginBottom: 4 }}>{name}</div>
      <div style={{ color: "#555" }}>{fmt$(value)}</div>
      <div style={{ color: "#999", fontSize: 11 }}>{pct}% of portfolio</div>
    </div>
  );
}

function AllocationPieChart({
  holdings,
  geoData = [],
}: {
  holdings: InvestmentHolding[];
  geoData?: GeoExposureEntry[];
}) {
  const [view, setView] = useState<"type" | "symbol" | "geo">("type");

  const holdingData = view !== "geo" ? groupHoldings(holdings, view) : [];
  const geoChartData = geoData.map((g) => ({ name: g.region, value: g.value }));
  const data  = view === "geo" ? geoChartData : holdingData;
  const total = data.reduce((s, d) => s + d.value, 0);

  if (holdings.length === 0) {
    return (
      <div style={{
        height: 260, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 8,
        background: "rgba(255,255,255,0.4)", borderRadius: 12,
        border: `1.5px solid ${C_BORDER}`,
      }}>
        <PieIcon size={32} color="#ddd" />
        <span style={{ fontSize: 13, color: "#bbb" }}>Add holdings to see allocation</span>
      </div>
    );
  }

  const colorFor = (name: string, i: number) => {
    if (view === "type")   return ASSET_TYPE_COLORS[name] ?? PIE_PALETTE[i % PIE_PALETTE.length];
    if (view === "geo")    return GEO_COLORS[name]        ?? PIE_PALETTE[i % PIE_PALETTE.length];
    return PIE_PALETTE[i % PIE_PALETTE.length];
  };

  const TABS = [
    { key: "type",   label: "By Type" },
    { key: "symbol", label: "By Symbol" },
    { key: "geo",    label: "By Geography" },
  ] as const;

  return (
    <div style={{
      background: "rgba(255,255,255,0.55)", backdropFilter: "blur(14px)",
      border: `1.5px solid ${C_BORDER}`, borderRadius: 12, padding: "18px 20px",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C_PRIMARY }}>Asset Allocation</span>
        <div style={{ display: "flex", gap: 4 }}>
          {TABS.map(({ key, label }) => (
            <button key={key} onClick={() => setView(key)} style={{
              fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 6,
              border: `1.5px solid ${view === key ? C_PRIMARY : C_BORDER}`,
              background: view === key ? C_PRIMARY : "transparent",
              color: view === key ? "#fff" : "#888", cursor: "pointer",
            }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {view === "geo" && geoData.length === 0 ? (
        <div style={{
          height: 200, display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, color: "#bbb",
        }}>
          Run a portfolio analysis to see geographic breakdown
        </div>
      ) : (
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <div style={{ flex: "0 0 200px", height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} cx="50%" cy="50%" innerRadius={55} outerRadius={90}
                  dataKey="value" paddingAngle={2}>
                  {data.map((entry, i) => (
                    <Cell key={entry.name} fill={colorFor(entry.name, i)} />
                  ))}
                </Pie>
                <RechartTooltip content={<PieTooltipContent total={total} />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            {data.map((entry, i) => {
              const pct = total > 0 ? (entry.value / total) * 100 : 0;
              const color = colorFor(entry.name, i);
              return (
                <div key={entry.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#444", flex: 1 }}>{entry.name}</span>
                  <span style={{ fontSize: 11, color: "#777", minWidth: 80, textAlign: "right" }}>{fmt$(entry.value)}</span>
                  <span style={{ fontSize: 11, color, fontWeight: 700, minWidth: 42, textAlign: "right" }}>{pct.toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Portfolio growth line chart ───────────────────────────────────────────────

function GrowthLineChart({
  snapshots, onBackfill,
}: {
  snapshots: PortfolioSnapshot[];
  onBackfill?: () => Promise<void>;
}) {
  const [seeding, setSeeding] = useState(false);

  const handleBackfill = async () => {
    if (!onBackfill) return;
    setSeeding(true);
    try { await onBackfill(); } finally { setSeeding(false); }
  };

  const tooFew = snapshots.length < 2;

  if (snapshots.length === 0 || tooFew) {
    return (
      <div style={{
        background: "rgba(255,255,255,0.55)", backdropFilter: "blur(14px)",
        border: `1.5px solid ${C_BORDER}`, borderRadius: 12, padding: "18px 20px",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 10, minHeight: 236,
      }}>
        <BarChart2 size={28} color="#ccc" />
        <span style={{ fontSize: 12.5, fontWeight: 600, color: "#aaa" }}>Only today's snapshot</span>
        <span style={{ fontSize: 11, color: "#bbb", textAlign: "center", maxWidth: 220 }}>
          Generate simulated monthly history from your holdings' purchase dates to see the growth trend.
        </span>
        {onBackfill && (
          <button
            onClick={handleBackfill}
            disabled={seeding}
            style={{
              marginTop: 4, padding: "7px 16px", borderRadius: 8, border: "none", cursor: seeding ? "wait" : "pointer",
              background: C_PRIMARY, color: "#fff", fontSize: 12, fontWeight: 600,
              display: "flex", alignItems: "center", gap: 6, opacity: seeding ? 0.7 : 1,
            }}
          >
            {seeding
              ? <><Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> Generating…</>
              : <><TrendingUp size={12} /> Generate History</>}
          </button>
        )}
      </div>
    );
  }

  const chartData = snapshots.map((s) => ({
    date:  formatSnapshotDate(s.date),
    value: s.total_value,
    pl:    s.profit_loss,
  }));

  const lastPl = snapshots[snapshots.length - 1]?.profit_loss ?? 0;
  const lineColor = lastPl >= 0 ? C_SUCCESS : C_ERROR;

  return (
    <div style={{
      background: "rgba(255,255,255,0.55)", backdropFilter: "blur(14px)",
      border: `1.5px solid ${C_BORDER}`, borderRadius: 12, padding: "18px 20px",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C_PRIMARY }}>Portfolio Growth</span>
        <span style={{ fontSize: 10.5, color: "#aaa" }}>
          {snapshots.length} snapshot{snapshots.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div style={{ height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C_BORDER} />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} width={46} />
            <RechartTooltip
              formatter={(v: number) => [fmt$(v), "Portfolio Value"]}
              contentStyle={{ fontSize: 12, border: `1px solid ${C_BORDER}`, borderRadius: 8 }}
            />
            <Line
              type="monotone" dataKey="value" stroke={lineColor} strokeWidth={2}
              dot={{ r: 3, fill: lineColor }} activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Market-wide top gainers / losers ─────────────────────────────────────────

function GainersLosersList() {
  const [data, setData]       = useState<MarketMovers | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMarketMovers()
      .then(setData)
      .catch(() => setData({ gainers: [], losers: [] }))
      .finally(() => setLoading(false));
  }, []);

  const itemStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "8px 0", borderBottom: `1px solid ${C_BORDER}`,
  };

  const renderItems = (items: MarketMover[], positive: boolean) => {
    if (loading) return <div style={{ fontSize: 12, color: "#bbb", textAlign: "center", padding: "18px 0" }}>Loading…</div>;
    if (items.length === 0) return <div style={{ fontSize: 12, color: "#bbb", textAlign: "center", padding: "18px 0" }}>{positive ? "No gainers right now" : "No losers right now"}</div>;
    return items.map((m) => (
      <div key={m.symbol} style={itemStyle}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: C_PRIMARY }}>{m.symbol}</div>
          <div style={{ fontSize: 10, color: "#aaa" }}>{fmt$(m.current_price)}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: positive ? C_SUCCESS : C_ERROR }}>
            {m.percentage_change >= 0 ? "+" : ""}{m.percentage_change.toFixed(2)}%
          </div>
          <div style={{ fontSize: 11, color: "#aaa" }}>
            {m.daily_change >= 0 ? "+" : ""}{fmt$(m.daily_change)}
          </div>
        </div>
      </div>
    ));
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <div style={{
        background: "rgba(255,255,255,0.55)", backdropFilter: "blur(14px)",
        border: `1.5px solid ${C_BORDER}`, borderRadius: 12, padding: "18px 20px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
          <TrendingUp size={14} color={C_SUCCESS} />
          <span style={{ fontSize: 13, fontWeight: 700, color: C_PRIMARY }}>Top Gainers</span>
          <span style={{ fontSize: 10, color: "#aaa", marginLeft: "auto" }}>Market</span>
        </div>
        {renderItems(data?.gainers ?? [], true)}
      </div>

      <div style={{
        background: "rgba(255,255,255,0.55)", backdropFilter: "blur(14px)",
        border: `1.5px solid ${C_BORDER}`, borderRadius: 12, padding: "18px 20px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
          <TrendingDown size={14} color={C_ERROR} />
          <span style={{ fontSize: 13, fontWeight: 700, color: C_PRIMARY }}>Top Losers</span>
          <span style={{ fontSize: 10, color: "#aaa", marginLeft: "auto" }}>Market</span>
        </div>
        {renderItems(data?.losers ?? [], false)}
      </div>
    </div>
  );
}

// ── Price Alerts (user's own holdings daily movers) ───────────────────────────

function PriceAlertsPanel({ assets }: { assets: AssetPerformance[] }) {
  const withDaily = assets
    .filter((a) => a.percentage_change != null)
    .sort((a, b) => (a.percentage_change ?? 0) - (b.percentage_change ?? 0));

  if (withDaily.length === 0) return null;

  return (
    <div style={{
      background: "rgba(255,255,255,0.55)", backdropFilter: "blur(14px)",
      border: `1.5px solid ${C_BORDER}`, borderRadius: 12, padding: "18px 20px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
        <Bell size={14} color={C_WARNING} />
        <span style={{ fontSize: 13, fontWeight: 700, color: C_PRIMARY }}>Price Alerts</span>
        <span style={{ fontSize: 10, color: "#aaa", marginLeft: "auto" }}>Your holdings · today</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {withDaily.map((a) => {
          const pct   = a.percentage_change ?? 0;
          const color = pct >= 0 ? C_SUCCESS : C_ERROR;
          const direction = pct >= 0 ? "rose" : "fell";
          const totalRetColor = a.return_percentage >= 0 ? C_SUCCESS : C_ERROR;
          return (
            <div key={a.id} style={{
              display: "flex", alignItems: "flex-start", justifyContent: "space-between",
              padding: "10px 0", borderBottom: `1px solid ${C_BORDER}`, gap: 12,
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flex: 1 }}>
                <div style={{
                  width: 3, minHeight: 40, borderRadius: 2,
                  background: color, flexShrink: 0, marginTop: 2,
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: C_PRIMARY }}>{a.symbol}</span>
                    <span style={{ fontSize: 10, color: "#aaa" }}>{ASSET_TYPE_LABELS[a.asset_type as keyof typeof ASSET_TYPE_LABELS] ?? a.asset_type}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
                    {`${a.symbol} ${direction} ${Math.abs(pct).toFixed(2)}% today — now at ${fmt$(a.current_price)}`}
                  </div>
                  <div style={{ fontSize: 10.5, color: "#aaa", marginTop: 3 }}>
                    {`${a.quantity} units held · ${fmt$(a.current_value)} value · total return `}
                    <span style={{ color: totalRetColor, fontWeight: 600 }}>
                      {a.return_percentage >= 0 ? "+" : ""}{a.return_percentage.toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color }}>
                  {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
                </div>
                <div style={{ fontSize: 11, color: "#aaa" }}>
                  {a.daily_change != null ? `${a.daily_change >= 0 ? "+" : ""}${fmt$(a.daily_change)}` : "—"}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Markowitz risk-return scatter plot ────────────────────────────────────────

function MarkowitzTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as MarkowitzPoint & { risk: number; ret: number };
  return (
    <div style={{
      background: "rgba(255,255,255,0.95)", backdropFilter: "blur(12px)",
      border: `1.5px solid ${C_BORDER}`, borderRadius: 8, padding: "10px 14px",
      fontSize: 12, boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
    }}>
      <div style={{ fontWeight: 700, color: C_PRIMARY, marginBottom: 4 }}>{d.symbol}</div>
      <div style={{ color: "#555" }}>Volatility: {d.risk.toFixed(1)}%</div>
      <div style={{ color: "#555" }}>CAGR: {d.ret >= 0 ? "+" : ""}{d.ret.toFixed(1)}%</div>
      <div style={{ color: "#999", fontSize: 11 }}>Value: {fmt$(d.value)}</div>
    </div>
  );
}

function MarkowitzScatterPlot() {
  const [data, setData]       = useState<MarkowitzPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    fetchMarkowitz()
      .then(setData)
      .catch(() => setError("Could not load — is the backend running on port 8000?"))
      .finally(() => setLoading(false));
  }, []);

  const plotData = data.filter((d) => d.risk !== null && d.ret !== null) as Array<MarkowitzPoint & { risk: number; ret: number }>;
  const noVolData = data.filter((d) => d.risk === null);

  return (
    <div style={{
      background: "rgba(255,255,255,0.55)", backdropFilter: "blur(14px)",
      border: `1.5px solid ${C_BORDER}`, borderRadius: 12, padding: "20px",
    }}>
      <div style={{ marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C_PRIMARY }}>Markowitz Risk-Return Plot</span>
        <p style={{ margin: "2px 0 0", fontSize: 11, color: "#999" }}>
          Annualised volatility (%) vs CAGR (%) — bubble size = position value
        </p>
      </div>

      {loading && (
        <div style={{ height: 260, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "#aaa" }}>
          <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
          <span style={{ fontSize: 12 }}>Computing volatility via yfinance…</span>
        </div>
      )}

      {!loading && error && (
        <div style={{ height: 260, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 12, color: C_ERROR }}>{error}</span>
        </div>
      )}

      {!loading && !error && plotData.length === 0 && (
        <div style={{ height: 260, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <BarChart2 size={28} color="#ccc" />
          <span style={{ fontSize: 12.5, color: "#aaa" }}>
            {data.length === 0
              ? "Add holdings to see risk-return analysis"
              : "Volatility unavailable — add stocks or ETFs to plot"}
          </span>
        </div>
      )}

      {!loading && !error && plotData.length > 0 && (
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C_BORDER} />
              <XAxis
                type="number" dataKey="risk" name="Volatility %" unit="%" tick={{ fontSize: 10 }}
                label={{ value: "Volatility %", position: "insideBottom", offset: -15, fontSize: 10 }}
              />
              <YAxis
                type="number" dataKey="ret" name="CAGR %" unit="%" tick={{ fontSize: 10 }} width={48}
                label={{ value: "CAGR %", angle: -90, position: "insideLeft", fontSize: 10 }}
              />
              <ZAxis type="number" dataKey="value" range={[60, 400]} />
              <RechartTooltip content={<MarkowitzTooltip />} />
              <Scatter data={plotData} fill={C_PRIMARY} opacity={0.78} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}

      {!loading && noVolData.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 11, color: "#aaa" }}>
          Not plotted (no volatility data): {noVolData.map((d) => d.symbol).join(", ")} — crypto &amp; real estate excluded
        </div>
      )}
    </div>
  );
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function PortfolioInsightsPanel({ holdings }: { holdings: InvestmentHolding[] }) {
  const [insights, setInsights] = useState<InvestmentInsight[]>([]);

  useEffect(() => {
    if (holdings.length === 0) { setInsights([]); return; }
    fetchInsights().then(setInsights).catch(() => setInsights([]));
  }, [holdings]);

  if (insights.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: "#999", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        Portfolio Alerts
      </span>
      {insights.map((ins, i) => {
        const color = SEVERITY_COLOR[ins.severity] ?? C_PRIMARY;
        return (
          <div key={i} style={{
            background: color + "0f", border: `1.5px solid ${color}40`,
            borderLeft: `4px solid ${color}`, borderRadius: 10, padding: "12px 14px",
            display: "flex", flexDirection: "column", gap: 5,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <AlertTriangle size={12} color={color} />
              <span style={{ fontWeight: 700, fontSize: 12, color }}>{ins.type}</span>
              <span style={{
                fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
                background: color + "20", color, padding: "1px 6px", borderRadius: 4,
              }}>{ins.severity}</span>
              {ins.affected.map((sym) => (
                <span key={sym} style={{
                  fontSize: 10, fontWeight: 700, background: "rgba(0,0,0,0.06)",
                  color: "#555", padding: "1px 6px", borderRadius: 4,
                }}>{sym}</span>
              ))}
            </div>
            <p style={{ margin: 0, fontSize: 12, color: "#555", lineHeight: 1.5 }}>{ins.message}</p>
          </div>
        );
      })}
    </div>
  );
}

function OverviewTab({
  holdings, summary, prices, snapshots, geoData, onBackfill,
}: {
  holdings: InvestmentHolding[];
  summary: PortfolioSummary | null;
  prices: MarketPrice[];
  snapshots: PortfolioSnapshot[];
  geoData: GeoExposureEntry[];
  onBackfill: () => Promise<void>;
}) {
  const holdingSymbols = new Set(holdings.map((h) => h.symbol.toUpperCase()));
  const plColor = summary && summary.profit_loss !== 0
    ? (summary.profit_loss >= 0 ? C_SUCCESS : C_ERROR)
    : C_PRIMARY;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <AlertBanner prices={prices} holdingSymbols={holdingSymbols} />

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <StatCard
          label="Portfolio Value"
          value={summary ? fmt$(summary.total_value) : "—"}
          sub={summary ? `${summary.holding_count} holding${summary.holding_count !== 1 ? "s" : ""} · market value` : "Loading…"}
          accent={C_PRIMARY}
          muted={!summary}
        />
        <StatCard
          label="Total Cost Basis"
          value={summary ? fmt$(summary.total_cost) : "—"}
          accent="#6366f1"
          muted={!summary}
        />
        <StatCard
          label="Profit / Loss"
          value={summary ? (summary.profit_loss >= 0 ? "+" : "") + fmt$(summary.profit_loss) : "—"}
          accent={plColor}
          muted={!summary}
        />
        <StatCard
          label="Return %"
          value={summary ? fmtPct(summary.return_percentage) : "—"}
          accent={plColor}
          muted={!summary}
        />
      </div>

      <PortfolioInsightsPanel holdings={holdings} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <AllocationPieChart holdings={holdings} geoData={geoData} />
        <GrowthLineChart snapshots={snapshots} onBackfill={onBackfill} />
      </div>

      <GainersLosersList />
      <PriceAlertsPanel assets={summary?.assets ?? []} />
    </div>
  );
}

// ── Holdings tab ──────────────────────────────────────────────────────────────

const ASSET_TYPES: AssetType[] = ["stock", "crypto", "etf", "fund", "real_estate"];
const TODAY = new Date().toISOString().slice(0, 10);

function AddHoldingModal({ onClose, onSave }: {
  onClose: () => void;
  onSave: (data: NewHolding) => Promise<void>;
}) {
  const [form, setForm] = useState<NewHolding>({
    symbol: "", asset_type: "stock", quantity: 0, buy_price: 0, purchase_date: TODAY,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const set = (k: keyof NewHolding, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.symbol.trim()) { setError("Symbol is required"); return; }
    if (form.quantity <= 0)  { setError("Quantity must be > 0"); return; }
    if (form.buy_price <= 0) { setError("Buy price must be > 0"); return; }
    setSaving(true); setError(null);
    try {
      await onSave({ ...form, symbol: form.symbol.toUpperCase().trim() });
      onClose();
    } catch {
      setError("Failed to save — is the backend running on port 8000?");
    } finally { setSaving(false); }
  }

  const inp: React.CSSProperties = {
    width: "100%", padding: "8px 10px", fontSize: 13,
    border: `1.5px solid ${C_BORDER}`, borderRadius: 7,
    background: "rgba(255,255,255,0.8)", outline: "none", boxSizing: "border-box",
  };
  const lbl: React.CSSProperties = { fontSize: 11.5, fontWeight: 600, color: "#555", display: "block", marginBottom: 4 };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
    }}>
      <div style={{
        background: "rgba(255,255,255,0.96)", backdropFilter: "blur(20px)",
        borderRadius: 14, padding: 28, width: 420, maxWidth: "90vw",
        border: `1.5px solid ${C_BORDER}`, boxShadow: "0 8px 40px rgba(0,0,0,0.15)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C_PRIMARY }}>Add Holding</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#888" }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={lbl}>Symbol</label>
            <input style={inp} placeholder="e.g. AAPL, BTC, VOO"
              value={form.symbol} onChange={(e) => set("symbol", e.target.value.toUpperCase())} />
          </div>
          <div>
            <label style={lbl}>Asset Type</label>
            <select style={{ ...inp, appearance: "auto" }} value={form.asset_type}
              onChange={(e) => set("asset_type", e.target.value as AssetType)}>
              {ASSET_TYPES.map((t) => <option key={t} value={t}>{ASSET_TYPE_LABELS[t]}</option>)}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={lbl}>Quantity</label>
              <input style={inp} type="number" min="0" step="0.000001" placeholder="0"
                value={form.quantity || ""} onChange={(e) => set("quantity", parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <label style={lbl}>Buy Price ($)</label>
              <input style={inp} type="number" min="0" step="0.01" placeholder="0.00"
                value={form.buy_price || ""} onChange={(e) => set("buy_price", parseFloat(e.target.value) || 0)} />
            </div>
          </div>
          <div>
            <label style={lbl}>Purchase Date</label>
            <input style={inp} type="date" value={form.purchase_date}
              onChange={(e) => set("purchase_date", e.target.value)} />
          </div>
          {error && <p style={{ margin: 0, fontSize: 12, color: C_ERROR, fontWeight: 500 }}>{error}</p>}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{
              padding: "9px 18px", fontSize: 13, fontWeight: 600, borderRadius: 8,
              border: `1.5px solid ${C_BORDER}`, background: "transparent", cursor: "pointer", color: "#555",
            }}>Cancel</button>
            <button type="submit" disabled={saving} style={{
              padding: "9px 18px", fontSize: 13, fontWeight: 600, borderRadius: 8,
              border: "none", background: C_PRIMARY, color: "#fff",
              cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1,
              display: "flex", alignItems: "center", gap: 6,
            }}>
              {saving && <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />}
              {saving ? "Saving…" : "Add Holding"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CsvUploadZone({ onUpload }: {
  onUpload: (file: File) => Promise<{ imported: number; symbols: string[]; errors: string[] }>;
}) {
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<
    null | { type: "loading" }
       | { type: "success"; imported: number; symbols: string[]; errors: string[] }
       | { type: "error"; message: string }
  >(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setStatus({ type: "loading" });
    try {
      setStatus({ type: "success", ...(await onUpload(file)) });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        ?? "Upload failed — is the backend running?";
      setStatus({ type: "error", message: msg });
    }
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? C_PRIMARY : C_BORDER}`, borderRadius: 12,
          padding: "28px 20px", display: "flex", flexDirection: "column",
          alignItems: "center", gap: 8, cursor: "pointer",
          background: dragging ? C_PRIMARY + "08" : "rgba(255,255,255,0.4)", transition: "all 0.15s",
        }}
      >
        <Upload size={22} color={dragging ? C_PRIMARY : "#aaa"} />
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: dragging ? C_PRIMARY : "#777" }}>
          Drop CSV here, or click to browse
        </p>
        <p style={{ margin: 0, fontSize: 11, color: "#aaa" }}>
          Required: <code>symbol, asset_type, quantity, buy_price</code> — optional: <code>purchase_date</code>
        </p>
        <input ref={inputRef} type="file" accept=".csv" style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
      </div>
      {status?.type === "loading" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 12, color: "#666" }}>
          <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> Parsing…
        </div>
      )}
      {status?.type === "success" && (
        <div style={{
          marginTop: 10, padding: "10px 14px", borderRadius: 8,
          background: C_SUCCESS + "10", border: `1px solid ${C_SUCCESS}40`,
          fontSize: 12, color: C_SUCCESS, fontWeight: 500,
        }}>
          Imported {status.imported} holding{status.imported !== 1 ? "s" : ""}
          {status.symbols.length > 0 && `: ${status.symbols.join(", ")}`}
          {status.errors.length > 0 && (
            <ul style={{ margin: "6px 0 0", paddingLeft: 16, color: C_ERROR }}>
              {status.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
        </div>
      )}
      {status?.type === "error" && (
        <div style={{
          marginTop: 10, padding: "10px 14px", borderRadius: 8,
          background: C_ERROR + "10", border: `1px solid ${C_ERROR}40`,
          fontSize: 12, color: C_ERROR, fontWeight: 500,
        }}>{status.message}</div>
      )}
    </div>
  );
}

function HoldingsTab({ holdings, loading, fetchError, summary, onAdd, onDelete, onClearAll, onCsvUpload }: {
  holdings: InvestmentHolding[]; loading: boolean; fetchError: string | null;
  summary: PortfolioSummary | null;
  onAdd: (data: NewHolding) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClearAll: () => Promise<void>;
  onCsvUpload: (file: File) => Promise<{ imported: number; symbols: string[]; errors: string[] }>;
}) {
  const [showAdd, setShowAdd]     = useState(false);
  const [showCsv, setShowCsv]     = useState(false);
  const [deletingId, setDeleting] = useState<string | null>(null);
  const [clearing, setClearing]   = useState(false);

  // Build a symbol → asset performance map from summary for live price display
  const assetMap: Record<string, AssetPerformance> = {};
  if (summary) {
    for (const a of summary.assets) {
      assetMap[a.symbol.toUpperCase()] = a;
    }
  }

  async function handleClearAll() {
    if (!confirm("Clear all holdings? This cannot be undone.")) return;
    setClearing(true);
    try { await onClearAll(); } finally { setClearing(false); }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try { await onDelete(id); } finally { setDeleting(null); }
  }

  const th: React.CSSProperties = {
    padding: "10px 14px", textAlign: "left", fontWeight: 700, fontSize: 10.5,
    color: "#777", letterSpacing: "0.04em", textTransform: "uppercase",
  };
  const td: React.CSSProperties = { padding: "11px 14px", fontSize: 12.5, color: "#333", borderTop: `1px solid ${C_BORDER}` };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={() => setShowAdd(true)} style={{
          display: "flex", alignItems: "center", gap: 6, background: C_PRIMARY,
          color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer",
        }}><Plus size={13} /> Add Holding</button>
        <button onClick={() => setShowCsv((v) => !v)} style={{
          display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.7)",
          color: C_PRIMARY, border: `1.5px solid ${C_BORDER}`, borderRadius: 8,
          padding: "9px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer",
        }}><Upload size={13} /> {showCsv ? "Hide CSV" : "Import CSV"}</button>
        {holdings.length > 0 && (
          <button onClick={handleClearAll} disabled={clearing} style={{
            display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.7)",
            color: C_ERROR, border: `1.5px solid ${C_ERROR}40`, borderRadius: 8,
            padding: "9px 16px", fontSize: 12, fontWeight: 600,
            cursor: clearing ? "not-allowed" : "pointer", opacity: clearing ? 0.6 : 1, marginLeft: "auto",
          }}>
            {clearing ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Trash2 size={13} />}
            {clearing ? "Clearing…" : "Clear All"}
          </button>
        )}
      </div>

      {showCsv && <CsvUploadZone onUpload={async (f) => { const r = await onCsvUpload(f); return r; }} />}

      {fetchError && (
        <div style={{
          padding: "10px 14px", borderRadius: 8,
          background: C_ERROR + "10", border: `1px solid ${C_ERROR}40`, fontSize: 12, color: C_ERROR, fontWeight: 500,
        }}>{fetchError}</div>
      )}

      <div style={{
        background: "rgba(255,255,255,0.55)", backdropFilter: "blur(14px)",
        border: `1.5px solid ${C_BORDER}`, borderRadius: 12, overflow: "hidden",
      }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "rgba(255,255,255,0.3)" }}>
              {["Symbol", "Asset Type", "Quantity", "Buy Price", "Current Price", "P / L", "Return %", ""].map((h) => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ ...td, textAlign: "center", color: "#aaa" }}>
                <Loader2 size={16} style={{ animation: "spin 1s linear infinite", display: "inline" }} /> Loading…
              </td></tr>
            ) : holdings.length === 0 ? (
              <tr><td colSpan={8} style={{ ...td, textAlign: "center", color: "#aaa" }}>
                No holdings yet — add manually or import a CSV
              </td></tr>
            ) : holdings.map((h) => {
              const perf = assetMap[h.symbol.toUpperCase()];
              const plColor = perf ? (perf.profit_loss >= 0 ? C_SUCCESS : C_ERROR) : "#bbb";
              return (
                <tr key={h.id}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.4)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={{ ...td, fontWeight: 700, color: C_PRIMARY }}>{h.symbol}</td>
                  <td style={td}>{ASSET_TYPE_LABELS[h.asset_type] ?? h.asset_type}</td>
                  <td style={td}>{h.quantity.toLocaleString(undefined, { maximumFractionDigits: 6 })}</td>
                  <td style={td}>{fmt$(h.buy_price)}</td>
                  <td style={td}>{perf ? fmt$(perf.current_price) : <span style={{ color: "#bbb" }}>—</span>}</td>
                  <td style={{ ...td, color: plColor, fontWeight: perf ? 600 : 400 }}>
                    {perf ? (perf.profit_loss >= 0 ? "+" : "") + fmt$(perf.profit_loss) : "—"}
                  </td>
                  <td style={{ ...td, color: plColor, fontWeight: perf ? 600 : 400 }}>
                    {perf ? fmtPct(perf.return_percentage) : "—"}
                  </td>
                  <td style={td}>
                    <button onClick={() => handleDelete(String(h.id))} disabled={deletingId === String(h.id)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#ccc", padding: 4, borderRadius: 4, display: "flex", alignItems: "center" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = C_ERROR)}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "#ccc")}
                    >
                      {deletingId === String(h.id)
                        ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
                        : <Trash2 size={13} />}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {holdings.length > 0 && (
            <tfoot>
              <tr style={{ background: "rgba(255,255,255,0.2)", borderTop: `1.5px solid ${C_BORDER}` }}>
                <td colSpan={3} style={{ ...td, fontWeight: 700, fontSize: 11, color: "#777" }}>
                  {holdings.length} holding{holdings.length !== 1 ? "s" : ""}
                </td>
                <td style={{ ...td, fontWeight: 700 }}>
                  {fmt$(holdings.reduce((s, h) => s + h.quantity * h.buy_price, 0))}
                  <span style={{ fontSize: 10, fontWeight: 400, color: "#aaa", marginLeft: 4 }}>cost</span>
                </td>
                <td colSpan={4} style={{ ...td, fontWeight: 700 }}>
                  {summary
                    ? <>{fmt$(summary.total_value)} <span style={{ fontSize: 10, fontWeight: 400, color: C_SUCCESS, marginLeft: 4 }}>market value</span></>
                    : <span style={{ fontSize: 11, color: "#aaa" }}>Market value loading…</span>}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {showAdd && <AddHoldingModal onClose={() => setShowAdd(false)} onSave={onAdd} />}
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ── Analytics tab ─────────────────────────────────────────────────────────────

function AnalyticsTab() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <MarkowitzScatterPlot />
    </div>
  );
}

// ── Insights tab ──────────────────────────────────────────────────────────────

const SEVERITY_COLOR: Record<string, string> = {
  high: C_ERROR, medium: C_WARNING, low: C_SUCCESS, info: C_PRIMARY,
};

// ── AI Scenarios tab ──────────────────────────────────────────────────────────

function AITab({ holdings, summary }: { holdings: InvestmentHolding[]; summary: PortfolioSummary | null }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p style={{ fontSize: 12.5, color: "#666", margin: 0 }}>
        Auto-generated portfolio health report — strengths, weaknesses, and next steps based on your holdings and onboarding profile. For a full conversation, switch to the Ask Elly tab.
      </p>

      <InvestmentAIPanel holdings={holdings} summary={summary} />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function InvestmentPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [holdings, setHoldings]   = useState<InvestmentHolding[]>([]);
  const [summary, setSummary]     = useState<PortfolioSummary | null>(null);
  const [prices, setPrices]       = useState<MarketPrice[]>([]);
  const [snapshots, setSnapshots] = useState<PortfolioSnapshot[]>([]);
  const [geoData, setGeoData]     = useState<GeoExposureEntry[]>([]);
  const [loading, setLoading]     = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    setFetchError(null);
    try {
      const [h, p] = await Promise.all([fetchHoldings(), fetchPrices()]);
      setHoldings(h);
      setPrices(p);
      const s = await fetchSummary();
      setSummary(s);
      let snaps = await fetchSnapshots();
      if (snaps.length < 2 && h.length > 0) {
        await backfillSnapshots();
        snaps = await fetchSnapshots();
      }
      setSnapshots(snaps);
      // geo exposure is slow (yFinance per holding) — fetch last, fail silently
      fetchGeographicExposure()
        .then((r) => setGeoData(r.by_geography))
        .catch(() => {});
    } catch {
      setFetchError("Could not load — is the backend running on port 8000?");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  async function handleAdd(data: NewHolding) {
    await addHolding(data);
    await loadAll();
  }
  async function handleDelete(id: string) {
    await deleteHolding(id);
    await loadAll();
  }
  async function handleCsvUpload(file: File) {
    const result = await uploadHoldingsCsv(file);
    await loadAll();
    return result;
  }
  async function handleClearAll() {
    await clearAllHoldings();
    setHoldings([]);
    setSummary(null);
    setSnapshots([]);
  }
  async function handleBackfill() {
    await backfillSnapshots();
    const snaps = await fetchSnapshots();
    setSnapshots(snaps);
  }

  const tabContent: Record<string, React.ReactNode> = {
    overview:  <OverviewTab holdings={holdings} summary={summary} prices={prices} snapshots={snapshots} geoData={geoData} onBackfill={handleBackfill} />,
    holdings:  <HoldingsTab holdings={holdings} loading={loading} fetchError={fetchError} summary={summary}
                 onAdd={handleAdd} onDelete={handleDelete} onClearAll={handleClearAll} onCsvUpload={handleCsvUpload} />,
    analytics: <AnalyticsTab />,
    risk:      <RiskTab holdings={holdings} summary={summary} snapshots={snapshots} />,
    goals:     <InvestmentGoalsTab holdings={holdings} summary={summary} />,
    ai:        <AITab holdings={holdings} summary={summary} />,
    chat:      <EllyChat holdings={holdings} summary={summary} />,
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{
        padding: "20px 28px 16px", borderBottom: `1.5px solid ${C_BORDER}`,
        background: "rgba(255,255,255,0.35)", backdropFilter: "blur(12px)", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <TrendingUp size={18} color={C_PRIMARY} />
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: C_PRIMARY }}>Investment Intelligence</h1>
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase",
            background: C_PRIMARY + "15", color: C_PRIMARY, padding: "2px 8px", borderRadius: 4,
          }}>Feature 3</span>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: "#777" }}>
          Portfolio tracking, market data, analytics, and AI-powered scenario planning.
        </p>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>
        <TabBar active={activeTab} onChange={setActiveTab} />
        {tabContent[activeTab]}
      </div>
    </div>
  );
}
