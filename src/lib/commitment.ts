export type CommitmentInput = {
  low: string;
  high: string;
  salt: string;
  marketId: string;
};

export type PredictionCommitment = {
  commitment: string;
  inputs: [string, string, string, string];
};

type Poseidon = {
  (inputs: Array<bigint | string | number>): unknown;
  F: {
    toString(value: unknown): string;
  };
};

let poseidonPromise: Promise<Poseidon> | null = null;

function getPoseidon() {
  poseidonPromise ??= import("circomlibjs").then((module) => module.buildPoseidonOpt());

  return poseidonPromise;
}

function parseDecimalString(value: string, fieldName: string): bigint {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${fieldName} must be a decimal string`);
  }

  return BigInt(value);
}

export function generatePredictionSalt(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);

  let value = 0n;
  for (const byte of bytes) {
    value = (value << 8n) + BigInt(byte);
  }

  return value.toString();
}

export async function createPredictionCommitment(input: CommitmentInput): Promise<PredictionCommitment> {
  const orderedInputs: [string, string, string, string] = [input.low, input.high, input.salt, input.marketId];
  const poseidon = await getPoseidon();
  const hash = poseidon(orderedInputs.map((value, index) => parseDecimalString(value, `commitment input ${index}`)));

  return {
    commitment: poseidon.F.toString(hash),
    inputs: orderedInputs,
  };
}
