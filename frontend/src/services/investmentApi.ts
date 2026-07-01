import axios from "axios";

const BASE_URL =
  ((import.meta as unknown) as { env: Record<string, string> }).env
    .VITE_API_URL ?? "http://localhost:8000";

export const investmentApiClient = axios.create({ baseURL: BASE_URL });

export type AssetType = "stock" | "crypto" | "etf" | "fund" | "real_estate";

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  stock:       "Stock",
  crypto:      "Crypto",
  etf:         "ETF",
  fund:        "Fund",
  real_estate: "Real Estate",
};

export interface InvestmentHolding {
  id:            string;
  user_id:       string;
  symbol:        string;
  asset_type:    AssetType;
  quantity:      number;
  buy_price:     number;
  purchase_date: string;
  source:        "manual" | "csv";
  created_at:    string;
}

export interface NewHolding {
  symbol:        string;
  asset_type:    AssetType;
  quantity:      number;
  buy_price:     number;
  purchase_date: string;
}

export async function fetchHoldings(): Promise<InvestmentHolding[]> {
  const res = await investmentApiClient.get<InvestmentHolding[]>("/investments/holdings");
  return res.data;
}

export async function addHolding(data: NewHolding): Promise<InvestmentHolding> {
  const res = await investmentApiClient.post<InvestmentHolding>("/investments/holdings", data);
  return res.data;
}

export async function deleteHolding(id: string): Promise<void> {
  await investmentApiClient.delete(`/investments/holdings/${id}`);
}

export async function clearAllHoldings(): Promise<void> {
  await investmentApiClient.delete("/investments/holdings");
}

export interface InvestmentInsight {
  type: string;
  message: string;
  severity: "high" | "medium" | "low" | "info";
  affected: string[];
}

export async function fetchInsights(): Promise<InvestmentInsight[]> {
  const res = await investmentApiClient.get<InvestmentInsight[]>("/investments/insights");
  return res.data;
}

// ── Investment Onboarding payload + persistence ───────────────────────────────

export interface InvestmentOnboardingPayload {
  age:                  number;
  experienceLevel:      "beginner" | "intermediate" | "advanced";
  investmentCapital:    number;
  emergencyCash:        number;
  communicationStyle:   "simple" | "technical";
  investmentStrategies: Array<"day_trading" | "index" | "growth" | "income" | "buy_and_hold" | "dollar_cost_average">;
  timeHorizon:          "daily" | "weekly" | "monthly" | "annually" | "indefinitely";
  assetInterests:       Array<"stock" | "crypto" | "etf">;
  country?:             string;
}

export interface InvestmentOnboardingRecord extends InvestmentOnboardingPayload {
  available:   boolean;
  completedAt: string;
}

export async function submitInvestmentOnboarding(
  payload: InvestmentOnboardingPayload,
): Promise<InvestmentOnboardingRecord> {
  const res = await investmentApiClient.post<{ status: string; onboarding: InvestmentOnboardingRecord }>(
    "/investments/onboarding",
    payload,
  );
  return res.data.onboarding;
}

export async function fetchInvestmentOnboarding(): Promise<InvestmentOnboardingRecord | null> {
  const res = await investmentApiClient.get<Partial<InvestmentOnboardingRecord> & { available?: boolean }>(
    "/investments/onboarding",
  );
  const data = res.data;
  if (!data || data.available !== true || !data.completedAt) return null;
  return data as InvestmentOnboardingRecord;
}

export async function resetInvestmentOnboarding(): Promise<void> {
  await investmentApiClient.delete("/investments/onboarding");
}

export async function loadInvestmentOnboarding(): Promise<InvestmentOnboardingPayload | null> {
  // DB-backed read by user_id (kept for callers that want the per-user record).
  try {
    const res = await investmentApiClient.get<{
      age:                   number;
      experience_level:      string;
      investment_capital:    number;
      emergency_cash:        number | null;
      communication_style:   string;
      investment_strategies: string[];
      time_horizon:          string;
      asset_interests:       string[];
    }>("/investments/onboarding/demo-user");
    const d = res.data;
    return {
      age:                  d.age,
      experienceLevel:      d.experience_level     as InvestmentOnboardingPayload["experienceLevel"],
      investmentCapital:    d.investment_capital,
      emergencyCash:        d.emergency_cash ?? 0,
      communicationStyle:   d.communication_style  as InvestmentOnboardingPayload["communicationStyle"],
      investmentStrategies: (d.investment_strategies ?? []) as InvestmentOnboardingPayload["investmentStrategies"],
      timeHorizon:          d.time_horizon         as InvestmentOnboardingPayload["timeHorizon"],
      assetInterests:       (d.asset_interests ?? []) as InvestmentOnboardingPayload["assetInterests"],
    };
  } catch {
    return null;
  }
}

export interface MarketPrice {
  symbol: string;
  current_price: number | null;
  daily_change: number | null;
  percentage_change: number | null;
  timestamp: string;
}

export interface AssetPerformance {
  id: number;
  symbol: string;
  asset_type: AssetType;
  quantity: number;
  buy_price: number;
  current_price: number;
  cost_basis: number;
  current_value: number;
  profit_loss: number;
  return_percentage: number;
  cagr: number | null;
  annualised_volatility: number | null;
  daily_change: number | null;
  percentage_change: number | null;
}

export interface PortfolioSummary {
  total_value: number;
  total_cost: number;
  profit_loss: number;
  return_percentage: number;
  holding_count: number;
  assets: AssetPerformance[];
  diversification: {
    score: number;
    distinct_asset_types: string[];
    overexposed_holdings: Array<{ id: number; symbol: string; asset_type: string; percentage: number }>;
    overexposed_types: Array<{ asset_type: string; percentage: number }>;
  };
}

export interface PortfolioSnapshot {
  date: string;
  total_value: number;
  profit_loss: number;
  return_percentage: number;
}

export interface MarkowitzPoint {
  symbol: string;
  asset_type: string;
  risk: number | null;
  ret: number | null;
  value: number;
}

export async function fetchPrices(): Promise<MarketPrice[]> {
  const res = await investmentApiClient.get<MarketPrice[]>("/investments/prices");
  return res.data;
}

export async function fetchSummary(): Promise<PortfolioSummary> {
  const res = await investmentApiClient.get<PortfolioSummary>("/investments/summary");
  return res.data;
}

export async function fetchSnapshots(): Promise<PortfolioSnapshot[]> {
  const res = await investmentApiClient.get<PortfolioSnapshot[]>("/investments/snapshots");
  return res.data;
}

export async function backfillSnapshots(): Promise<{ seeded: number; from: string; to: string }> {
  const res = await investmentApiClient.post("/investments/snapshots/backfill");
  return res.data;
}

export async function fetchMarkowitz(): Promise<MarkowitzPoint[]> {
  const res = await investmentApiClient.get<MarkowitzPoint[]>("/investments/markowitz");
  return res.data;
}

export interface MarketMover {
  symbol:            string;
  current_price:     number;
  daily_change:      number;
  percentage_change: number;
}

export interface MarketMovers {
  gainers: MarketMover[];
  losers:  MarketMover[];
}

export async function fetchMarketMovers(): Promise<MarketMovers> {
  const res = await investmentApiClient.get<MarketMovers>("/investments/market-movers");
  return res.data;
}

export interface GeoExposureEntry {
  region:     string;
  symbols:    string[];
  value:      number;
  percentage: number;
}

export interface GeoExposureResponse {
  total_value:  number;
  by_geography: GeoExposureEntry[];
}

export async function fetchGeographicExposure(): Promise<GeoExposureResponse> {
  const res = await investmentApiClient.get<GeoExposureResponse>("/investments/geographic-exposure");
  return res.data;
}

export async function deleteAllHoldings(): Promise<void> {
  await investmentApiClient.delete("/investments/holdings");
}

export async function uploadHoldingsCsv(
  file: File
): Promise<{ imported: number; symbols: string[]; errors: string[] }> {
  const form = new FormData();
  form.append("file", file);
  const res = await investmentApiClient.post<{
    imported: number;
    symbols: string[];
    errors: string[];
  }>("/investments/holdings/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

export async function loadDemoHoldings(): Promise<{
  imported: number; symbols: string[]; errors: string[];
}> {
  const res = await investmentApiClient.post<{
    imported: number; symbols: string[]; errors: string[];
  }>("/investments/holdings/load-demo");
  return res.data;
}

// ── AI Insights (portfolio analysis via Llama) ────────────────────────────────

export interface InvestmentAIResponse {
  summary:           string;
  pros:              string[];
  cons:              string[];
  next_steps:        string[];
  question_response: string;
  sources:           string[];
  profile_context:   string;
}

/** Personal Finance context injected from Feature 2 for cross-feature analysis. */
export interface PFContextInput {
  hasData:          boolean;
  monthlyExpenses:  number;
  cashBalance:      number;
  savingsRate:      number;
  healthScore:      number;
  healthGrade:      string;
  netCashFlow:      number;
}

export interface InvestmentAIRequest {
  question: string;
  Goals:    string;
  period:   string;
  summary: {
    totalCost:         number;
    cashBalance:       number;
    totalCurrentValue: number | null;
    totalPnL:          number | null;
    totalReturnPct:    number | null;
    // Cross-feature: Personal Finance context (optional)
    monthlyExpenses?:  number;
    savingsRate?:      number;
    healthScore?:      number;
    healthGrade?:      string;
    netCashFlow?:      number;
  };
  holdings: Array<{
    symbol:            string;
    asset_type:        string;
    quantity:          number;
    buy_price:         number;
    purchase_date:     string;
    costBasis:         number;
    current_price:     number | null;
    current_value:     number | null;
    profit_loss:       number | null;
    return_percentage: number | null;
  }>;
  onboarding: {
    available:            boolean;
    completedAt:          string | null;
    age:                  number;
    experienceLevel:      string;
    investmentCapital:    number;
    emergencyCash:        number;
    communicationStyle:   string;
    investmentStrategies: string[];
    timeHorizon:          string;
    assetInterests:       string[];
    // Cross-feature: average monthly expenses from PF (triggers emergency reserve calc)
    monthlyExpenses?:     number;
    country?:             string;
  };
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface InvestmentAIOnboardingInput extends InvestmentOnboardingPayload {
  completedAt: string | null;
}

export function buildInvestmentAIPayload(
  question:   string,
  holdings:   InvestmentHolding[],
  onboarding: InvestmentAIOnboardingInput,
  goals:      string = "",
  period:     string = "Current portfolio",
  summary:    PortfolioSummary | null = null,
  pfContext:  PFContextInput | null = null,
  history:    Array<{ role: "user" | "assistant"; content: string }> = [],
): InvestmentAIRequest {
  const cashBalance = holdings
    .filter((h) => h.asset_type === ("cash" as AssetType))
    .reduce((s, h) => s + h.quantity * h.buy_price, 0);

  const totalCost = holdings.reduce((s, h) => s + h.quantity * h.buy_price, 0);

  const perfMap = new Map<string, AssetPerformance>();
  if (summary) {
    for (const a of summary.assets) {
      perfMap.set(a.symbol.toUpperCase(), a);
    }
  }

  return {
    question,
    Goals:  goals,
    period,
    summary: {
      totalCost,
      // PF cashBalance overrides the holdings-based cash estimate when available
      cashBalance:       pfContext?.cashBalance ?? cashBalance,
      totalCurrentValue: summary?.total_value ?? null,
      totalPnL:          summary?.profit_loss ?? null,
      totalReturnPct:    summary?.return_percentage ?? null,
      // Cross-feature PF fields (backend prompt uses these for analysis rules)
      ...(pfContext ? {
        monthlyExpenses: pfContext.monthlyExpenses,
        savingsRate:     pfContext.savingsRate,
        healthScore:     pfContext.healthScore,
        healthGrade:     pfContext.healthGrade,
        netCashFlow:     pfContext.netCashFlow,
      } : {}),
    },
    holdings: holdings.map((h) => {
      const perf = perfMap.get(h.symbol.toUpperCase());
      return {
        symbol:            h.symbol,
        asset_type:        h.asset_type,
        quantity:          h.quantity,
        buy_price:         h.buy_price,
        purchase_date:     h.purchase_date,
        costBasis:         h.quantity * h.buy_price,
        current_price:     perf?.current_price ?? null,
        current_value:     perf?.current_value ?? null,
        profit_loss:       perf?.profit_loss ?? null,
        return_percentage: perf?.return_percentage ?? null,
      };
    }),
    onboarding: {
      available:            onboarding.completedAt !== null,
      completedAt:          onboarding.completedAt,
      age:                  onboarding.age,
      experienceLevel:      onboarding.experienceLevel,
      investmentCapital:    onboarding.investmentCapital,
      emergencyCash:        onboarding.emergencyCash,
      communicationStyle:   onboarding.communicationStyle,
      investmentStrategies: onboarding.investmentStrategies,
      timeHorizon:          onboarding.timeHorizon,
      assetInterests:       onboarding.assetInterests,
      // monthlyExpenses triggers the emergency cash reserve block in the backend prompt
      ...(pfContext ? { monthlyExpenses: pfContext.monthlyExpenses } : {}),
      ...(onboarding.country ? { country: onboarding.country } : {}),
    },
    ...(history.length ? { history } : {}),
  };
}

export async function fetchInvestmentAIInsights(
  payload: InvestmentAIRequest,
): Promise<InvestmentAIResponse> {
  const res = await investmentApiClient.post<InvestmentAIResponse>(
    "/pf/portfolio-analysis",
    { data: payload },
  );
  return res.data;
}

// ── Forecast Config persistence ───────────────────────────────────────────────

export interface ForecastConfigPayload {
  starting_mrr:    number;
  growth_rate:     number;
  churn_rate:      number;
  cogs_percent:    number;
  marketing_spend: number;
  payroll:         number;
  months:          number;
  user_id?:        string;
}

export async function saveForecastConfig(config: ForecastConfigPayload): Promise<void> {
  await investmentApiClient.post("/forecast/config", { ...config, user_id: "demo-user" });
}

export async function loadForecastConfig(): Promise<ForecastConfigPayload | null> {
  try {
    const res = await investmentApiClient.get<ForecastConfigPayload>("/forecast/config/demo-user");
    return res.data;
  } catch {
    return null;
  }
}
