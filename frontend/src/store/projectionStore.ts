import { create } from "zustand";
import { persist } from "zustand/middleware";
import { API_BASE } from "@/lib/api";

export type ScenarioPreset = "bear" | "base" | "bull" | "custom";
export type AccountType = "user" | "industry" | "government";

export interface SavedScenario {
  id: string;
  name: string;
  growthRate: number;
  startingMRR: number;
  churnRate: number;
  cogsPercent: number;
  marketingSpend: number;
  payroll: number;
  forecastMonths: number;
}

export interface HistoricalPoint {
  ds: string;
  revenue: number;
  expenses: number;
  profit: number;
}

export interface ProphetPoint {
  ds: string;
  revenue: number;
  yhat_lower: number;
  yhat_upper: number;
}

export interface SliderForecastPoint {
  ds: string;
  revenue: number;
  expenses: number;
  gross_margin: number;
  net_profit: number;
}

export interface ProphetApiData {
  historical: HistoricalPoint[];
  prophet_forecast: ProphetPoint[];
  slider_forecast: SliderForecastPoint[];
  available_entities: string[];
}

export interface CustomSnapshot {
  growthRate: number;
  startingMRR: number;
  churnRate: number;
  cogsPercent: number;
  marketingSpend: number;
  payroll: number;
  forecastMonths: number;
}

export interface ProjectionState {
  accountType: AccountType | null;
  setAccountType: (type: AccountType) => void;

  growthRate: number;
  startingMRR: number;
  churnRate: number;
  cogsPercent: number;
  marketingSpend: number;
  payroll: number;
  forecastMonths: number;
  activeScenario: ScenarioPreset;
  activeTab: string;
  scenarioCounts: Record<string, number>;
  totalScenarioRuns: number;
  recordScenarioRun: (scenario: string) => void;
  savedScenarios: SavedScenario[];
  customSnapshot: CustomSnapshot | null;

  // API state
  apiData: ProphetApiData | null;
  apiLoading: boolean;
  apiError: string | null;

  setGrowthRate: (v: number) => void;
  setStartingMRR: (v: number) => void;
  setChurnRate: (v: number) => void;
  setCogsPercent: (v: number) => void;
  setMarketingSpend: (v: number) => void;
  setPayroll: (v: number) => void;
  setForecastMonths: (v: number) => void;
  setActiveScenario: (preset: ScenarioPreset) => void;
  setActiveTab: (tab: string) => void;
  saveCustomScenario: (name: string) => void;
  deleteCustomScenario: (id: string) => void;
  loadCustomScenario: (id: string) => void;
  saveCustomSnapshot: () => void;
  reset: () => void;
  fetchProphetForecast: () => Promise<void>;
}

const SCENARIO_PRESETS = {
  bear: { growthRate: 3, startingMRR: 18000, churnRate: 7, cogsPercent: 30, marketingSpend: 2000, payroll: 35000 },
  base: { growthRate: 8, startingMRR: 18000, churnRate: 3, cogsPercent: 22, marketingSpend: 4000, payroll: 35000 },
  bull: { growthRate: 18, startingMRR: 18000, churnRate: 1.5, cogsPercent: 18, marketingSpend: 8000, payroll: 35000 },
};

export const useProjectionStore = create<ProjectionState>()(
  persist(
    (set, get) => ({
  accountType: null,
  setAccountType: (type) => set({ accountType: type }),

  growthRate: 8,
  startingMRR: 18000,
  churnRate: 3,
  cogsPercent: 22,
  marketingSpend: 4000,
  payroll: 35000,
  forecastMonths: 12,
  activeScenario: "base",
  activeTab: "projection",
  scenarioCounts: {},
  totalScenarioRuns: 0,
  savedScenarios: [],
  customSnapshot: null,
  apiData: null,
  apiLoading: false,
  apiError: null,

  setGrowthRate: (v) => set({ growthRate: v, activeScenario: "custom" }),
  setStartingMRR: (v) => set({ startingMRR: v, activeScenario: "custom" }),
  setChurnRate: (v) => set({ churnRate: v, activeScenario: "custom" }),
  setCogsPercent: (v) => set({ cogsPercent: v, activeScenario: "custom" }),
  setMarketingSpend: (v) => set({ marketingSpend: v, activeScenario: "custom" }),
  setPayroll: (v) => set({ payroll: v, activeScenario: "custom" }),
  setForecastMonths: (v) => set({ forecastMonths: v, activeScenario: "custom" }),

  recordScenarioRun: (scenario: string) => {
    set((s) => ({
      scenarioCounts: { ...s.scenarioCounts, [scenario]: (s.scenarioCounts[scenario] ?? 0) + 1 },
      totalScenarioRuns: s.totalScenarioRuns + 1,
    }));
  },

  setActiveScenario: (preset) => {
    if (preset === "custom") {
      const snap = get().customSnapshot;
      set({ activeScenario: "custom", ...(snap ?? {}) });
      return;
    }
    set({ ...SCENARIO_PRESETS[preset], activeScenario: preset });
    get().recordScenarioRun(preset);
  },

  saveCustomSnapshot: () => {
    const s = get();
    set({
      customSnapshot: {
        growthRate:     s.growthRate,
        startingMRR:    s.startingMRR,
        churnRate:      s.churnRate,
        cogsPercent:    s.cogsPercent,
        marketingSpend: s.marketingSpend,
        payroll:        s.payroll,
        forecastMonths: s.forecastMonths,
      },
    });
  },

  setActiveTab: (tab) => set({ activeTab: tab }),

  saveCustomScenario: (name) => {
    const s = get();
    const entry: SavedScenario = {
      id: `custom-${Date.now()}`,
      name,
      growthRate: s.growthRate,
      startingMRR: s.startingMRR,
      churnRate: s.churnRate,
      cogsPercent: s.cogsPercent,
      marketingSpend: s.marketingSpend,
      payroll: s.payroll,
      forecastMonths: s.forecastMonths,
    };
    set({ savedScenarios: [...s.savedScenarios, entry] });
  },

  deleteCustomScenario: (id) => {
    set((s) => ({ savedScenarios: s.savedScenarios.filter((sc) => sc.id !== id) }));
  },

  loadCustomScenario: (id) => {
    const sc = get().savedScenarios.find((s) => s.id === id);
    if (!sc) return;
    const { id: _id, name: _name, ...values } = sc;
    set({ ...values, activeScenario: "custom" });
    get().recordScenarioRun(sc.name);
  },

  reset: () => set({
    accountType:       null,
    growthRate:        8,
    startingMRR:       18000,
    churnRate:         3,
    cogsPercent:       22,
    marketingSpend:    4000,
    payroll:           35000,
    forecastMonths:    12,
    activeScenario:    "base",
    activeTab:         "projection",
    scenarioCounts:    {},
    totalScenarioRuns: 0,
    savedScenarios:    [],
    customSnapshot:    null,
    apiData:           null,
    apiLoading:        false,
    apiError:          null,
  }),

  fetchProphetForecast: async () => {
    const s = get();
    set({ apiLoading: true, apiError: null });
    try {
      const res = await fetch(`${API_BASE}/prophet-forecast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          starting_mrr: s.startingMRR,
          growth_rate: s.growthRate,
          churn_rate: s.churnRate,
          cogs_percent: s.cogsPercent,
          marketing_spend: s.marketingSpend,
          payroll: s.payroll,
          months: s.forecastMonths,
        }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data: ProphetApiData = await res.json();
      set({ apiData: data, apiLoading: false });
    } catch (err) {
      set({ apiLoading: false, apiError: (err as Error).message });
    }
  },
    }),
    {
      name: "ew-projection-store-v1",
      partialize: (s) => ({
        accountType:       s.accountType,
        growthRate:        s.growthRate,
        startingMRR:       s.startingMRR,
        churnRate:         s.churnRate,
        cogsPercent:       s.cogsPercent,
        marketingSpend:    s.marketingSpend,
        payroll:           s.payroll,
        forecastMonths:    s.forecastMonths,
        activeScenario:    s.activeScenario,
        activeTab:         s.activeTab,
        scenarioCounts:    s.scenarioCounts,
        totalScenarioRuns: s.totalScenarioRuns,
        savedScenarios:    s.savedScenarios,
        customSnapshot:    s.customSnapshot,
      }),
    }
  )
);
