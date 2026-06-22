import assert from "node:assert/strict";
import test from "node:test";

import { resolveTotalXlmPayments, stroopsToXlm, xlmToStroops } from "./xlm-payments.ts";

test("converts XLM decimals to stroops and back", () => {
  assert.equal(xlmToStroops("1").toString(), "10000000");
  assert.equal(xlmToStroops("1.2345678").toString(), "12345678");
  assert.equal(stroopsToXlm(12345678n), "1.2345678");
});

test("rejects amounts with more than seven decimals", () => {
  assert.throws(() => xlmToStroops("1.12345678"), /Invalid XLM amount/);
});

test("sums only native payments inside the window", async () => {
  const fetchImpl = async () =>
    new Response(
      JSON.stringify({
        _embedded: {
          records: [
            {
              type: "payment",
              asset_type: "native",
              amount: "10.5",
              created_at: "2026-06-14T10:05:00Z",
              paging_token: "3",
            },
            {
              type: "payment",
              asset_type: "credit_alphanum4",
              amount: "99",
              created_at: "2026-06-14T10:04:00Z",
              paging_token: "2",
            },
            {
              type: "create_account",
              asset_type: "native",
              amount: "100",
              created_at: "2026-06-14T10:03:00Z",
              paging_token: "1",
            },
            {
              type: "payment",
              asset_type: "native",
              amount: "5",
              created_at: "2026-06-14T09:59:59Z",
              paging_token: "0",
            },
          ],
        },
      }),
      { status: 200 },
    );

  const result = await resolveTotalXlmPayments({
    marketId: "xlm-payments-testnet-10m",
    windowStart: "2026-06-14T10:00:00Z",
    windowEnd: "2026-06-14T10:10:00Z",
    fetchImpl,
  });

  assert.equal(result.actualValue, "10.5");
  assert.equal(result.nativePaymentsCounted, 1);
  assert.equal(result.submittedTransaction, null);
});

test("paginates until it reaches records older than the window", async () => {
  const urls: string[] = [];
  const fetchImpl = async (url: string | URL | Request) => {
    urls.push(String(url));

    if (urls.length === 1) {
      return new Response(
        JSON.stringify({
          _embedded: {
            records: [
              {
                type: "payment",
                asset_type: "native",
                amount: "1",
                created_at: "2026-06-14T10:09:00Z",
                paging_token: "2",
              },
            ],
          },
          _links: {
            next: {
              href: "https://horizon-testnet.stellar.org/payments?cursor=2&order=desc&limit=200",
            },
          },
        }),
        { status: 200 },
      );
    }

    return new Response(
      JSON.stringify({
        _embedded: {
          records: [
            {
              type: "payment",
              asset_type: "native",
              amount: "2",
              created_at: "2026-06-14T10:01:00Z",
              paging_token: "1",
            },
            {
              type: "payment",
              asset_type: "native",
              amount: "3",
              created_at: "2026-06-14T09:59:00Z",
              paging_token: "0",
            },
          ],
        },
      }),
      { status: 200 },
    );
  };

  const result = await resolveTotalXlmPayments({
    marketId: "xlm-payments-testnet-10m",
    windowStart: "2026-06-14T10:00:00Z",
    windowEnd: "2026-06-14T10:10:00Z",
    fetchImpl,
  });

  assert.equal(urls.length, 2);
  assert.equal(result.actualValue, "3");
  assert.equal(result.recordsScanned, 3);
});
