export const CRYPTO_PRICE_SCALE = 10_000;

export type CryptoAssetId = "bitcoin" | "ethereum" | "solana" | "stellar" | "dogecoin" | "hyperliquid";

export type CryptoPriceConfig = {
  id: CryptoAssetId;
  symbol: string;
  marketId: string;
  scale: number;
};

export type CoinGeckoSimplePriceResponse = Partial<Record<CryptoAssetId, { usd?: number }>>;

export type CryptoPrice = {
  assetId: CryptoAssetId;
  symbol: string;
  marketId: string;
  priceUsd: number;
  scaledPrice: number;
  scale: number;
  source: string;
  fetchedAt: string;
};

export type FetchCryptoPriceOptions = {
  assetId: CryptoAssetId;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

const COINGECKO_SIMPLE_PRICE_URL = "https://api.coingecko.com/api/v3/simple/price";

export const CRYPTO_PRICE_MARKETS: Record<CryptoAssetId, CryptoPriceConfig> = {
  bitcoin: { id: "bitcoin", symbol: "BTC", marketId: "3005", scale: 1 },
  ethereum: { id: "ethereum", symbol: "ETH", marketId: "3006", scale: 1 },
  solana: { id: "solana", symbol: "SOL", marketId: "3007", scale: 1 },
  stellar: { id: "stellar", symbol: "XLM", marketId: "3008", scale: CRYPTO_PRICE_SCALE },
  dogecoin: { id: "dogecoin", symbol: "DOGE", marketId: "3009", scale: CRYPTO_PRICE_SCALE },
  hyperliquid: { id: "hyperliquid", symbol: "HYPE", marketId: "3010", scale: 1 },
};

export function parseCryptoAssetId(value: string): CryptoAssetId {
  if (value in CRYPTO_PRICE_MARKETS) return value as CryptoAssetId;
  throw new Error(`Unsupported crypto asset id: ${value}`);
}

export function buildCoinGeckoSimplePriceUrl(assetId: CryptoAssetId): string {
  const query = new URLSearchParams({
    ids: assetId,
    vs_currencies: "usd",
    precision: "full",
  });
  return `${COINGECKO_SIMPLE_PRICE_URL}?${query.toString()}`;
}

export async function fetchCryptoPrice({
  assetId,
  fetchImpl = fetch,
  timeoutMs = 10_000,
}: FetchCryptoPriceOptions): Promise<CryptoPrice> {
  const config = CRYPTO_PRICE_MARKETS[assetId];
  const source = buildCoinGeckoSimplePriceUrl(assetId);
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error(`CoinGecko ${assetId} price request timed out`));
    }, timeoutMs);
  });

  const request = fetchImpl(source, {
    headers: { accept: "application/json" },
    signal: controller.signal,
  });
  const response = await Promise.race([request, timeoutPromise]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
  if (!response.ok) {
    throw new Error(`CoinGecko ${assetId} price request failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as CoinGeckoSimplePriceResponse;
  const priceUsd = Number(data[assetId]?.usd ?? 0);
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
    throw new Error(`CoinGecko returned an invalid ${assetId} USD price`);
  }

  return {
    assetId,
    symbol: config.symbol,
    marketId: config.marketId,
    priceUsd,
    scaledPrice: Math.round(priceUsd * config.scale),
    scale: config.scale,
    source,
    fetchedAt: new Date().toISOString(),
  };
}
