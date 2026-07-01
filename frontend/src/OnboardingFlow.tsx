import { useState } from "react";
import { useProjectionStore } from "@/store/projectionStore";
import type { ProfilePreset } from "@/lib/profilePresets";
import { saveForecastConfig } from "@/services/investmentApi";
import ImportFinancialDataStep from "@/components/ImportFinancialDataStep";
import {
  ProgressBar,
  StepHeader,
  Slider,
  Toggle,
  Tip,
  NavRow,
  formatDollars,
  formatPercent,
  formatMonths,
} from "@/components/onboarding/primitives";

// ─── Types & defaults ─────────────────────────────────────────────────────────

interface OBState {
  revenue: number;
  growthRate: number;
  churnRate: number;
  months: number;
  useCOGS: boolean;
  cogsPercent: number;
  useMarketing: boolean;
  marketingSpend: number;
  usePayroll: boolean;
  payroll: number;
}

const DEFAULT: OBState = {
  revenue: 40100,
  growthRate: 0.05,
  churnRate: 3,
  months: 12,
  useCOGS: true,
  cogsPercent: 0.22,
  useMarketing: true,
  marketingSpend: 4000,
  usePayroll: true,
  payroll: 22000,
};

// ─── Step 2: Revenue ──────────────────────────────────────────────────────────

interface RevenueStepProps { state: OBState; patch: (p: Partial<OBState>) => void; }

function RevenueStep({ state, patch }: RevenueStepProps) {
  return (
    <div>
      <StepHeader
        currentStep={2}
        of={3}
        title="Revenue & Growth"
        sub="Set your starting revenue and growth expectations."
      />
      <Slider
        label="Starting Monthly Revenue"
        value={state.revenue}
        min={500}
        max={150000}
        step={500}
        format={formatDollars}
        onChange={(v) => patch({ revenue: v })}
      />
      <Slider
        label="Monthly Growth Rate"
        value={state.growthRate}
        min={0}
        max={0.3}
        step={0.005}
        format={formatPercent}
        parse={(s) => parseFloat(s.replace(/[^0-9.\-]/g, "")) / 100}
        onChange={(v) => patch({ growthRate: v })}
      />
      <Slider
        label="Monthly Churn Rate"
        value={state.churnRate}
        min={0}
        max={20}
        step={0.5}
        format={(v) => `${v.toFixed(2)}%`}
        onChange={(v) => patch({ churnRate: v })}
      />
      <Slider
        label="Forecast Period"
        value={state.months}
        min={3}
        max={36}
        step={3}
        format={formatMonths}
        onChange={(v) => patch({ months: v })}
      />
      <Tip
        text={
          state.growthRate >= 0.08
            ? `${formatPercent(state.growthRate)}/mo is strong growth — great for early-stage. Ensure your cost base scales slower than revenue.`
            : `Conservative ${formatPercent(state.growthRate)}/mo — solid for a stable base. Ensure costs don't outpace revenue.`
        }
      />
    </div>
  );
}

// ─── Step 3: Costs ────────────────────────────────────────────────────────────

interface CostsStepProps { state: OBState; patch: (p: Partial<OBState>) => void; }

function CostsStep({ state, patch }: CostsStepProps) {
  const totalExpenses =
    (state.useCOGS ? state.revenue * state.cogsPercent : 0) +
    (state.useMarketing ? state.marketingSpend : 0) +
    (state.usePayroll ? state.payroll : 0);

  return (
    <div>
      <StepHeader
        currentStep={3}
        of={3}
        title="Costs & Expenses"
        sub="Toggle anything that doesn't apply — it'll be excluded."
      />

      <div className="flex gap-2 flex-wrap mb-5">
        <Toggle label="COGS %"    on={state.useCOGS}      toggle={() => patch({ useCOGS:      !state.useCOGS      })} />
        <Toggle label="Marketing" on={state.useMarketing}  toggle={() => patch({ useMarketing: !state.useMarketing })} />
        <Toggle label="Payroll"   on={state.usePayroll}    toggle={() => patch({ usePayroll:   !state.usePayroll   })} />
      </div>

      <Slider
        label="COGS %"
        hint="Cost of Goods Sold as % of revenue"
        value={state.cogsPercent}
        min={0}
        max={0.8}
        step={0.01}
        format={formatPercent}
        parse={(s) => parseFloat(s.replace(/[^0-9.\-]/g, "")) / 100}
        onChange={(v) => patch({ cogsPercent: v })}
        disabled={!state.useCOGS}
      />
      <Slider
        label="Marketing Spend"
        hint="Ads, tools and events per month"
        value={state.marketingSpend}
        min={0}
        max={50000}
        step={500}
        format={formatDollars}
        onChange={(v) => patch({ marketingSpend: v })}
        disabled={!state.useMarketing}
      />
      <Slider
        label="Payroll"
        hint="Total salary costs per month"
        value={state.payroll}
        min={0}
        max={200000}
        step={1000}
        format={formatDollars}
        onChange={(v) => patch({ payroll: v })}
        disabled={!state.usePayroll}
      />

      <div className="mt-2 bg-primary/10 border border-primary/20 rounded-xl px-4 py-2.5 flex justify-between items-center">
        <span className="text-muted-foreground text-sm">Estimated monthly expenses</span>
        <span className={`text-sm font-bold ${totalExpenses > state.revenue ? "text-destructive" : "text-[#1D9E75]"}`}>
          {formatDollars(Math.round(totalExpenses))}
        </span>
      </div>

      <Tip
        text={
          !state.useCOGS && !state.useMarketing && !state.usePayroll
            ? "No costs toggled on — add at least one for a realistic forecast."
            : totalExpenses > state.revenue
            ? `⚠️ Expenses (${formatDollars(Math.round(totalExpenses))}) exceed starting revenue (${formatDollars(state.revenue)}). Strong growth needed to break even.`
            : `Healthy starting margin. With ${formatPercent(state.growthRate)}/mo revenue growth vs fixed costs, revenue should pull ahead.`
        }
      />
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

interface OnboardingFlowProps { onComplete: () => void; onBack: () => void; initialValues?: ProfilePreset; }

export default function OnboardingFlow({ onComplete, onBack, initialValues }: OnboardingFlowProps) {
  const [step, setStep] = useState(1);
  const [state, setState] = useState<OBState>(initialValues ?? DEFAULT);

  const patch = (p: Partial<OBState>) => setState((prev) => ({ ...prev, ...p }));

  const setStartingMRR      = useProjectionStore((s) => s.setStartingMRR);
  const setGrowthRate       = useProjectionStore((s) => s.setGrowthRate);
  const setChurnRate        = useProjectionStore((s) => s.setChurnRate);
  const setCogsPercent      = useProjectionStore((s) => s.setCogsPercent);
  const setMarketingSpend   = useProjectionStore((s) => s.setMarketingSpend);
  const setPayroll          = useProjectionStore((s) => s.setPayroll);
  const setForecastMonths      = useProjectionStore((s) => s.setForecastMonths);
  const saveCustomSnapshot     = useProjectionStore((s) => s.saveCustomSnapshot);
  const fetchProphetForecast   = useProjectionStore((s) => s.fetchProphetForecast);

  function handleComplete() {
    setStartingMRR(state.revenue);
    setGrowthRate(state.growthRate * 100);
    setChurnRate(state.churnRate);
    setCogsPercent(state.useCOGS ? state.cogsPercent * 100 : 0);
    setMarketingSpend(state.useMarketing ? state.marketingSpend : 0);
    setPayroll(state.usePayroll ? state.payroll : 0);
    setForecastMonths(state.months);

    saveCustomSnapshot();
    fetchProphetForecast();

    saveForecastConfig({
      starting_mrr:    state.revenue,
      growth_rate:     state.growthRate * 100,
      churn_rate:      state.churnRate,
      cogs_percent:    state.useCOGS    ? state.cogsPercent    * 100 : 0,
      marketing_spend: state.useMarketing ? state.marketingSpend : 0,
      payroll:         state.usePayroll   ? state.payroll        : 0,
      months:          state.months,
    }).catch(() => {});

    onComplete();
  }

  return (
    <div className="h-full flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-lg bg-white/30 backdrop-blur-[18px] rounded-[28px] border-2 border-white/70 shadow-[0_8px_48px_rgba(120,100,180,0.10)] p-8">
        <ProgressBar step={step} total={3} />

        {step === 1 && (
          <ImportFinancialDataStep
            onBack={onBack}
            onSkip={() => setStep(2)}
            onApply={() => setStep(2)}
          />
        )}
        {step === 2 && <RevenueStep state={state} patch={patch} />}
        {step === 3 && <CostsStep   state={state} patch={patch} />}

        {step === 2 && (
          <NavRow
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
            nextLabel="Next →"
          />
        )}
        {step === 3 && (
          <NavRow
            onBack={() => setStep(2)}
            onNext={handleComplete}
            nextLabel="Finish →"
          />
        )}
      </div>
    </div>
  );
}
