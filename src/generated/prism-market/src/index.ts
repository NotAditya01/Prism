import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}


export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CCNVNXIE74IBGWJOFNKQD6J2VZEZGQVNKZXBEKHFRWKVCOUXKFAFIQTJ",
  }
} as const

export const Errors = {
  1: {message:"AlreadyInitialized"},
  2: {message:"MarketExists"},
  3: {message:"MarketMissing"},
  4: {message:"MarketInactive"},
  5: {message:"DuplicateCommitment"},
  6: {message:"InvalidStake"},
  7: {message:"PoolMissing"},
  8: {message:"AlreadySettled"},
  9: {message:"NotSettled"},
  10: {message:"AlreadyClaimed"},
  11: {message:"RangeMiss"},
  12: {message:"InvalidRange"},
  13: {message:"InvalidCommitment"},
  14: {message:"InsufficientPool"},
  15: {message:"BelowMinStake"},
  16: {message:"UnauthorizedResolver"}
}


export interface Market {
  active: boolean;
  actual_value: i128;
  claimed_count: u32;
  claimed_pool: i128;
  fee_collected: i128;
  id: u64;
  loser_count: u32;
  max_multiplier: u32;
  max_range_width: u64;
  min_stake: i128;
  resolver_address: string;
  sealed_count: u32;
  settled: boolean;
  total_pool: i128;
  treasury_address: string;
  winner_count: u32;
}

export type DataKey = {tag: "Admin", values: void} | {tag: "XlmToken", values: void} | {tag: "Market", values: readonly [u64]} | {tag: "Commitment", values: readonly [u64, string]} | {tag: "Claim", values: readonly [u64, string]} | {tag: "Nullifier", values: readonly [u64, string]};


export interface ClaimRecord {
  fee: i128;
  market_id: u64;
  payout: i128;
  predicted_high: i128;
  predicted_low: i128;
  wallet: string;
}


export interface MarketStats {
  claimed_count: u32;
  claimed_pool: i128;
  fee_collected: i128;
  loser_count: u32;
  sealed_count: u32;
  total_pool: i128;
  winner_count: u32;
}


export interface CommitmentRecord {
  claimed: boolean;
  commitment_hash: Buffer;
  encrypted_blob: Buffer;
  market_id: u64;
  stake: i128;
  wallet: string;
}

export interface Client {
  /**
   * Construct and simulate a claim transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  claim: ({wallet, market_id, predicted_low, predicted_high, multiplier_tier}: {wallet: string, market_id: u64, predicted_low: i128, predicted_high: i128, multiplier_tier: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a commit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  commit: ({wallet, market_id, commitment_hash, encrypted_blob, stake}: {wallet: string, market_id: u64, commitment_hash: Buffer, encrypted_blob: Buffer, stake: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a fund_pool transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  fund_pool: ({funder, market_id, amount}: {funder: string, market_id: u64, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_claim transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_claim: ({market_id, wallet}: {market_id: u64, wallet: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<ClaimRecord>>>

  /**
   * Construct and simulate a get_market transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_market: ({market_id}: {market_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Market>>>

  /**
   * Construct and simulate a create_market transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  create_market: ({admin, market_id, max_range_width, max_multiplier, min_stake, treasury_address, resolver_address}: {admin: string, market_id: u64, max_range_width: u64, max_multiplier: u32, min_stake: i128, treasury_address: string, resolver_address: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a settle_market transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  settle_market: ({resolver, market_id, actual_value}: {resolver: string, market_id: u64, actual_value: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a claim_winnings transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  claim_winnings: ({wallet, market_id, predicted_low, predicted_high, salt, submitted_commitment}: {wallet: string, market_id: u64, predicted_low: i128, predicted_high: i128, salt: Buffer, submitted_commitment: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a get_commitment transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_commitment: ({market_id, wallet}: {market_id: u64, wallet: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<CommitmentRecord>>>

  /**
   * Construct and simulate a get_market_stats transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_market_stats: ({market_id}: {market_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<MarketStats>>>

  /**
   * Construct and simulate a get_pool_balance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_pool_balance: ({market_id}: {market_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a commit_prediction transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  commit_prediction: ({wallet, market_id, commitment_hash, encrypted_blob, stake}: {wallet: string, market_id: u64, commitment_hash: Buffer, encrypted_blob: Buffer, stake: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a is_nullifier_used transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  is_nullifier_used: ({market_id, wallet}: {market_id: u64, wallet: string}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {admin, xlm_token}: {admin: string, xlm_token: string},
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({admin, xlm_token}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAAEAAAAAAAAAASQWxyZWFkeUluaXRpYWxpemVkAAAAAAABAAAAAAAAAAxNYXJrZXRFeGlzdHMAAAACAAAAAAAAAA1NYXJrZXRNaXNzaW5nAAAAAAAAAwAAAAAAAAAOTWFya2V0SW5hY3RpdmUAAAAAAAQAAAAAAAAAE0R1cGxpY2F0ZUNvbW1pdG1lbnQAAAAABQAAAAAAAAAMSW52YWxpZFN0YWtlAAAABgAAAAAAAAALUG9vbE1pc3NpbmcAAAAABwAAAAAAAAAOQWxyZWFkeVNldHRsZWQAAAAAAAgAAAAAAAAACk5vdFNldHRsZWQAAAAAAAkAAAAAAAAADkFscmVhZHlDbGFpbWVkAAAAAAAKAAAAAAAAAAlSYW5nZU1pc3MAAAAAAAALAAAAAAAAAAxJbnZhbGlkUmFuZ2UAAAAMAAAAAAAAABFJbnZhbGlkQ29tbWl0bWVudAAAAAAAAA0AAAAAAAAAEEluc3VmZmljaWVudFBvb2wAAAAOAAAAAAAAAA1CZWxvd01pblN0YWtlAAAAAAAADwAAAAAAAAAUVW5hdXRob3JpemVkUmVzb2x2ZXIAAAAQ",
        "AAAAAQAAAAAAAAAAAAAABk1hcmtldAAAAAAAEAAAAAAAAAAGYWN0aXZlAAAAAAABAAAAAAAAAAxhY3R1YWxfdmFsdWUAAAALAAAAAAAAAA1jbGFpbWVkX2NvdW50AAAAAAAABAAAAAAAAAAMY2xhaW1lZF9wb29sAAAACwAAAAAAAAANZmVlX2NvbGxlY3RlZAAAAAAAAAsAAAAAAAAAAmlkAAAAAAAGAAAAAAAAAAtsb3Nlcl9jb3VudAAAAAAEAAAAAAAAAA5tYXhfbXVsdGlwbGllcgAAAAAABAAAAAAAAAAPbWF4X3JhbmdlX3dpZHRoAAAAAAYAAAAAAAAACW1pbl9zdGFrZQAAAAAAAAsAAAAAAAAAEHJlc29sdmVyX2FkZHJlc3MAAAATAAAAAAAAAAxzZWFsZWRfY291bnQAAAAEAAAAAAAAAAdzZXR0bGVkAAAAAAEAAAAAAAAACnRvdGFsX3Bvb2wAAAAAAAsAAAAAAAAAEHRyZWFzdXJ5X2FkZHJlc3MAAAATAAAAAAAAAAx3aW5uZXJfY291bnQAAAAE",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABgAAAAAAAAAAAAAABUFkbWluAAAAAAAAAAAAAAAAAAAIWGxtVG9rZW4AAAABAAAAAAAAAAZNYXJrZXQAAAAAAAEAAAAGAAAAAQAAAAAAAAAKQ29tbWl0bWVudAAAAAAAAgAAAAYAAAATAAAAAQAAAAAAAAAFQ2xhaW0AAAAAAAACAAAABgAAABMAAAABAAAAAAAAAAlOdWxsaWZpZXIAAAAAAAACAAAABgAAABM=",
        "AAAAAQAAAAAAAAAAAAAAC0NsYWltUmVjb3JkAAAAAAYAAAAAAAAAA2ZlZQAAAAALAAAAAAAAAAltYXJrZXRfaWQAAAAAAAAGAAAAAAAAAAZwYXlvdXQAAAAAAAsAAAAAAAAADnByZWRpY3RlZF9oaWdoAAAAAAALAAAAAAAAAA1wcmVkaWN0ZWRfbG93AAAAAAAACwAAAAAAAAAGd2FsbGV0AAAAAAAT",
        "AAAAAQAAAAAAAAAAAAAAC01hcmtldFN0YXRzAAAAAAcAAAAAAAAADWNsYWltZWRfY291bnQAAAAAAAAEAAAAAAAAAAxjbGFpbWVkX3Bvb2wAAAALAAAAAAAAAA1mZWVfY29sbGVjdGVkAAAAAAAACwAAAAAAAAALbG9zZXJfY291bnQAAAAABAAAAAAAAAAMc2VhbGVkX2NvdW50AAAABAAAAAAAAAAKdG90YWxfcG9vbAAAAAAACwAAAAAAAAAMd2lubmVyX2NvdW50AAAABA==",
        "AAAAAQAAAAAAAAAAAAAAEENvbW1pdG1lbnRSZWNvcmQAAAAGAAAAAAAAAAdjbGFpbWVkAAAAAAEAAAAAAAAAD2NvbW1pdG1lbnRfaGFzaAAAAAPuAAAAIAAAAAAAAAAOZW5jcnlwdGVkX2Jsb2IAAAAAAA4AAAAAAAAACW1hcmtldF9pZAAAAAAAAAYAAAAAAAAABXN0YWtlAAAAAAAACwAAAAAAAAAGd2FsbGV0AAAAAAAT",
        "AAAAAAAAAAAAAAAFY2xhaW0AAAAAAAAFAAAAAAAAAAZ3YWxsZXQAAAAAABMAAAAAAAAACW1hcmtldF9pZAAAAAAAAAYAAAAAAAAADXByZWRpY3RlZF9sb3cAAAAAAAALAAAAAAAAAA5wcmVkaWN0ZWRfaGlnaAAAAAAACwAAAAAAAAAPbXVsdGlwbGllcl90aWVyAAAAAAQAAAABAAAD6QAAAAsAAAAD",
        "AAAAAAAAAAAAAAAGY29tbWl0AAAAAAAFAAAAAAAAAAZ3YWxsZXQAAAAAABMAAAAAAAAACW1hcmtldF9pZAAAAAAAAAYAAAAAAAAAD2NvbW1pdG1lbnRfaGFzaAAAAAPuAAAAIAAAAAAAAAAOZW5jcnlwdGVkX2Jsb2IAAAAAAA4AAAAAAAAABXN0YWtlAAAAAAAACwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAAJZnVuZF9wb29sAAAAAAAAAwAAAAAAAAAGZnVuZGVyAAAAAAATAAAAAAAAAAltYXJrZXRfaWQAAAAAAAAGAAAAAAAAAAZhbW91bnQAAAAAAAsAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAAAAAAAJZ2V0X2NsYWltAAAAAAAAAgAAAAAAAAAJbWFya2V0X2lkAAAAAAAABgAAAAAAAAAGd2FsbGV0AAAAAAATAAAAAQAAA+kAAAfQAAAAC0NsYWltUmVjb3JkAAAAAAM=",
        "AAAAAAAAAAAAAAAKZ2V0X21hcmtldAAAAAAAAQAAAAAAAAAJbWFya2V0X2lkAAAAAAAABgAAAAEAAAPpAAAH0AAAAAZNYXJrZXQAAAAAAAM=",
        "AAAAAAAAAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAIAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAJeGxtX3Rva2VuAAAAAAAAEwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAANY3JlYXRlX21hcmtldAAAAAAAAAcAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAJbWFya2V0X2lkAAAAAAAABgAAAAAAAAAPbWF4X3JhbmdlX3dpZHRoAAAAAAYAAAAAAAAADm1heF9tdWx0aXBsaWVyAAAAAAAEAAAAAAAAAAltaW5fc3Rha2UAAAAAAAALAAAAAAAAABB0cmVhc3VyeV9hZGRyZXNzAAAAEwAAAAAAAAAQcmVzb2x2ZXJfYWRkcmVzcwAAABMAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAAAAAAANc2V0dGxlX21hcmtldAAAAAAAAAMAAAAAAAAACHJlc29sdmVyAAAAEwAAAAAAAAAJbWFya2V0X2lkAAAAAAAABgAAAAAAAAAMYWN0dWFsX3ZhbHVlAAAACwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAAOY2xhaW1fd2lubmluZ3MAAAAAAAYAAAAAAAAABndhbGxldAAAAAAAEwAAAAAAAAAJbWFya2V0X2lkAAAAAAAABgAAAAAAAAANcHJlZGljdGVkX2xvdwAAAAAAAAsAAAAAAAAADnByZWRpY3RlZF9oaWdoAAAAAAALAAAAAAAAAARzYWx0AAAD7gAAACAAAAAAAAAAFHN1Ym1pdHRlZF9jb21taXRtZW50AAAD7gAAACAAAAABAAAD6QAAAAsAAAAD",
        "AAAAAAAAAAAAAAAOZ2V0X2NvbW1pdG1lbnQAAAAAAAIAAAAAAAAACW1hcmtldF9pZAAAAAAAAAYAAAAAAAAABndhbGxldAAAAAAAEwAAAAEAAAPpAAAH0AAAABBDb21taXRtZW50UmVjb3JkAAAAAw==",
        "AAAAAAAAAAAAAAAQZ2V0X21hcmtldF9zdGF0cwAAAAEAAAAAAAAACW1hcmtldF9pZAAAAAAAAAYAAAABAAAD6QAAB9AAAAALTWFya2V0U3RhdHMAAAAAAw==",
        "AAAAAAAAAAAAAAAQZ2V0X3Bvb2xfYmFsYW5jZQAAAAEAAAAAAAAACW1hcmtldF9pZAAAAAAAAAYAAAABAAAD6QAAAAsAAAAD",
        "AAAAAAAAAAAAAAARY29tbWl0X3ByZWRpY3Rpb24AAAAAAAAFAAAAAAAAAAZ3YWxsZXQAAAAAABMAAAAAAAAACW1hcmtldF9pZAAAAAAAAAYAAAAAAAAAD2NvbW1pdG1lbnRfaGFzaAAAAAPuAAAAIAAAAAAAAAAOZW5jcnlwdGVkX2Jsb2IAAAAAAA4AAAAAAAAABXN0YWtlAAAAAAAACwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAARaXNfbnVsbGlmaWVyX3VzZWQAAAAAAAACAAAAAAAAAAltYXJrZXRfaWQAAAAAAAAGAAAAAAAAAAZ3YWxsZXQAAAAAABMAAAABAAAAAQ==" ]),
      options
    )
  }
  public readonly fromJSON = {
    claim: this.txFromJSON<Result<i128>>,
        commit: this.txFromJSON<Result<void>>,
        fund_pool: this.txFromJSON<Result<void>>,
        get_claim: this.txFromJSON<Result<ClaimRecord>>,
        get_market: this.txFromJSON<Result<Market>>,
        create_market: this.txFromJSON<Result<void>>,
        settle_market: this.txFromJSON<Result<void>>,
        claim_winnings: this.txFromJSON<Result<i128>>,
        get_commitment: this.txFromJSON<Result<CommitmentRecord>>,
        get_market_stats: this.txFromJSON<Result<MarketStats>>,
        get_pool_balance: this.txFromJSON<Result<i128>>,
        commit_prediction: this.txFromJSON<Result<void>>,
        is_nullifier_used: this.txFromJSON<boolean>
  }
}
