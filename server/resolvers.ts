import { Keypair, Networks } from "@stellar/stellar-sdk";
import { basicNodeSigner } from "@stellar/stellar-sdk/contract";

import { Client } from "../src/generated/prism-market/src/index.ts";
import { resolveTotalXlmPayments } from "../src/lib/resolver/xlm-payments.ts";
import { fetchXlmUsdcPrice } from "../src/lib/resolver/xlm-usdc-price.ts";

const DEFAULT_CONTRACT_ID = "CCNVNXIE74IBGWJOFNKQD6J2VZEZGQVNKZXBEKHFRWKVCOUXKFAFIQTJ";
const DEFAULT_TESTNET_RPC = "https://soroban-testnet.stellar.org";
const DEFAULT_TESTNET_HORIZON = "https://horizon-testnet.stellar.org";
const DEFAULT_MAINNET_HORIZON = "https://horizon.stellar.org";

type Settlement = {
  alreadySettled: boolean;
  resolverAddress: string;
  transactionHash: string | null;
  stellarExpert: string | null;
};

export type ResolveXlmPaymentsInput = {
  marketId?: string;
  windowStart?: string;
  windowEnd?: string;
  maxPages?: number;
};

export type ResolveXlmUsdcInput = {
  marketId?: string;
};

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

function parseMarketId(value: string, name: string): string {
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be an unsigned integer`);
  return value;
}

function resolverConfiguration() {
  const network = (process.env.STELLAR_NETWORK ?? "testnet").toLowerCase();
  if (network !== "testnet") {
    throw new Error("The deployed PRISM resolver currently supports STELLAR_NETWORK=testnet only");
  }

  const keypair = Keypair.fromSecret(requiredEnv("RESOLVER_SECRET"));
  const resolverAddress = keypair.publicKey();
  const configuredAddress = process.env.PRISM_RESOLVER_ADDRESS?.trim();
  if (configuredAddress && configuredAddress !== resolverAddress) {
    throw new Error("RESOLVER_SECRET does not match PRISM_RESOLVER_ADDRESS");
  }

  return {
    contractId: process.env.PRISM_MARKET_CONTRACT_ID?.trim() || DEFAULT_CONTRACT_ID,
    keypair,
    networkPassphrase: Networks.TESTNET,
    resolverAddress,
    rpcUrl: process.env.STELLAR_RPC?.trim() || DEFAULT_TESTNET_RPC,
  };
}

function transactionHash(sent: { sendTransactionResponse?: { hash?: string } }): string | null {
  return sent.sendTransactionResponse?.hash ?? null;
}

async function settleMarket(marketId: string, actualValue: string): Promise<Settlement> {
  const config = resolverConfiguration();
  const signer = basicNodeSigner(config.keypair, config.networkPassphrase);
  const client = new Client({
    contractId: config.contractId,
    networkPassphrase: config.networkPassphrase,
    publicKey: config.resolverAddress,
    rpcUrl: config.rpcUrl,
    signAuthEntry: signer.signAuthEntry,
    signTransaction: signer.signTransaction,
  });

  const current = await client.get_market({ market_id: BigInt(marketId) });
  const market = current.result.unwrap();
  if (market.settled) {
    return {
      alreadySettled: true,
      resolverAddress: config.resolverAddress,
      transactionHash: null,
      stellarExpert: null,
    };
  }

  const transaction = await client.settle_market({
    resolver: config.resolverAddress,
    market_id: BigInt(marketId),
    actual_value: BigInt(actualValue),
  });
  const sent = await transaction.signAndSend();
  sent.result.unwrap();
  const hash = transactionHash(sent);

  return {
    alreadySettled: false,
    resolverAddress: config.resolverAddress,
    transactionHash: hash,
    stellarExpert: hash ? `https://stellar.expert/explorer/testnet/tx/${hash}` : null,
  };
}

function defaultWindowEnd(): string {
  return new Date().toISOString();
}

function defaultWindowStart(windowEnd: string): string {
  return new Date(Date.parse(windowEnd) - 10 * 60 * 1000).toISOString();
}

export async function resolveXlmPayments(input: ResolveXlmPaymentsInput = {}) {
  const marketId = parseMarketId(input.marketId ?? process.env.PRISM_MARKET_ID ?? "3003", "marketId");
  const windowEnd = input.windowEnd ?? defaultWindowEnd();
  const windowStart = input.windowStart ?? defaultWindowStart(windowEnd);
  const maxPages = input.maxPages ?? 25;
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100) {
    throw new Error("maxPages must be an integer between 1 and 100");
  }

  const metric = await resolveTotalXlmPayments({
    marketId,
    windowStart,
    windowEnd,
    horizonUrl: process.env.HORIZON_URL?.trim() || DEFAULT_TESTNET_HORIZON,
    maxPages,
  });
  const actualValue = Math.round(Number(metric.actualValue)).toString();
  if (!/^\d+$/.test(actualValue)) throw new Error("Resolver produced an invalid whole-XLM value");
  const settlement = await settleMarket(marketId, actualValue);

  return {
    market_id: marketId,
    metric: metric.metric,
    actual_value: actualValue,
    actual_value_xlm: metric.actualValue,
    actual_value_stroops: metric.actualValueStroops,
    window_start: windowStart,
    window_end: windowEnd,
    horizon_source: metric.source,
    records_scanned: metric.recordsScanned,
    native_payments_counted: metric.nativePaymentsCounted,
    settled_at: new Date().toISOString(),
    already_settled: settlement.alreadySettled,
    resolver_address: settlement.resolverAddress,
    tx_hash: settlement.transactionHash,
    stellar_expert: settlement.stellarExpert,
  };
}

export async function resolveXlmUsdc(input: ResolveXlmUsdcInput = {}) {
  const marketId = parseMarketId(input.marketId ?? process.env.PRISM_XLM_USDC_MARKET_ID ?? "3004", "marketId");
  const price = await fetchXlmUsdcPrice({
    horizonUrl: process.env.SDEX_HORIZON_URL?.trim() || DEFAULT_MAINNET_HORIZON,
  });
  const settlement = await settleMarket(marketId, price.scaledPrice.toString());

  return {
    market_id: marketId,
    actual_value: price.scaledPrice.toString(),
    actual_price_usdc: price.midPrice.toFixed(4),
    pricing_method: price.method,
    recent_trade_count: price.tradeCount,
    order_book_mid_price: price.orderBookMidPrice.toFixed(4),
    order_book_spread_percent: price.spreadPercent.toFixed(2),
    best_bid: price.bestBid.toString(),
    best_ask: price.bestAsk.toString(),
    scale: 10_000,
    horizon_source: price.source,
    settled_at: new Date().toISOString(),
    already_settled: settlement.alreadySettled,
    resolver_address: settlement.resolverAddress,
    tx_hash: settlement.transactionHash,
    stellar_expert: settlement.stellarExpert,
  };
}
