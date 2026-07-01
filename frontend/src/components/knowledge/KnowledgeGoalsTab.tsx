import { useState } from "react";
import {
  Plus, Trash2, Loader2, X, ChevronRight,
  BarChart2, Wallet, TrendingUp, Target,
} from "lucide-react";
import { C_PRIMARY, C_BORDER, C_SUCCESS, C_ERROR, C_WARNING } from "@/lib/colors";
import {
  createGoal, updateGoal, deleteGoal,
} from "@/services/knowledgeApi";
import type { GoalResponse, GoalCreatePayload } from "@/services/knowledgeApi";

// ── Helpers ───────────────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<string, string> = {
  f1: "Financial Projections",
  f2: "Personal Finance",
  f3: "Investments",
  manual: "Manual",
};

const SOURCE_COLORS: Record<string, string> = {
  f1: "#6366f1",
  f2: "#10b981",
  f3: "#f59e0b",
  manual: C_PRIMARY,
};

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  f1: <BarChart2 size={11} />,
  f2: <Wallet size={11} />,
  f3: <TrendingUp size={11} />,
  manual: <Target size={11} />,
};

const STAGE_LABELS: Record<string, string> = {
  identified: "Identified",
  in_progress: "In Progress",
  done: "Done",
};

const STAGE_COLORS: Record<string, string> = {
  identified: C_WARNING,
  in_progress: C_PRIMARY,
  done: C_SUCCESS,
};

const STAGE_SEQUENCE = ["identified", "in_progress", "done"] as const;

function nextStage(current: string): string | null {
  const idx = STAGE_SEQUENCE.indexOf(current as typeof STAGE_SEQUENCE[number]);
  return idx >= 0 && idx < STAGE_SEQUENCE.length - 1 ? STAGE_SEQUENCE[idx + 1] : null;
}

// ── Create Goal Modal ─────────────────────────────────────────────────────────

function CreateGoalModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (goal: GoalResponse) => void;
}) {
  const [form, setForm] = useState<GoalCreatePayload>({
    title: "",
    description: "",
    source_feature: "manual",
    stage: "identified",
    next_step: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof GoalCreatePayload, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setError("Title is required"); return; }
    setSaving(true); setError(null);
    try {
      const created = await createGoal({
        ...form,
        description: form.description || undefined,
        next_step: form.next_step || undefined,
      });
      onCreated(created);
      onClose();
    } catch {
      setError("Failed to save — is the backend running on port 8000?");
    } finally { setSaving(false); }
  }

  const inp: React.CSSProperties = {
    width: "100%", padding: "8px 10px", fontSize: 13,
    border: `1.5px solid ${C_BORDER}`, borderRadius: 7,
    background: "rgba(255,255,255,0.8)", outline: "none", boxSizing: "border-box",
    fontFamily: "inherit",
  };
  const lbl: React.CSSProperties = {
    fontSize: 11.5, fontWeight: 600, color: "#555", display: "block", marginBottom: 4,
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
    }}>
      <div style={{
        background: "rgba(255,255,255,0.97)", backdropFilter: "blur(20px)",
        borderRadius: 14, padding: 28, width: 460, maxWidth: "90vw",
        border: `1.5px solid ${C_BORDER}`, boxShadow: "0 8px 40px rgba(0,0,0,0.15)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C_PRIMARY }}>New Goal</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#888" }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={lbl}>Goal title</label>
            <input style={inp} placeholder="e.g. Build emergency fund"
              value={form.title} onChange={(e) => set("title", e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Description (optional)</label>
            <textarea style={{ ...inp, resize: "none" }} rows={2}
              placeholder="Why this goal matters..."
              value={form.description} onChange={(e) => set("description", e.target.value)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={lbl}>Source</label>
              <select style={{ ...inp, appearance: "auto" }}
                value={form.source_feature}
                onChange={(e) => set("source_feature", e.target.value)}>
                <option value="manual">Manual</option>
                <option value="f1">Financial Projections</option>
                <option value="f2">Personal Finance</option>
                <option value="f3">Investments</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Stage</label>
              <select style={{ ...inp, appearance: "auto" }}
                value={form.stage}
                onChange={(e) => set("stage", e.target.value)}>
                <option value="identified">Identified</option>
                <option value="in_progress">In Progress</option>
              </select>
            </div>
          </div>
          <div>
            <label style={lbl}>Next step (optional)</label>
            <input style={inp} placeholder="e.g. Automate $500/month transfer"
              value={form.next_step} onChange={(e) => set("next_step", e.target.value)} />
          </div>
          {error && <p style={{ margin: 0, fontSize: 12, color: C_ERROR }}>{error}</p>}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{
              padding: "9px 18px", fontSize: 13, fontWeight: 600, borderRadius: 8,
              border: `1.5px solid ${C_BORDER}`, background: "transparent", cursor: "pointer", color: "#555",
            }}>
              Cancel
            </button>
            <button type="submit" disabled={saving} style={{
              padding: "9px 18px", fontSize: 13, fontWeight: 600, borderRadius: 8,
              border: "none", background: C_PRIMARY, color: "#fff",
              cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1,
              display: "flex", alignItems: "center", gap: 6,
            }}>
              {saving && <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />}
              {saving ? "Creating…" : "Create Goal"}
            </button>
          </div>
        </form>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ── Goal Card ─────────────────────────────────────────────────────────────────

function GoalCard({
  goal,
  onStageAdvance,
  onDelete,
}: {
  goal: GoalResponse;
  onStageAdvance: (id: string, newStage: string) => void;
  onDelete: (id: string) => void;
}) {
  const [advancing, setAdvancing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const srcColor = SOURCE_COLORS[goal.source_feature] ?? C_PRIMARY;
  const stageColor = STAGE_COLORS[goal.stage] ?? C_PRIMARY;
  const stageLabel = STAGE_LABELS[goal.stage] ?? goal.stage;
  const next = nextStage(goal.stage);
  const isDone = goal.stage === "done";

  async function handleAdvance() {
    if (!next || advancing) return;
    setAdvancing(true);
    try { await onStageAdvance(goal.id, next); } finally { setAdvancing(false); }
  }

  async function handleDelete() {
    if (deleting) return;
    if (!window.confirm("Delete this goal? This cannot be undone.")) return;
    setDeleting(true);
    try { await onDelete(goal.id); } finally { setDeleting(false); }
  }

  return (
    <div style={{
      background: isDone ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.60)",
      backdropFilter: "blur(14px)",
      border: `1.5px solid ${isDone ? C_BORDER : stageColor + "40"}`,
      borderLeft: `4px solid ${isDone ? C_BORDER : stageColor}`,
      borderRadius: 12, padding: "16px 18px",
      display: "flex", flexDirection: "column", gap: 10,
      opacity: isDone ? 0.7 : 1,
      transition: "all 0.15s",
    }}>
      {/* Top row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1 }}>
          {/* Source + stage badges */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 7 }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
              background: srcColor + "15", color: srcColor, padding: "2px 8px", borderRadius: 4,
            }}>
              {SOURCE_ICONS[goal.source_feature]}
              {SOURCE_LABELS[goal.source_feature] ?? goal.source_feature}
            </span>
            <span style={{
              fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
              background: stageColor + "15", color: stageColor, padding: "2px 8px", borderRadius: 4,
            }}>
              {stageLabel}
            </span>
          </div>

          <div style={{ fontSize: 14, fontWeight: 700, color: isDone ? "#888" : C_PRIMARY, lineHeight: 1.35 }}>
            {isDone && <span style={{ marginRight: 6 }}>✓</span>}
            {goal.title}
          </div>

          {goal.description && (
            <p style={{ margin: "5px 0 0", fontSize: 12, color: "#666", lineHeight: 1.55 }}>
              {goal.description}
            </p>
          )}
        </div>

        <button
          onClick={handleDelete}
          disabled={deleting}
          title="Delete goal"
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "#d0d0d0", padding: 4, borderRadius: 5, flexShrink: 0,
            display: "flex", alignItems: "center",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = C_ERROR; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#d0d0d0"; }}
        >
          {deleting
            ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
            : <Trash2 size={13} />}
        </button>
      </div>

      {/* Next step */}
      {goal.next_step && !isDone && (
        <div style={{
          background: C_PRIMARY + "09", border: `1px solid ${C_PRIMARY}20`,
          borderRadius: 8, padding: "8px 12px",
          fontSize: 12, color: "#555", lineHeight: 1.5,
          display: "flex", gap: 8, alignItems: "flex-start",
        }}>
          <ChevronRight size={13} color={C_PRIMARY} style={{ flexShrink: 0, marginTop: 1 }} />
          <span><strong style={{ color: C_PRIMARY }}>Next step: </strong>{goal.next_step}</span>
        </div>
      )}

      {/* Advance stage button */}
      {!isDone && next && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={handleAdvance}
            disabled={advancing}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              background: stageColor + "12", border: `1.5px solid ${stageColor}35`,
              color: stageColor, borderRadius: 7, padding: "5px 12px",
              fontSize: 11.5, fontWeight: 600, cursor: advancing ? "not-allowed" : "pointer",
              fontFamily: "inherit", transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = stageColor + "22";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = stageColor + "12";
            }}
          >
            {advancing
              ? <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} />
              : <ChevronRight size={11} />}
            Mark as {STAGE_LABELS[next]}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

interface Props {
  goals: GoalResponse[];
  onGoalsChange: (goals: GoalResponse[]) => void;
}

export function KnowledgeGoalsTab({ goals, onGoalsChange }: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "done">("active");

  const active = goals.filter((g) => g.stage !== "done");
  const done = goals.filter((g) => g.stage === "done");
  const displayed = filter === "all" ? goals : filter === "active" ? active : done;

  async function handleStageAdvance(id: string, newStage: string) {
    const updated = await updateGoal(id, { stage: newStage });
    onGoalsChange(goals.map((g) => (g.id === id ? updated : g)));
  }

  async function handleDelete(id: string) {
    await deleteGoal(id);
    onGoalsChange(goals.filter((g) => g.id !== id));
  }

  function handleCreated(goal: GoalResponse) {
    onGoalsChange([goal, ...goals]);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: C_PRIMARY, color: "#fff",
            border: "none", borderRadius: 8, padding: "9px 16px",
            fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}
        >
          <Plus size={13} /> New Goal
        </button>

        <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
          {(["all", "active", "done"] as const).map((f) => {
            const count = f === "all" ? goals.length : f === "active" ? active.length : done.length;
            const isActive = filter === f;
            return (
              <button key={f} onClick={() => setFilter(f)} style={{
                fontSize: 11.5, fontWeight: 600, padding: "5px 12px", borderRadius: 7,
                border: `1.5px solid ${isActive ? C_PRIMARY : C_BORDER}`,
                background: isActive ? C_PRIMARY : "transparent",
                color: isActive ? "#fff" : "#888", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 5,
              }}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  background: isActive ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.08)",
                  borderRadius: 10, padding: "1px 6px",
                }}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: 10 }}>
        {[
          { label: "Total Goals", value: goals.length, color: C_PRIMARY },
          { label: "In Progress", value: goals.filter((g) => g.stage === "in_progress").length, color: C_PRIMARY },
          { label: "Identified", value: goals.filter((g) => g.stage === "identified").length, color: C_WARNING },
          { label: "Completed", value: done.length, color: C_SUCCESS },
        ].map((stat) => (
          <div key={stat.label} style={{
            flex: 1, background: "rgba(255,255,255,0.55)", backdropFilter: "blur(14px)",
            border: `1.5px solid ${C_BORDER}`, borderTop: `3px solid ${stat.color}`,
            borderRadius: 10, padding: "12px 16px",
          }}>
            <div style={{ fontSize: 10.5, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 5 }}>
              {stat.label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: stat.color }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Goal cards */}
      {displayed.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "40px 20px",
          background: "rgba(255,255,255,0.4)", borderRadius: 12,
          border: `1.5px dashed ${C_BORDER}`,
          color: "#aaa", fontSize: 13,
        }}>
          {filter === "done"
            ? "No completed goals yet — keep going!"
            : "No goals here. Click 'New Goal' to add one."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {displayed.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onStageAdvance={handleStageAdvance}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateGoalModal
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
