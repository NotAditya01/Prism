export type EncryptionError = {
  code: "encryption_error";
  reason: "wallet_not_connected" | "missing_commitment" | "signature_rejected" | "encryption_failed";
  message: string;
};

export function createEncryptionError(
  reason: EncryptionError["reason"],
  message: string,
): EncryptionError {
  return {
    code: "encryption_error",
    reason,
    message,
  };
}

export function normalizeSignedMessage(signedMessage: string | Uint8Array | null): string {
  if (typeof signedMessage === "string" && signedMessage.length > 0) {
    return signedMessage;
  }

  if (signedMessage instanceof Uint8Array && signedMessage.byteLength > 0) {
    let binary = "";

    for (const byte of signedMessage) {
      binary += String.fromCharCode(byte);
    }

    return btoa(binary);
  }

  throw createEncryptionError("signature_rejected", "Freighter did not return a signature.");
}
