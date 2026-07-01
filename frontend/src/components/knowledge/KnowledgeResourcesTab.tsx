// SCAFFOLD — Feature 5: Knowledge & Learning — Resources & News tab
// Layout: two-column (Resources left, News right).
// Resources are filtered by topic; news is filtered server-side by holdings.
// TODO: add goal-keyword filtering to resources once the goal schema is stable.

import { useState, useEffect } from "react";
import { Clock, BookOpen, Layers, MessageSquare, Loader2, Newspaper, ExternalLink } from "lucide-react";
import { C_PRIMARY, C_BORDER, C_SUCCESS, C_WARNING } from "@/lib/colors";
import { fetchConversations } from "@/services/knowledgeApi";
import type { ResourceItem, ConversationRecord, NewsItem } from "@/services/knowledgeApi";

// ── Shared helpers ────────────────────────────────────────────────────────────

const TOPIC_COLORS: Record<string, string> = {
  strategic_finance: "#6366f1",
  personal_finance:  "#10b981",
  investing:         "#f59e0b",
};

const TOPIC_LABELS: Record<string, string> = {
  strategic_finance: "Strategic Finance",
  personal_finance:  "Personal Finance",
  investing:         "Investing",
};

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  article:   <BookOpen size={13} />,
  framework: <Layers size={13} />,
};

function formatNewsDate(unixSeconds: number): string {
  if (!unixSeconds) return "";
  const d = new Date(unixSeconds * 1000);
  const now = Date.now();
  const diffH = Math.floor((now - d.getTime()) / 3_600_000);
  if (diffH < 1)  return "Just now";
  if (diffH < 24) return `${diffH}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Left column: Resource card ────────────────────────────────────────────────

function ResourceCard({ item }: { item: ResourceItem }) {
  const topicColor = TOPIC_COLORS[item.topic] ?? C_PRIMARY;

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.58)", backdropFilter: "blur(14px)",
        border: `1.5px solid ${C_BORDER}`,
        borderTop: `3px solid ${topicColor}`,
        borderRadius: 12, padding: "16px 18px",
        display: "flex", flexDirection: "column", gap: 10,
        transition: "transform 0.15s, box-shadow 0.15s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 20px rgba(0,0,0,0.08)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = "none";
        (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
      }}
    >
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 2 }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
          background: topicColor + "15", color: topicColor, padding: "2px 8px", borderRadius: 4,
        }}>
          {CATEGORY_ICONS[item.category]}
          {item.category.charAt(0).toUpperCase() + item.category.slice(1)}
        </span>
        <span style={{
          fontSize: 9.5, fontWeight: 600, background: "rgba(0,0,0,0.06)",
          color: "#777", padding: "2px 8px", borderRadius: 4,
          textTransform: "uppercase", letterSpacing: "0.05em",
        }}>
          {TOPIC_LABELS[item.topic] ?? item.topic}
        </span>
      </div>

      <div style={{ fontSize: 13.5, fontWeight: 700, color: C_PRIMARY, lineHeight: 1.3 }}>
        {item.title}
      </div>
      <p style={{ margin: 0, fontSize: 12, color: "#666", lineHeight: 1.6, flex: 1 }}>
        {item.description}
      </p>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {item.tags.slice(0, 3).map((tag) => (
            <span key={tag} style={{
              fontSize: 10, background: "#f5f5f5", border: "1px solid #eee",
              borderRadius: 4, padding: "2px 7px", color: "#777",
            }}>
              {tag}
            </span>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, color: "#aaa", fontSize: 11, flexShrink: 0 }}>
          <Clock size={10} />
          {item.read_time_min} min read
        </div>
      </div>
    </div>
  );
}

// ── Left column: Conversation card ───────────────────────────────────────────

function ConversationCard({ conv }: { conv: ConversationRecord }) {
  const [expanded, setExpanded] = useState(false);
  const date = conv.created_at
    ? new Date(conv.created_at).toLocaleDateString("en-US", {
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : "";

  return (
    <div style={{
      background: "rgba(255,255,255,0.55)", backdropFilter: "blur(14px)",
      border: `1.5px solid ${C_BORDER}`, borderRadius: 10, overflow: "hidden",
    }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: "100%", padding: "12px 16px", background: "none", border: "none",
          cursor: "pointer", textAlign: "left", display: "flex",
          alignItems: "center", gap: 10, fontFamily: "inherit",
        }}
      >
        <MessageSquare size={13} color={C_PRIMARY} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#333", lineHeight: 1.4 }}>
          {conv.question}
        </span>
        <span style={{ fontSize: 10.5, color: "#bbb", flexShrink: 0 }}>{date}</span>
      </button>
      {expanded && (
        <div style={{
          borderTop: `1px solid ${C_BORDER}`, padding: "12px 16px",
          fontSize: 12.5, color: "#555", lineHeight: 1.65,
          background: "rgba(255,255,255,0.4)",
        }}>
          {conv.answer.slice(0, 400)}{conv.answer.length > 400 ? "…" : ""}
        </div>
      )}
    </div>
  );
}

// ── Right column: News card ───────────────────────────────────────────────────

function NewsCard({ item }: { item: NewsItem }) {
  const hasLink = Boolean(item.url);

  return (
    <div style={{
      background: "rgba(255,255,255,0.58)", backdropFilter: "blur(14px)",
      border: `1.5px solid ${C_BORDER}`,
      borderLeft: `3px solid ${C_PRIMARY}`,
      borderRadius: 10, padding: "14px 16px",
      display: "flex", flexDirection: "column", gap: 8,
      transition: "transform 0.15s, box-shadow 0.15s",
    }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.07)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = "none";
        (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
      }}
    >
      {/* Source + ticker badge + time */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {item.related && (
          <span style={{
            fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em",
            background: C_PRIMARY + "15", color: C_PRIMARY,
            padding: "2px 8px", borderRadius: 4, textTransform: "uppercase",
          }}>
            {item.related}
          </span>
        )}
        {item.source && (
          <span style={{ fontSize: 10.5, color: "#999", fontWeight: 500 }}>
            {item.source}
          </span>
        )}
        {item.datetime > 0 && (
          <span style={{ fontSize: 10.5, color: "#bbb", marginLeft: "auto" }}>
            {formatNewsDate(item.datetime)}
          </span>
        )}
      </div>

      {/* Headline */}
      <div style={{ fontSize: 13, fontWeight: 700, color: "#222", lineHeight: 1.4 }}>
        {item.headline}
      </div>

      {/* Summary */}
      {item.summary && (
        <p style={{ margin: 0, fontSize: 11.5, color: "#666", lineHeight: 1.6 }}>
          {item.summary.slice(0, 160)}{item.summary.length > 160 ? "…" : ""}
        </p>
      )}

      {/* Read more link */}
      {hasLink && (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 11.5, color: C_PRIMARY, fontWeight: 600,
            textDecoration: "none", marginTop: 2,
          }}
        >
          Read full story <ExternalLink size={11} />
        </a>
      )}
    </div>
  );
}

// ── Left column ───────────────────────────────────────────────────────────────

type LeftSection = "articles" | "frameworks" | "history";

function ResourcesColumn({ resources }: { resources: ResourceItem[] }) {
  const [active, setActive]         = useState<LeftSection>("articles");
  const [convs, setConvs]           = useState<ConversationRecord[]>([]);
  const [convsLoading, setConvsLoading] = useState(true);

  useEffect(() => {
    fetchConversations()
      .then(setConvs)
      .catch(() => setConvs([]))
      .finally(() => setConvsLoading(false));
  }, []);

  const articles   = resources.filter((r) => r.category === "article");
  const frameworks = resources.filter((r) => r.category === "framework");

  const SECTIONS = [
    { key: "articles" as const,   label: "Articles",     count: articles.length },
    { key: "frameworks" as const, label: "Frameworks",   count: frameworks.length },
    { key: "history" as const,    label: "Chat History", count: convs.length },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Section pills */}
      <div style={{ display: "flex", gap: 4, borderBottom: `1.5px solid ${C_BORDER}`, marginBottom: 2 }}>
        {SECTIONS.map(({ key, label, count }) => {
          const isActive = active === key;
          return (
            <button key={key} onClick={() => setActive(key)} style={{
              background: "none", border: "none", cursor: "pointer",
              padding: "7px 14px", fontSize: 12,
              fontWeight: isActive ? 700 : 500,
              color: isActive ? C_PRIMARY : "#888",
              borderBottom: isActive ? `2px solid ${C_PRIMARY}` : "2px solid transparent",
              marginBottom: -1.5, transition: "all 0.15s",
              display: "flex", alignItems: "center", gap: 5, fontFamily: "inherit",
            }}>
              {label}
              <span style={{
                fontSize: 9.5, fontWeight: 700,
                background: isActive ? C_PRIMARY + "18" : "rgba(0,0,0,0.06)",
                color: isActive ? C_PRIMARY : "#999",
                borderRadius: 10, padding: "1px 6px",
              }}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Articles grid */}
      {active === "articles" && (
        <>
          {articles.length === 0 ? (
            <EmptyState icon={<BookOpen size={20} color="#ccc" />} message="No articles available yet." />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {articles.map((item) => <ResourceCard key={item.id} item={item} />)}
            </div>
          )}
          <TopicLegend />
        </>
      )}

      {/* Frameworks grid */}
      {active === "frameworks" && (
        <>
          {frameworks.length === 0 ? (
            <EmptyState icon={<Layers size={20} color="#ccc" />} message="No frameworks available yet." />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {frameworks.map((item) => <ResourceCard key={item.id} item={item} />)}
            </div>
          )}
          <TopicLegend />
        </>
      )}

      {/* Chat history */}
      {active === "history" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {convsLoading && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#aaa", fontSize: 13, padding: "20px 0" }}>
              <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
              Loading conversation history…
            </div>
          )}
          {!convsLoading && convs.length === 0 && (
            <EmptyState
              icon={<MessageSquare size={20} color="#ccc" />}
              message="No past conversations yet — start chatting with Elly on the right."
            />
          )}
          {!convsLoading && convs.map((c) => <ConversationCard key={c.id} conv={c} />)}
        </div>
      )}
    </div>
  );
}

// ── Right column ──────────────────────────────────────────────────────────────

function NewsColumn({ news, loading }: { news: NewsItem[]; loading: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Column header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        borderBottom: `1.5px solid ${C_BORDER}`, paddingBottom: 9,
      }}>
        <Newspaper size={14} color={C_PRIMARY} />
        <span style={{ fontSize: 13, fontWeight: 700, color: C_PRIMARY }}>
          Market News
        </span>
        <span style={{ fontSize: 10.5, color: "#aaa", marginLeft: "auto" }}>
          filtered by holdings
        </span>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#aaa", fontSize: 13, padding: "20px 0" }}>
          <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
          Loading news…
        </div>
      )}

      {/* Empty state */}
      {!loading && news.length === 0 && (
        <EmptyState
          icon={<Newspaper size={20} color="#ccc" />}
          message="No news available. Add investment holdings so ELLY can surface relevant stories."
        />
      )}

      {/* News cards */}
      {!loading && news.map((item, i) => (
        <NewsCard key={`${item.datetime}-${i}`} item={item} />
      ))}
    </div>
  );
}

// ── Shared micro-components ───────────────────────────────────────────────────

function EmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", gap: 10,
      padding: "36px 20px", textAlign: "center",
      background: "rgba(255,255,255,0.4)", border: `1.5px dashed ${C_BORDER}`,
      borderRadius: 12, color: "#aaa", fontSize: 13,
    }}>
      {icon}
      {message}
    </div>
  );
}

function TopicLegend() {
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", paddingTop: 2 }}>
      {Object.entries(TOPIC_LABELS).map(([key, label]) => (
        <div key={key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: TOPIC_COLORS[key] }} />
          <span style={{ fontSize: 10.5, color: "#999" }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main exported tab ─────────────────────────────────────────────────────────

interface Props {
  resources: ResourceItem[];
  news: NewsItem[];
  newsLoading: boolean;
}

export function KnowledgeResourcesTab({ resources, news, newsLoading }: Props) {
  return (
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
      {/* Left — Resources (articles, frameworks, chat history) */}
      <div style={{ flex: "0 0 58%", minWidth: 0 }}>
        <ResourcesColumn resources={resources} />
      </div>

      {/* Divider */}
      <div style={{ width: 1, alignSelf: "stretch", background: C_BORDER, flexShrink: 0 }} />

      {/* Right — News feed */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <NewsColumn news={news} loading={newsLoading} />
      </div>

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
