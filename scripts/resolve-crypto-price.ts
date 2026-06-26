import { mkdir, writeFile } from "node:fs/promises";

import { resolveCryptoPrice } from "../server/resolvers.ts";

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

const result = await resolveCryptoPrice({
  assetId: argument("asset-id"),
  marketId: argument("market-id"),
});

await mkdir("docs/deployments", { recursive: true });
await writeFile("docs/deployments/latest-crypto-price-settlement.json", `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
