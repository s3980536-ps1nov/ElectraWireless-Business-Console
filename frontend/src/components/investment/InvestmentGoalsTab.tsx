import { useState, useMemo } from "react";
import { useInvestmentGoalsStore } from "@/store/investmentGoalsStore";
import type { InvestmentGoal, GoalFrequency } from "@/store/investmentGoalsStore";
import type { InvestmentStrategy, AssetInterest } from "@/store/investmentContextStore";
import type { InvestmentHolding, PortfolioSummary } from "@/services/investmentApi";
import { C_PRIMARY, C_BORDER, C_ERROR } from "@/lib/colors";
import {
  progressColor,
  DeadlineBadge,
  inputStyle,
  inputWrapStyle,
  prefixStyle,
  btnPrimaryStyle,
  btnSecondaryStyle,
} from "@/lib/goalStyles";

// ── Domain labels ─────────────────────────────────────────────────────────────

const STRATEGY_OPTIONS: ReadonlyArray<{ value: InvestmentStrategy; label: string }> = [
  { value: "day_trading",         label: "Day Trading" },
  { value: "index",               label: "Index" },
  { value: "growth",              label: "Growth" },
  { value: "income",              label: "Income" },
  { value: "buy_and_hold",        label: "Buy and Hold" },
  { value: "dollar_cost_average", label: "Dollar-Cost Average" },
];

const STRATEGY_LABEL: Record<InvestmentStrategy, string> =
  STRATEGY_OPTIONS.reduce((acc, o) => ({ ...acc, [o.value]: o.label }), {} as Record<InvestmentStrategy, string>);

const ASSET_OPTIONS: ReadonlyArray<{ value: AssetInterest; label: string }> = [
  { value: "stock",  label: "Stocks" },
  { value: "etf",    label: "ETFs" },
  { value: "crypto", label: "Crypto" },
];

const ASSET_LABEL: Record<AssetInterest, string> =
  ASSET_OPTIONS.reduce((acc, o) => ({ ...acc, [o.value]: o.label }), {} as Record<AssetInterest, string>);

const FREQUENCY_OPTIONS: ReadonlyArray<{ value: GoalFrequency; label: string }> = [
  { value: "weekly",  label: "Weekly"  },
  { value: "monthly", label: "Monthly" },
];

const STRATEGY_TARGET_HINT: Record<InvestmentStrategy, string> = {
  dollar_cost_average: "$ to invest each period in the chosen asset.",
  buy_and_hold:        "Total $ to invest and hold in the chosen asset.",
  growth:              "Target portfolio value to reach in the chosen asset.",
  index:               "Total $ allocated to ETF (index) positions.",
  income:              "Capital deployed in income-producing assets (dividend tracking coming soon).",
  day_trading:         "Trading capital deployed in the chosen asset.",
};

// ── Progress calculation ──────────────────────────────────────────────────────

function periodStart(freq: GoalFrequency): Date {
  const now = new Date();
  if (freq === "monthly") {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  // weekly: Monday-based start of current week
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const offset = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - offset);
  return d;
}

/**
 * Returns the "current amount" for a goal: auto-derived from matching holdings
 * (filtered by asset type and optionally by symbol) + any manual contributions.
 *
 * - DCA: cost basis of matching holdings purchased in the current period bucket.
 * - Buy & Hold / Index: cost basis of matching holdings (Index forces asset = ETF).
 * - Growth / Income / Day Trading: current value of matching holdings.
 */
function computeInvestmentGoalProgress(
  goal: InvestmentGoal,
  holdings: InvestmentHolding[],
  summary: PortfolioSummary | null,
): number {
  const effectiveAsset: AssetInterest = goal.strategy === "index" ? "etf" : goal.assetType;
  const goalSymbol = goal.symbol?.trim().toUpperCase();
  const symbolMatches = (s: string) => !goalSymbol || s.trim().toUpperCase() === goalSymbol;
  const manual = goal.manualContribution ?? 0;

  if (goal.strategy === "dollar_cost_average") {
    if (!goal.frequency) return manual;
    const start = periodStart(goal.frequency).getTime();
    const auto = holdings
      .filter((h) => h.asset_type === effectiveAsset)
      .filter((h) => symbolMatches(h.symbol))
      .filter((h) => new Date(h.purchase_date).getTime() >= start)
      .reduce((s, h) => s + h.quantity * h.buy_price, 0);
    return auto + manual;
  }

  if (!summary) return manual;
  const matching = summary.assets
    .filter((a) => a.asset_type === effectiveAsset)
    .filter((a) => symbolMatches(a.symbol));

  if (goal.strategy === "buy_and_hold" || goal.strategy === "index") {
    return matching.reduce((s, a) => s + a.cost_basis, 0) + manual;
  }
  // growth, income, day_trading
  return matching.reduce((s, a) => s + a.current_value, 0) + manual;
}

// ── Goal Card ─────────────────────────────────────────────────────────────────

interface GoalCardProps {
  goal:     InvestmentGoal;
  holdings: InvestmentHolding[];
  summary:  PortfolioSummary | null;
}

function GoalCard({ goal, holdings, summary }: GoalCardProps) {
  const updateGoal = useInvestmentGoalsStore((s) => s.updateGoal);
  const deleteGoal = useInvestmentGoalsStore((s) => s.deleteGoal);

  const [editing, setEditing] = useState(false);
  const [draftTitle,     setDraftTitle]     = useState(goal.title);
  const [draftTarget,    setDraftTarget]    = useState(String(goal.targetAmount));
  const [draftDeadline,  setDraftDeadline]  = useState(goal.deadline);
  const [draftFrequency, setDraftFrequency] = useState<GoalFrequency>(goal.frequency ?? "monthly");
  const [draftSymbol,    setDraftSymbol]    = useState(goal.symbol ?? "");
  const [draftManual,    setDraftManual]    = useState(String(goal.manualContribution ?? 0));

  const current = useMemo(
    () => computeInvestmentGoalProgress(goal, holdings, summary),
    [goal, holdings, summary],
  );

  const pct = goal.targetAmount > 0
    ? Math.min(100, Math.round((current / goal.targetAmount) * 100))
    : 0;
  const barColor = progressColor(pct);

  const saveEdit = () => {
    const target = parseFloat(draftTarget);
    if (isNaN(target) || target <= 0) return;
    const manual = parseFloat(draftManual);
    const cleanSymbol = draftSymbol.trim().toUpperCase();
    updateGoal(goal.id, {
      title:              draftTitle.trim() || goal.title,
      targetAmount:       target,
      deadline:           draftDeadline || goal.deadline,
      frequency:          goal.strategy === "dollar_cost_average" ? draftFrequency : undefined,
      symbol:             cleanSymbol || undefined,
      manualContribution: isNaN(manual) || manual <= 0 ? undefined : manual,
    });
    setEditing(false);
  };

  const targetSuffix = goal.strategy === "dollar_cost_average" && goal.frequency
    ? `/${goal.frequency === "weekly" ? "wk" : "mo"}`
    : "";

  const effectiveAsset: AssetInterest = goal.strategy === "index" ? "etf" : goal.assetType;
  const scopeLabel = goal.symbol ? goal.symbol : ASSET_LABEL[effectiveAsset];

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.55)",
        border: `1.5px solid ${C_BORDER}`,
        borderTop: `3px solid ${barColor}`,
        borderRadius: 10,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "hsl(242 44% 30%)", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {goal.title}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, color: "hsl(245 16% 55%)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {STRATEGY_LABEL[goal.strategy]}
            </span>
            <span style={{ fontSize: 10, color: "hsl(245 16% 55%)" }}>· {scopeLabel}</span>
            <DeadlineBadge deadline={goal.deadline} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button
            onClick={() => {
              const raw = window.prompt(`Add a contribution to "${goal.title}" (in $):`, "");
              if (raw === null) return;
              const amount = parseFloat(raw);
              if (isNaN(amount) || amount <= 0) return;
              updateGoal(goal.id, { manualContribution: (goal.manualContribution ?? 0) + amount });
            }}
            style={{ fontSize: 11, color: C_PRIMARY, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
            title="Manually add to this goal's progress without logging a holding"
          >
            + Contribute
          </button>
          <button
            onClick={() => {
              setEditing(true);
              setDraftTitle(goal.title);
              setDraftTarget(String(goal.targetAmount));
              setDraftDeadline(goal.deadline);
              setDraftFrequency(goal.frequency ?? "monthly");
              setDraftSymbol(goal.symbol ?? "");
              setDraftManual(String(goal.manualContribution ?? 0));
            }}
            style={{ fontSize: 11, color: C_PRIMARY, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
          >
            Edit
          </button>
          <button
            onClick={() => { if (window.confirm(`Delete goal "${goal.title}"?`)) deleteGoal(goal.id); }}
            style={{ fontSize: 11, color: C_ERROR, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
          >
            Delete
          </button>
        </div>
      </div>

      {/* Inline editor */}
      {editing && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, background: "rgba(255,255,255,0.70)", border: `1px solid ${C_BORDER}`, borderRadius: 8, padding: 12 }}>
          <input
            autoFocus
            placeholder="Goal title"
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            style={inputStyle}
          />
          <input
            placeholder="Symbol (optional) — e.g. BTC, AAPL"
            value={draftSymbol}
            onChange={(e) => setDraftSymbol(e.target.value)}
            style={{ ...inputStyle, textTransform: "uppercase" }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <div style={inputWrapStyle}>
              <span style={prefixStyle}>Target $</span>
              <input
                type="number" min="1" step="100"
                value={draftTarget}
                onChange={(e) => setDraftTarget(e.target.value)}
                style={inputStyle}
              />
            </div>
            <input
              type="date"
              value={draftDeadline}
              onChange={(e) => setDraftDeadline(e.target.value)}
              style={{ ...inputStyle, flex: "0 0 140px" }}
            />
          </div>
          {goal.strategy === "dollar_cost_average" && (
            <select
              value={draftFrequency}
              onChange={(e) => setDraftFrequency(e.target.value as GoalFrequency)}
              style={{ ...inputStyle, appearance: "auto" }}
            >
              {FREQUENCY_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          )}
          <div style={inputWrapStyle}>
            <span style={prefixStyle}>Manual $</span>
            <input
              type="number" min="0" step="100"
              value={draftManual}
              onChange={(e) => setDraftManual(e.target.value)}
              title="Manual contributions added on top of auto-derived progress. Set to 0 to clear."
              style={inputStyle}
            />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={saveEdit} style={btnPrimaryStyle}>Save</button>
            <button onClick={() => setEditing(false)} style={btnSecondaryStyle}>Cancel</button>
          </div>
        </div>
      )}

      {/* Progress bar */}
      <div>
        <div style={{ height: 6, background: "hsl(244 25% 88%)", borderRadius: 4, overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              background: barColor,
              borderRadius: 4,
              transition: "width 0.3s ease",
            }}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 6 }}>
          <span style={{ color: barColor, fontWeight: 600 }}>{pct}% {goal.strategy === "dollar_cost_average" ? "this period" : "complete"}</span>
          <span style={{ color: "hsl(245 16% 55%)" }}>
            ${current.toLocaleString("en-AU", { maximumFractionDigits: 0 })} · ${goal.targetAmount.toLocaleString("en-AU", { maximumFractionDigits: 0 })}{targetSuffix}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Add Goal Form ─────────────────────────────────────────────────────────────

function AddInvestmentGoalForm({ onDone }: { onDone: () => void }) {
  const addGoal = useInvestmentGoalsStore((s) => s.addGoal);

  const [strategy,  setStrategy]  = useState<InvestmentStrategy>("buy_and_hold");
  const [title,     setTitle]     = useState("");
  const [assetType, setAssetType] = useState<AssetInterest>("stock");
  const [symbol,    setSymbol]    = useState("");
  const [target,    setTarget]    = useState("");
  const [frequency, setFrequency] = useState<GoalFrequency>("monthly");
  const [deadline,  setDeadline]  = useState("");
  const [error,     setError]     = useState("");

  const isDCA = strategy === "dollar_cost_average";
  const isIndex = strategy === "index";

  const submit = () => {
    const t = parseFloat(target);
    if (!title.trim())      return setError("Enter a goal title.");
    if (isNaN(t) || t <= 0) return setError("Enter a valid target amount.");
    if (!deadline)          return setError("Pick a deadline.");

    const cleanSymbol = symbol.trim().toUpperCase();
    addGoal({
      id:           crypto.randomUUID(),
      title:        title.trim(),
      strategy,
      assetType:    isIndex ? "etf" : assetType,
      targetAmount: t,
      frequency:    isDCA ? frequency : undefined,
      deadline,
      createdAt:    new Date().toISOString(),
      symbol:       cleanSymbol || undefined,
    });
    onDone();
  };

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.65)",
        border: `1.5px solid ${C_BORDER}`,
        borderLeft: `3px solid ${C_PRIMARY}`,
        borderRadius: 10,
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: C_PRIMARY }}>New Investment Goal</div>

      {error && <div style={{ fontSize: 12, color: C_ERROR }}>{error}</div>}

      {/* Strategy chip selector */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: "hsl(245 16% 45%)", marginBottom: 6 }}>Strategy</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
          {STRATEGY_OPTIONS.map((opt) => {
            const on = strategy === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => { setStrategy(opt.value); setError(""); }}
                style={{
                  background: on ? C_PRIMARY : "transparent",
                  color: on ? "#fff" : "hsl(247 57% 33%)",
                  border: `1.5px solid ${on ? C_PRIMARY : C_BORDER}`,
                  borderRadius: 7,
                  padding: "7px 10px",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Title */}
      <input
        autoFocus
        placeholder="Goal title (e.g. ETF Stack)"
        value={title}
        onChange={(e) => { setTitle(e.target.value); setError(""); }}
        style={inputStyle}
      />

      {/* Asset Type chip selector — hidden for Index (forced to ETF) */}
      {!isIndex && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "hsl(245 16% 45%)", marginBottom: 6 }}>Asset Type</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            {ASSET_OPTIONS.map((opt) => {
              const on = assetType === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setAssetType(opt.value)}
                  style={{
                    background: on ? C_PRIMARY : "transparent",
                    color: on ? "#fff" : "hsl(247 57% 33%)",
                    border: `1.5px solid ${on ? C_PRIMARY : C_BORDER}`,
                    borderRadius: 7,
                    padding: "7px 10px",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Symbol (optional) — narrows progress to a single ticker within the asset type */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: "hsl(245 16% 45%)", marginBottom: 6 }}>
          Symbol <span style={{ fontWeight: 400, color: "hsl(245 16% 55%)" }}>(optional)</span>
        </div>
        <input
          placeholder="e.g. BTC, AAPL, VOO — leave blank to track the whole asset type"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          style={{ ...inputStyle, textTransform: "uppercase" }}
        />
      </div>

      {/* Target + deadline + (optional) frequency */}
      <div>
        <div style={{ fontSize: 11, color: "hsl(245 16% 55%)", marginBottom: 6, fontStyle: "italic" }}>
          {STRATEGY_TARGET_HINT[strategy]}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={inputWrapStyle}>
            <span style={prefixStyle}>Target $</span>
            <input
              type="number" min="1" step="100"
              placeholder={isDCA ? "500" : "10000"}
              value={target}
              onChange={(e) => { setTarget(e.target.value); setError(""); }}
              style={inputStyle}
            />
          </div>
          {isDCA && (
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as GoalFrequency)}
              style={{ ...inputStyle, appearance: "auto", flex: "0 0 110px" }}
            >
              {FREQUENCY_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          )}
          <input
            type="date"
            value={deadline}
            onChange={(e) => { setDeadline(e.target.value); setError(""); }}
            title="Deadline"
            style={{ ...inputStyle, flex: "0 0 150px" }}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={submit} style={btnPrimaryStyle}>Add Goal</button>
        <button onClick={onDone} style={btnSecondaryStyle}>Cancel</button>
      </div>
    </div>
  );
}

// ── Investment Goals Tab ──────────────────────────────────────────────────────

interface InvestmentGoalsTabProps {
  holdings: InvestmentHolding[];
  summary:  PortfolioSummary | null;
}

export function InvestmentGoalsTab({ holdings, summary }: InvestmentGoalsTabProps) {
  const goals = useInvestmentGoalsStore((s) => s.goals);
  const [adding, setAdding] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "hsl(242 44% 28%)" }}>Investment Goals</div>
          <div style={{ fontSize: 12, color: "hsl(245 16% 55%)" }}>
            {goals.length === 0 ? "No goals yet — add one below." : `${goals.length} goal${goals.length !== 1 ? "s" : ""}`}
          </div>
        </div>
        {!adding && (
          <button onClick={() => setAdding(true)} style={btnPrimaryStyle}>
            + Add Goal
          </button>
        )}
      </div>

      {/* Add form */}
      {adding && <AddInvestmentGoalForm onDone={() => setAdding(false)} />}

      {/* Empty nudge */}
      {goals.length === 0 && !adding && (
        <div
          style={{
            background: "rgba(47,36,133,0.07)",
            border: `1.5px solid rgba(47,36,133,0.18)`,
            borderRadius: 10,
            padding: "20px 24px",
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <span style={{ fontSize: 24 }}>🎯</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C_PRIMARY, marginBottom: 3 }}>
              Set a portfolio goal to get started
            </div>
            <div style={{ fontSize: 12, color: "hsl(245 16% 49%)", lineHeight: 1.6 }}>
              Track buy-and-hold targets, dollar-cost-average pace, or growth milestones — Elly will use these for goal-aware analysis.
            </div>
          </div>
        </div>
      )}

      {/* Goal cards grid */}
      {goals.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
          {goals.map((g) => (
            <GoalCard key={g.id} goal={g} holdings={holdings} summary={summary} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Goal → readable summary (used by AI panel) ────────────────────────────────

/**
 * Build a short one-line description of a goal, including current-period
 * progress percentage. Used by InvestmentAIPanel to inject goal context into
 * the LLM payload.
 */
export function summarizeInvestmentGoal(
  goal: InvestmentGoal,
  holdings: InvestmentHolding[],
  summary: PortfolioSummary | null,
): string {
  const current = computeInvestmentGoalProgress(goal, holdings, summary);
  const pct = goal.targetAmount > 0
    ? Math.min(100, Math.round((current / goal.targetAmount) * 100))
    : 0;

  const strategyLabel = STRATEGY_LABEL[goal.strategy];
  const effectiveAsset: AssetInterest = goal.strategy === "index" ? "etf" : goal.assetType;
  const scope = goal.symbol ? goal.symbol : ASSET_LABEL[effectiveAsset];
  const targetFmt = goal.targetAmount.toLocaleString("en-AU", { maximumFractionDigits: 0 });

  if (goal.strategy === "dollar_cost_average" && goal.frequency) {
    const freqLabel = goal.frequency === "weekly" ? "week" : "month";
    return `${strategyLabel} $${targetFmt}/${freqLabel} into ${scope}, ${pct}% on track this period, deadline ${goal.deadline}`;
  }
  return `${strategyLabel} $${targetFmt} in ${scope}, ${pct}% complete, deadline ${goal.deadline}`;
}
