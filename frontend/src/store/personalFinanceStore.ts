import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useMemo } from "react";
import { MOCK_TRANSACTIONS } from "@/services/personalFinanceApi";
import { filterByPeriod, type Period } from "@/lib/periodFilter";

export interface Goal {
  id: string;
  name: string;
  type: "savings" | "spending_limit" | "net_worth";
  targetAmount: number;
  currentAmount: number;
  deadline?: string;   // ISO yyyy-mm-dd
  category?: string;   // only for spending_limit
}

export interface Transaction {
  id: string;
  date: string;           // ISO yyyy-mm-dd
  description: string;
  amount: number;         // positive = income, negative = expense
  type: "income" | "expense" | "transfer";
  category: string;
  source: "csv" | "manual";
}

export type FlowStep = "empty" | "review" | "dashboard";
export type { Period };

interface PersonalFinanceState {
  flowStep: FlowStep;
  activeTab: string;
  activePeriod: Period;

  // Confirmed transactions live here
  transactions: Transaction[];
  // Transactions parsed from CSV awaiting category review
  pendingTransactions: Transaction[];
  // category → monthly budget limit
  budgets: Record<string, number>;

  goals: Goal[];

  // Manual net worth inputs (assets and liabilities)
  assets: number;
  liabilities: number;

  apiLoading: boolean;
  apiError: string | null;

  // Actions
  setFlowStep: (step: FlowStep) => void;
  setActiveTab: (tab: string) => void;
  setActivePeriod: (period: Period) => void;
  setPendingTransactions: (txs: Transaction[]) => void;
  confirmPendingTransactions: () => void;
  addTransaction: (tx: Transaction) => void;
  updateTransactionCategory: (id: string, category: string) => void;
  updatePendingCategory: (id: string, category: string) => void;
  deleteTransaction: (id: string) => void;
  setBudget: (category: string, limit: number) => void;
  addGoal: (goal: Goal) => void;
  updateGoal: (id: string, patch: Partial<Goal>) => void;
  deleteGoal: (id: string) => void;
  setAssets: (n: number) => void;
  setLiabilities: (n: number) => void;
  setApiLoading: (v: boolean) => void;
  setApiError: (e: string | null) => void;
  /** Loads all mock transactions at once and navigates to the dashboard view */
  loadDemoData: () => void;
  reset: () => void;
}

export const usePersonalFinanceStore = create<PersonalFinanceState>()(
  persist(
    (set) => ({
  flowStep: "empty",
  activeTab: "overview",
  activePeriod: "Last 3 months",
  transactions: [],
  pendingTransactions: [],
  budgets: {},
  goals: [],
  assets: 0,
  liabilities: 0,
  apiLoading: false,
  apiError: null,

  setFlowStep: (flowStep) => set({ flowStep }),
  setActiveTab: (activeTab) => set({ activeTab }),
  setActivePeriod: (activePeriod) => set({ activePeriod }),
  setAssets: (assets) => set({ assets }),
  setLiabilities: (liabilities) => set({ liabilities }),

  setPendingTransactions: (pendingTransactions) =>
    set({ pendingTransactions, flowStep: "review" }),

  confirmPendingTransactions: () =>
    set((s) => ({
      transactions: [...s.transactions, ...s.pendingTransactions],
      pendingTransactions: [],
      flowStep: "dashboard",
    })),

  addTransaction: (tx) =>
    set((s) => ({
      transactions: [tx, ...s.transactions],
      flowStep: "dashboard",
    })),

  updateTransactionCategory: (id, category) =>
    set((s) => ({
      transactions: s.transactions.map((t) =>
        t.id === id ? { ...t, category } : t
      ),
    })),

  updatePendingCategory: (id, category) =>
    set((s) => ({
      pendingTransactions: s.pendingTransactions.map((t) =>
        t.id === id ? { ...t, category } : t
      ),
    })),

  deleteTransaction: (id) =>
    set((s) => ({ transactions: s.transactions.filter((t) => t.id !== id) })),

  setBudget: (category, limit) =>
    set((s) => ({ budgets: { ...s.budgets, [category]: limit } })),

  addGoal: (goal) =>
    set((s) => ({ goals: [...s.goals, goal] })),

  updateGoal: (id, patch) =>
    set((s) => ({ goals: s.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) })),

  deleteGoal: (id) =>
    set((s) => ({ goals: s.goals.filter((g) => g.id !== id) })),

  setApiLoading: (apiLoading) => set({ apiLoading }),
  setApiError: (apiError) => set({ apiError }),

  loadDemoData: () =>
    set({
      transactions: [...MOCK_TRANSACTIONS],
      flowStep: "dashboard",
      activeTab: "overview",
    }),

  reset: () =>
    set({
      flowStep: "empty",
      activeTab: "overview",
      activePeriod: "Last 3 months",
      transactions: [],
      pendingTransactions: [],
      budgets: {},
      goals: [],
      assets: 0,
      liabilities: 0,
      apiLoading: false,
      apiError: null,
    }),
    }),
    {
      name: "elly-pf-store-v2",
      // Only persist user data — exclude transient UI/API state
      partialize: (state) => ({
        flowStep:     state.flowStep,
        activeTab:    state.activeTab,
        activePeriod: state.activePeriod,
        transactions: state.transactions,
        budgets:      state.budgets,
        goals:        state.goals,
        assets:       state.assets,
        liabilities:  state.liabilities,
      }),
    }
  )
);

/** Returns the confirmed transactions filtered to the currently selected period. */
export function useFilteredTransactions(): Transaction[] {
  const transactions = usePersonalFinanceStore((s) => s.transactions);
  const activePeriod = usePersonalFinanceStore((s) => s.activePeriod);
  return useMemo(() => filterByPeriod(transactions, activePeriod), [transactions, activePeriod]);
}
