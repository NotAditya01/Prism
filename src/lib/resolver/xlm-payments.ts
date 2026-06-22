export type HorizonPaymentRecord = {
  type: string;
  created_at: string;
  amount?: string;
  asset_type?: string;
  paging_token: string;
};

export type HorizonPaymentsPage = {
  _embedded: {
    records: HorizonPaymentRecord[];
  };
  _links?: {
    next?: {
      href: string;
    };
  };
};

export type XlmPaymentResolution = {
  marketId: string;
  metric: "total_xlm_payments";
  windowStart: string;
  windowEnd: string;
  actualValue: string;
  actualValueStroops: string;
  source: string;
  recordsScanned: number;
  nativePaymentsCounted: number;
  submittedTransaction: null;
};

export type ResolveXlmPaymentsOptions = {
  marketId: string;
  windowStart: string;
  windowEnd: string;
  horizonUrl?: string;
  maxPages?: number;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

const STROOPS_PER_XLM = 10_000_000n;
const STELLAR_TESTNET_HORIZON_URL = "https://horizon-testnet.stellar.org";

export function xlmToStroops(amount: string): bigint {
  if (!/^\d+(\.\d{1,7})?$/.test(amount)) {
    throw new Error(`Invalid XLM amount: ${amount}`);
  }

  const [whole, fraction = ""] = amount.split(".");
  return BigInt(whole) * STROOPS_PER_XLM + BigInt(fraction.padEnd(7, "0"));
}

export function stroopsToXlm(stroops: bigint): string {
  const whole = stroops / STROOPS_PER_XLM;
  const fraction = (stroops % STROOPS_PER_XLM).toString().padStart(7, "0").replace(/0+$/, "");

  return fraction.length > 0 ? `${whole}.${fraction}` : whole.toString();
}

export function isNativePaymentInsideWindow(
  record: HorizonPaymentRecord,
  windowStartMs: number,
  windowEndMs: number,
): boolean {
  const createdAt = Date.parse(record.created_at);

  return (
    record.type === "payment" &&
    record.asset_type === "native" &&
    typeof record.amount === "string" &&
    createdAt >= windowStartMs &&
    createdAt <= windowEndMs
  );
}

export async function resolveTotalXlmPayments({
  marketId,
  windowStart,
  windowEnd,
  horizonUrl = STELLAR_TESTNET_HORIZON_URL,
  maxPages = 25,
  fetchImpl = fetch,
  timeoutMs = 10_000,
}: ResolveXlmPaymentsOptions): Promise<XlmPaymentResolution> {
  const windowStartMs = Date.parse(windowStart);
  const windowEndMs = Date.parse(windowEnd);

  if (!Number.isFinite(windowStartMs) || !Number.isFinite(windowEndMs) || windowEndMs <= windowStartMs) {
    throw new Error("Resolver window must have valid start and end ISO timestamps");
  }

  let nextUrl = `${horizonUrl}/payments?order=desc&limit=200`;
  let totalStroops = 0n;
  let recordsScanned = 0;
  let nativePaymentsCounted = 0;

  for (let page = 0; page < maxPages && nextUrl; page += 1) {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new Error("Horizon payments request timed out"));
      }, timeoutMs);
    });
    const request = fetchImpl(nextUrl, {
      headers: {
        accept: "application/json",
      },
      signal: controller.signal,
    });
    const response = await Promise.race([request, timeoutPromise]).finally(() => {
      if (timeout) clearTimeout(timeout);
    });

    if (!response.ok) {
      throw new Error(`Horizon request failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as HorizonPaymentsPage;
    const records = data._embedded.records;

    recordsScanned += records.length;

    for (const record of records) {
      if (isNativePaymentInsideWindow(record, windowStartMs, windowEndMs)) {
        totalStroops += xlmToStroops(record.amount!);
        nativePaymentsCounted += 1;
      }
    }

    const oldestRecord = records.at(-1);
    if (!oldestRecord || Date.parse(oldestRecord.created_at) < windowStartMs) {
      break;
    }

    nextUrl = data._links?.next?.href ?? "";
  }

  return {
    marketId,
    metric: "total_xlm_payments",
    windowStart,
    windowEnd,
    actualValue: stroopsToXlm(totalStroops),
    actualValueStroops: totalStroops.toString(),
    source: `${horizonUrl}/payments`,
    recordsScanned,
    nativePaymentsCounted,
    submittedTransaction: null,
  };
}
