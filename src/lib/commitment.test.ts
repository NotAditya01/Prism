import assert from "node:assert/strict";
import test from "node:test";

import { createPredictionCommitment, generatePredictionSalt } from "./commitment.ts";

test("generates decimal salt", () => {
  const salt = generatePredictionSalt();

  assert.match(salt, /^\d+$/);
  assert.notEqual(salt, "0");
});

test("creates deterministic Poseidon commitments", async () => {
  const input = {
    low: "1000",
    high: "1125",
    salt: "999999999",
    marketId: "1001",
  };

  const first = await createPredictionCommitment(input);
  const second = await createPredictionCommitment(input);

  assert.equal(first.commitment, second.commitment);
  assert.deepEqual(first.inputs, ["1000", "1125", "999999999", "1001"]);
});

test("binds commitment to market id", async () => {
  const base = {
    low: "1000",
    high: "1125",
    salt: "999999999",
  };

  const first = await createPredictionCommitment({ ...base, marketId: "1001" });
  const second = await createPredictionCommitment({ ...base, marketId: "1002" });

  assert.notEqual(first.commitment, second.commitment);
});
