import { useState } from "react";
import { Lightbulb } from "lucide-react";

// ─── Formatters ───────────────────────────────────────────────────────────────

export const formatDollars = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const formatPercent = (v: number) => `${(v * 100).toFixed(2)}%`;
export const formatMonths  = (v: number) => `${v} mo`;

// ─── ProgressBar ──────────────────────────────────────────────────────────────

export interface ProgressBarProps { step: number; total: number; }

export function ProgressBar({ step, total }: ProgressBarProps) {
  return (
    <div className="flex gap-1.5 mb-5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`flex-1 h-0.5 rounded-full transition-colors duration-300 ${
            i < step ? "bg-primary" : "bg-border"
          }`}
        />
      ))}
    </div>
  );
}

// ─── StepHeader ───────────────────────────────────────────────────────────────

export interface StepHeaderProps { currentStep: number; of: number; title: string; sub: string; }

export function StepHeader({ currentStep: n, of: total, title, sub }: StepHeaderProps) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-1.5">
        <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground font-extrabold text-xs flex items-center justify-center flex-shrink-0">
          {n}
        </div>
        <span className="text-muted-foreground text-xs tracking-widest uppercase">
          Step {n} of {total}
        </span>
      </div>
      <h2 className="text-foreground text-2xl font-extrabold tracking-tight mb-1">{title}</h2>
      <p className="text-muted-foreground text-sm">{sub}</p>
    </div>
  );
}

// ─── Slider ───────────────────────────────────────────────────────────────────

export interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (newValue: number) => string;
  parse?: (input: string) => number;
  onChange: (newValue: number) => void;
  disabled?: boolean;
  hint?: string;
}

export function Slider({ label, value, min, max, step, format, parse, onChange, disabled, hint }: SliderProps) {
  const [editing, setEditing] = useState(false);
  const [inputText, setInputText] = useState("");

  function handleFocus() {
    setEditing(true);
    setInputText(format(value));
  }

  function commit() {
    setEditing(false);
    const parsed = parse
      ? parse(inputText)
      : parseFloat(inputText.replace(/[^0-9.\-]/g, ""));
    if (!isNaN(parsed)) {
      onChange(Math.min(max, Math.max(min, parsed)));
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
    if (e.key === "Escape") setEditing(false);
  }

  return (
    <div className={`mb-6 transition-opacity duration-200 ${disabled ? "opacity-30" : "opacity-100"}`}>
      {hint && <p className="text-muted-foreground text-xs mb-0.5">{hint}</p>}
      {label !== "" && (
        <div className="flex justify-between items-center mb-1">
          <label className="text-muted-foreground text-sm font-semibold">{label}</label>
          {disabled ? (
            <span className="text-sm font-bold text-muted-foreground">—</span>
          ) : (
            <input
              type="text"
              value={editing ? inputText : format(value)}
              onFocus={handleFocus}
              onChange={(e) => setInputText(e.target.value)}
              onBlur={commit}
              onKeyDown={handleKeyDown}
              className="text-sm font-bold text-primary bg-transparent border-b border-primary/30 focus:border-primary outline-none text-right w-28 transition-colors duration-150 font-sans"
            />
          )}
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`w-full block ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
      />
    </div>
  );
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

export interface ToggleProps { label: string; on: boolean; toggle: () => void; }

export function Toggle({ label, on, toggle }: ToggleProps) {
  return (
    <button
      onClick={toggle}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-150 font-sans ${
        on ? "bg-primary/10 border-primary text-primary" : "bg-transparent border-border text-muted-foreground"
      }`}
    >
      <span
        className={`w-2 h-2 rounded-full flex-shrink-0 transition-colors duration-150 ${
          on ? "bg-primary" : "bg-border"
        }`}
      />
      {label}
    </button>
  );
}

// ─── Tip ──────────────────────────────────────────────────────────────────────

export interface TipProps { text: string; size?: "sm" | "md"; }

export function Tip({ text, size = "md" }: TipProps) {
  const sm = size === "sm";
  return (
    <div className={`bg-primary/[0.07] border border-primary/20 rounded-xl flex gap-2 ${
      sm ? "mt-3 px-2.5 py-2" : "mt-5 px-3.5 py-3"
    }`}>
      <Lightbulb size={sm ? 11 : 13} className={`text-primary flex-shrink-0 ${sm ? "mt-px" : "mt-0.5"}`} />
      <p className={`text-muted-foreground leading-relaxed m-0 ${sm ? "text-[11px]" : "text-xs"}`}>{text}</p>
    </div>
  );
}

// ─── NavRow ───────────────────────────────────────────────────────────────────

export interface NavRowProps {
  onBack: () => void;
  onNext: () => void;
  nextLabel: string;
  nextDisabled?: boolean;
}

export function NavRow({ onBack, onNext, nextLabel, nextDisabled = false }: NavRowProps) {
  return (
    <div className="flex justify-between mt-5">
      <button
        onClick={onBack}
        className="bg-transparent border border-border text-muted-foreground rounded-lg px-5 py-2.5 text-sm font-medium hover:border-muted-foreground hover:text-foreground transition-colors duration-150 font-sans"
      >
        ← Back
      </button>
      <button
        onClick={onNext}
        disabled={nextDisabled}
        className="bg-primary text-primary-foreground rounded-lg px-6 py-2.5 text-sm font-semibold hover:opacity-85 transition-opacity duration-150 font-sans disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:opacity-50"
      >
        {nextLabel}
      </button>
    </div>
  );
}
