pragma circom 2.1.6;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

template RangeMarket() {
    // Private inputs
    signal input predicted_low;
    signal input predicted_high;
    signal input salt;

    // Public inputs: preserve this order for contract/verifier integration.
    signal input commitment;
    signal input actual_value;
    signal input market_id;
    signal input multiplier_tier;

    signal width;
    signal tier4;
    signal tier3;
    signal tier2;
    signal tier1;

    component hasher = Poseidon(4);
    hasher.inputs[0] <== predicted_low;
    hasher.inputs[1] <== predicted_high;
    hasher.inputs[2] <== salt;
    hasher.inputs[3] <== market_id;
    commitment === hasher.out;

    component actualGteLow = GreaterEqThan(64);
    actualGteLow.in[0] <== actual_value;
    actualGteLow.in[1] <== predicted_low;
    actualGteLow.out === 1;

    component highGteActual = GreaterEqThan(64);
    highGteActual.in[0] <== predicted_high;
    highGteActual.in[1] <== actual_value;
    highGteActual.out === 1;

    component highGtLow = GreaterThan(64);
    highGtLow.in[0] <== predicted_high;
    highGtLow.in[1] <== predicted_low;
    highGtLow.out === 1;

    width <== predicted_high - predicted_low;

    component isTier4 = IsEqual();
    isTier4.in[0] <== multiplier_tier;
    isTier4.in[1] <== 4;
    tier4 <== isTier4.out;

    component isTier3 = IsEqual();
    isTier3.in[0] <== multiplier_tier;
    isTier3.in[1] <== 3;
    tier3 <== isTier3.out;

    component isTier2 = IsEqual();
    isTier2.in[0] <== multiplier_tier;
    isTier2.in[1] <== 2;
    tier2 <== isTier2.out;

    component isTier1 = IsEqual();
    isTier1.in[0] <== multiplier_tier;
    isTier1.in[1] <== 1;
    tier1 <== isTier1.out;

    tier4 + tier3 + tier2 + tier1 === 1;

    component tier4Max = LessEqThan(64);
    tier4Max.in[0] <== width;
    tier4Max.in[1] <== 100;

    component tier3Max = LessEqThan(64);
    tier3Max.in[0] <== width;
    tier3Max.in[1] <== 250;

    component tier2Max = LessEqThan(64);
    tier2Max.in[0] <== width;
    tier2Max.in[1] <== 500;

    component tier1Max = LessEqThan(64);
    tier1Max.in[0] <== width;
    tier1Max.in[1] <== 1000;

    tier4 * (tier4Max.out - 1) === 0;
    tier3 * (tier3Max.out - 1) === 0;
    tier2 * (tier2Max.out - 1) === 0;
    tier1 * (tier1Max.out - 1) === 0;
}

component main { public [commitment, actual_value, market_id, multiplier_tier] } = RangeMarket();
