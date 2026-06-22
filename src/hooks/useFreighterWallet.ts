import { getAddress, getNetwork, isConnected, requestAccess, signMessage, signTransaction } from "@stellar/freighter-api";
import { useCallback, useEffect, useState } from "react";

import { createWalletError, validateFreighterNetwork, type WalletError } from "@/lib/wallet";
import { normalizeSignedMessage } from "@/lib/encryption-error";
import { DERIVATION_MESSAGE } from "@/lib/crypto/prediction-encryption";

export type WalletStatus = "idle" | "checking" | "connecting" | "connected" | "error";

export type FreighterWalletState = {
  status: WalletStatus;
  address: string | null;
  network: string | null;
  networkPassphrase: string | null;
  error: WalletError | null;
};

const initialState: FreighterWalletState = {
  status: "idle",
  address: null,
  network: null,
  networkPassphrase: null,
  error: null,
};

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }

  return "Freighter could not connect. Try again from the wallet extension.";
}

export function useFreighterWallet() {
  const [state, setState] = useState<FreighterWalletState>(initialState);

  const loadAuthorizedWallet = useCallback(async () => {
    setState((current) => ({ ...current, status: "checking", error: null }));

    const connection = await isConnected();

    if (connection.error || !connection.isConnected) {
      setState({
        ...initialState,
        status: "error",
        error: createWalletError("missing_freighter", "Install Freighter to connect a Stellar testnet wallet."),
      });
      return;
    }

    const addressResult = await getAddress();

    if (addressResult.error || !addressResult.address) {
      setState(initialState);
      return;
    }

    const networkResult = await getNetwork();

    if (networkResult.error) {
      setState({
        ...initialState,
        status: "error",
        error: createWalletError("unknown", networkResult.error.message),
      });
      return;
    }

    const networkError = validateFreighterNetwork(networkResult);

    setState({
      status: networkError ? "error" : "connected",
      address: addressResult.address,
      network: networkResult.network,
      networkPassphrase: networkResult.networkPassphrase,
      error: networkError,
    });
  }, []);

  useEffect(() => {
    void loadAuthorizedWallet();
  }, [loadAuthorizedWallet]);

  const connect = useCallback(async () => {
    setState((current) => ({ ...current, status: "connecting", error: null }));

    try {
      const connection = await isConnected();

      if (connection.error || !connection.isConnected) {
        const walletError = createWalletError("missing_freighter", "Install Freighter wallet to predict");
        setState({
          ...initialState,
          status: "error",
          error: walletError,
        });
        throw new Error(walletError.message);
      }

      const access = await requestAccess();

      if (access.error || !access.address) {
        const walletError = createWalletError("access_rejected", access.error?.message ?? "Freighter access was rejected.");
        setState({
          ...initialState,
          status: "error",
          error: walletError,
        });
        throw new Error(walletError.message);
      }

      const networkResult = await getNetwork();

      if (networkResult.error) {
        const walletError = createWalletError("unknown", networkResult.error.message);
        setState({
          ...initialState,
          status: "error",
          error: walletError,
        });
        throw new Error(walletError.message);
      }

      const networkError = validateFreighterNetwork(networkResult);

      setState({
        status: networkError ? "error" : "connected",
        address: access.address,
        network: networkResult.network,
        networkPassphrase: networkResult.networkPassphrase,
        error: networkError,
      });

      if (networkError) {
        throw new Error("Switch Freighter to Stellar testnet");
      }

      return access.address;
    } catch (error) {
      const message = errorMessage(error);
      setState({
        ...initialState,
        status: "error",
        error: createWalletError(
          /install freighter/i.test(message)
            ? "missing_freighter"
            : /switch freighter|testnet/i.test(message)
              ? "wrong_network"
              : /reject/i.test(message)
                ? "access_rejected"
                : "unknown",
          message,
        ),
      });
      throw error instanceof Error ? error : new Error(message);
    }
  }, []);

  const disconnect = useCallback(() => {
    setState(initialState);
  }, []);

  const signEncryptionMessage = useCallback(async () => {
    let address = state.address;
    let networkPassphrase = state.networkPassphrase;

    if (!address || !networkPassphrase) {
      const addressResult = await getAddress();
      const networkResult = await getNetwork();

      address = addressResult.address || null;
      networkPassphrase = networkResult.networkPassphrase || null;
    }

    if (!address || !networkPassphrase) {
      throw createWalletError("access_rejected", "Connect Freighter before signing.");
    }

    const result = await signMessage(DERIVATION_MESSAGE, {
      address,
      networkPassphrase,
    });

    if (result.error) {
      throw createWalletError("access_rejected", result.error.message);
    }

    return normalizeSignedMessage(result.signedMessage);
  }, [state.address, state.networkPassphrase]);

  const signSorobanTransaction = useCallback(
    async (xdr: string, options?: { networkPassphrase?: string; address?: string }) => {
      let address = options?.address ?? state.address;
      let networkPassphrase = options?.networkPassphrase ?? state.networkPassphrase;

      if (!address || !networkPassphrase) {
        const addressResult = await getAddress();
        const networkResult = await getNetwork();

        address = addressResult.address || null;
        networkPassphrase = networkResult.networkPassphrase || null;
      }

      if (!address || !networkPassphrase) {
        throw createWalletError("access_rejected", "Connect Freighter before signing.");
      }

      const result = await signTransaction(xdr, {
        networkPassphrase,
        address,
      });

      if (result.error) {
        throw createWalletError("access_rejected", result.error.message);
      }

      return result;
    },
    [state.address, state.networkPassphrase],
  );

  return {
    ...state,
    connect,
    disconnect,
    signEncryptionMessage,
    signSorobanTransaction,
  };
}
