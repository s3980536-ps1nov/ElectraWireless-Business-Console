import { useState, useEffect } from "react";
import { Loader2, Sparkles, TrendingUp, TrendingDown, ListChecks, MessageCircle, UserCircle, RefreshCw, Activity } from "lucide-react";
import { useInvestmentContextStore } from "@/store/investmentContextStore";
import { useInvestmentGoalsStore } from "@/store/investmentGoalsStore";
import { usePersonalFinanceStore } from "@/store/personalFinanceStore";
import { fetchSummary } from "@/services/personalFinanceApi";
import type { FinancialSummary } from "@/services/personalFinanceApi";
import { buildInvestmentAIPayload, fetchInvestmentAIInsights } from "@/services/investmentApi";
import type { InvestmentHolding, InvestmentAIResponse, PortfolioSummary, PFContextInput } from "@/services/investmentApi";
import { useInvestmentAIStore, holdingsFingerprint } from "@/store/investmentAIStore";
import { summarizeInvestmentGoal } from "@/components/investment/InvestmentGoalsTab";
import { C_PRIMARY, C_SUCCESS, C_ERROR, C_WARNING, C_BORDER } from "@/lib/colors";

type SectionAccent = "primary" | "success" | "error" | "warning";

const ACCENT_COLOR: Record<SectionAccent, string> = {
  primary: C_PRIMARY,
  success: C_SUCCESS,
  error:   C_ERROR,
  warning: C_WARNING,
};

function SectionCard({
  accent, icon, title, children,
}: {
  accent: SectionAccent;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  const color = ACCENT_COLOR[accent];
  return (
    <div style={{
      background: `${color}0d`,
      border: `1px solid ${color}2a`,
      borderLeft: `3px solid ${color}`,
      borderRadius: 10,
      padding: "14px 16px",
      display: "flex",
      flexDirection: "column",
      gap: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color, display: "flex" }}>{icon}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color }}>{title}</span>
      </div>
      <div style={{ fontSize: 12, color: "hsl(245 16% 40%)", lineHeight: 1.55 }}>
        {children}
      </div>
    </div>
  );
}

function BulletList({ items, color }: { items: string[]; color: string }) {
  if (items.length === 0) {
    return <span style={{ color: "#aaa", fontStyle: "italic" }}>None reported.</span>;
  }
  return (
    <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 5 }}>
      {items.map((item, i) => (
        <li key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <span style={{ color, flexShrink: 0, fontWeight: 700, lineHeight: 1.55 }}>•</span>
          <span style={{ flex: 1 }}>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function InvestmentAIPanel({ holdings, summary }: { holdings: InvestmentHolding[]; summary: PortfolioSummary | null }) {
  const onboarding      = useInvestmentContextStore();
  const investmentGoals = useInvestmentGoalsStore((s) => s.goals);
  const pfStore         = usePersonalFinanceStore();
  const { transactions, assets, liabilities } = pfStore;

  const { result, generatedAt, fingerprint: cachedFingerprint, setReport } = useInvestmentAIStore();

  const [loading,   setLoading]  = useState(false);
  const [error,     setError]    = useState<string | null>(null);
  const [pfSummary, setPfSummary] = useState<FinancialSummary | null>(null);

  const currentFingerprint = holdingsFingerprint(holdings);
  // Discard cached report if holdings have changed since it was generated
  const cachedResult = cachedFingerprint === currentFingerprint ? result : null;
  const cachedAt     = cachedFingerprint === currentFingerprint && generatedAt
    ? new Date(generatedAt)
    : null;

  useEffect(() => {
    if (transactions.length === 0) { setPfSummary(null); return; }
    fetchSummary(transactions).then(setPfSummary).catch(() => setPfSummary(null));
  }, [transactions]);

  const pfContext: PFContextInput | null = pfSummary
    ? {
        hasData:         true,
        monthlyExpenses: pfSummary.totalExpenses / Math.max(1, pfSummary.monthlyBreakdown.length),
        cashBalance:     assets > 0 ? assets - liabilities : Math.max(0, pfSummary.netCashFlow),
        savingsRate:     pfSummary.savingsRate,
        healthScore:     pfSummary.healthScore,
        healthGrade:     pfSummary.healthGrade,
        netCashFlow:     pfSummary.netCashFlow,
      }
    : null;

  const hasHoldings = holdings.length > 0;

  async function generate() {
    if (!hasHoldings || loading) return;
    setLoading(true);
    setError(null);
    try {
      const goalsSummary = investmentGoals
        .map((g) => summarizeInvestmentGoal(g, holdings, summary))
        .join("; ");
      const payload = buildInvestmentAIPayload("", holdings, {
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
      }, goalsSummary, "Current portfolio", summary, pfContext);
      setReport(await fetchInvestmentAIInsights(payload), currentFingerprint);
    } catch {
      setError("Could not generate report — is the backend running on port 8000?");
    } finally {
      setLoading(false);
    }
  }

  // Removed auto-run — Groq free tier has a 100k token/day limit and
  // firing on every page mount burns ~7k tokens with no user question.

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Report header bar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 16px",
        background: "rgba(255,255,255,0.55)",
        border: `1.5px solid ${C_BORDER}`,
        borderLeft: `3px solid ${C_PRIMARY}`,
        borderRadius: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: C_PRIMARY, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Portfolio Health Report
          </span>
          {pfContext && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
              background: `${C_SUCCESS}1a`, color: C_SUCCESS, border: `1px solid ${C_SUCCESS}40`,
              display: "flex", alignItems: "center", gap: 4,
            }}>
              <Activity size={9} /> Cashflow linked
            </span>
          )}
          {cachedAt && (
            <span style={{ fontSize: 10, color: "#aaa" }}>
              Generated {cachedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
        <button
          onClick={generate}
          disabled={!hasHoldings || loading}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            fontSize: 11, fontWeight: 600, padding: "5px 12px", borderRadius: 7,
            border: `1px solid ${C_PRIMARY}40`,
            background: loading ? "#f5f5f5" : `${C_PRIMARY}10`,
            color: loading ? "#aaa" : C_PRIMARY,
            cursor: !hasHoldings || loading ? "not-allowed" : "pointer",
          }}
        >
          {loading
            ? <><Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} /> Generating…</>
            : <><RefreshCw size={11} /> Refresh</>}
        </button>
      </div>

      {/* Loading skeleton */}
      {loading && !cachedResult && (
        <div style={{
          padding: "32px 20px", borderRadius: 10, textAlign: "center",
          background: "rgba(255,255,255,0.4)", border: `1.5px dashed ${C_BORDER}`,
        }}>
          <Loader2 size={20} style={{ animation: "spin 1s linear infinite", color: C_PRIMARY, margin: "0 auto 10px" }} />
          <div style={{ fontSize: 12.5, color: "#888" }}>Analysing your portfolio…</div>
          <div style={{ fontSize: 11, color: "#bbb", marginTop: 4 }}>Powered by Llama · this takes ~10 seconds</div>
        </div>
      )}

      {/* No holdings */}
      {!hasHoldings && !loading && (
        <div style={{
          padding: "24px 20px", borderRadius: 10, fontSize: 12.5, color: "#aaa",
          background: "rgba(255,255,255,0.4)", border: `1.5px dashed ${C_BORDER}`, textAlign: "center",
        }}>
          Add holdings first — the report generates automatically once your portfolio has data.
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          padding: "10px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500,
          background: `${C_ERROR}10`, border: `1px solid ${C_ERROR}40`, color: C_ERROR,
        }}>
          {error}
        </div>
      )}

      {/* Report sections */}
      {cachedResult && !loading && (
        <>
          {cachedResult.profile_context && (
            <SectionCard accent="primary" icon={<UserCircle size={13} />} title="Your Profile">
              {cachedResult.profile_context}
            </SectionCard>
          )}

          {cachedResult.summary && (
            <SectionCard accent="primary" icon={<Sparkles size={13} />} title="Summary">
              {cachedResult.summary}
            </SectionCard>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <SectionCard accent="success" icon={<TrendingUp size={13} />} title="Strengths">
              <BulletList items={cachedResult.pros} color={C_SUCCESS} />
            </SectionCard>
            <SectionCard accent="error" icon={<TrendingDown size={13} />} title="Weaknesses">
              <BulletList items={cachedResult.cons} color={C_ERROR} />
            </SectionCard>
          </div>

          <SectionCard accent="warning" icon={<ListChecks size={13} />} title="Next Steps">
            <BulletList items={cachedResult.next_steps} color={C_WARNING} />
          </SectionCard>

          {cachedResult.question_response &&
            cachedResult.question_response.toLowerCase().trim() !== "no question provided." && (
            <SectionCard accent="primary" icon={<MessageCircle size={13} />} title="Additional Notes">
              {cachedResult.question_response}
            </SectionCard>
          )}
        </>
      )}

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
