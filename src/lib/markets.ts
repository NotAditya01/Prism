import type { PayoutTier } from "@/lib/payout-tiers";

export type MarketCategory = "stellar_metrics" | "real_world";
export type MarketStatus = "active" | "sample";
export type SettlementStatus = "active" | "pending_settlement" | "settled";
export type MarketMetricKind = "xlm_payments" | "xlm_usdc_price" | "crypto_price" | "sample";
export type DisplayMarketCategory = "Crypto" | "Social" | "Stellar";

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
  displayCategory?: DisplayMarketCategory;
  popularRange?: string;
  avgPayout?: string;
  displayVolume?: string;
  resolverAssetId?: string;
  snapshotPrice?: string;
  resolutionTime?: number;
  closesLabel?: string;
};

export const cryptoMarketResolutionTime = 1782691200; // 2026-06-29T00:00:00Z
export const cryptoMarketClosesLabel = "June 29, 2026 · 00:00 UTC";

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

export const cryptoPriceMarkets: Market[] = [
  {
    id: "btc-price-dec-2026",
    numericId: "3005",
    metricKind: "crypto_price",
    category: "real_world",
    displayCategory: "Crypto",
    question: "BTC price at Dec 31, 2026",
    shortQuestion: "BTC price",
    description:
      "Predict the Bitcoin spot price in USD. Resolved from CoinGecko's Bitcoin USD spot price feed for demo settlement.",
    metric: "BTC/USD spot price",
    source: "CoinGecko bitcoin USD price",
    window: cryptoMarketClosesLabel,
    stake: "5+ testnet XLM",
    maxPayout: "10x less 2% fee",
    maxRangeWidth: "250000",
    sealedPredictions: 0,
    status: "active",
    settlementStatus: "active",
    tierSummary: "Up to 10x",
    settlementSource: "Pending resolver-posted CoinGecko result",
    settledValue: null,
    tiers: defaultPayoutTiers,
    rangeMin: 0,
    rangeMax: 250000,
    defaultLow: "55000",
    defaultHigh: "70000",
    outcomeScale: 1,
    outcomeDecimals: 0,
    outcomeUnit: "USD",
    popularRange: "$55,000 - $70,000",
    avgPayout: "2.4x",
    displayVolume: "$52.4K",
    resolverAssetId: "bitcoin",
    snapshotPrice: "$60,475",
    resolutionTime: cryptoMarketResolutionTime,
    closesLabel: cryptoMarketClosesLabel,
  },
  {
    id: "eth-price-dec-2026",
    numericId: "3006",
    metricKind: "crypto_price",
    category: "real_world",
    displayCategory: "Crypto",
    question: "ETH price at Dec 31, 2026",
    shortQuestion: "ETH price",
    description:
      "Predict the Ethereum spot price in USD. Resolved from CoinGecko's Ethereum USD spot price feed for demo settlement.",
    metric: "ETH/USD spot price",
    source: "CoinGecko ethereum USD price",
    window: cryptoMarketClosesLabel,
    stake: "5+ testnet XLM",
    maxPayout: "10x less 2% fee",
    maxRangeWidth: "10000",
    sealedPredictions: 0,
    status: "active",
    settlementStatus: "active",
    tierSummary: "Up to 10x",
    settlementSource: "Pending resolver-posted CoinGecko result",
    settledValue: null,
    tiers: defaultPayoutTiers,
    rangeMin: 0,
    rangeMax: 10000,
    defaultLow: "1200",
    defaultHigh: "2200",
    outcomeScale: 1,
    outcomeDecimals: 0,
    outcomeUnit: "USD",
    popularRange: "$1,200 - $2,200",
    avgPayout: "3.1x",
    displayVolume: "$31.2K",
    resolverAssetId: "ethereum",
    snapshotPrice: "$1,578.87",
    resolutionTime: cryptoMarketResolutionTime,
    closesLabel: cryptoMarketClosesLabel,
  },
  {
    id: "sol-price-dec-2026",
    numericId: "3007",
    metricKind: "crypto_price",
    category: "real_world",
    displayCategory: "Crypto",
    question: "SOL price at Dec 31, 2026",
    shortQuestion: "SOL price",
    description:
      "Predict the Solana spot price in USD. Resolved from CoinGecko's Solana USD spot price feed for demo settlement.",
    metric: "SOL/USD spot price",
    source: "CoinGecko solana USD price",
    window: cryptoMarketClosesLabel,
    stake: "5+ testnet XLM",
    maxPayout: "10x less 2% fee",
    maxRangeWidth: "1000",
    sealedPredictions: 0,
    status: "active",
    settlementStatus: "active",
    tierSummary: "Up to 10x",
    settlementSource: "Pending resolver-posted CoinGecko result",
    settledValue: null,
    tiers: defaultPayoutTiers,
    rangeMin: 0,
    rangeMax: 1000,
    defaultLow: "50",
    defaultHigh: "90",
    outcomeScale: 1,
    outcomeDecimals: 0,
    outcomeUnit: "USD",
    popularRange: "$50 - $90",
    avgPayout: "2.8x",
    displayVolume: "$24.7K",
    resolverAssetId: "solana",
    snapshotPrice: "$70.57",
    resolutionTime: cryptoMarketResolutionTime,
    closesLabel: cryptoMarketClosesLabel,
  },
  {
    id: "xlm-price-dec-2026",
    numericId: "3008",
    metricKind: "crypto_price",
    category: "real_world",
    displayCategory: "Crypto",
    question: "XLM price at Dec 31, 2026",
    shortQuestion: "XLM price",
    description:
      "Predict the Stellar Lumens spot price in USD. Resolved from CoinGecko's Stellar USD spot price feed for demo settlement.",
    metric: "XLM/USD spot price",
    source: "CoinGecko stellar USD price",
    window: cryptoMarketClosesLabel,
    stake: "5+ testnet XLM",
    maxPayout: "10x less 2% fee",
    maxRangeWidth: "10000",
    sealedPredictions: 0,
    status: "active",
    settlementStatus: "active",
    tierSummary: "Up to 10x",
    settlementSource: "Pending resolver-posted CoinGecko result",
    settledValue: null,
    tiers: defaultPayoutTiers,
    rangeMin: 0,
    rangeMax: 10000,
    defaultLow: "1400",
    defaultHigh: "2200",
    outcomeScale: 10000,
    outcomeDecimals: 4,
    outcomeUnit: "USD",
    popularRange: "$0.1400 - $0.2200",
    avgPayout: "3.4x",
    displayVolume: "$18.9K",
    resolverAssetId: "stellar",
    snapshotPrice: "$0.1786",
    resolutionTime: cryptoMarketResolutionTime,
    closesLabel: cryptoMarketClosesLabel,
  },
  {
    id: "doge-price-dec-2026",
    numericId: "3009",
    metricKind: "crypto_price",
    category: "real_world",
    displayCategory: "Crypto",
    question: "DOGE price at Dec 31, 2026",
    shortQuestion: "DOGE price",
    description:
      "Predict the Dogecoin spot price in USD. Resolved from CoinGecko's Dogecoin USD spot price feed for demo settlement.",
    metric: "DOGE/USD spot price",
    source: "CoinGecko dogecoin USD price",
    window: cryptoMarketClosesLabel,
    stake: "5+ testnet XLM",
    maxPayout: "10x less 2% fee",
    maxRangeWidth: "10000",
    sealedPredictions: 0,
    status: "active",
    settlementStatus: "active",
    tierSummary: "Up to 10x",
    settlementSource: "Pending resolver-posted CoinGecko result",
    settledValue: null,
    tiers: defaultPayoutTiers,
    rangeMin: 0,
    rangeMax: 10000,
    defaultLow: "500",
    defaultHigh: "1000",
    outcomeScale: 10000,
    outcomeDecimals: 4,
    outcomeUnit: "USD",
    popularRange: "$0.0500 - $0.1000",
    avgPayout: "3.7x",
    displayVolume: "$14.6K",
    resolverAssetId: "dogecoin",
    snapshotPrice: "$0.0748",
    resolutionTime: cryptoMarketResolutionTime,
    closesLabel: cryptoMarketClosesLabel,
  },
  {
    id: "hype-price-dec-2026",
    numericId: "3010",
    metricKind: "crypto_price",
    category: "real_world",
    displayCategory: "Crypto",
    question: "HYPE price at Dec 31, 2026",
    shortQuestion: "HYPE price",
    description:
      "Predict the Hyperliquid spot price in USD. Resolved from CoinGecko's Hyperliquid USD spot price feed for demo settlement.",
    metric: "HYPE/USD spot price",
    source: "CoinGecko hyperliquid USD price",
    window: cryptoMarketClosesLabel,
    stake: "5+ testnet XLM",
    maxPayout: "10x less 2% fee",
    maxRangeWidth: "1000",
    sealedPredictions: 0,
    status: "active",
    settlementStatus: "active",
    tierSummary: "Up to 10x",
    settlementSource: "Pending resolver-posted CoinGecko result",
    settledValue: null,
    tiers: defaultPayoutTiers,
    rangeMin: 0,
    rangeMax: 1000,
    defaultLow: "45",
    defaultHigh: "85",
    outcomeScale: 1,
    outcomeDecimals: 0,
    outcomeUnit: "USD",
    popularRange: "$45 - $85",
    avgPayout: "3.2x",
    displayVolume: "$19.4K",
    resolverAssetId: "hyperliquid",
    snapshotPrice: "$64.38",
    resolutionTime: cryptoMarketResolutionTime,
    closesLabel: cryptoMarketClosesLabel,
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

export const liveMarkets = [...stellarMetricMarkets, ...cryptoPriceMarkets];

export function getMarketById(id: string): Market | undefined {
  return [...liveMarkets, ...realWorldSampleMarkets].find((market) => market.id === id);
}

export function formatOutcomeValue(market: Market, scaledValue: string | number | bigint): string {
  const numeric = Number(scaledValue) / market.outcomeScale;
  if (!Number.isFinite(numeric)) return "--";

  if (market.metricKind === "xlm_usdc_price" || market.metricKind === "crypto_price") {
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
  active: liveMarkets.filter((market) => market.status === "active").length,
  samples: realWorldSampleMarkets.length,
  sealedPredictions: liveMarkets.reduce((count, market) => count + market.sealedPredictions, 0),
};
