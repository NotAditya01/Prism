export type WalletErrorCode = "wallet_error";

export type WalletErrorReason = "missing_freighter" | "access_rejected" | "wrong_network" | "unknown";

export type WalletError = {
  code: WalletErrorCode;
  reason: WalletErrorReason;
  message: string;
};

export type FreighterNetworkState = {
  network: string;
  networkPassphrase: string;
};

const STELLAR_TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";

export function createWalletError(reason: WalletErrorReason, message: string): WalletError {
  return {
    code: "wallet_error",
    reason,
    message,
  };
}

export function validateFreighterNetwork(network: FreighterNetworkState): WalletError | null {
  if (network.networkPassphrase !== STELLAR_TESTNET_PASSPHRASE) {
    return createWalletError(
      "wrong_network",
      `Switch Freighter to Stellar testnet before continuing. Current network: ${network.network || "unknown"}.`,
    );
  }

  return null;
}

export function formatWalletAddress(address: string): string {
  if (address.length <= 12) {
    return address;
  }

  return `${address.slice(0, 5)}...${address.slice(-5)}`;
}
