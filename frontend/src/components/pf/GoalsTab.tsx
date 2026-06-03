import { useState, useMemo } from "react";
import { usePersonalFinanceStore, useFilteredTransactions } from "@/store/personalFinanceStore";
import type { Goal } from "@/store/personalFinanceStore";
import { CATEGORIES } from "@/lib/categories";
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

// ── Auto-derive current progress from store state ─────────────────────────────

function useGoalProgress(goal: Goal): number {
  const assets      = usePersonalFinanceStore((s) => s.assets);
  const liabilities = usePersonalFinanceStore((s) => s.liabilities);
  const txs         = useFilteredTransactions();

  return useMemo(() => {
    if (goal.type === "net_worth") {
      return Math.max(0, assets - liabilities);
    }
    if (goal.type === "spending_limit") {
      const spent = txs
        .filter((t) => t.amount < 0 && t.category === goal.category)
        .reduce((s, t) => s + Math.abs(t.amount), 0);
      // progress = how much of the limit is still intact (remaining)
      return Math.max(0, goal.targetAmount - spent);
    }
    // savings: net positive cash flow
    return Math.max(
      0,
      txs.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0) -
      txs.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
    );
  }, [goal, txs, assets, liabilities]);
}

// ── Goal Card ─────────────────────────────────────────────────────────────────

function GoalCard({ goal }: { goal: Goal }) {
  const updateGoal = usePersonalFinanceStore((s) => s.updateGoal);
  const deleteGoal = usePersonalFinanceStore((s) => s.deleteGoal);
  const autoProgress = useGoalProgress(goal);

  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName]     = useState(goal.name);
  const [draftTarget, setDraftTarget] = useState(String(goal.targetAmount));
  const [draftDeadline, setDraftDeadline] = useState(goal.deadline ?? "");
  const [draftManual, setDraftManual] = useState(String(goal.currentAmount));

  const effectiveCurrent = goal.type === "savings" || goal.type === "spending_limit"
    ? autoProgress
    : goal.currentAmount || autoProgress;

  const pct = goal.targetAmount > 0
    ? Math.min(100, Math.round((effectiveCurrent / goal.targetAmount) * 100))
    : 0;

  const barColor = progressColor(pct);

  const typeLabel: Record<Goal["type"], string> = {
    savings:        "Savings Goal",
    spending_limit: "Spending Limit",
    net_worth:      "Net Worth Goal",
  };

  const saveEdit = () => {
    const target = parseFloat(draftTarget);
    const manual = parseFloat(draftManual);
    if (isNaN(target) || target <= 0) return;
    updateGoal(goal.id, {
      name:          draftName.trim() || goal.name,
      targetAmount:  target,
      currentAmount: isNaN(manual) ? 0 : manual,
      deadline:      draftDeadline || undefined,
    });
    setEditing(false);
  };

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
            {goal.name}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, color: "hsl(245 16% 55%)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {typeLabel[goal.type]}
            </span>
            {goal.category && (
              <span style={{ fontSize: 10, color: "hsl(245 16% 55%)" }}>· {goal.category}</span>
            )}
            {goal.deadline && <DeadlineBadge deadline={goal.deadline} />}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: 8 }}>
          <button
            onClick={() => { setEditing(true); setDraftName(goal.name); setDraftTarget(String(goal.targetAmount)); setDraftDeadline(goal.deadline ?? ""); setDraftManual(String(goal.currentAmount)); }}
            style={{ fontSize: 11, color: C_PRIMARY, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
          >
            Edit
          </button>
          <button
            onClick={() => { if (window.confirm(`Delete goal "${goal.name}"?`)) deleteGoal(goal.id); }}
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
            placeholder="Goal name"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            style={inputStyle}
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
            {goal.type === "net_worth" && (
              <div style={inputWrapStyle}>
                <span style={prefixStyle}>Current $</span>
                <input
                  type="number" min="0" step="100"
                  value={draftManual}
                  onChange={(e) => setDraftManual(e.target.value)}
                  style={inputStyle}
                />
              </div>
            )}
            <input
              type="date"
              value={draftDeadline}
              onChange={(e) => setDraftDeadline(e.target.value)}
              style={{ ...inputStyle, flex: "0 0 140px" }}
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
          <span style={{ color: barColor, fontWeight: 600 }}>{pct}% complete</span>
          <span style={{ color: "hsl(245 16% 55%)" }}>
            ${effectiveCurrent.toLocaleString("en-AU", { maximumFractionDigits: 0 })} / ${goal.targetAmount.toLocaleString("en-AU", { maximumFractionDigits: 0 })}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Add Goal Form ─────────────────────────────────────────────────────────────

const GOAL_TYPES: { value: Goal["type"]; label: string; hint: string }[] = [
  { value: "savings",        label: "Savings Goal",    hint: "Track net cash flow toward a target" },
  { value: "spending_limit", label: "Spending Limit",  hint: "Limit spending in a category" },
  { value: "net_worth",      label: "Net Worth Goal",  hint: "Track assets minus liabilities" },
];

function AddGoalForm({ onDone }: { onDone: () => void }) {
  const addGoal = usePersonalFinanceStore((s) => s.addGoal);

  const [name,     setName]     = useState("");
  const [type,     setType]     = useState<Goal["type"]>("savings");
  const [target,   setTarget]   = useState("");
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [deadline, setDeadline] = useState("");
  const [error,    setError]    = useState("");

  const submit = () => {
    const t = parseFloat(target);
    if (!name.trim())        return setError("Enter a goal name.");
    if (isNaN(t) || t <= 0) return setError("Enter a valid target amount.");
    addGoal({
      id:            `goal-${Date.now()}`,
      name:          name.trim(),
      type,
      targetAmount:  t,
      currentAmount: 0,
      deadline:      deadline || undefined,
      category:      type === "spending_limit" ? category : undefined,
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
      <div style={{ fontSize: 13, fontWeight: 700, color: C_PRIMARY }}>New Goal</div>

      {error && (
        <div style={{ fontSize: 12, color: C_ERROR }}>{error}</div>
      )}

      {/* Goal type selector */}
      <div style={{ display: "flex", gap: 8 }}>
        {GOAL_TYPES.map((gt) => (
          <button
            key={gt.value}
            onClick={() => setType(gt.value)}
            title={gt.hint}
            style={{
              flex: 1,
              background: type === gt.value ? C_PRIMARY : "transparent",
              color: type === gt.value ? "#fff" : "hsl(247 57% 33%)",
              border: `1.5px solid ${type === gt.value ? C_PRIMARY : C_BORDER}`,
              borderRadius: 7,
              padding: "7px 10px",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {gt.label}
          </button>
        ))}
      </div>

      {/* Name */}
      <input
        autoFocus
        placeholder="Goal name (e.g. Emergency Fund)"
        value={name}
        onChange={(e) => { setName(e.target.value); setError(""); }}
        style={inputStyle}
      />

      {/* Target + deadline row */}
      <div style={{ display: "flex", gap: 8 }}>
        <div style={inputWrapStyle}>
          <span style={prefixStyle}>Target $</span>
          <input
            type="number" min="1" step="100"
            placeholder="10000"
            value={target}
            onChange={(e) => { setTarget(e.target.value); setError(""); }}
            style={inputStyle}
          />
        </div>
        <input
          type="date"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          title="Optional deadline"
          style={{ ...inputStyle, flex: "0 0 150px" }}
        />
      </div>

      {/* Category picker for spending_limit */}
      {type === "spending_limit" && (
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          style={{ ...inputStyle, appearance: "auto" }}
        >
          {CATEGORIES.filter((c) => c !== "Income").map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={submit} style={btnPrimaryStyle}>Add Goal</button>
        <button onClick={onDone} style={btnSecondaryStyle}>Cancel</button>
      </div>
    </div>
  );
}

// ── Goals Tab ─────────────────────────────────────────────────────────────────

export function GoalsTab() {
  const goals   = usePersonalFinanceStore((s) => s.goals);
  const [adding, setAdding] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "hsl(242 44% 28%)" }}>Financial Goals</div>
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
      {adding && <AddGoalForm onDone={() => setAdding(false)} />}

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
          <span style={{ fontSize: 24 }}>🏁</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C_PRIMARY, marginBottom: 3 }}>
              Set a financial goal to get started
            </div>
            <div style={{ fontSize: 12, color: "hsl(245 16% 49%)", lineHeight: 1.6 }}>
              Track savings targets, spending limits by category, or a net worth milestone — all with auto-calculated progress from your transactions.
            </div>
          </div>
        </div>
      )}

      {/* Goal cards grid */}
      {goals.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
          {goals.map((g) => (
            <GoalCard key={g.id} goal={g} />
          ))}
        </div>
      )}
    </div>
  );
}
