import { useState } from "react";
import {
  TrendingDown,
  BarChart2,
  TrendingUp,
  Database,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { useProjectionStore } from "@/store/projectionStore";
import { usePersonalFinanceStore, useFilteredTransactions } from "@/store/personalFinanceStore";
import { useInvestmentContextStore } from "@/store/investmentContextStore";
import { AIHintBlock } from "@/components/AIHintBlock";
import { API_BASE, type AnalysisResult } from "@/lib/api";
import type { ConsoleTool } from "@/components/ConsoleSidebar";
import { cn } from "@/lib/utils";
import {
  fetchSummary,
  fetchInsights,
  fetchPFAIInsights,
  buildPFAIPayload,
  type PFAIResponse,
} from "@/services/personalFinanceApi";
import {
  fetchHoldings,
  fetchInvestmentAIInsights,
  buildInvestmentAIPayload,
  type InvestmentAIResponse,
} from "@/services/investmentApi";

const TOOL_TIPS: Partial<Record<ConsoleTool, string[]>> = {
  home: [
    "Use the Financial Projection Engine to model revenue and run scenario analysis.",
    "Import bank statements in Personal Finance to track spending automatically.",
    "Explore scenarios to stress-test your financial plans.",
  ],
  personal: [
    "Import your bank statement to get AI-powered category insights.",
    "Set budgets for each category to track overspending in real time.",
    "Review the Cash Flow tab to spot monthly income & expense trends.",
  ],
  investment: [
    "Add holdings or import a CSV — Elly tailors analysis to your real portfolio.",
    "Open the AI Scenarios tab for a full Llama-powered portfolio review.",
    "Onboarding context (age, horizon, goals) is automatically included in every prompt.",
  ],
};

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[9.5px] font-bold tracking-[0.11em] uppercase text-primary mb-2.5">
      {children}
    </div>
  );
}

interface QuickActionBtnProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}

function QuickActionBtn({ icon, label, onClick }: QuickActionBtnProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 bg-white/55 border-[1.5px] border-primary/[0.14] rounded-[7px] px-3 py-[7px] text-[11.5px] font-semibold text-foreground cursor-pointer text-left w-full transition-all duration-150 tracking-[0.01em] hover:bg-primary/[0.08] hover:text-primary hover:border-primary/[0.26]"
    >
      <span className="flex flex-shrink-0">{icon}</span>
      {label}
    </button>
  );
}

function Spinner() {
  return (
    <span className="w-2.5 h-2.5 rounded-full border-[1.5px] border-[hsl(245_16%_55%)] border-t-transparent inline-block animate-[spin_0.7s_linear_infinite] flex-shrink-0" />
  );
}

interface ConsoleAISidebarProps {
  activeTool: ConsoleTool;
}

export function ConsoleAISidebar({ activeTool }: ConsoleAISidebarProps) {
  const [input, setInput]                 = useState("");
  const [loading, setLoading]             = useState(false);
  const [result, setResult]               = useState<AnalysisResult | null>(null);
  const [pfResult, setPfResult]           = useState<PFAIResponse | null>(null);
  const [investmentResult, setInvestmentResult] = useState<InvestmentAIResponse | null>(null);
  const [error, setError]                 = useState<string | null>(null);

  const setActiveScenario = useProjectionStore((s) => s.setActiveScenario);
  const { loadDemoData, reset } = usePersonalFinanceStore();
  const pfTransactions = useFilteredTransactions();
  const pfBudgets      = usePersonalFinanceStore((s) => s.budgets);
  const pfPeriod       = usePersonalFinanceStore((s) => s.activePeriod);

  async function handleAsk(overrideQuestion?: string) {
    const q = (overrideQuestion ?? input).trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setPfResult(null);
    setInvestmentResult(null);
    try {
      if (activeTool === "personal") {
        const summary  = await fetchSummary(pfTransactions);
        const insights = await fetchInsights(pfTransactions, pfBudgets);
        const payload  = buildPFAIPayload(q, pfPeriod, summary, insights);
        setPfResult(await fetchPFAIInsights(payload));
      } else if (activeTool === "investment") {
        const holdings   = await fetchHoldings();
        const onboarding = useInvestmentContextStore.getState();
        const payload    = buildInvestmentAIPayload(q, holdings, {
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
        });
        setInvestmentResult(await fetchInvestmentAIInsights(payload));
      } else {
        const res = await fetch(`${API_BASE}/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: q }),
        });
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        setResult(await res.json() as AnalysisResult);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const noPFData = activeTool === "personal" && pfTransactions.length === 0;
  const isDisabled = loading || !input.trim() || noPFData;

  return (
    <div className="w-[240px] flex-shrink-0 h-full flex flex-col border-l-[1.5px] border-border bg-white/[0.28] backdrop-blur-[20px] overflow-y-auto overflow-x-hidden">

      {/* Ask Elly */}
      <section className="px-3.5 py-4 border-b border-primary/[0.08] flex-shrink-0">
        <SectionHeader>Ask Elly</SectionHeader>

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleAsk();
            }
          }}
          disabled={loading}
          placeholder="Ask about your financial outlook…"
          className="w-full min-h-[72px] max-h-[120px] bg-white/65 border-[1.5px] border-primary/[0.15] rounded-lg px-3 py-2.5 text-xs text-foreground font-[inherit] leading-[1.55] resize-none outline-none box-border transition-colors duration-150 disabled:opacity-60 focus:border-primary/[0.35]"
        />

        <button
          onClick={() => handleAsk()}
          disabled={isDisabled}
          className={cn(
            "mt-2 w-full rounded-[7px] px-3.5 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors duration-150",
            isDisabled
              ? "bg-[hsl(245_16%_85%)] text-[hsl(245_16%_55%)] cursor-not-allowed"
              : "bg-primary text-white cursor-pointer"
          )}
        >
          {loading ? <><Spinner /> Thinking…</> : "Ask Elly"}
        </button>

        {noPFData && !loading && (
          <p className="mt-2 m-0 text-[10.5px] text-muted-foreground leading-[1.55]">
            Import transactions or load demo data to ask Elly about your finances.
          </p>
        )}
      </section>

      {/* Response / Elly Suggestions — flex-1 so it fills available space */}
      <section className="p-3.5 border-b border-primary/[0.08] flex-1 min-h-0 overflow-y-auto">
        {error && (
          <>
            <SectionHeader>Error</SectionHeader>
            <span className="text-destructive text-[11.5px]">{error}</span>
          </>
        )}

        {!error && (result || pfResult || investmentResult) && (
          <>
            <SectionHeader>Elly's Response</SectionHeader>
            <div className="flex flex-col gap-3">
              {result && (
                <>
                  <p className="m-0 text-xs text-[hsl(242_44%_35%)] leading-[1.65]">
                    {result.analysis_short}
                  </p>
                  {result.next_steps.length > 0 && (
                    <div>
                      <div className="text-[9.5px] font-bold tracking-[0.08em] uppercase text-[hsl(245_16%_56%)] mb-1.5">
                        Next Steps
                      </div>
                      {result.next_steps.slice(0, 2).map((s, i) => (
                        <p key={i} className="m-0 mb-1 text-[11px] text-[hsl(245_16%_45%)] leading-[1.55]">
                          → {s}
                        </p>
                      ))}
                    </div>
                  )}
                </>
              )}
              {pfResult && (
                <>
                  <p className="m-0 text-xs text-[hsl(242_44%_35%)] leading-[1.65]">
                    {pfResult.answer ?? pfResult.summary}
                  </p>
                  {(() => {
                    const items = pfResult.supporting_insights ?? pfResult.recommendedActions;
                    const label = pfResult.supporting_insights ? "Key Insights" : "Next Steps";
                    if (!items || items.length === 0) return null;
                    return (
                      <div>
                        <div className="text-[9.5px] font-bold tracking-[0.08em] uppercase text-[hsl(245_16%_56%)] mb-1.5">
                          {label}
                        </div>
                        {items.slice(0, 3).map((s, i) => (
                          <p key={i} className="m-0 mb-1 text-[11px] text-[hsl(245_16%_45%)] leading-[1.55]">
                            → {s}
                          </p>
                        ))}
                      </div>
                    );
                  })()}
                </>
              )}
              {investmentResult && (
                <>
                  {investmentResult.profile_context && (
                    <div className="rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1.5">
                      <div className="text-[9.5px] font-bold tracking-[0.08em] uppercase text-primary mb-0.5">
                        Your Profile
                      </div>
                      <p className="m-0 text-[10.5px] text-[hsl(242_44%_35%)] leading-[1.55]">
                        {investmentResult.profile_context}
                      </p>
                    </div>
                  )}
                  <p className="m-0 text-xs text-[hsl(242_44%_35%)] leading-[1.65]">
                    {investmentResult.question_response &&
                      investmentResult.question_response.toLowerCase().trim() !== "no question provided."
                      ? investmentResult.question_response
                      : investmentResult.summary}
                  </p>
                  {investmentResult.next_steps.length > 0 && (
                    <div>
                      <div className="text-[9.5px] font-bold tracking-[0.08em] uppercase text-[hsl(245_16%_56%)] mb-1.5">
                        Next Steps
                      </div>
                      {investmentResult.next_steps.slice(0, 3).map((s, i) => (
                        <p key={i} className="m-0 mb-1 text-[11px] text-[hsl(245_16%_45%)] leading-[1.55]">
                          → {s}
                        </p>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {!error && !result && !pfResult && !investmentResult && (
          <>
            <SectionHeader>Elly Suggestions</SectionHeader>
            {activeTool === "projection" ? (
              <AIHintBlock />
            ) : (
              <div className="flex flex-col gap-2">
                {(TOOL_TIPS[activeTool] ?? []).map((tip, i) => (
                  <p key={i} className="m-0 text-[11.5px] text-muted-foreground leading-[1.65]">
                    <span className="text-primary mr-[5px]">→</span>
                    {tip}
                  </p>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* Quick Actions */}
      <section className="p-3.5 flex-shrink-0">
        <SectionHeader>Quick Actions</SectionHeader>

        <div className="flex flex-col gap-1.5">
          {activeTool === "projection" && (
            <>
              <QuickActionBtn
                icon={<TrendingDown size={13} />}
                label="Apply Bear Scenario"
                onClick={() => setActiveScenario("bear")}
              />
              <QuickActionBtn
                icon={<BarChart2 size={13} />}
                label="Apply Base Scenario"
                onClick={() => setActiveScenario("base")}
              />
              <QuickActionBtn
                icon={<TrendingUp size={13} />}
                label="Apply Bull Scenario"
                onClick={() => setActiveScenario("bull")}
              />
            </>
          )}
          {activeTool === "personal" && (
            <>
              <QuickActionBtn
                icon={<Database size={13} />}
                label="Load Demo Data"
                onClick={loadDemoData}
              />
              <QuickActionBtn
                icon={<RotateCcw size={13} />}
                label="Reset All Data"
                onClick={reset}
              />
            </>
          )}
          {activeTool === "investment" && (
            <>
              <QuickActionBtn
                icon={<Sparkles size={13} />}
                label="Generate AI Report"
                onClick={() => handleAsk("Give me a full portfolio review with strengths, weaknesses, and next steps.")}
              />
              <QuickActionBtn
                icon={<RotateCcw size={13} />}
                label="Reset Analysis"
                onClick={() => { setInvestmentResult(null); setError(null); }}
              />
            </>
          )}
          {activeTool === "home" && (
            <p className="m-0 text-[11.5px] text-muted-foreground leading-[1.65]">
              Select a tool to see quick actions.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
