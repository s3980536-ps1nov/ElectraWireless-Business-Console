import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ExperienceLevel     = "beginner" | "intermediate" | "advanced";
export type CommunicationStyle  = "simple" | "technical";
export type InvestmentStrategy  = "day_trading" | "index" | "growth" | "income" | "buy_and_hold" | "dollar_cost_average";
export type TimeHorizon         = "daily" | "weekly" | "monthly" | "annually" | "indefinitely";
export type AssetInterest       = "stock" | "crypto" | "etf";

export const INVESTMENT_CAPITAL_MIN  = 0;
export const INVESTMENT_CAPITAL_MAX  = 500_000;
export const INVESTMENT_CAPITAL_STEP = 1_000;

export const EMERGENCY_CASH_MIN  = 0;
export const EMERGENCY_CASH_MAX  = 200_000;
export const EMERGENCY_CASH_STEP = 1_000;

export interface InvestmentOnboardingValues {
  age: number;
  experienceLevel: ExperienceLevel;
  investmentCapital: number;
  emergencyCash: number;
  communicationStyle: CommunicationStyle;
  investmentStrategies: InvestmentStrategy[];
  timeHorizon: TimeHorizon;
  assetInterests: AssetInterest[];
  country: string;
}

export interface InvestmentContextState extends InvestmentOnboardingValues {
  // ISO timestamp written when the user successfully completes onboarding.
  // Null means onboarding has not been completed in this browser.
  completedAt: string | null;

  setAge: (v: number) => void;
  setExperienceLevel: (v: ExperienceLevel) => void;
  setInvestmentCapital: (v: number) => void;
  setEmergencyCash: (v: number) => void;
  setCommunicationStyle: (v: CommunicationStyle) => void;
  setInvestmentStrategies: (v: InvestmentStrategy[]) => void;
  setTimeHorizon: (v: TimeHorizon) => void;
  setAssetInterests: (v: AssetInterest[]) => void;
  setCountry: (v: string) => void;
  setCompletedAt: (v: string | null) => void;

  setAll: (partial: Partial<InvestmentOnboardingValues & { completedAt: string | null }>) => void;
  reset: () => void;
}

export const INVESTMENT_ONBOARDING_DEFAULTS: InvestmentOnboardingValues = {
  age: 30,
  experienceLevel:      "beginner",
  investmentCapital:    50_000,
  emergencyCash:        10_000,
  communicationStyle:   "simple",
  investmentStrategies: ["buy_and_hold"],
  timeHorizon:          "monthly",
  assetInterests:       ["stock", "crypto", "etf"],
  country:              "",
};

const INITIAL_STATE = { ...INVESTMENT_ONBOARDING_DEFAULTS, completedAt: null as string | null };

export const useInvestmentContextStore = create<InvestmentContextState>()(
  persist(
    (set) => ({
      ...INITIAL_STATE,
      setAge:                  (v) => set({ age: v }),
      setExperienceLevel:      (v) => set({ experienceLevel: v }),
      setInvestmentCapital:    (v) => set({ investmentCapital: v }),
      setEmergencyCash:        (v) => set({ emergencyCash: v }),
      setCommunicationStyle:   (v) => set({ communicationStyle: v }),
      setInvestmentStrategies: (v) => set({ investmentStrategies: v }),
      setTimeHorizon:          (v) => set({ timeHorizon: v }),
      setAssetInterests:       (v) => set({ assetInterests: v }),
      setCountry:              (v) => set({ country: v }),
      setCompletedAt:          (v) => set({ completedAt: v }),
      setAll:                  (partial) => set(partial),
      reset:                   () => set(INITIAL_STATE),
    }),
    {
      name: "elly-investment-onboarding-v2",
      partialize: (state) => ({
        age:                  state.age,
        experienceLevel:      state.experienceLevel,
        investmentCapital:    state.investmentCapital,
        emergencyCash:        state.emergencyCash,
        communicationStyle:   state.communicationStyle,
        investmentStrategies: state.investmentStrategies,
        timeHorizon:          state.timeHorizon,
        assetInterests:       state.assetInterests,
        country:              state.country,
        completedAt:          state.completedAt,
      }),
    },
  ),
);
