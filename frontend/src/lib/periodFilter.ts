import type { Transaction } from "@/store/personalFinanceStore";

export type Period = "All" | "Last 30 days" | "Last 3 months" | "Last 6 months" | "This year";

export const PERIODS = ["All", "Last 30 days", "Last 3 months", "Last 6 months", "This year"] as const;

function getCutoff(period: Exclude<Period, "All">, ref: Date): Date {
  const d = new Date(ref);
  switch (period) {
    case "Last 30 days":  d.setDate(d.getDate() - 30); break;
    case "Last 3 months": d.setMonth(d.getMonth() - 3); break;
    case "Last 6 months": d.setMonth(d.getMonth() - 6); break;
    case "This year":     d.setMonth(0); d.setDate(1); break;
  }
  return d;
}

export function filterByPeriod(transactions: Transaction[], period: Period): Transaction[] {
  if (transactions.length === 0) return [];
  if (period === "All") return transactions;

  const now = Date.now();
  const timestamps = transactions
    .map((tx) => new Date(tx.date + "T00:00:00").getTime())
    .filter((t) => !isNaN(t));
  const latestMs = timestamps.length > 0 ? Math.max(...timestamps) : NaN;

  // If the newest transaction is more than 90 days old, anchor the period
  // window to that transaction date so historical/imported data still shows.
  const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;
  const anchor = !isNaN(latestMs) && now - latestMs > NINETY_DAYS ? new Date(latestMs) : new Date();

  const cutoff = getCutoff(period, anchor);
  return transactions.filter((tx) => new Date(tx.date + "T00:00:00") >= cutoff);
}

/** Number of months covered by the period — used to scale monthly budgets. */
export function getPeriodMonths(period: Period): number {
  switch (period) {
    case "All":           return 1;
    case "Last 30 days":  return 1;
    case "Last 3 months": return 3;
    case "Last 6 months": return 6;
    case "This year":     return new Date().getMonth() + 1;
  }
}

/** Short human label for the period — used in budget display. */
export function getPeriodLabel(period: Period): string {
  switch (period) {
    case "All":           return "all time";
    case "Last 30 days":  return "30-day";
    case "Last 3 months": return "3-month";
    case "Last 6 months": return "6-month";
    case "This year":     return "year-to-date";
  }
}
