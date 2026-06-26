export const NETWORK_CONFIG = {
  contractId: import.meta.env.VITE_CONTRACT_ID ?? "CBUPR4BIQF7PON277VHOBWKQBGJTB6UW23C36GDXMXEKLPBXUCC2KODO",
  marketId: 3003,
  network: "testnet",
  horizonUrl: "https://horizon-testnet.stellar.org",
  rpcUrl: "https://soroban-testnet.stellar.org",
  maxRangeWidth: 1000,
  maxMultiplier: 10,
  minStakeXlm: 5,
  treasuryAddress: import.meta.env.VITE_TREASURY_ADDRESS ?? "GDYC2AUKPBCFS24PIUYXUWPYL46QIQCELNUPTXA6B4SNNNTQJM2BBVP7",
} as const;
