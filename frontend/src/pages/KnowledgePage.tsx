import { useState, useEffect } from "react";
import { BookOpen, Loader2 } from "lucide-react";
import { C_PRIMARY, C_BORDER } from "@/lib/colors";
import { useKnowledgeStore } from "@/store/knowledgeStore";
import {
  sendKnowledgeChat,
  fetchGoals,
  fetchResources,
  fetchUserContext,
  fetchNews,
} from "@/services/knowledgeApi";
import type { GoalResponse, ResourceItem, UserContext, NewsItem } from "@/services/knowledgeApi";
import { EllyKnowledgeChat } from "@/components/knowledge/EllyKnowledgeChat";
import { KnowledgeOverviewTab } from "@/components/knowledge/KnowledgeOverviewTab";
import { KnowledgeGoalsTab } from "@/components/knowledge/KnowledgeGoalsTab";
import { KnowledgeResourcesTab } from "@/components/knowledge/KnowledgeResourcesTab";

// ── Tab bar ───────────────────────────────────────────────────────────────────

const TABS = [
  { key: "overview",   label: "User Knowledge" },
  { key: "goals",      label: "Journey & Goal Tracking" },
  { key: "resources",  label: "Resources & News" },
];

function TabBar({ active, onChange }: { active: string; onChange: (k: string) => void }) {
  return (
    <div style={{ display: "flex", gap: 4, borderBottom: `1.5px solid ${C_BORDER}`, marginBottom: 24 }}>
      {TABS.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          style={{
            background: "none", border: "none", cursor: "pointer",
            padding: "8px 14px", fontSize: 12.5,
            fontWeight: active === t.key ? 700 : 500,
            color: active === t.key ? C_PRIMARY : "#888",
            borderBottom: active === t.key ? `2px solid ${C_PRIMARY}` : "2px solid transparent",
            marginBottom: -1.5, transition: "all 0.15s",
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function KnowledgePage() {
  const [activeTab, setActiveTab]   = useState("overview");
  const [goals, setGoals]           = useState<GoalResponse[]>([]);
  const [resources, setResources]   = useState<ResourceItem[]>([]);
  const [userContext, setUserContext] = useState<UserContext | null>(null);
  const [news, setNews]             = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(true);
  const [ellySending, setEllySending] = useState(false);

  const { pushUser, pushLoading, resolveLoading, failLoading } = useKnowledgeStore();

  useEffect(() => {
    Promise.all([
      fetchGoals(),
      fetchResources(),
      fetchUserContext(),
    ])
      .then(([g, r, ctx]) => {
        setGoals(g);
        setResources(r);
        setUserContext(ctx);
      })
      .catch(() => {})
      .finally(() => setDataLoading(false));

    fetchNews()
      .then((resp) => setNews(resp.items))
      .catch(() => setNews([]))
      .finally(() => setNewsLoading(false));
  }, []);

  async function handleAskElly(question: string) {
    const q = question.trim();
    if (!q || ellySending) return;
    setEllySending(true);
    pushUser(q);
    const loadingId = pushLoading();
    try {
      const result = await sendKnowledgeChat({ question: q });
      resolveLoading(loadingId, result.answer);
    } catch {
      failLoading(
        loadingId,
        "Elly couldn't respond — is the backend running on port 8000?",
      );
    } finally {
      setEllySending(false);
    }
  }

  const tabContent: Record<string, React.ReactNode> = {
    overview: (
      <KnowledgeOverviewTab
        goals={goals}
        resources={resources}
        userContext={userContext}
        contextLoading={dataLoading}
        onAskElly={handleAskElly}
        onGoToGoals={() => setActiveTab("goals")}
        onGoToResources={() => setActiveTab("resources")}
      />
    ),
    goals: (
      <KnowledgeGoalsTab
        goals={goals}
        onGoalsChange={setGoals}
      />
    ),
    resources: (
      <KnowledgeResourcesTab
        resources={resources}
        news={news}
        newsLoading={newsLoading}
      />
    ),
  };

  return (
    <div style={{
      height: "100%", display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* Page header */}
      <div style={{
        padding: "20px 28px 16px",
        borderBottom: `1.5px solid ${C_BORDER}`,
        background: "rgba(255,255,255,0.35)", backdropFilter: "blur(12px)",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <BookOpen size={18} color={C_PRIMARY} />
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: C_PRIMARY }}>
            Knowledge & Learning
          </h1>
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase",
            background: C_PRIMARY + "15", color: C_PRIMARY, padding: "2px 8px", borderRadius: 4,
          }}>
            Feature 5
          </span>
          {dataLoading && (
            <Loader2
              size={14}
              color={C_PRIMARY}
              style={{ animation: "spin 1s linear infinite", marginLeft: 4 }}
            />
          )}
        </div>
        <p style={{ margin: 0, fontSize: 12, color: "#777" }}>
          Ask Elly anything · Track cross-feature goals · Explore curated resources
        </p>
      </div>

      {/* Body: tab content (left) + ELLY chat sidebar (right) */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Main content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>
          <TabBar active={activeTab} onChange={setActiveTab} />
          {tabContent[activeTab]}
        </div>

        {/* Persistent ELLY chat sidebar */}
        <EllyKnowledgeChat sending={ellySending} onSend={handleAskElly} />
      </div>

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
