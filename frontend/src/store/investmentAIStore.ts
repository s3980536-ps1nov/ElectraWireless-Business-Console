import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { InvestmentAIResponse } from "@/services/investmentApi";

interface InvestmentAIState {
  result:      InvestmentAIResponse | null;
  generatedAt: string | null;          // ISO string — Date is not JSON-safe
  fingerprint: string | null;          // sorted symbols — cache key

  setReport:   (result: InvestmentAIResponse, fingerprint: string) => void;
  clearReport: () => void;
}

export const useInvestmentAIStore = create<InvestmentAIState>()(
  persist(
    (set) => ({
      result:      null,
      generatedAt: null,
      fingerprint: null,

      setReport: (result, fingerprint) =>
        set({ result, fingerprint, generatedAt: new Date().toISOString() }),

      clearReport: () =>
        set({ result: null, generatedAt: null, fingerprint: null }),
    }),
    { name: "ew-investment-ai-v1" }
  )
);

/** Stable fingerprint from a holdings array — changes when symbols are added/removed. */
export function holdingsFingerprint(holdings: { symbol: string }[]): string {
  return holdings
    .map((h) => h.symbol.toUpperCase())
    .sort()
    .join(",");
}
