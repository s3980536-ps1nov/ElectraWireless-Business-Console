import { useState, useRef } from "react";
import {
  ProgressBar,
  StepHeader,
  Tip,
  Slider,
  NavRow,
} from "@/components/onboarding/primitives";
import {
  useInvestmentContextStore,
  INVESTMENT_ONBOARDING_DEFAULTS,
  INVESTMENT_CAPITAL_MIN,
  INVESTMENT_CAPITAL_MAX,
  INVESTMENT_CAPITAL_STEP,
  EMERGENCY_CASH_MIN,
  EMERGENCY_CASH_MAX,
  EMERGENCY_CASH_STEP,
  type ExperienceLevel,
  type CommunicationStyle,
  type InvestmentStrategy,
  type TimeHorizon,
  type AssetInterest,
  type InvestmentOnboardingValues,
} from "@/store/investmentContextStore";
import { submitInvestmentOnboarding, uploadHoldingsCsv, loadDemoHoldings } from "@/services/investmentApi";

// ─── Types & defaults ─────────────────────────────────────────────────────────

type OBState = InvestmentOnboardingValues;

const DEFAULT: OBState = INVESTMENT_ONBOARDING_DEFAULTS;

// ─── ChoiceGroup ──────────────────────────────────────────────────────────────

interface ChoiceGroupProps<T extends string> {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (v: T) => void;
  columns?: 2 | 3 | 4;
}

function ChoiceGroup<T extends string>({ label, value, options, onChange, columns = 3 }: ChoiceGroupProps<T>) {
  const gridCls = columns === 4 ? "grid-cols-4" : columns === 2 ? "grid-cols-2" : "grid-cols-3";
  return (
    <div className="mb-6">
      <label className="text-muted-foreground text-sm font-semibold block mb-2">{label}</label>
      <div className={`grid ${gridCls} gap-2`}>
        {options.map((opt) => {
          const on = opt.value === value;
          return (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all duration-150 font-sans ${
                on
                  ? "bg-primary/10 border-primary text-primary"
                  : "bg-transparent border-border text-muted-foreground hover:border-muted-foreground"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── MultiChoiceGroup ─────────────────────────────────────────────────────────

interface MultiChoiceGroupProps<T extends string> {
  label: string;
  hint?: string;
  values: T[];
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (vals: T[]) => void;
  columns?: 2 | 3 | 4;
}

function MultiChoiceGroup<T extends string>({ label, hint, values, options, onChange, columns = 3 }: MultiChoiceGroupProps<T>) {
  const gridCls = columns === 4 ? "grid-cols-4" : columns === 2 ? "grid-cols-2" : "grid-cols-3";
  const toggle = (v: T) =>
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  return (
    <div className="mb-6">
      <label className="text-muted-foreground text-sm font-semibold block mb-1">{label}</label>
      {hint && <p className="text-muted-foreground text-xs mb-2">{hint}</p>}
      <div className={`grid ${gridCls} gap-2`}>
        {options.map((opt) => {
          const on = values.includes(opt.value);
          return (
            <button
              key={opt.value}
              onClick={() => toggle(opt.value)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all duration-150 font-sans ${
                on
                  ? "bg-primary/10 border-primary text-primary"
                  : "bg-transparent border-border text-muted-foreground hover:border-muted-foreground"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 1: Personal Context ─────────────────────────────────────────────────

interface StepProps { state: OBState; patch: (p: Partial<OBState>) => void; }

const COUNTRIES = [
  "Australia", "Austria", "Belgium", "Brazil", "Canada", "Chile", "China",
  "Colombia", "Czech Republic", "Denmark", "Egypt", "Finland", "France",
  "Germany", "Greece", "Hong Kong", "Hungary", "India", "Indonesia", "Ireland",
  "Israel", "Italy", "Japan", "Malaysia", "Mexico", "Netherlands", "New Zealand",
  "Nigeria", "Norway", "Pakistan", "Philippines", "Poland", "Portugal",
  "Romania", "Saudi Arabia", "Singapore", "South Africa", "South Korea",
  "Spain", "Sweden", "Switzerland", "Taiwan", "Thailand", "Turkey",
  "United Arab Emirates", "United Kingdom", "United States", "Vietnam",
];

function CountryAutocomplete({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [query, setQuery]       = useState(value);
  const [open, setOpen]         = useState(false);

  const filtered = query.length > 0
    ? COUNTRIES.filter((c) => c.toLowerCase().includes(query.toLowerCase())).slice(0, 6)
    : [];

  function select(c: string) {
    onChange(c);
    setQuery(c);
    setOpen(false);
  }

  return (
    <div className="relative mb-6">
      <label className="text-muted-foreground text-sm font-semibold block mb-2">Country</label>
      <p className="text-muted-foreground text-xs mb-2">Used to suggest domestic investment opportunities.</p>
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Type your country…"
        className="w-full px-3 py-2 rounded-lg text-sm font-sans bg-transparent border border-border text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none transition-colors duration-150"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 rounded-lg border border-border bg-white/90 backdrop-blur-sm shadow-lg overflow-hidden">
          {filtered.map((c) => (
            <li
              key={c}
              onMouseDown={() => select(c)}
              className="px-3 py-2 text-sm cursor-pointer hover:bg-primary/10 hover:text-primary text-foreground font-sans transition-colors duration-100"
            >
              {c}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PersonalContextStep({ state, patch }: StepProps) {
  return (
    <div>
      <StepHeader
        currentStep={1}
        of={4}
        title="Personal Context"
        sub="Helps Elly tailor explanations to your situation."
      />
      <CountryAutocomplete value={state.country} onChange={(v) => patch({ country: v })} />
      <Slider
        label="Age"
        value={state.age}
        min={18}
        max={100}
        step={1}
        format={(v) => `${v} years`}
        onChange={(v) => patch({ age: v })}
      />
      <ChoiceGroup<ExperienceLevel>
        label="Experience Level"
        value={state.experienceLevel}
        columns={3}
        options={[
          { value: "beginner",     label: "Beginner" },
          { value: "intermediate", label: "Intermediate" },
          { value: "advanced",     label: "Advanced" },
        ]}
        onChange={(v) => patch({ experienceLevel: v })}
      />
      <Slider
        label="Investment Capital"
        hint="Money you've set aside to invest — already committed to the market."
        value={state.investmentCapital}
        min={INVESTMENT_CAPITAL_MIN}
        max={INVESTMENT_CAPITAL_MAX}
        step={INVESTMENT_CAPITAL_STEP}
        format={(v) => `$${v.toLocaleString("en-US")}`}
        onChange={(v) => patch({ investmentCapital: v })}
      />
      <Slider
        label="Emergency Cash"
        hint="Savings kept outside the market as your financial cushion."
        value={state.emergencyCash}
        min={EMERGENCY_CASH_MIN}
        max={EMERGENCY_CASH_MAX}
        step={EMERGENCY_CASH_STEP}
        format={(v) => `$${v.toLocaleString("en-US")}`}
        onChange={(v) => patch({ emergencyCash: v })}
      />
    </div>
  );
}

// ─── Step 2: Communication Preference ─────────────────────────────────────────

function CommunicationStep({ state, patch }: StepProps) {
  const cards: Array<{ value: CommunicationStyle; title: string; desc: string }> = [
    { value: "simple",    title: "Simple explanations",  desc: "Plain language, analogies, fewer numbers." },
    { value: "technical", title: "Technical breakdowns", desc: "Ratios, formulas, deeper data context." },
  ];
  return (
    <div>
      <StepHeader
        currentStep={2}
        of={4}
        title="Communication Preference"
        sub="How should Elly speak to you?"
      />
      <div className="grid grid-cols-2 gap-3 mt-2">
        {cards.map((c) => {
          const on = state.communicationStyle === c.value;
          return (
            <button
              key={c.value}
              onClick={() => patch({ communicationStyle: c.value })}
              className={`text-left rounded-xl border-2 p-4 transition-all duration-150 ${
                on
                  ? "bg-primary/10 border-primary"
                  : "bg-white/40 border-border hover:border-primary/40"
              }`}
            >
              <div className={`text-sm font-bold mb-1 ${on ? "text-primary" : "text-foreground"}`}>
                {c.title}
              </div>
              <div className="text-xs text-muted-foreground leading-relaxed">{c.desc}</div>
            </button>
          );
        })}
      </div>
      <Tip size="sm" text="Elly adapts the depth of her responses to match your choice — light highlights or full breakdowns, you decide." />
    </div>
  );
}

// ─── Step 3: Investment Goals ─────────────────────────────────────────────────

function GoalsStep({ state, patch }: StepProps) {
  return (
    <div>
      <StepHeader
        currentStep={3}
        of={4}
        title="Investment Goals"
        sub="What outcome are you optimizing for?"
      />
      <MultiChoiceGroup<InvestmentStrategy>
        label="Investment Strategies"
        hint="Pick one or more — Elly will weigh suggestions toward the styles you choose."
        values={state.investmentStrategies}
        columns={3}
        options={[
          { value: "day_trading",         label: "Day Trading" },
          { value: "index",               label: "Index" },
          { value: "growth",              label: "Growth" },
          { value: "income",              label: "Income" },
          { value: "buy_and_hold",        label: "Buy and Hold" },
          { value: "dollar_cost_average", label: "Dollar-Cost Average" },
        ]}
        onChange={(v) => patch({ investmentStrategies: v })}
      />
      <ChoiceGroup<TimeHorizon>
        label="Time Horizon"
        value={state.timeHorizon}
        columns={3}
        options={[
          { value: "daily",        label: "Daily"        },
          { value: "weekly",       label: "Weekly"       },
          { value: "monthly",      label: "Monthly"      },
          { value: "annually",     label: "Annually"     },
          { value: "indefinitely", label: "Indefinitely" },
        ]}
        onChange={(v) => patch({ timeHorizon: v })}
      />
      <MultiChoiceGroup<AssetInterest>
        label="Asset Interests"
        hint="Which asset types are you interested in? Select all that apply — Elly will tailor suggestions to these."
        values={state.assetInterests}
        columns={3}
        options={[
          { value: "stock",  label: "Stocks" },
          { value: "crypto", label: "Crypto" },
          { value: "etf",    label: "ETFs"   },
        ]}
        onChange={(v) => patch({ assetInterests: v })}
      />
    </div>
  );
}

// ─── Step 4: CSV Import ───────────────────────────────────────────────────────

type UploadStatus = "idle" | "loading" | "success" | "error";

interface CsvImportStepProps {
  onUploaded: () => void;
}

function CsvImportStep({ onUploaded }: CsvImportStepProps) {
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [result, setResult] = useState<{ imported: number; symbols: string[]; errors: string[] } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file.name.endsWith(".csv")) {
      setStatus("error");
      setResult({ imported: 0, symbols: [], errors: ["File must be a .csv"] });
      return;
    }
    setStatus("loading");
    try {
      const data = await uploadHoldingsCsv(file);
      setResult(data);
      setStatus(data.imported > 0 ? "success" : "error");
      if (data.imported > 0) onUploaded();
    } catch {
      setStatus("error");
      setResult({ imported: 0, symbols: [], errors: ["Upload failed — check the server is running."] });
    }
  }

  return (
    <div>
      <StepHeader
        currentStep={4}
        of={4}
        title="Import Your Portfolio"
        sub="Upload a CSV to populate your dashboard, or skip to start with a demo portfolio you can edit."
      />

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        onClick={() => inputRef.current?.click()}
        className={`mt-3 mb-4 rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-all duration-150 ${
          dragOver ? "border-primary bg-primary/10" :
          status === "success" ? "border-green-400 bg-green-50" :
          status === "error" ? "border-red-400 bg-red-50" :
          "border-border hover:border-primary/50 bg-white/30"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />

        {status === "idle" && (
          <>
            <div className="text-2xl mb-1">📂</div>
            <div className="text-sm font-semibold text-foreground">Drag & drop a CSV or click to browse</div>
            <div className="text-xs text-muted-foreground mt-1">Columns: symbol, asset_type, quantity, buy_price (+ optional purchase_date)</div>
          </>
        )}
        {status === "loading" && (
          <div className="text-sm text-muted-foreground animate-pulse">Uploading…</div>
        )}
        {status === "success" && result && (
          <>
            <div className="text-sm font-bold text-green-700">✓ Imported {result.imported} holding{result.imported !== 1 ? "s" : ""}</div>
            <div className="text-xs text-green-600 mt-1">{result.symbols.join(", ")}</div>
            {result.errors.length > 0 && (
              <div className="text-xs text-amber-600 mt-2">{result.errors.length} row{result.errors.length !== 1 ? "s" : ""} skipped</div>
            )}
          </>
        )}
        {status === "error" && result && (
          <>
            <div className="text-sm font-bold text-red-600">Import failed</div>
            {result.errors.slice(0, 3).map((e, i) => (
              <div key={i} className="text-xs text-red-500 mt-1">{e}</div>
            ))}
            <div className="text-xs text-muted-foreground mt-2">Click to try again</div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

interface InvestmentOnboardingFlowProps { onComplete: () => void; onBack: () => void; }

export default function InvestmentOnboardingFlow({ onComplete, onBack }: InvestmentOnboardingFlowProps) {
  const [step, setStep] = useState(1);
  const [state, setState] = useState<OBState>(DEFAULT);
  const [csvUploaded, setCsvUploaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const patch = (p: Partial<OBState>) => setState((prev) => ({ ...prev, ...p }));

  const setAll = useInvestmentContextStore((s) => s.setAll);

  const strategiesEmpty = state.investmentStrategies.length === 0;
  const interestsEmpty  = state.assetInterests.length === 0;
  const step3Invalid    = strategiesEmpty || interestsEmpty;

  async function seedDemoIfSkipped(): Promise<void> {
    if (csvUploaded) return;
    try {
      const res = await loadDemoHoldings();
      if (!res || res.imported === 0) {
        console.warn("[onboarding] Demo portfolio load returned 0 imports:", res);
      }
    } catch (err) {
      console.warn("[onboarding] Demo portfolio load failed:", err);
    }
  }

  async function handleComplete() {
    if (submitting) return;

    setSubmitting(true);
    setSubmitError(null);

    // Seed the demo portfolio BEFORE navigating so the dashboard sees the
    // holdings on its first fetch instead of mounting against an empty table.
    await seedDemoIfSkipped();

    try {
      const saved = await submitInvestmentOnboarding(state);
      setAll({ ...state, completedAt: saved.completedAt });
      onComplete();
    } catch {
      setAll({ ...state, completedAt: new Date().toISOString() });
      setSubmitError("Couldn't reach the server. Click Retry to try again, or Skip to continue without server sync.");
      setSubmitting(false);
    }
  }

  async function handleSkipSync() {
    await seedDemoIfSkipped();
    setAll({ ...state, completedAt: new Date().toISOString() });
    onComplete();
  }

  return (
    <div className="h-full flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-lg bg-white/30 backdrop-blur-[18px] rounded-[28px] border-2 border-white/70 shadow-[0_8px_48px_rgba(120,100,180,0.10)] p-8">
        <ProgressBar step={step} total={4} />

        {step === 1 && <PersonalContextStep state={state} patch={patch} />}
        {step === 2 && <CommunicationStep   state={state} patch={patch} />}
        {step === 3 && <GoalsStep           state={state} patch={patch} />}
        {step === 4 && <CsvImportStep onUploaded={() => setCsvUploaded(true)} />}

        {step === 3 && step3Invalid && (
          <p className="mt-3 text-xs text-amber-700/90 font-medium">
            {strategiesEmpty && interestsEmpty
              ? "Pick at least one strategy and one asset interest to continue."
              : strategiesEmpty
                ? "Pick at least one investment strategy to continue."
                : "Pick at least one asset interest to continue."}
          </p>
        )}

        {step === 4 && submitError && (
          <div className="mt-3">
            <p className="text-xs text-amber-700/90 font-medium">{submitError}</p>
            <button
              onClick={handleSkipSync}
              className="mt-2 text-xs text-muted-foreground underline hover:text-foreground transition-colors duration-150"
            >
              Skip sync and finish →
            </button>
          </div>
        )}

        {step === 1 && (
          <NavRow onBack={onBack} onNext={() => setStep(2)} nextLabel="Next →" />
        )}
        {step === 2 && (
          <NavRow onBack={() => setStep(1)} onNext={() => setStep(3)} nextLabel="Next →" />
        )}
        {step === 3 && (
          <NavRow
            onBack={() => setStep(2)}
            onNext={() => setStep(4)}
            nextLabel="Next →"
            nextDisabled={step3Invalid}
          />
        )}
        {step === 4 && (
          <NavRow
            onBack={() => setStep(3)}
            onNext={handleComplete}
            nextLabel={
              submitting       ? "Saving…"
              : submitError    ? "Retry →"
              : csvUploaded    ? "Finish →"
              :                  "Skip →"
            }
            nextDisabled={submitting}
          />
        )}
      </div>
    </div>
  );
}
