import { Buffer } from "buffer";

import {
  Client,
  networks,
  type ClaimRecord,
  type CommitmentRecord,
  type Market as ChainMarket,
} from "@/generated/prism-market/src";
import type { ClientOptions } from "@stellar/stellar-sdk/contract";
import type { EncryptedPredictionBlob } from "@/lib/crypto/prediction-encryption";
import { NETWORK_CONFIG } from "@/lib/config/network";
import { STELLAR_TESTNET } from "@/lib/stellar-network";

export const PRISM_MARKET_CONTRACT_ID =
  (import.meta.env.VITE_PRISM_MARKET_CONTRACT_ID as string | undefined) ??
  (import.meta.env.VITE_CONTRACT_ID as string | undefined) ??
  NETWORK_CONFIG.contractId ??
  networks.testnet.contractId;

export const PRISM_DEMO_MARKET_ID = NETWORK_CONFIG.marketId.toString();
export const PRISM_STAKE_STROOPS = "100000000";

export type SignSorobanTransaction = NonNullable<ClientOptions["signTransaction"]>;

export type StoreCommitmentInput = {
  walletAddress: string;
  marketId: string;
  commitmentHash: string;
  encryptedBlob: EncryptedPredictionBlob;
  stake: string;
  signTransaction: SignSorobanTransaction;
};

export type ClaimInput = {
  walletAddress: string;
  marketId: string;
  predictedLow: string;
  predictedHigh: string;
  salt: string;
  submittedCommitment: string;
  signTransaction: SignSorobanTransaction;
};

export type TransactionResult<T> = {
  txHash: string | null;
  result: T;
};

function getClient(publicKey?: string, signTransaction?: SignSorobanTransaction) {
  return new Client({
    ...networks.testnet,
    contractId: PRISM_MARKET_CONTRACT_ID,
    rpcUrl: STELLAR_TESTNET.rpcUrl,
    publicKey,
    signTransaction,
  });
}

function unwrapResult<T>(result: { unwrap(): T }): T {
  return result.unwrap();
}

function parseUnsignedDecimal(value: string, fieldName: string): bigint {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${fieldName} must be a non-negative decimal string`);
  }

  return BigInt(value);
}

function decimalToBytes32(value: string): Buffer {
  let number = parseUnsignedDecimal(value, "commitment hash");
  const bytes = Buffer.alloc(32);

  for (let index = 31; index >= 0; index -= 1) {
    bytes[index] = Number(number & 255n);
    number >>= 8n;
  }

  if (number !== 0n) {
    throw new Error("commitment hash does not fit in 32 bytes");
  }

  return bytes;
}

function decimalOrHexToBytes32(value: string): Buffer {
  if (/^[a-f0-9]{64}$/i.test(value)) {
    return Buffer.from(value, "hex");
  }
  return decimalToBytes32(value);
}

function encryptedBlobToBytes(encryptedBlob: EncryptedPredictionBlob): Buffer {
  return Buffer.from(JSON.stringify(encryptedBlob), "utf8");
}

function transactionHash(sent: { sendTransactionResponse?: { hash?: string } }) {
  return sent.sendTransactionResponse?.hash ?? null;
}

export async function getMarket(marketId: string, walletAddress?: string): Promise<ChainMarket> {
  const client = getClient(walletAddress);
  const tx = await client.get_market({ market_id: BigInt(marketId) });

  return unwrapResult(tx.result);
}

export async function getCommitment(marketId: string, walletAddress: string): Promise<CommitmentRecord> {
  const client = getClient(walletAddress);
  const tx = await client.get_commitment({ market_id: BigInt(marketId), wallet: walletAddress });

  return unwrapResult(tx.result);
}

export async function getClaim(marketId: string, walletAddress: string): Promise<ClaimRecord> {
  const client = getClient(walletAddress);
  const tx = await client.get_claim({ market_id: BigInt(marketId), wallet: walletAddress });

  return unwrapResult(tx.result);
}

export async function storeCommitment(input: StoreCommitmentInput): Promise<TransactionResult<ChainMarket>> {
  const client = getClient(input.walletAddress, input.signTransaction);
  const tx = await client.commit_prediction({
    wallet: input.walletAddress,
    market_id: BigInt(input.marketId),
    commitment_hash: decimalToBytes32(input.commitmentHash),
    encrypted_blob: encryptedBlobToBytes(input.encryptedBlob),
    stake: BigInt(input.stake),
  });

  const sent = await tx.signAndSend();
  unwrapResult(sent.result);

  return {
    txHash: transactionHash(sent),
    result: await getMarket(input.marketId, input.walletAddress),
  };
}

export async function claimPrediction(input: ClaimInput): Promise<TransactionResult<bigint>> {
  const client = getClient(input.walletAddress, input.signTransaction);
  const tx = await client.claim_winnings({
    wallet: input.walletAddress,
    market_id: BigInt(input.marketId),
    predicted_low: BigInt(input.predictedLow),
    predicted_high: BigInt(input.predictedHigh),
    salt: decimalOrHexToBytes32(input.salt),
    submitted_commitment: decimalToBytes32(input.submittedCommitment),
  });

  const sent = await tx.signAndSend();

  return {
    txHash: transactionHash(sent),
    result: unwrapResult(sent.result),
  };
}

export async function getMarketStats(marketId: string, walletAddress?: string) {
  const client = getClient(walletAddress);
  const tx = await client.get_market_stats({ market_id: BigInt(marketId) });
  return unwrapResult(tx.result);
}

export async function getPoolBalance(marketId: string, walletAddress?: string) {
  const client = getClient(walletAddress);
  const tx = await client.get_pool_balance({ market_id: BigInt(marketId) });
  return unwrapResult(tx.result);
}
