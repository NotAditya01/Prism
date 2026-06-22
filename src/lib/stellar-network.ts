export const STELLAR_TESTNET = {
  network: "TESTNET",
  networkPassphrase: "Test SDF Network ; September 2015",
  horizonUrl: "https://horizon-testnet.stellar.org",
  rpcUrl: "https://soroban-testnet.stellar.org",
} as const;

type HorizonAccountBalance = {
  asset_type: string;
  balance: string;
};

type HorizonAccountResponse = {
  balances?: HorizonAccountBalance[];
};

export async function getNativeXlmBalance(address: string, fetchImpl: typeof fetch = fetch): Promise<number> {
  const response = await fetchImpl(`${STELLAR_TESTNET.horizonUrl}/accounts/${address}`, {
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    if (response.status === 404) return 0;
    throw new Error(`Unable to load wallet balance: ${response.status} ${response.statusText}`);
  }

  const account = (await response.json()) as HorizonAccountResponse;
  const nativeBalance = account.balances?.find((balance) => balance.asset_type === "native");
  const value = Number(nativeBalance?.balance ?? 0);
  if (!Number.isFinite(value)) throw new Error("Wallet returned an invalid XLM balance");
  return value;
}
