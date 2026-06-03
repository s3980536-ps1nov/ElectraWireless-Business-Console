import { BarChart2, Wallet, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Feature data ─────────────────────────────────────────────────────────────

const PROJECTION_FEATURES = [
  "Revenue & MRR forecasting",
  "P&L and cash runway",
  "Bear / Base / Bull scenarios",
];

const PERSONAL_FEATURES = [
  "Bank statement import",
  "Category budgets & alerts",
  "Cash flow visualisation",
];

const INVESTMENT_FEATURES = [
  "AI portfolio analysis & insights",
  "Live market data & price alerts",
  "Risk, goals & scenario planning",
];

// ─── FeatureCard ──────────────────────────────────────────────────────────────

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  features: string[];
  buttonLabel: string;
  buttonVariant?: "primary" | "secondary";
  onClick: () => void;
}

function FeatureCard({
  icon,
  title,
  description,
  features,
  buttonLabel,
  buttonVariant = "primary",
  onClick,
}: FeatureCardProps) {
  return (
    <div className="bg-white/40 backdrop-blur-[18px] rounded-[28px] border border-white/70 shadow-[0_8px_48px_rgba(120,100,180,0.15)] p-7 flex flex-col gap-3 hover:-translate-y-1 transition-all duration-200">
      <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
        {icon}
      </div>
      <div>
        <h2 className="text-[15px] font-bold text-foreground leading-tight mb-1">{title}</h2>
        <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
      </div>
      <ul className="flex flex-col gap-1.5 mt-1">
        {features.map((item) => (
          <li key={item} className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-primary/50 flex-shrink-0" />
            {item}
          </li>
        ))}
      </ul>
      <button
        onClick={onClick}
        className={cn(
          "mt-auto w-full rounded-full py-2.5 text-sm font-bold cursor-pointer transition-all duration-150",
          buttonVariant === "primary"
            ? "bg-primary text-white hover:opacity-90"
            : "bg-primary/10 text-primary hover:bg-primary/20"
        )}
      >
        {buttonLabel}
      </button>
    </div>
  );
}

// ─── ConsoleHome ──────────────────────────────────────────────────────────────

interface ConsoleHomeProps {
  onOpenProjection: () => void;
  onOpenPersonal: () => void;
  onOpenInvestment: () => void;
}

export function ConsoleHome({ onOpenProjection, onOpenPersonal, onOpenInvestment }: ConsoleHomeProps) {
  return (
    <div className="h-full flex flex-col items-center justify-center py-10 px-6 font-sans">
      <img
        src="/ElectraWireless Logo2.png"
        alt="ElectraWireless"
        className="w-20 h-20 object-contain mb-4"
      />
      <h1 className="text-[26px] font-extrabold text-foreground text-center leading-tight mb-2">
        Welcome to Business Console
      </h1>
      <p className="text-sm text-muted-foreground text-center mb-8">
        Select a feature below to get started.
      </p>

      <div className="grid grid-cols-3 gap-5 w-full max-w-[1020px]">
        <FeatureCard
          icon={<BarChart2 size={22} />}
          title="Financial Projection Engine"
          description="Model revenue growth, run scenario analysis, and forecast your financial future."
          features={PROJECTION_FEATURES}
          buttonLabel="Get Started →"
          onClick={onOpenProjection}
        />
        <FeatureCard
          icon={<Wallet size={22} />}
          title="Personal Finance"
          description="Import bank statements, track spending, and manage budgets in one place."
          features={PERSONAL_FEATURES}
          buttonLabel="Open →"
          buttonVariant="secondary"
          onClick={onOpenPersonal}
        />
        <FeatureCard
          icon={<TrendingUp size={22} />}
          title="Investment Intelligence"
          description="Track your portfolio, get AI-powered analysis, and make smarter investment decisions."
          features={INVESTMENT_FEATURES}
          buttonLabel="Open →"
          buttonVariant="secondary"
          onClick={onOpenInvestment}
        />
      </div>
    </div>
  );
}
