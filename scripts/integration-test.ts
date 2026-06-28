import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { createPredictionCommitment } from "../src/lib/commitment.ts";

const execFileAsync = promisify(execFile);
const STROOPS = 10_000_000n;

type Scenario = {
  name: string;
  run: () => Promise<void>;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function env(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function xlm(value: number | bigint): string {
  return (BigInt(value) * STROOPS).toString();
}

async function stellar(args: string[]) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const { stdout, stderr } = await execFileAsync("stellar", args, { maxBuffer: 1024 * 1024 });
      await new Promise((resolve) => setTimeout(resolve, 1200));
      return `${stdout}\n${stderr}`.trim();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!/502|503|504|timeout|temporar|rate|TxBadSeq/i.test(message) || attempt === 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 4000));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("stellar command failed");
}

async function invoke(functionName: string, params: Record<string, string>, sourceAccount = requiredEnv("STELLAR_SOURCE_ACCOUNT")) {
  const args = [
    "contract",
    "invoke",
    "--network",
    env("STELLAR_NETWORK", "testnet"),
    "--source-account",
    sourceAccount,
    "--id",
    requiredEnv("PRISM_MARKET_CONTRACT_ID"),
    "--",
    functionName,
  ];

  for (const [key, value] of Object.entries(params)) {
    args.push(`--${key}`, value);
  }

  return stellar(args);
}

async function invokeContract(contractId: string, functionName: string, params: Record<string, string>) {
  const args = [
    "contract",
    "invoke",
    "--network",
    env("STELLAR_NETWORK", "testnet"),
    "--source-account",
    requiredEnv("STELLAR_SOURCE_ACCOUNT"),
    "--id",
    contractId,
    "--",
    functionName,
  ];

  for (const [key, value] of Object.entries(params)) {
    args.push(`--${key}`, value);
  }

  return stellar(args);
}

async function createMarket(marketId: string, maxRangeWidth = "1000", resolutionTime = "1") {
  await invoke("create_market", {
    admin: requiredEnv("PRISM_ADMIN_ADDRESS"),
    market_id: marketId,
    max_range_width: maxRangeWidth,
    max_multiplier: "10",
    min_stake: xlm(5),
    resolution_time: resolutionTime,
    treasury_address: requiredEnv("PRISM_TREASURY_ADDRESS"),
    resolver_address: requiredEnv("PRISM_RESOLVER_ADDRESS"),
  });
}

async function fundPool(marketId: string, amount: string) {
  await invoke("fund_pool", {
    funder: requiredEnv("PRISM_FUNDER_ADDRESS"),
    market_id: marketId,
    amount,
  });
}

async function tokenBalance(address: string): Promise<bigint> {
  const output = await invokeContract(requiredEnv("XLM_TOKEN_CONTRACT_ID"), "balance", { id: address });
  const matches = output.match(/-?\d+/g);
  if (!matches?.length) throw new Error(`Could not parse balance output: ${output}`);
  return BigInt(matches.at(-1)!);
}

async function claimRecord(marketId: string, wallet: string): Promise<{ payout: bigint; fee: bigint }> {
  const output = await invoke("get_claim", { market_id: marketId, wallet });
  const jsonStart = output.indexOf("{");
  const jsonEnd = output.lastIndexOf("}");
  if (jsonStart < 0) throw new Error(`Could not parse claim output: ${output}`);
  if (jsonEnd < jsonStart) throw new Error(`Could not parse claim output: ${output}`);
  const parsed = JSON.parse(output.slice(jsonStart, jsonEnd + 1)) as { payout: string; fee: string };
  return { payout: BigInt(parsed.payout), fee: BigInt(parsed.fee) };
}

async function expectError(name: string, action: () => Promise<unknown>, expected: string) {
  try {
    await action();
    throw new Error(`${name}: expected ${expected}, got success`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes(expected) && !message.includes(errorCodeFor(expected))) {
      throw new Error(`${name}: expected ${expected}, got ${message}`);
    }
  }
}

function errorCodeFor(errorName: string) {
  const codes: Record<string, string> = {
    AlreadyClaimed: "#10",
    RangeMiss: "#11",
    InvalidCommitment: "#13",
    InsufficientPool: "#14",
    BelowMinStake: "#15",
    UnauthorizedResolver: "#16",
  };
  return codes[errorName] ?? errorName;
}

function decimalToBytes32Hex(value: string): string {
  let number = BigInt(value);
  const bytes = Buffer.alloc(32);
  for (let index = 31; index >= 0; index -= 1) {
    bytes[index] = Number(number & 255n);
    number >>= 8n;
  }
  if (number !== 0n) throw new Error("commitment does not fit in 32 bytes");
  return bytes.toString("hex");
}

async function commitPrediction(marketId: string, wallet: string, low: bigint, high: bigint, stake: string) {
  const salt = randomBytes(32);
  const saltDecimal = BigInt(`0x${salt.toString("hex")}`).toString();
  const { commitment } = await createPredictionCommitment({
    low: low.toString(),
    high: high.toString(),
    salt: saltDecimal,
    marketId,
  });
  const hashHex = decimalToBytes32Hex(commitment);
  await invoke("commit_prediction", {
    wallet,
    market_id: marketId,
    commitment_hash: hashHex,
    encrypted_blob: Buffer.from("{}").toString("hex"),
    stake,
  });
  return { salt, hashHex };
}

async function claim(marketId: string, wallet: string, low: bigint, high: bigint, salt: Buffer, hashHex: string) {
  return invoke("claim_winnings", {
    wallet,
    market_id: marketId,
    predicted_low: low.toString(),
    predicted_high: high.toString(),
    salt: salt.toString("hex"),
    submitted_commitment: hashHex,
  });
}

function scenarioList(): Scenario[] {
  const baseMarketId = BigInt(env("PRISM_SCENARIO_MARKET_ID_BASE", "3001"));
  const wallet = requiredEnv("PRISM_TEST_WALLET_ADDRESS");
  const resolver = requiredEnv("PRISM_RESOLVER_ADDRESS");
  const nonResolver = env("PRISM_NON_RESOLVER_ADDRESS", wallet);
  const treasury = requiredEnv("PRISM_TREASURY_ADDRESS");
  const marketId = (offset: number) => (baseMarketId + BigInt(offset)).toString();

  return [
    {
      name: "SCENARIO 1 — Below minimum stake rejected",
      run: async () => {
        const id = marketId(1);
        await createMarket(id);
        await expectError("below minimum stake", () => commitPrediction(id, wallet, 280n, 330n, xlm(4)), "BelowMinStake");
      },
    },
    {
      name: "SCENARIO 2 — Tight range, high stake",
      run: async () => {
        const id = marketId(2);
        await createMarket(id);
        const { salt, hashHex } = await commitPrediction(id, wallet, 280n, 330n, xlm(100));
        await invoke("settle_market", { resolver, market_id: id, actual_value: "321" });
        await claim(id, wallet, 280n, 330n, salt, hashHex);
        const record = await claimRecord(id, wallet);
        if (record.payout !== 980n * STROOPS) throw new Error("claim record payout is not 980 XLM");
        if (record.fee !== 20n * STROOPS) throw new Error("claim record fee is not 20 XLM");
      },
    },
    {
      name: "SCENARIO 3 — Wide range, low stake",
      run: async () => {
        const id = marketId(3);
        await createMarket(id);
        const { salt, hashHex } = await commitPrediction(id, wallet, 100n, 600n, xlm(5));
        await invoke("settle_market", { resolver, market_id: id, actual_value: "321" });
        await claim(id, wallet, 100n, 600n, salt, hashHex);
        const record = await claimRecord(id, wallet);
        if (record.payout !== 49_000_000n) throw new Error("claim record payout is not 4.9 XLM");
        if (record.fee !== 1_000_000n) throw new Error("claim record fee is not 0.1 XLM");
      },
    },
    {
      name: "SCENARIO 4 — Range miss",
      run: async () => {
        const id = marketId(4);
        await createMarket(id);
        const { salt, hashHex } = await commitPrediction(id, wallet, 400n, 500n, xlm(10));
        await invoke("settle_market", { resolver, market_id: id, actual_value: "321" });
        await expectError("range miss", () => claim(id, wallet, 400n, 500n, salt, hashHex), "RangeMiss");
      },
    },
    {
      name: "SCENARIO 5 — Duplicate claim",
      run: async () => {
        const id = marketId(5);
        await createMarket(id);
        const { salt, hashHex } = await commitPrediction(id, wallet, 280n, 330n, xlm(100));
        await invoke("settle_market", { resolver, market_id: id, actual_value: "321" });
        await claim(id, wallet, 280n, 330n, salt, hashHex);
        await expectError("duplicate claim", () => claim(id, wallet, 280n, 330n, salt, hashHex), "AlreadyClaimed");
      },
    },
    {
      name: "SCENARIO 6 — Unauthorized resolver",
      run: async () => {
        const id = marketId(6);
        await createMarket(id);
        await expectError(
          "unauthorized resolver",
          () => invoke("settle_market", { resolver: nonResolver, market_id: id, actual_value: "321" }, env("PRISM_NON_RESOLVER_SOURCE_ACCOUNT", nonResolver)),
          "UnauthorizedResolver",
        );
      },
    },
    {
      name: "SCENARIO 7 — Pool insufficient",
      run: async () => {
        const id = marketId(7);
        await createMarket(id);
        const { salt, hashHex } = await commitPrediction(id, wallet, 320n, 321n, xlm(5000));
        await invoke("settle_market", { resolver, market_id: id, actual_value: "321" });
        await expectError("insufficient pool", () => claim(id, wallet, 320n, 321n, salt, hashHex), "InsufficientPool");
      },
    },
    {
      name: "SCENARIO 8 — Large stake uncapped",
      run: async () => {
        const id = marketId(8);
        await createMarket(id);
        await commitPrediction(id, wallet, 280n, 350n, xlm(5000));
      },
    },
    {
      name: "SCENARIO 9 — Full demo path",
      run: async () => {
        const id = marketId(9);
        await createMarket(id);
        const { salt, hashHex } = await commitPrediction(id, wallet, 280n, 350n, xlm(50));
        await invoke("settle_market", { resolver, market_id: id, actual_value: "321" });
        await claim(id, wallet, 280n, 350n, salt, hashHex);
        const record = await claimRecord(id, wallet);
        if (record.payout !== 490n * STROOPS) throw new Error("claim record payout is not 490 XLM");
        if (record.fee !== 10n * STROOPS) throw new Error("claim record fee is not 10 XLM");
        await expectError("duplicate demo claim", () => claim(id, wallet, 280n, 350n, salt, hashHex), "AlreadyClaimed");
      },
    },
    {
      name: "SCENARIO 10 — XLM/USDC market end to end",
      run: async () => {
        const id = env("PRISM_XLM_USDC_TEST_MARKET_ID", marketId(10));
        await createMarket(id, "10000");
        await fundPool(id, xlm(5000));
        const { salt, hashHex } = await commitPrediction(id, wallet, 1050n, 1150n, xlm(10));
        await invoke("settle_market", { resolver, market_id: id, actual_value: "1089" });
        await claim(id, wallet, 1050n, 1150n, salt, hashHex);
        const record = await claimRecord(id, wallet);
        if (record.payout !== 98n * STROOPS) throw new Error("XLM/USDC payout is not 98 XLM");
        if (record.fee !== 2n * STROOPS) throw new Error("XLM/USDC fee is not 2 XLM");
      },
    },
  ];
}

let failed = 0;

for (const scenario of scenarioList()) {
  try {
    await scenario.run();
    console.log(`PASS ${scenario.name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${scenario.name}`);
    console.error(error instanceof Error ? error.message : error);
  }
}

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("ALL SCENARIOS PASSED");
}
