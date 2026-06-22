import assert from "node:assert/strict";
import test from "node:test";

import { STELLAR_TESTNET } from "./stellar-network.ts";
import { formatWalletAddress, validateFreighterNetwork } from "./wallet.ts";

test("accepts Stellar testnet passphrase", () => {
  const result = validateFreighterNetwork({
    network: "TESTNET",
    networkPassphrase: STELLAR_TESTNET.networkPassphrase,
  });

  assert.equal(result, null);
});

test("rejects non-testnet passphrase as wallet_error", () => {
  const result = validateFreighterNetwork({
    network: "PUBLIC",
    networkPassphrase: "Public Global Stellar Network ; September 2015",
  });

  assert.equal(result?.code, "wallet_error");
  assert.equal(result?.reason, "wrong_network");
});

test("formats long wallet addresses", () => {
  assert.equal(formatWalletAddress("GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890"), "GABCD...67890");
});
