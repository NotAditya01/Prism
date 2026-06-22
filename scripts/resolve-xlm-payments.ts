import { mkdir, writeFile } from "node:fs/promises";

import { resolveXlmPayments } from "../server/resolvers.ts";

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

const result = await resolveXlmPayments({
  marketId: argument("market-id"),
  windowStart: argument("window-start"),
  windowEnd: argument("window-end"),
  maxPages: argument("max-pages") ? Number(argument("max-pages")) : undefined,
});

await mkdir("docs/deployments", { recursive: true });
await writeFile("docs/deployments/latest-settlement.json", `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
