import { useState, useRef, useEffect } from "react";
import {
  Send, Sparkles, RotateCcw, Loader2, User,
  TrendingUp, TrendingDown, ListChecks, UserCircle,
  BarChart2, ChevronDown,
} from "lucide-react";
import { useInvestmentChatStore } from "@/store/investmentChatStore";
import type { ChatMessage } from "@/store/investmentChatStore";
import { useInvestmentContextStore } from "@/store/investmentContextStore";
import { useInvestmentGoalsStore } from "@/store/investmentGoalsStore";
import { usePersonalFinanceStore } from "@/store/personalFinanceStore";
import { fetchSummary as fetchPFSummary } from "@/services/personalFinanceApi";
import {
  buildInvestmentAIPayload,
  fetchInvestmentAIInsights,
} from "@/services/investmentApi";
import type {
  InvestmentHolding, PortfolioSummary, PFContextInput, InvestmentAIResponse,
} from "@/services/investmentApi";
import { summarizeInvestmentGoal } from "@/components/investment/InvestmentGoalsTab";
import { C_PRIMARY, C_SUCCESS, C_ERROR, C_WARNING, C_BORDER } from "@/lib/colors";

const STARTERS = [
  "Review my full portfolio — strengths, risks, and what to do next",
  "Am I on track to meet my investment goals?",
  "How diversified is my portfolio and where are the gaps?",
  "What's my biggest risk right now and how can I protect against it?",
];

function EllyAvatar() {
  return (
    <div style={{
      width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
      background: `linear-gradient(135deg, ${C_PRIMARY}, #8b5cf6)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: `0 2px 8px ${C_PRIMARY}30`,
    }}>
      <Sparkles size={14} color="#fff" />
    </div>
  );
}

function UserAvatar() {
  return (
    <div style={{
      width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
      background: `${C_PRIMARY}12`, border: `1.5px solid ${C_PRIMARY}25`,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <User size={14} color={C_PRIMARY} />
    </div>
  );
}

function BulletList({ items, color }: { items: string[]; color: string }) {
  if (!items.length) {
    return <span style={{ color: "#bbb", fontStyle: "italic", fontSize: 12 }}>None.</span>;
  }
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
      {items.map((item, i) => (
        <li key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <span style={{ color, fontWeight: 700, flexShrink: 0, lineHeight: 1.6 }}>•</span>
          <span style={{ fontSize: 12.5, lineHeight: 1.6, color: "#444" }}>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function SectionBlock({ color, icon, label, children }: {
  color: string; icon: React.ReactNode; label: string; children: React.ReactNode;
}) {
  return (
    <div style={{
      background: color + "0a",
      border: `1px solid ${color}25`,
      borderLeft: `3px solid ${color}`,
      borderRadius: 10,
      padding: "11px 14px",
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ color, display: "flex" }}>{icon}</span>
        <span style={{ fontSize: 10.5, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.07em" }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 12.5, color: "#444", lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

// ── Rich text renderer for LLM markdown-style output ──────────────────────────

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**")
          ? <strong key={i}>{part.slice(2, -2)}</strong>
          : <span key={i}>{part}</span>
      )}
    </>
  );
}

function RichText({ text }: { text: string }) {
  if (!text) return null;

  const nodes: React.ReactNode[] = [];
  const buf: string[] = [];

  const flushBuf = (key: string | number) => {
    if (!buf.length) return;
    nodes.push(
      <ul key={`ul-${key}`} style={{ margin: "4px 0 8px", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 5 }}>
        {buf.splice(0).map((item, i) => (
          <li key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span style={{ color: C_PRIMARY, flexShrink: 0, fontWeight: 700, lineHeight: 1.65, fontSize: 13 }}>•</span>
            <span style={{ fontSize: 13, lineHeight: 1.65, color: "#3a3a3a" }}>{renderInline(item)}</span>
          </li>
        ))}
      </ul>
    );
  };

  text.split("\n").forEach((line, idx) => {
    if (line.startsWith("## ")) {
      flushBuf(idx);
      nodes.push(
        <div key={idx} style={{
          fontSize: 15, fontWeight: 700, color: C_PRIMARY,
          marginTop: nodes.length > 0 ? 20 : 0, marginBottom: 8,
          paddingBottom: 7, borderBottom: `1.5px solid ${C_PRIMARY}22`,
        }}>
          {renderInline(line.slice(3))}
        </div>
      );
    } else if (line.startsWith("### ")) {
      flushBuf(idx);
      nodes.push(
        <div key={idx} style={{
          fontSize: 13, fontWeight: 700, color: "#444",
          marginTop: 14, marginBottom: 4,
        }}>
          {renderInline(line.slice(4))}
        </div>
      );
    } else if (/^[-*]\s/.test(line)) {
      buf.push(line.replace(/^[-*]\s/, ""));
    } else if (line.trim() === "") {
      flushBuf(idx);
      if (nodes.length > 0) nodes.push(<div key={idx} style={{ height: 6 }} />);
    } else {
      flushBuf(idx);
      const confMatch = line.match(/\*\*Confidence(?:\s+Level)?\*\*:\s*(High|Medium|Low)/i);
      if (confMatch) {
        const level = confMatch[1];
        const color = level.toLowerCase() === "high" ? C_SUCCESS
                    : level.toLowerCase() === "low"  ? C_ERROR
                    : C_WARNING;
        nodes.push(
          <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0" }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "#555" }}>Confidence Level:</span>
            <span style={{
              fontSize: 12, fontWeight: 700, padding: "3px 12px", borderRadius: 20,
              background: `${color}18`, color, border: `1px solid ${color}35`,
            }}>
              {level}
            </span>
          </div>
        );
      } else {
        nodes.push(
          <p key={idx} style={{ margin: "2px 0", fontSize: 13.5, lineHeight: 1.78, color: "#2d2d2d" }}>
            {renderInline(line)}
          </p>
        );
      }
    }
  });

  flushBuf("end");
  return <div style={{ display: "flex", flexDirection: "column" }}>{nodes}</div>;
}

// ── Elly response card ────────────────────────────────────────────────────────

function EllyResponseCard({ response }: { response: InvestmentAIResponse }) {
  const [analysisOpen, setAnalysisOpen] = useState(false);

  const hasDirectAnswer =
    !!response.question_response &&
    response.question_response.toLowerCase().trim() !== "no question provided.";

  const hasAnalysis =
    response.pros.length > 0 ||
    response.cons.length > 0 ||
    response.next_steps.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Profile chip — compact, non-intrusive */}
      {response.profile_context && (
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          background: `${C_PRIMARY}0d`, border: `1px solid ${C_PRIMARY}22`,
          borderRadius: 20, padding: "4px 10px", alignSelf: "flex-start",
          fontSize: 11, color: C_PRIMARY, fontWeight: 600,
        }}>
          <UserCircle size={11} />
          {response.profile_context}
        </div>
      )}

      {/* Direct answer — front and centre, rendered as rich text */}
      {hasDirectAnswer && <RichText text={response.question_response} />}

      {/* Summary — shown only when there is no specific question answer */}
      {!hasDirectAnswer && response.summary && (
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.75, color: "#2d2d2d" }}>
          {response.summary}
        </p>
      )}

      {/* Portfolio analysis — collapsible, so it doesn't bury the answer */}
      {hasAnalysis && (
        <div>
          <button
            onClick={() => setAnalysisOpen((o) => !o)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "none", border: `1.5px solid ${C_BORDER}`,
              borderRadius: 8, padding: "6px 12px",
              fontSize: 11.5, fontWeight: 600, color: "#888",
              cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
            }}
          >
            <BarChart2 size={12} />
            {analysisOpen ? "Hide" : "Show"} portfolio analysis
            <ChevronDown
              size={12}
              style={{ transform: analysisOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}
            />
          </button>

          {analysisOpen && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
              {response.summary && hasDirectAnswer && (
                <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.65, color: "#555" }}>
                  {response.summary}
                </p>
              )}
              {(response.pros.length > 0 || response.cons.length > 0) && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <SectionBlock color={C_SUCCESS} icon={<TrendingUp size={12} />} label="Strengths">
                    <BulletList items={response.pros} color={C_SUCCESS} />
                  </SectionBlock>
                  <SectionBlock color={C_ERROR} icon={<TrendingDown size={12} />} label="Risks">
                    <BulletList items={response.cons} color={C_ERROR} />
                  </SectionBlock>
                </div>
              )}
              {response.next_steps.length > 0 && (
                <SectionBlock color={C_WARNING} icon={<ListChecks size={12} />} label="Next Steps">
                  <BulletList items={response.next_steps} color={C_WARNING} />
                </SectionBlock>
              )}
            </div>
          )}
        </div>
      )}

      {/* Sources */}
      {response.sources && response.sources.length > 0 && (
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center",
          paddingTop: 10, borderTop: `1px solid ${C_BORDER}`,
        }}>
          <span style={{ fontSize: 10, color: "#bbb" }}>Sources:</span>
          {response.sources.map((s, i) => (
            <span key={i} style={{
              fontSize: 10, background: "#f5f5f5", border: "1px solid #e8e8e8",
              borderRadius: 4, padding: "2px 7px", color: "#888",
            }}>
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function MessageRow({ msg }: { msg: ChatMessage }) {
  if (msg.role === "user") {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, alignItems: "flex-start" }}>
        <div style={{
          maxWidth: "70%",
          background: C_PRIMARY,
          color: "#fff",
          borderRadius: "16px 16px 4px 16px",
          padding: "12px 16px",
          fontSize: 13.5,
          lineHeight: 1.65,
        }}>
          {msg.text}
        </div>
        <UserAvatar />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <EllyAvatar />
      <div style={{
        flex: 1,
        background: "rgba(255,255,255,0.78)",
        backdropFilter: "blur(14px)",
        border: `1.5px solid ${C_BORDER}`,
        borderRadius: "4px 16px 16px 16px",
        padding: "14px 16px",
      }}>
        {msg.state === "loading" && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Loader2 size={14} style={{ animation: "spin 1s linear infinite", color: C_PRIMARY }} />
            <span style={{ fontSize: 12.5, color: "#999" }}>Elly is thinking…</span>
          </div>
        )}
        {msg.state === "error" && (
          <span style={{ fontSize: 13, color: C_ERROR }}>{msg.error}</span>
        )}
        {msg.state === "done" && (
          <EllyResponseCard response={msg.response} />
        )}
      </div>
    </div>
  );
}

export function EllyChat({
  holdings,
  summary,
}: {
  holdings: InvestmentHolding[];
  summary: PortfolioSummary | null;
}) {
  const { messages, pushUser, pushLoading, resolveLoading, failLoading, clear } =
    useInvestmentChatStore();

  const onboarding     = useInvestmentContextStore();
  const investmentGoals = useInvestmentGoalsStore((s) => s.goals);
  const pfStore        = usePersonalFinanceStore();
  const { transactions, assets, liabilities } = pfStore;

  const [input, setInput]         = useState("");
  const [sending, setSending]     = useState(false);
  const [pfContext, setPfContext]  = useState<PFContextInput | null>(null);
  const bottomRef                 = useRef<HTMLDivElement>(null);
  const textareaRef               = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!transactions.length) { setPfContext(null); return; }
    fetchPFSummary(transactions)
      .then((pf) => setPfContext({
        hasData:         true,
        monthlyExpenses: pf.totalExpenses / Math.max(1, pf.monthlyBreakdown.length),
        cashBalance:     assets > 0 ? assets - liabilities : Math.max(0, pf.netCashFlow),
        savingsRate:     pf.savingsRate,
        healthScore:     pf.healthScore,
        healthGrade:     pf.healthGrade,
        netCashFlow:     pf.netCashFlow,
      }))
      .catch(() => setPfContext(null));
  }, [transactions, assets, liabilities]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(question: string) {
    const q = question.trim();
    if (!q || sending || !holdings.length) return;

    // Snapshot history BEFORE pushing the new user message
    const history = messages
      .filter((m): m is typeof m & { role: "user" | "elly" } => m.role === "user" || m.role === "elly")
      .slice(-8)
      .flatMap((m) => {
        if (m.role === "user") return [{ role: "user" as const, content: m.text }];
        if (m.role === "elly" && m.state === "done") {
          const content = m.response.question_response || m.response.summary || "";
          return content ? [{ role: "assistant" as const, content }] : [];
        }
        return [];
      });

    setSending(true);
    setInput("");
    pushUser(q);
    const loadingId = pushLoading();
    try {
      const goalsSummary = investmentGoals
        .map((g) => summarizeInvestmentGoal(g, holdings, summary))
        .join("; ");
      const payload = buildInvestmentAIPayload(q, holdings, {
        age:                  onboarding.age,
        experienceLevel:      onboarding.experienceLevel,
        investmentCapital:    onboarding.investmentCapital,
        emergencyCash:        onboarding.emergencyCash,
        communicationStyle:   onboarding.communicationStyle,
        investmentStrategies: onboarding.investmentStrategies,
        timeHorizon:          onboarding.timeHorizon,
        assetInterests:       onboarding.assetInterests,
        country:              onboarding.country,
        completedAt:          onboarding.completedAt,
      }, goalsSummary, "Current portfolio", summary, pfContext, history);
      const result = await fetchInvestmentAIInsights(payload);
      resolveLoading(loadingId, result);
    } catch {
      failLoading(loadingId, "Elly couldn't respond — is the backend running on port 8000?");
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }

  const hasHoldings = holdings.length > 0;
  const canSend = hasHoldings && !!input.trim() && !sending;

  return (
    <div style={{
      height: "calc(100vh - 215px)",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 20,
        padding: "4px 2px 12px",
      }}>
        {messages.length === 0 && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", flex: 1, gap: 28, padding: "32px 0",
          }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
              <div style={{
                width: 60, height: 60, borderRadius: "50%",
                background: `linear-gradient(135deg, ${C_PRIMARY}, #8b5cf6)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: `0 10px 28px ${C_PRIMARY}35`,
              }}>
                <Sparkles size={26} color="#fff" />
              </div>
              <div style={{ textAlign: "center", maxWidth: 400 }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: "#2d2d2d", marginBottom: 8 }}>
                  Ask Elly anything about your investments
                </div>
                <div style={{ fontSize: 13, color: "#999", lineHeight: 1.6 }}>
                  {hasHoldings
                    ? "Elly has full context of your holdings, onboarding profile, and goals. Responses include a breakdown of strengths, risks, and next steps."
                    : "Add holdings to your portfolio first so Elly can give you personalised analysis."}
                </div>
              </div>
            </div>

            {hasHoldings && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", maxWidth: 540 }}>
                {STARTERS.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => send(s)}
                    disabled={sending}
                    style={{
                      background: "rgba(255,255,255,0.72)",
                      border: `1.5px solid ${C_BORDER}`,
                      borderRadius: 10, padding: "11px 16px",
                      fontSize: 13, color: "#555", cursor: "pointer",
                      textAlign: "left", lineHeight: 1.45,
                      fontFamily: "inherit",
                      transition: "all 0.15s",
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
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((msg) => (
          <MessageRow key={msg.id} msg={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div style={{
        flexShrink: 0,
        borderTop: `1.5px solid ${C_BORDER}`,
        paddingTop: 14,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}>
        {!hasHoldings && (
          <div style={{
            fontSize: 12, color: "#aaa",
            background: "rgba(255,255,255,0.5)",
            borderRadius: 8, padding: "8px 12px",
            border: `1px solid ${C_BORDER}`,
          }}>
            Add holdings to your portfolio to start chatting with Elly.
          </div>
        )}

        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            disabled={sending || !hasHoldings}
            placeholder={
              hasHoldings
                ? "Ask Elly anything about your investments… (Enter to send, Shift+Enter for new line)"
                : "Add holdings to start chatting"
            }
            rows={2}
            style={{
              flex: 1, resize: "none",
              borderRadius: 12,
              border: `1.5px solid ${C_BORDER}`,
              padding: "11px 14px",
              fontSize: 13, lineHeight: 1.55,
              fontFamily: "inherit",
              outline: "none",
              background: "rgba(255,255,255,0.75)",
              color: "#333",
              transition: "border-color 0.15s",
              maxHeight: 110,
              opacity: !hasHoldings ? 0.5 : 1,
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = `${C_PRIMARY}55`)}
            onBlur={(e)  => (e.currentTarget.style.borderColor = C_BORDER)}
          />

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <button
              onClick={() => send(input)}
              disabled={!canSend}
              title="Send"
              style={{
                width: 42, height: 42, borderRadius: 10, border: "none",
                cursor: canSend ? "pointer" : "not-allowed",
                background: canSend
                  ? `linear-gradient(135deg, ${C_PRIMARY}, #8b5cf6)`
                  : "#e8e8e8",
                color: canSend ? "#fff" : "#bbb",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, transition: "all 0.15s",
              }}
            >
              {sending
                ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                : <Send size={16} />}
            </button>

            {messages.length > 0 && (
              <button
                onClick={clear}
                title="Clear conversation"
                style={{
                  width: 42, height: 42, borderRadius: 10,
                  border: `1.5px solid ${C_BORDER}`,
                  cursor: "pointer",
                  background: "rgba(255,255,255,0.7)",
                  color: "#ccc",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0, transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.color = C_ERROR;
                  (e.currentTarget as HTMLButtonElement).style.borderColor = `${C_ERROR}45`;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.color = "#ccc";
                  (e.currentTarget as HTMLButtonElement).style.borderColor = C_BORDER;
                }}
              >
                <RotateCcw size={14} />
              </button>
            )}
          </div>
        </div>

        <div style={{ fontSize: 10.5, color: "#ccc" }}>
          Shift+Enter for new line · Powered by Llama · Responses include holdings, profile, and goals context
        </div>
      </div>

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
