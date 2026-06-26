import { timingSafeEqual } from "node:crypto";

import express, { type NextFunction, type Request, type Response } from "express";

import { MarketNotReadyError, resolveCryptoPrice, resolveXlmPayments, resolveXlmUsdc } from "./resolvers.ts";

const app = express();
const runningResolvers = new Set<string>();

app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));

function tokensEqual(provided: string, expected: string): boolean {
  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);
  return providedBytes.length === expectedBytes.length && timingSafeEqual(providedBytes, expectedBytes);
}

function auth(request: Request, response: Response, next: NextFunction) {
  const expected = process.env.RESOLVER_ADMIN_TOKEN;
  const authorization = request.header("authorization") ?? "";
  const provided = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!expected || !provided || !tokensEqual(provided, expected)) {
    response.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}

async function runOnce<T>(key: string, operation: () => Promise<T>): Promise<T> {
  if (runningResolvers.has(key)) throw new Error(`${key} resolution is already running`);
  runningResolvers.add(key);
  try {
    return await operation();
  } finally {
    runningResolvers.delete(key);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Resolver failed";
}

function errorStatus(error: unknown, message: string): number {
  if (error instanceof MarketNotReadyError) return 409;
  if (/already running/i.test(message)) return 409;
  return 500;
}

app.get("/health", (_request, response) => {
  response.json({ status: "ok", network: process.env.STELLAR_NETWORK ?? "testnet" });
});

app.post("/resolve/xlm-payments", auth, async (request, response) => {
  try {
    const result = await runOnce("xlm-payments", () => resolveXlmPayments({
      windowStart: request.body?.windowStart,
      windowEnd: request.body?.windowEnd,
      maxPages: request.body?.maxPages,
    }));
    response.json(result);
  } catch (error) {
    const message = errorMessage(error);
    response.status(errorStatus(error, message)).json({ error: message });
  }
});

app.post("/resolve/xlm-usdc", auth, async (request, response) => {
  try {
    const result = await runOnce("xlm-usdc", () => resolveXlmUsdc());
    response.json(result);
  } catch (error) {
    const message = errorMessage(error);
    response.status(errorStatus(error, message)).json({ error: message });
  }
});

app.post("/resolve/crypto-price", auth, async (request, response) => {
  try {
    const assetId = typeof request.body?.assetId === "string" ? request.body.assetId : undefined;
    const marketId = typeof request.body?.marketId === "string" ? request.body.marketId : undefined;
    const key = `crypto-price:${assetId ?? marketId ?? "bitcoin"}`;
    const result = await runOnce(key, () => resolveCryptoPrice({ assetId, marketId }));
    response.json(result);
  } catch (error) {
    const message = errorMessage(error);
    response.status(errorStatus(error, message)).json({ error: message });
  }
});

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PORT must be a valid TCP port");
}

app.listen(port, "0.0.0.0", () => {
  console.log(`PRISM resolver listening on port ${port}`);
});

export { app };
