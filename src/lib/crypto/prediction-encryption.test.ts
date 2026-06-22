import assert from "node:assert/strict";
import test from "node:test";

import {
  DERIVATION_MESSAGE,
  PREDICTION_BLOB_VERSION,
  decryptPredictionBlob,
  encryptPredictionBlob,
} from "./prediction-encryption.ts";

const sampleBlob = {
  version: PREDICTION_BLOB_VERSION,
  marketId: "xlm-payments-10m",
  low: "PRISM_LOW_SENTINEL_1500000000001",
  high: "PRISM_HIGH_SENTINEL_2500000000002",
  salt: "PRISM_SALT_SENTINEL_12345678901234567890",
  createdAt: "2026-06-14T00:00:00.000Z",
};

test("uses the fixed Freighter derivation message", () => {
  assert.equal(DERIVATION_MESSAGE, "prism-encryption-v1");
});

test("encrypts and decrypts a prediction blob from the same signature", async () => {
  const signature = "GDUZQJ6SAMPLE_SIGNATURE_FROM_FREIGHTER";

  const encrypted = await encryptPredictionBlob(sampleBlob, signature);
  const decrypted = await decryptPredictionBlob(encrypted, signature);

  assert.deepEqual(decrypted, sampleBlob);
});

test("does not leak low high or salt in encrypted payload", async () => {
  const encrypted = await encryptPredictionBlob(sampleBlob, "same-signature");
  const serialized = JSON.stringify(encrypted);

  assert.equal(serialized.includes(sampleBlob.low), false);
  assert.equal(serialized.includes(sampleBlob.high), false);
  assert.equal(serialized.includes(sampleBlob.salt), false);
});

test("fails to decrypt with a different signature", async () => {
  const encrypted = await encryptPredictionBlob(sampleBlob, "correct-signature");

  await assert.rejects(
    () => decryptPredictionBlob(encrypted, "wrong-signature"),
    /decrypt prediction blob/i,
  );
});
