import { mkdir, writeFile } from "node:fs/promises";

import { resolveXlmUsdc } from "../server/resolvers.ts";

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

const result = await resolveXlmUsdc({ marketId: argument("market-id") });

await mkdir("docs/deployments", { recursive: true });
await writeFile("docs/deployments/latest-xlm-usdc-settlement.json", `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
