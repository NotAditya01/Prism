import assert from "node:assert/strict";
import test from "node:test";

import {
  buildXlmUsdcOrderBookUrl,
  buildXlmUsdcTradesUrl,
  calculateMidPrice,
  calculateRecentTradeVwap,
  fetchXlmUsdcPrice,
  MAINNET_USDC_ISSUER,
} from "./xlm-usdc-price.ts";

test("builds the mainnet XLM/USDC order book URL", () => {
  const url = new URL(buildXlmUsdcOrderBookUrl());

  assert.equal(url.searchParams.get("selling_asset_type"), "native");
  assert.equal(url.searchParams.get("buying_asset_code"), "USDC");
  assert.equal(url.origin, "https://horizon.stellar.org");
  assert.equal(url.searchParams.get("buying_asset_issuer"), MAINNET_USDC_ISSUER);
});

test("calculates and scales the mid price", () => {
  const result = calculateMidPrice({
    bids: [{ price: "0.1088" }],
    asks: [{ price: "0.1090" }],
  });

  assert.equal(result.midPrice, 0.1089);
  assert.ok(result.spreadPercent > 0);
});

test("calculates a volume-weighted price from recent trades", () => {
  const result = calculateRecentTradeVwap([
    { base_amount: "100", counter_amount: "59" },
    { base_amount: "200", counter_amount: "118" },
  ]);

  assert.equal(result.price, 0.59);
  assert.equal(result.tradeCount, 2);
});

test("fetches the order book through the injected fetch implementation", async () => {
  const result = await fetchXlmUsdcPrice({
    fetchImpl: async (input) => {
      const url = String(input);
      return new Response(JSON.stringify(url.includes("/trades") ? {
        _embedded: {
          records: [
            { base_amount: "100", counter_amount: "59" },
            { base_amount: "200", counter_amount: "118" },
          ],
        },
      } : {
        bids: [{ price: "0.273" }],
        asks: [{ price: "0.5" }],
      }), { status: 200 });
    },
  });

  assert.equal(result.scaledPrice, 5900);
  assert.equal(result.method, "recent_trade_vwap");
  assert.equal(result.tradeCount, 2);
  assert.match(result.source, /trades/);
});

test("keeps the order-book midpoint when the spread is tight", async () => {
  const result = await fetchXlmUsdcPrice({
    fetchImpl: async () => new Response(JSON.stringify({
      bids: [{ price: "0.1088" }],
      asks: [{ price: "0.1090" }],
    }), { status: 200 }),
  });

  assert.equal(result.scaledPrice, 1089);
  assert.equal(result.method, "orderbook_mid");
  assert.match(result.source, /order_book/);
});

test("rejects an empty order book", () => {
  assert.throws(() => calculateMidPrice({ bids: [], asks: [] }), /valid best bid and ask/);
});

test("builds the XLM/USDC recent trades URL", () => {
  const url = new URL(buildXlmUsdcTradesUrl());
  assert.equal(url.searchParams.get("base_asset_type"), "native");
  assert.equal(url.searchParams.get("counter_asset_code"), "USDC");
  assert.equal(url.searchParams.get("order"), "desc");
});

test("times out when Horizon does not respond", async () => {
  await assert.rejects(
    fetchXlmUsdcPrice({
      fetchImpl: async () => new Promise<Response>(() => undefined),
      timeoutMs: 5,
    }),
    /Unable to load trustworthy XLM\/USDC market data from Horizon/,
  );
});
