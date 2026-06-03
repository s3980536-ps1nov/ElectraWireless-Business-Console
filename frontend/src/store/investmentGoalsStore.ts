import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { InvestmentStrategy, AssetInterest } from "@/store/investmentContextStore";

export type GoalFrequency = "weekly" | "monthly";

export interface InvestmentGoal {
  id:                 string;
  title:              string;
  strategy:           InvestmentStrategy;
  assetType:          AssetInterest;
  targetAmount:       number;
  frequency?:         GoalFrequency; // required iff strategy === "dollar_cost_average"
  deadline:           string;        // ISO yyyy-mm-dd
  createdAt:          string;        // ISO timestamp
  symbol?:            string;        // optional, stored uppercase; narrows within assetType
  manualContribution?: number;       // user-bumped progress, added on top of auto-computed
}

interface InvestmentGoalsState {
  goals: InvestmentGoal[];

  addGoal:    (goal: InvestmentGoal) => void;
  updateGoal: (id: string, patch: Partial<InvestmentGoal>) => void;
  deleteGoal: (id: string) => void;
  reset:      () => void;
}

export const useInvestmentGoalsStore = create<InvestmentGoalsState>()(
  persist(
    (set) => ({
      goals: [],

      addGoal: (goal) =>
        set((s) => ({ goals: [...s.goals, goal] })),

      updateGoal: (id, patch) =>
        set((s) => ({ goals: s.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) })),

      deleteGoal: (id) =>
        set((s) => ({ goals: s.goals.filter((g) => g.id !== id) })),

      reset: () => set({ goals: [] }),
    }),
    {
      name: "elly-investment-goals-v1",
      partialize: (state) => ({ goals: state.goals }),
    },
  ),
);
