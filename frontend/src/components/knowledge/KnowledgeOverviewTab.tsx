import { BookOpen, Target, Sparkles, ChevronRight, Clock, Loader2 } from "lucide-react";
import { C_PRIMARY, C_BORDER, C_SUCCESS, C_ERROR, C_WARNING } from "@/lib/colors";
import type { GoalResponse, ResourceItem, UserContext } from "@/services/knowledgeApi";

// ── Helpers ───────────────────────────────────────────────────────────────────

const STAGE_COLORS: Record<string, string> = {
  identified: C_WARNING,
  in_progress: C_PRIMARY,
  done: C_SUCCESS,
};

const STAGE_LABELS: Record<string, string> = {
  identified: "Identified",
  in_progress: "In Progress",
  done: "Done",
};

const TOPIC_COLORS: Record<string, string> = {
  strategic_finance: "#6366f1",
  personal_finance:  "#10b981",
  investing:         "#f59e0b",
};

const STARTERS = [
  "What is a burn rate and how do I calculate it?",
  "How do I build a diversified investment portfolio?",
  "What is the difference between ARR and MRR?",
  "How do SaaS companies make money?",
];

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryCard({
  label, value, sub, color,
}: {
  label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.6)", backdropFilter: "blur(16px)",
      border: `1.5px solid ${C_BORDER}`,
      borderTop: `3px solid ${color}`,
      borderRadius: 12, padding: "16px 20px", flex: 1, minWidth: 130,
    }}>
      <div style={{ fontSize: 10.5, color: "#888", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 7 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color, letterSpacing: "-0.5px" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function ActiveGoalRow({ goal }: { goal: GoalResponse }) {
  const stageColor = STAGE_COLORS[goal.stage] ?? C_PRIMARY;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "10px 14px", borderBottom: `1px solid ${C_BORDER}`,
    }}>
      <div style={{ width: 3, minHeight: 36, borderRadius: 2, background: stageColor, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#333", lineHeight: 1.3, marginBottom: 3 }}>
          {goal.title}
        </div>
        {goal.next_step && (
          <div style={{ fontSize: 11, color: "#888", lineHeight: 1.4 }}>
            → {goal.next_step}
          </div>
        )}
      </div>
      <span style={{
        fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
        background: stageColor + "15", color: stageColor, padding: "2px 8px",
        borderRadius: 4, flexShrink: 0,
      }}>
        {STAGE_LABELS[goal.stage] ?? goal.stage}
      </span>
    </div>
  );
}

function ResourcePreviewCard({ item }: { item: ResourceItem }) {
  const topicColor = TOPIC_COLORS[item.topic] ?? C_PRIMARY;
  return (
    <div style={{
      background: "rgba(255,255,255,0.55)", backdropFilter: "blur(14px)",
      border: `1.5px solid ${C_BORDER}`, borderLeft: `3px solid ${topicColor}`,
      borderRadius: 10, padding: "12px 14px",
      display: "flex", flexDirection: "column", gap: 5,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
          background: topicColor + "15", color: topicColor, padding: "2px 6px", borderRadius: 3,
        }}>
          {item.category}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 3, color: "#bbb", fontSize: 10.5, marginLeft: "auto" }}>
          <Clock size={10} />
          {item.read_time_min}m
        </div>
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: C_PRIMARY, lineHeight: 1.3 }}>
        {item.title}
      </div>
      <p style={{ margin: 0, fontSize: 11.5, color: "#666", lineHeight: 1.5 }}>
        {item.description.slice(0, 100)}{item.description.length > 100 ? "…" : ""}
      </p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  goals: GoalResponse[];
  resources: ResourceItem[];
  userContext: UserContext | null;
  contextLoading: boolean;
  onAskElly: (question: string) => void;
  onGoToGoals: () => void;
  onGoToResources: () => void;
}

export function KnowledgeOverviewTab({
  goals,
  resources,
  userContext,
  contextLoading,
  onAskElly,
  onGoToGoals,
  onGoToResources,
}: Props) {
  const active = goals.filter((g) => g.stage !== "done");
  const done   = goals.filter((g) => g.stage === "done");
  const snap   = userContext?.financialSnapshot ?? {};

  const topResources = resources
    .sort((a, b) => a.read_time_min - b.read_time_min)
    .slice(0, 4);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Summary stats */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <SummaryCard label="Active Goals" value={active.length} color={C_PRIMARY}
          sub={`${done.length} completed`} />

        {snap.mrr ? (
          <SummaryCard label="Monthly Revenue" value={`$${Number(snap.mrr).toLocaleString()}`}
            color="#6366f1" sub={snap.growth_rate ? `${snap.growth_rate}% growth` : undefined} />
        ) : (
          <SummaryCard label="Revenue" value="—" color="#ddd"
            sub="Open Financial Projections" />
        )}

        {snap.health_score ? (
          <SummaryCard label="Finance Score" value={`${snap.health_score}/100`}
            color={Number(snap.health_score) >= 70 ? C_SUCCESS : C_WARNING}
            sub={snap.savings_rate ? `${Number(snap.savings_rate).toFixed(1)}% savings rate` : undefined} />
        ) : (
          <SummaryCard label="Finance Score" value="—" color="#ddd"
            sub="Import bank data" />
        )}

        {snap.portfolio_value ? (
          <SummaryCard label="Portfolio" value={`$${Number(snap.portfolio_value).toLocaleString()}`}
            color={Number(snap.portfolio_return ?? 0) >= 0 ? C_SUCCESS : C_ERROR}
            sub={`${Number(snap.portfolio_return ?? 0) >= 0 ? "+" : ""}${Number(snap.portfolio_return ?? 0).toFixed(1)}% return`} />
        ) : (
          <SummaryCard label="Portfolio" value="—" color="#ddd"
            sub="Add holdings" />
        )}
      </div>

      {/* ELLY insight card */}
      <div style={{
        background: `linear-gradient(135deg, ${C_PRIMARY}0f, #8b5cf608)`,
        border: `1.5px solid ${C_PRIMARY}25`,
        borderRadius: 14, padding: "20px 22px",
        display: "flex", flexDirection: "column", gap: 14,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: "50%",
            background: `linear-gradient(135deg, ${C_PRIMARY}, #8b5cf6)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 4px 14px ${C_PRIMARY}35`,
          }}>
            <Sparkles size={16} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C_PRIMARY }}>Ask Elly anything</div>
            <div style={{ fontSize: 11.5, color: "#888" }}>
              Financial questions · Business strategy · Personalised advice
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {STARTERS.map((s, i) => (
            <button
              key={i}
              onClick={() => onAskElly(s)}
              style={{
                background: "rgba(255,255,255,0.72)", border: `1.5px solid ${C_BORDER}`,
                borderRadius: 9, padding: "9px 14px", fontSize: 12.5, color: "#555",
                cursor: "pointer", textAlign: "left", lineHeight: 1.45,
                fontFamily: "inherit", transition: "all 0.15s",
                display: "flex", alignItems: "center", gap: 8,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = `${C_PRIMARY}55`;
                (e.currentTarget as HTMLButtonElement).style.color = C_PRIMARY;
                (e.currentTarget as HTMLButtonElement).style.background = `${C_PRIMARY}08`;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = C_BORDER;
                (e.currentTarget as HTMLButtonElement).style.color = "#555";
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.72)";
              }}
            >
              <ChevronRight size={12} color={C_PRIMARY} style={{ flexShrink: 0 }} />
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Active goals summary */}
      <div style={{
        background: "rgba(255,255,255,0.55)", backdropFilter: "blur(14px)",
        border: `1.5px solid ${C_BORDER}`, borderRadius: 12, overflow: "hidden",
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 18px", borderBottom: `1px solid ${C_BORDER}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Target size={15} color={C_PRIMARY} />
            <span style={{ fontSize: 13, fontWeight: 700, color: C_PRIMARY }}>Active Goals</span>
            <span style={{
              fontSize: 10, fontWeight: 700, background: C_PRIMARY + "15",
              color: C_PRIMARY, borderRadius: 10, padding: "1px 7px",
            }}>{active.length}</span>
          </div>
          <button
            onClick={onGoToGoals}
            style={{
              background: "none", border: `1.5px solid ${C_BORDER}`,
              borderRadius: 7, padding: "4px 10px", fontSize: 11.5, fontWeight: 600,
              color: C_PRIMARY, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            View all →
          </button>
        </div>

        {active.length === 0 ? (
          <div style={{ padding: "20px 18px", fontSize: 12.5, color: "#aaa", textAlign: "center" }}>
            No active goals — click 'View all' to add one.
          </div>
        ) : (
          active.slice(0, 3).map((goal) => (
            <ActiveGoalRow key={goal.id} goal={goal} />
          ))
        )}

        {active.length > 3 && (
          <div style={{ padding: "10px 18px", borderTop: `1px solid ${C_BORDER}` }}>
            <button
              onClick={onGoToGoals}
              style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: 12, color: "#aaa", fontFamily: "inherit",
              }}
            >
              +{active.length - 3} more goals
            </button>
          </div>
        )}
      </div>

      {/* Recommended resources */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <BookOpen size={15} color={C_PRIMARY} />
            <span style={{ fontSize: 13, fontWeight: 700, color: C_PRIMARY }}>Recommended Resources</span>
          </div>
          <button
            onClick={onGoToResources}
            style={{
              background: "none", border: `1.5px solid ${C_BORDER}`,
              borderRadius: 7, padding: "4px 10px", fontSize: 11.5, fontWeight: 600,
              color: C_PRIMARY, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Browse all →
          </button>
        </div>

        {contextLoading ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#aaa", fontSize: 12.5 }}>
            <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
            Loading recommendations…
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {topResources.map((item) => (
              <ResourcePreviewCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
