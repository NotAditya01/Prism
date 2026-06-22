import assert from "node:assert/strict";
import test from "node:test";

import { createEncryptionError, normalizeSignedMessage } from "./encryption-error.ts";

test("creates typed encryption errors", () => {
  const error = createEncryptionError("wallet_not_connected", "Connect Freighter first.");

  assert.equal(error.code, "encryption_error");
  assert.equal(error.reason, "wallet_not_connected");
});

test("normalizes string signatures", () => {
  assert.equal(normalizeSignedMessage("signed-message"), "signed-message");
});

test("normalizes byte signatures", () => {
  assert.equal(normalizeSignedMessage(new Uint8Array([1, 2, 3])), "AQID");
});

test("rejects empty signatures", () => {
  assert.throws(
    () => normalizeSignedMessage(null),
    (error) =>
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "encryption_error" &&
      "reason" in error &&
      error.reason === "signature_rejected",
  );
});
