export type PayoutTier = {
  id: 1 | 2 | 3 | 4;
  label: string;
  maxWidth: string;
  multiplier: number;
  payout: string;
};

export type PayoutPreview =
  | {
      status: "valid";
      width: string;
      tier: PayoutTier;
    }
  | {
      status: "invalid";
      width: string | null;
      reason: string;
    };

function parseDecimalString(value: string, fieldName: string): bigint {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${fieldName} must be a decimal string`);
  }

  return BigInt(value);
}

export function calculatePayoutPreview(low: string, high: string, tiers: PayoutTier[]): PayoutPreview {
  try {
    const lowValue = parseDecimalString(low, "low");
    const highValue = parseDecimalString(high, "high");

    if (highValue <= lowValue) {
      return {
        status: "invalid",
        width: null,
        reason: "High must be greater than low",
      };
    }

    const width = highValue - lowValue;
    const tier = [...tiers]
      .sort((left, right) => Number(BigInt(left.maxWidth) - BigInt(right.maxWidth)))
      .find((candidate) => width <= BigInt(candidate.maxWidth));

    if (!tier) {
      return {
        status: "invalid",
        width: width.toString(),
        reason: "Range is wider than the market maximum",
      };
    }

    return {
      status: "valid",
      width: width.toString(),
      tier,
    };
  } catch (error) {
    return {
      status: "invalid",
      width: null,
      reason: error instanceof Error ? error.message : "Invalid range",
    };
  }
}
