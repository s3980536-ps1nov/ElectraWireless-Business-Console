import { useMemo } from "react";
import {
  Shield, AlertTriangle, CheckCircle, RefreshCw,
  Zap, TrendingUp, DollarSign, Clock, Repeat,
  PieChart as PieIcon,
} from "lucide-react";
import { useInvestmentContextStore } from "@/store/investmentContextStore";
import type {
  InvestmentStrategy, ExperienceLevel, TimeHorizon, AssetInterest,
} from "@/store/investmentContextStore";
import type {
  PortfolioSummary, PortfolioSnapshot, InvestmentHolding, AssetPerformance,
} from "@/services/investmentApi";
import { C_PRIMARY, C_BORDER, C_SUCCESS, C_ERROR, C_WARNING } from "@/lib/colors";

// ── Helpers ────────────────────────────────────────────────────────────────────

function computeMaxDrawdown(snapshots: PortfolioSnapshot[]): number {
  if (snapshots.length < 2) return 0;
  let peak = snapshots[0].total_value;
  let maxDD = 0;
  for (const s of snapshots) {
    if (s.total_value > peak) peak = s.total_value;
    if (peak > 0) {
      const dd = (peak - s.total_value) / peak * 100;
      if (dd > maxDD) maxDD = dd;
    }
  }
  return maxDD;
}

// ── Risk tier ──────────────────────────────────────────────────────────────────

type RiskTier = "Conservative" | "Moderate" | "Aggressive" | "Speculative";

const TIER_COLOR: Record<RiskTier, string> = {
  Conservative: C_SUCCESS,
  Moderate:     C_PRIMARY,
  Aggressive:   C_WARNING,
  Speculative:  C_ERROR,
};

const TIER_DESC: Record<RiskTier, string> = {
  Conservative: "Your strategy prioritises capital preservation and steady returns over high growth.",
  Moderate:     "Your strategy balances growth potential with manageable risk exposure.",
  Aggressive:   "Your strategy accepts higher volatility in pursuit of above-market returns.",
  Speculative:  "Your strategy involves significant short-term risk. Active monitoring is critical.",
};

function deriveRiskTier(
  strategies: InvestmentStrategy[],
  experience: ExperienceLevel,
  assetInterests: AssetInterest[],
  horizon: TimeHorizon,
): RiskTier {
  const hasDayTrading    = strategies.includes("day_trading");
  const hasCrypto        = assetInterests.includes("crypto");
  const hasGrowth        = strategies.includes("growth");
  const shortHorizon     = horizon === "daily" || horizon === "weekly";
  const hasConservative  = strategies.includes("index") || strategies.includes("buy_and_hold") || strategies.includes("income");

  if (hasDayTrading && (hasCrypto || shortHorizon)) return "Speculative";
  if (hasDayTrading)                                return "Aggressive";
  if (hasGrowth && experience === "advanced")       return "Aggressive";
  if (hasGrowth)                                    return "Aggressive";
  if (hasConservative && !hasGrowth)                return "Conservative";
  return "Moderate";
}

// ── Strategy content config ────────────────────────────────────────────────────

const STRATEGY_LABELS: Record<InvestmentStrategy, string> = {
  day_trading:         "Day Trading",
  index:               "Index",
  growth:              "Growth",
  income:              "Income",
  buy_and_hold:        "Buy & Hold",
  dollar_cost_average: "Dollar-Cost Average",
};

interface StrategyConfig {
  icon: React.ReactNode;
  keyRisks: string[];
  protections: Array<{ label: string; detail: string }>;
  showRebalancing: boolean;
}

const STRATEGY_CONFIG: Record<InvestmentStrategy, StrategyConfig> = {
  day_trading: {
    icon: <Zap size={14} />,
    keyRisks: [
      "Intraday swings can eliminate gains rapidly without predefined exit rules.",
      "Emotional trading under pressure leads to oversized positions and revenge trades.",
      "Overtrading erodes returns through transaction costs and slippage.",
    ],
    protections: [
      { label: "Hard Stop-Loss Per Trade",   detail: "Cap single-trade loss at 1–2% of total capital. Exit automatically — no exceptions." },
      { label: "Daily Drawdown Limit",       detail: "Stop trading for the day if you lose more than 3% of capital. Prevents loss spirals." },
      { label: "Position Sizing Rule",       detail: "Never allocate more than 5% of total capital to a single intraday position." },
      { label: "Pre-Market Checklist",       detail: "Review key levels, news catalysts, and overnight gaps before placing any trade." },
    ],
    showRebalancing: false,
  },
  index: {
    icon: <PieIcon size={14} />,
    keyRisks: [
      "Allocation drift from target reduces the benefit of passive diversification.",
      "Holding only one index family (e.g. S&P 500 only) limits true diversification.",
      "Skipping rebalancing windows leads to unintended risk tilts over time.",
    ],
    protections: [
      { label: "Rebalance When Drift > 5%",       detail: "If any index position drifts more than 5% from target allocation, rebalance back." },
      { label: "Diversify Across Index Families",  detail: "Blend US total market, international, and bond index funds to reduce single-region risk." },
      { label: "Avoid Timing the Market",          detail: "Index investing benefits from consistent contributions — do not pause during corrections." },
    ],
    showRebalancing: true,
  },
  growth: {
    icon: <TrendingUp size={14} />,
    keyRisks: [
      "High-growth positions can fall 40–60% in corrections even when the thesis is intact.",
      "Sector concentration in tech or healthcare amplifies correlated drawdowns.",
      "Growth stocks may underperform for extended periods during rate-rising cycles.",
    ],
    protections: [
      { label: "Cap Single-Sector at 30%",   detail: "No sector should exceed 30% of portfolio value. Review allocation monthly." },
      { label: "Stagger Entry Points",        detail: "Deploy capital in tranches over 2–4 weeks — reduces timing risk on new positions." },
      { label: "Pre-Entry Mental Stop-Loss",  detail: "Define the maximum loss you accept per growth holding (e.g. 25%) before entering." },
      { label: "Pair with Defensive Assets",  detail: "Balance aggressive growth names with at least 20% in stable, low-volatility assets." },
    ],
    showRebalancing: false,
  },
  income: {
    icon: <DollarSign size={14} />,
    keyRisks: [
      "Dividend cuts during recessions reduce income streams without price recovery.",
      "Chasing high-yield stocks often masks weak fundamentals or excessive debt.",
      "Inflation gradually erodes the real purchasing power of fixed dividend income.",
    ],
    protections: [
      { label: "Screen for Payout Ratio < 70%",   detail: "Only hold income stocks with sustainable payout ratios and a consistent 5-year history." },
      { label: "Diversify Income Sources",         detail: "Mix dividend stocks, REITs, and bond ETFs so a single cut doesn't collapse your income." },
      { label: "Monitor Yield vs. Risk-Free Rate", detail: "When bond rates rise, equity dividends become less attractive — rebalance accordingly." },
    ],
    showRebalancing: true,
  },
  buy_and_hold: {
    icon: <Clock size={14} />,
    keyRisks: [
      "Large bear market drawdowns test conviction — panic selling at lows locks in losses.",
      "Neglecting annual rebalancing leads to unintended concentration in winning positions.",
      "A long horizon still requires periodic review as life circumstances change.",
    ],
    protections: [
      { label: "Annual Portfolio Review",          detail: "Set a calendar reminder to review once per year — resist the urge to check daily." },
      { label: "Define Max Drawdown Tolerance",    detail: "Know your threshold (e.g. −40%) before a correction hits so you hold through it calmly." },
      { label: "Rebalance Annually",               detail: "Trim winners and add to laggards once a year to maintain your intended allocation." },
      { label: "Maintain Emergency Cash Reserve",  detail: "Keep 6 months of expenses in cash outside investments — never sell holdings at a bad time." },
    ],
    showRebalancing: true,
  },
  dollar_cost_average: {
    icon: <Repeat size={14} />,
    keyRisks: [
      "Inconsistent contributions break the averaging benefit and reintroduce timing risk.",
      "DCA into a structurally declining asset averages down into sustained losses.",
      "Over-concentrating DCA targets while neglecting overall portfolio balance.",
    ],
    protections: [
      { label: "Automate Contributions",       detail: "Set up fixed recurring purchases on a schedule — remove the temptation to time entries." },
      { label: "Review DCA Targets Quarterly", detail: "Confirm that DCA assets still have sound fundamentals every 3 months." },
      { label: "Set a DCA Budget Cap",         detail: "Define what percentage of monthly income goes to DCA purchases and stick to it." },
    ],
    showRebalancing: true,
  },
};

// ── Conflict detection ─────────────────────────────────────────────────────────

interface Conflict {
  severity: "high" | "medium";
  message: string;
}

function detectConflicts(
  strategies: InvestmentStrategy[],
  horizon: TimeHorizon,
  assetInterests: AssetInterest[],
  summary: PortfolioSummary | null,
): Conflict[] {
  const out: Conflict[] = [];

  if (
    (strategies.includes("buy_and_hold") || strategies.includes("index")) &&
    (horizon === "daily" || horizon === "weekly")
  ) {
    const name = strategies.includes("buy_and_hold") ? "Buy & Hold" : "Index";
    out.push({
      severity: "high",
      message: `Your time horizon (${horizon}) conflicts with the ${name} strategy, which needs months or years to work. Consider extending your horizon or revising your strategy selection.`,
    });
  }

  if (strategies.includes("day_trading") && horizon === "indefinitely") {
    out.push({
      severity: "medium",
      message: "Day Trading with an indefinite horizon suggests unclear goals. Day traders operate on a daily or weekly cycle — define your trading schedule explicitly.",
    });
  }

  if (strategies.includes("income") && assetInterests.length > 0 && assetInterests.every((a) => a === "crypto")) {
    out.push({
      severity: "high",
      message: "Income strategy selected but only Crypto assets chosen. Crypto typically doesn't pay dividends — add dividend stocks or bond ETFs to generate income.",
    });
  }

  const overexposed = summary?.diversification?.overexposed_holdings ?? [];
  for (const h of overexposed.slice(0, 2)) {
    out.push({
      severity: "medium",
      message: `${h.symbol} makes up ${h.percentage.toFixed(1)}% of your portfolio — above the 25% safe concentration limit recommended for most strategies.`,
    });
  }

  return out;
}

// ── UI sub-components ──────────────────────────────────────────────────────────

function RiskBanner({ tier }: { tier: RiskTier }) {
  const color = TIER_COLOR[tier];
  return (
    <div style={{
      background: `${color}0f`, border: `1.5px solid ${color}40`,
      borderLeft: `4px solid ${color}`, borderRadius: 12, padding: "16px 20px",
      display: "flex", alignItems: "center", gap: 14,
    }}>
      <Shield size={22} color={color} />
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color }}>Risk Profile: {tier}</span>
          <span style={{
            fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em",
            background: `${color}20`, color, padding: "2px 7px", borderRadius: 4,
          }}>
            Derived from onboarding
          </span>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: "#666", lineHeight: 1.5 }}>{TIER_DESC[tier]}</p>
      </div>
    </div>
  );
}

function RiskMetricCard({
  label, value, sub, accent, muted,
}: {
  label: string; value: string; sub?: string; accent: string; muted?: boolean;
}) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.6)", backdropFilter: "blur(16px)",
      border: `1.5px solid ${C_BORDER}`, borderTop: `3px solid ${accent}`,
      borderRadius: 12, padding: "16px 20px", flex: 1, minWidth: 140,
    }}>
      <div style={{
        fontSize: 11, color: "#888", fontWeight: 600,
        letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 8,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 24, fontWeight: 800, letterSpacing: "-0.5px",
        color: muted ? "#bbb" : accent,
      }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: "#999", marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

function ConflictPanel({ conflicts }: { conflicts: Conflict[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: "#555", letterSpacing: "0.03em" }}>
        Strategy Alignment Checks
      </span>
      {conflicts.map((c, i) => {
        const color = c.severity === "high" ? C_ERROR : C_WARNING;
        return (
          <div key={i} style={{
            background: `${color}0f`, border: `1.5px solid ${color}40`,
            borderLeft: `4px solid ${color}`, borderRadius: 10,
            padding: "12px 16px", display: "flex", gap: 10, alignItems: "flex-start",
          }}>
            <AlertTriangle size={13} color={color} style={{ flexShrink: 0, marginTop: 2 }} />
            <p style={{ margin: 0, fontSize: 12, color: "#555", lineHeight: 1.5 }}>{c.message}</p>
          </div>
        );
      })}
    </div>
  );
}

function StrategyPanel({ strategy }: { strategy: InvestmentStrategy }) {
  const cfg = STRATEGY_CONFIG[strategy];
  return (
    <div style={{
      background: "rgba(255,255,255,0.55)", backdropFilter: "blur(14px)",
      border: `1.5px solid ${C_BORDER}`, borderRadius: 12,
      padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: C_PRIMARY, display: "flex" }}>{cfg.icon}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: C_PRIMARY }}>
          {STRATEGY_LABELS[strategy]} — Key Risks
        </span>
      </div>

      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
        {cfg.keyRisks.map((r, i) => (
          <li key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <AlertTriangle size={11} color={C_ERROR} style={{ flexShrink: 0, marginTop: 3 }} />
            <span style={{ fontSize: 12, color: "#555", lineHeight: 1.55 }}>{r}</span>
          </li>
        ))}
      </ul>

      <div>
        <span style={{
          fontSize: 11, fontWeight: 700, color: "#888",
          letterSpacing: "0.04em", textTransform: "uppercase",
        }}>
          Protection Strategies
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          {cfg.protections.map((p, i) => (
            <div key={i} style={{
              display: "flex", gap: 10, alignItems: "flex-start",
              padding: "10px 12px",
              background: `${C_SUCCESS}08`, border: `1px solid ${C_SUCCESS}25`, borderRadius: 8,
            }}>
              <CheckCircle size={13} color={C_SUCCESS} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#333", marginBottom: 2 }}>{p.label}</div>
                <div style={{ fontSize: 11.5, color: "#666", lineHeight: 1.5 }}>{p.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RebalancingPanel({ summary }: { summary: PortfolioSummary }) {
  const total     = summary.total_value;
  const idealPct  = summary.assets.length > 0 ? 100 / summary.assets.length : 0;
  const positions = [...summary.assets]
    .sort((a, b) => b.current_value - a.current_value)
    .slice(0, 6);

  return (
    <div style={{
      background: "rgba(255,255,255,0.55)", backdropFilter: "blur(14px)",
      border: `1.5px solid ${C_BORDER}`, borderRadius: 12, padding: "18px 20px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <RefreshCw size={14} color={C_PRIMARY} />
        <span style={{ fontSize: 13, fontWeight: 700, color: C_PRIMARY }}>Rebalancing Indicator</span>
        <span style={{ fontSize: 10, color: "#aaa", marginLeft: "auto" }}>Equal-weight baseline · top 6</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {positions.map((a) => {
          const actualPct = total > 0 ? (a.current_value / total) * 100 : 0;
          const drift     = actualPct - idealPct;
          const driftAbs  = Math.abs(drift);
          const barColor  = driftAbs > 5 ? (drift > 0 ? C_WARNING : C_PRIMARY) : C_SUCCESS;

          return (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C_PRIMARY, minWidth: 56 }}>
                {a.symbol}
              </span>
              <div style={{
                flex: 1, background: "#f0f0f4", borderRadius: 4, height: 6, overflow: "hidden",
              }}>
                <div style={{
                  width: `${Math.min(actualPct, 100)}%`, height: "100%",
                  background: barColor, borderRadius: 4, transition: "width 0.4s ease",
                }} />
              </div>
              <span style={{
                fontSize: 11, fontWeight: 600, color: barColor, minWidth: 44, textAlign: "right",
              }}>
                {actualPct.toFixed(1)}%
              </span>
              <span style={{
                fontSize: 10,
                fontWeight: driftAbs > 5 ? 700 : 400,
                color: driftAbs > 5 ? barColor : "#aaa",
                background: driftAbs > 5 ? `${barColor}18` : "transparent",
                padding: "1px 6px", borderRadius: 4, minWidth: 72, textAlign: "center",
              }}>
                {driftAbs > 5 ? `${drift > 0 ? "+" : ""}${drift.toFixed(1)}% drift` : "on target"}
              </span>
            </div>
          );
        })}
      </div>

      <p style={{ margin: "12px 0 0", fontSize: 11, color: "#aaa", lineHeight: 1.5 }}>
        Positions drifting more than ±5% from equal-weight baseline are flagged. Rebalance if your strategy targets a specific allocation.
      </p>
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────

export interface RiskTabProps {
  holdings:  InvestmentHolding[];
  summary:   PortfolioSummary | null;
  snapshots: PortfolioSnapshot[];
}

export function RiskTab({ holdings, summary, snapshots }: RiskTabProps) {
  const { investmentStrategies, experienceLevel, assetInterests, timeHorizon } =
    useInvestmentContextStore();

  const riskTier = useMemo(
    () => deriveRiskTier(investmentStrategies, experienceLevel, assetInterests, timeHorizon),
    [investmentStrategies, experienceLevel, assetInterests, timeHorizon],
  );

  const maxDrawdown = useMemo(() => computeMaxDrawdown(snapshots), [snapshots]);

  const conflicts = useMemo(
    () => detectConflicts(investmentStrategies, timeHorizon, assetInterests, summary),
    [investmentStrategies, timeHorizon, assetInterests, summary],
  );

  const showRebalancing = investmentStrategies.some((s) => STRATEGY_CONFIG[s].showRebalancing);

  const largestAsset = useMemo(
    () =>
      summary?.assets.reduce<AssetPerformance | null>(
        (best, a) => (!best || a.current_value > best.current_value ? a : best),
        null,
      ) ?? null,
    [summary],
  );

  const largestPct =
    summary && summary.total_value > 0 && largestAsset
      ? (largestAsset.current_value / summary.total_value) * 100
      : null;

  const divScore = summary?.diversification?.score ?? null;

  if (investmentStrategies.length === 0) {
    return (
      <div style={{
        padding: "32px 20px", borderRadius: 12, textAlign: "center",
        background: "rgba(255,255,255,0.4)", border: `1.5px dashed ${C_BORDER}`,
      }}>
        <Shield size={28} color="#ccc" style={{ display: "block", margin: "0 auto 10px" }} />
        <p style={{ margin: 0, fontSize: 13, color: "#aaa" }}>
          Complete the investment onboarding and select at least one strategy to see your risk profile.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Risk profile banner */}
      <RiskBanner tier={riskTier} />

      {/* Key metrics row */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <RiskMetricCard
          label="Max Drawdown"
          value={holdings.length === 0 || snapshots.length < 2 ? "—" : `-${maxDrawdown.toFixed(1)}%`}
          sub={snapshots.length < 2 ? "Not enough history yet" : "Peak-to-trough · all time"}
          accent={maxDrawdown > 20 ? C_ERROR : maxDrawdown > 10 ? C_WARNING : C_SUCCESS}
          muted={snapshots.length < 2}
        />
        <RiskMetricCard
          label="Largest Position"
          value={largestPct != null ? `${largestPct.toFixed(1)}%` : "—"}
          sub={largestAsset?.symbol ?? "No holdings"}
          accent={
            largestPct == null    ? C_PRIMARY  :
            largestPct > 40       ? C_ERROR    :
            largestPct > 25       ? C_WARNING  : C_SUCCESS
          }
          muted={largestPct == null}
        />
        <RiskMetricCard
          label="Diversification"
          value={divScore != null ? `${divScore}/100` : "—"}
          sub={
            divScore == null  ? "No holdings" :
            divScore >= 70    ? "Well diversified" :
            divScore >= 40    ? "Moderately diversified" : "Needs diversification"
          }
          accent={
            divScore == null  ? C_PRIMARY :
            divScore >= 70    ? C_SUCCESS :
            divScore >= 40    ? C_WARNING : C_ERROR
          }
          muted={divScore == null}
        />
        <RiskMetricCard
          label="Holdings"
          value={summary ? String(summary.holding_count) : "—"}
          sub={
            summary
              ? `${summary.diversification?.distinct_asset_types?.length ?? 0} asset type${(summary.diversification?.distinct_asset_types?.length ?? 0) !== 1 ? "s" : ""}`
              : "No data"
          }
          accent={C_PRIMARY}
          muted={!summary}
        />
      </div>

      {/* Strategy alignment warnings */}
      {conflicts.length > 0 && <ConflictPanel conflicts={conflicts} />}

      {/* Active strategies label row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#555" }}>Active Strategies:</span>
        {investmentStrategies.map((s) => (
          <span key={s} style={{
            fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 6,
            background: `${C_PRIMARY}12`, color: C_PRIMARY, border: `1px solid ${C_PRIMARY}30`,
          }}>
            {STRATEGY_LABELS[s]}
          </span>
        ))}
      </div>

      {/* Per-strategy risk + protection panels */}
      {investmentStrategies.map((s) => <StrategyPanel key={s} strategy={s} />)}

      {/* Rebalancing (only for applicable strategies) */}
      {showRebalancing && summary && summary.assets.length > 0 && (
        <RebalancingPanel summary={summary} />
      )}

    </div>
  );
}
