export const MAINNET_USDC_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
export const XLM_USDC_PRICE_SCALE = 10_000;

export type HorizonOrderBookLevel = {
  price?: string;
  amount?: string;
};

export type HorizonOrderBook = {
  bids?: HorizonOrderBookLevel[];
  asks?: HorizonOrderBookLevel[];
};

export type HorizonTradeRecord = {
  base_amount?: string;
  counter_amount?: string;
  ledger_close_time?: string;
};

export type HorizonTradesPage = {
  _embedded?: {
    records?: HorizonTradeRecord[];
  };
};

export type XlmUsdcPrice = {
  bestBid: number;
  bestAsk: number;
  midPrice: number;
  orderBookMidPrice: number;
  spreadPercent: number;
  method: "orderbook_mid" | "recent_trade_vwap";
  tradeCount: number;
  scaledPrice: number;
  source: string;
  orderBookSource: string;
  fetchedAt: string;
};

export type FetchXlmUsdcPriceOptions = {
  horizonUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

const MAINNET_HORIZON_URL = "https://horizon.stellar.org";
const MAX_TRUSTED_BOOK_SPREAD_PERCENT = 5;

export function buildXlmUsdcOrderBookUrl(horizonUrl = MAINNET_HORIZON_URL): string {
  const query = new URLSearchParams({
    selling_asset_type: "native",
    buying_asset_type: "credit_alphanum4",
    buying_asset_code: "USDC",
    buying_asset_issuer: MAINNET_USDC_ISSUER,
  });

  return `${horizonUrl}/order_book?${query.toString()}`;
}

export function buildXlmUsdcTradesUrl(horizonUrl = MAINNET_HORIZON_URL): string {
  const query = new URLSearchParams({
    base_asset_type: "native",
    counter_asset_type: "credit_alphanum4",
    counter_asset_code: "USDC",
    counter_asset_issuer: MAINNET_USDC_ISSUER,
    order: "desc",
    limit: "20",
  });

  return `${horizonUrl}/trades?${query.toString()}`;
}

export function calculateMidPrice(orderBook: HorizonOrderBook) {
  const bestBid = Number(orderBook.bids?.[0]?.price ?? 0);
  const bestAsk = Number(orderBook.asks?.[0]?.price ?? 0);

  if (!Number.isFinite(bestBid) || !Number.isFinite(bestAsk) || bestBid <= 0 || bestAsk <= 0) {
    throw new Error("Stellar DEX order book does not contain a valid best bid and ask");
  }

  const midPrice = (bestBid + bestAsk) / 2;
  return {
    bestBid,
    bestAsk,
    midPrice,
    spreadPercent: ((bestAsk - bestBid) / midPrice) * 100,
  };
}

export function calculateRecentTradeVwap(records: HorizonTradeRecord[]): { price: number; tradeCount: number } {
  let totalBase = 0;
  let totalCounter = 0;
  let tradeCount = 0;

  for (const record of records) {
    const baseAmount = Number(record.base_amount ?? 0);
    const counterAmount = Number(record.counter_amount ?? 0);
    if (!Number.isFinite(baseAmount) || !Number.isFinite(counterAmount) || baseAmount <= 0 || counterAmount <= 0) {
      continue;
    }
    totalBase += baseAmount;
    totalCounter += counterAmount;
    tradeCount += 1;
  }

  if (tradeCount === 0 || totalBase <= 0) {
    throw new Error("Stellar DEX does not contain valid recent XLM/USDC trades");
  }

  return {
    price: totalCounter / totalBase,
    tradeCount,
  };
}

export async function fetchXlmUsdcPrice({
  horizonUrl = MAINNET_HORIZON_URL,
  fetchImpl = fetch,
  timeoutMs = 10_000,
}: FetchXlmUsdcPriceOptions = {}): Promise<XlmUsdcPrice> {
  const orderBookSource = buildXlmUsdcOrderBookUrl(horizonUrl);
  const tradesSource = buildXlmUsdcTradesUrl(horizonUrl);

  async function requestJson<T>(url: string, label: string): Promise<T> {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new Error(`Horizon ${label} request timed out`));
      }, timeoutMs);
    });
    const request = fetchImpl(url, {
      headers: {
        accept: "application/json",
      },
      signal: controller.signal,
    });
    const response = await Promise.race([request, timeoutPromise]).finally(() => {
      if (timeout) clearTimeout(timeout);
    });
    if (!response.ok) {
      throw new Error(`Horizon ${label} request failed: ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<T>;
  }

  const [bookResult, tradesResult] = await Promise.allSettled([
    requestJson<HorizonOrderBook>(orderBookSource, "order book"),
    requestJson<HorizonTradesPage>(tradesSource, "trades"),
  ]);

  let book: ReturnType<typeof calculateMidPrice> | null = null;
  if (bookResult.status === "fulfilled") {
    try {
      book = calculateMidPrice(bookResult.value);
    } catch {
      book = null;
    }
  }
  let vwap: { price: number; tradeCount: number } | null = null;
  if (tradesResult.status === "fulfilled") {
    try {
      vwap = calculateRecentTradeVwap(tradesResult.value._embedded?.records ?? []);
    } catch {
      vwap = null;
    }
  }

  const useBook = Boolean(book && book.spreadPercent <= MAX_TRUSTED_BOOK_SPREAD_PERCENT);
  if (!useBook && !vwap) {
    if (book) {
      throw new Error(`XLM/USDC order-book spread is too wide (${book.spreadPercent.toFixed(1)}%) and no recent trades are available`);
    }
    throw new Error("Unable to load trustworthy XLM/USDC market data from Horizon");
  }

  const selectedPrice = useBook ? book!.midPrice : vwap!.price;
  const method: XlmUsdcPrice["method"] = useBook ? "orderbook_mid" : "recent_trade_vwap";
  const tradeCount = useBook ? 0 : vwap!.tradeCount;
  const source = useBook ? orderBookSource : tradesSource;

  return {
    bestBid: book?.bestBid ?? 0,
    bestAsk: book?.bestAsk ?? 0,
    midPrice: selectedPrice,
    orderBookMidPrice: book?.midPrice ?? 0,
    spreadPercent: book?.spreadPercent ?? 0,
    method,
    tradeCount,
    scaledPrice: Math.round(selectedPrice * XLM_USDC_PRICE_SCALE),
    source,
    orderBookSource,
    fetchedAt: new Date().toISOString(),
  };
}
