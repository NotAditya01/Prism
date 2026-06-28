import { Keypair, Networks } from "@stellar/stellar-sdk";
import { basicNodeSigner } from "@stellar/stellar-sdk/contract";

import { Client } from "../src/generated/prism-market/src/index.ts";
import { cryptoMarketResolutionTime, cryptoPriceMarkets } from "../src/lib/markets.ts";

const DEFAULT_CONTRACT_ID = "CAEZKGE2O6YYPSH366MYEAB62DSMYYUNKQTLXWEHEATJKAISAKRKLO2N";
const DEFAULT_TESTNET_RPC = "https://soroban-testnet.stellar.org";
const STROOPS = 10_000_000n;

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

function env(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function secret() {
  return process.env.PRISM_ADMIN_SECRET?.trim()
    || process.env.DEPLOYER_SECRET?.trim()
    || process.env.RESOLVER_SECRET?.trim()
    || requiredEnv("PRISM_ADMIN_SECRET");
}

function xlm(value: number | bigint) {
  return BigInt(value) * STROOPS;
}

const keypair = Keypair.fromSecret(secret());
const publicKey = keypair.publicKey();
const signer = basicNodeSigner(keypair, Networks.TESTNET);
const client = new Client({
  contractId: env("PRISM_MARKET_CONTRACT_ID", DEFAULT_CONTRACT_ID),
  networkPassphrase: Networks.TESTNET,
  publicKey,
  rpcUrl: env("STELLAR_RPC", DEFAULT_TESTNET_RPC),
  signAuthEntry: signer.signAuthEntry,
  signTransaction: signer.signTransaction,
});

const admin = env("PRISM_ADMIN_ADDRESS", publicKey);
const funder = env("PRISM_FUNDER_ADDRESS", publicKey);
const resolver = env("PRISM_RESOLVER_ADDRESS", publicKey);
const treasury = env("PRISM_TREASURY_ADDRESS", publicKey);
const poolXlm = BigInt(env("PRISM_CRYPTO_MARKET_POOL_XLM", "5000"));
const resolutionTime = BigInt(env("PRISM_CRYPTO_RESOLUTION_TIME", cryptoMarketResolutionTime.toString()));

for (const market of cryptoPriceMarkets) {
  try {
    const existing = await client.get_market({ market_id: BigInt(market.numericId) });
    existing.result.unwrap();
    console.log(`SKIP market ${market.numericId} already exists (${market.shortQuestion})`);
  } catch {
    const createTx = await client.create_market({
      admin,
      market_id: BigInt(market.numericId),
      max_range_width: BigInt(market.maxRangeWidth),
      max_multiplier: 10,
      min_stake: xlm(5),
      resolution_time: resolutionTime,
      treasury_address: treasury,
      resolver_address: resolver,
    });
    const sent = await createTx.signAndSend();
    sent.result.unwrap();
    console.log(`CREATED market ${market.numericId} (${market.shortQuestion})`);
  }

  const fundTx = await client.fund_pool({
    funder,
    market_id: BigInt(market.numericId),
    amount: xlm(poolXlm),
  });
  const sent = await fundTx.signAndSend();
  sent.result.unwrap();
  console.log(`FUNDED market ${market.numericId} with ${poolXlm.toString()} XLM`);
}
