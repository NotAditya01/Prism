import type { PayoutTier } from "@/lib/payout-tiers";

export type MarketCategory = "stellar_metrics" | "real_world";
export type MarketStatus = "active" | "sample";
export type SettlementStatus = "active" | "pending_settlement" | "settled";
export type MarketMetricKind = "xlm_payments" | "xlm_usdc_price" | "sample";

export type Market = {
  id: string;
  numericId: string;
  metricKind: MarketMetricKind;
  category: MarketCategory;
  question: string;
  shortQuestion: string;
  description: string;
  metric: string;
  source: string;
  window: string;
  stake: string;
  maxPayout: string;
  maxRangeWidth: string;
  sealedPredictions: number;
  status: MarketStatus;
  settlementStatus: SettlementStatus;
  tierSummary: string;
  settlementSource: string;
  settledValue: string | null;
  tiers: PayoutTier[];
  rangeMin: number;
  rangeMax: number;
  defaultLow: string;
  defaultHigh: string;
  outcomeScale: number;
  outcomeDecimals: number;
  outcomeUnit: string;
};

export const defaultPayoutTiers: PayoutTier[] = [
  { id: 4, label: "Tier 4", maxWidth: "100", multiplier: 4, payout: "40 testnet XLM" },
  { id: 3, label: "Tier 3", maxWidth: "250", multiplier: 3, payout: "30 testnet XLM" },
  { id: 2, label: "Tier 2", maxWidth: "500", multiplier: 2, payout: "20 testnet XLM" },
  { id: 1, label: "Tier 1", maxWidth: "1000", multiplier: 1, payout: "10 testnet XLM" },
];

export const stellarMetricMarkets: Market[] = [
  {
    id: "xlm-payments-testnet-10m",
    numericId: "3003",
    metricKind: "xlm_payments",
    category: "stellar_metrics",
    question: "Total XLM payments on Stellar testnet",
    shortQuestion: "Total XLM payments",
    description:
      "Predict the total volume of native XLM payment operations on Stellar testnet in a fixed 10-minute window. Resolved from live Stellar Horizon data.",
    metric: "XLM payment volume",
    source: "Stellar Horizon payments",
    window: "Fixed 10-minute demo window",
    stake: "5+ testnet XLM",
    maxPayout: "10x less 2% fee",
    maxRangeWidth: "1000000",
    sealedPredictions: 0,
    status: "active",
    settlementStatus: "active",
    tierSummary: "4x / 3x / 2x / 1x",
    settlementSource: "Pending resolver-posted Horizon/RPC result",
    settledValue: null,
    tiers: defaultPayoutTiers,
    rangeMin: 0,
    rangeMax: 1000000,
    defaultLow: "599500",
    defaultHigh: "600500",
    outcomeScale: 1,
    outcomeDecimals: 0,
    outcomeUnit: "XLM",
  },
  {
    id: "xlm-usdc-sdex-10m",
    numericId: "3004",
    metricKind: "xlm_usdc_price",
    category: "stellar_metrics",
    question: "XLM/USDC price on Stellar DEX",
    shortQuestion: "XLM/USDC price",
    description:
      "Predict the XLM/USDC reference price on Stellar's mainnet decentralized exchange at the close of a fixed 10-minute window. PRISM uses the order-book midpoint when liquid and recent-trade VWAP when the spread is too wide.",
    metric: "XLM/USDC mid-price",
    source: "Stellar mainnet Horizon DEX market data",
    window: "Fixed 10-minute demo window",
    stake: "5+ testnet XLM",
    maxPayout: "10x less 2% fee",
    maxRangeWidth: "10000",
    sealedPredictions: 0,
    status: "active",
    settlementStatus: "active",
    tierSummary: "Up to 10x",
    settlementSource: "Pending resolver-posted Stellar DEX result",
    settledValue: null,
    tiers: defaultPayoutTiers,
    rangeMin: 0,
    rangeMax: 10000,
    defaultLow: "1050",
    defaultHigh: "1150",
    outcomeScale: 10000,
    outcomeDecimals: 4,
    outcomeUnit: "USDC",
  },
];

export const realWorldSampleMarkets: Market[] = [
  {
    id: "btc-sunday-close-sample",
    numericId: "2001",
    metricKind: "sample",
    category: "real_world",
    question: "Bitcoin price at Sunday midnight UTC",
    shortQuestion: "Bitcoin Sunday close",
    description: "Sample real-world range market.",
    metric: "USD price",
    source: "Sample only",
    window: "Future market",
    stake: "10 testnet XLM",
    maxPayout: "40 testnet XLM",
    maxRangeWidth: "1000",
    sealedPredictions: 0,
    status: "sample",
    settlementStatus: "pending_settlement",
    tierSummary: "Display only",
    settlementSource: "Not configured for MVP",
    settledValue: null,
    tiers: defaultPayoutTiers,
    rangeMin: 0,
    rangeMax: 1000,
    defaultLow: "280",
    defaultHigh: "350",
    outcomeScale: 1,
    outcomeDecimals: 0,
    outcomeUnit: "USD",
  },
  {
    id: "apple-event-viewers-sample",
    numericId: "2002",
    metricKind: "sample",
    category: "real_world",
    question: "Next Apple event peak livestream viewers",
    shortQuestion: "Apple event viewers",
    description: "Sample real-world range market.",
    metric: "Concurrent viewers",
    source: "Sample only",
    window: "Future market",
    stake: "10 testnet XLM",
    maxPayout: "40 testnet XLM",
    maxRangeWidth: "1000",
    sealedPredictions: 0,
    status: "sample",
    settlementStatus: "pending_settlement",
    tierSummary: "Display only",
    settlementSource: "Not configured for MVP",
    settledValue: null,
    tiers: defaultPayoutTiers,
    rangeMin: 0,
    rangeMax: 1000,
    defaultLow: "280",
    defaultHigh: "350",
    outcomeScale: 1,
    outcomeDecimals: 0,
    outcomeUnit: "viewers",
  },
];

export function getMarketById(id: string): Market | undefined {
  return [...stellarMetricMarkets, ...realWorldSampleMarkets].find((market) => market.id === id);
}

export function formatOutcomeValue(market: Market, scaledValue: string | number | bigint): string {
  const numeric = Number(scaledValue) / market.outcomeScale;
  if (!Number.isFinite(numeric)) return "--";

  if (market.metricKind === "xlm_usdc_price") {
    return `$${numeric.toFixed(market.outcomeDecimals)}`;
  }

  return `${numeric.toLocaleString("en-US", {
    maximumFractionDigits: market.outcomeDecimals,
    minimumFractionDigits: market.outcomeDecimals,
  })} ${market.outcomeUnit}`;
}

export function parseOutcomeDisplayValue(market: Market, displayValue: string): string | null {
  const numeric = Number(displayValue.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(numeric)) return null;
  return Math.round(numeric * market.outcomeScale).toString();
}

export const marketCounts = {
  active: stellarMetricMarkets.filter((market) => market.status === "active").length,
  samples: realWorldSampleMarkets.length,
  sealedPredictions: stellarMetricMarkets.reduce((count, market) => count + market.sealedPredictions, 0),
};
