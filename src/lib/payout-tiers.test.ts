import assert from "node:assert/strict";
import test from "node:test";

import { calculatePayoutPreview, type PayoutTier } from "./payout-tiers.ts";

const tiers: PayoutTier[] = [
  { id: 4, label: "Tier 4", maxWidth: "100", multiplier: 4, payout: "40 XLM" },
  { id: 3, label: "Tier 3", maxWidth: "250", multiplier: 3, payout: "30 XLM" },
  { id: 2, label: "Tier 2", maxWidth: "500", multiplier: 2, payout: "20 XLM" },
  { id: 1, label: "Tier 1", maxWidth: "1000", multiplier: 1, payout: "10 XLM" },
];

test("returns the tightest matching tier", () => {
  const preview = calculatePayoutPreview("1000", "1100", tiers);

  assert.equal(preview.status, "valid");
  assert.equal(preview.status === "valid" ? preview.tier.id : null, 4);
  assert.equal(preview.width, "100");
});

test("returns lower tier when width crosses tight threshold", () => {
  const preview = calculatePayoutPreview("1000", "1125", tiers);

  assert.equal(preview.status, "valid");
  assert.equal(preview.status === "valid" ? preview.tier.id : null, 3);
});

test("rejects inverted ranges", () => {
  const preview = calculatePayoutPreview("1200", "1100", tiers);

  assert.equal(preview.status, "invalid");
});

test("rejects ranges wider than maximum tier", () => {
  const preview = calculatePayoutPreview("1000", "2501", tiers);

  assert.equal(preview.status, "invalid");
  assert.equal(preview.width, "1501");
});
