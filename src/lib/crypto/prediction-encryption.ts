export const DERIVATION_MESSAGE = "prism-encryption-v1";
export const PREDICTION_BLOB_VERSION = "prism-prediction-v1";
export const ENCRYPTED_BLOB_VERSION = "prism-encrypted-prediction-v1";

const AES_GCM_IV_BYTES = 12;
const HKDF_SALT = "prism-hkdf-salt-v1";
const HKDF_INFO = "prism-prediction-blob-v1";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export type PredictionBlob = {
  version: typeof PREDICTION_BLOB_VERSION;
  marketId: string;
  low: string;
  high: string;
  salt: string;
  createdAt: string;
};

export type EncryptedPredictionBlob = {
  version: typeof ENCRYPTED_BLOB_VERSION;
  algorithm: "AES-GCM";
  kdf: "HKDF-SHA-256";
  derivationMessage: typeof DERIVATION_MESSAGE;
  iv: string;
  ciphertext: string;
  createdAt: string;
};

export type CreatePredictionBlobInput = {
  marketId: string;
  low: string;
  high: string;
  salt: string;
  createdAt?: string;
};

type EncryptPredictionBlobOptions = {
  iv?: Uint8Array;
};

function getCrypto(): Crypto {
  const cryptoApi = globalThis.crypto;

  if (!cryptoApi?.subtle || !cryptoApi.getRandomValues) {
    throw new Error("WebCrypto is required for prediction encryption");
  }

  return cryptoApi;
}

function encodeText(value: string): Uint8Array {
  return textEncoder.encode(value);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);

  return copy.buffer;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function assertNonEmptyString(value: unknown, fieldName: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Prediction blob ${fieldName} must be a non-empty string`);
  }
}

function validatePredictionBlob(blob: unknown): asserts blob is PredictionBlob {
  if (!blob || typeof blob !== "object") {
    throw new Error("Prediction blob must be an object");
  }

  const candidate = blob as Partial<PredictionBlob>;

  if (candidate.version !== PREDICTION_BLOB_VERSION) {
    throw new Error(`Prediction blob version must be ${PREDICTION_BLOB_VERSION}`);
  }

  assertNonEmptyString(candidate.marketId, "marketId");
  assertNonEmptyString(candidate.low, "low");
  assertNonEmptyString(candidate.high, "high");
  assertNonEmptyString(candidate.salt, "salt");
  assertNonEmptyString(candidate.createdAt, "createdAt");
}

function validateEncryptedPredictionBlob(encrypted: unknown): asserts encrypted is EncryptedPredictionBlob {
  if (!encrypted || typeof encrypted !== "object") {
    throw new Error("Encrypted prediction blob must be an object");
  }

  const candidate = encrypted as Partial<EncryptedPredictionBlob>;

  if (candidate.version !== ENCRYPTED_BLOB_VERSION) {
    throw new Error(`Encrypted prediction blob version must be ${ENCRYPTED_BLOB_VERSION}`);
  }

  if (candidate.algorithm !== "AES-GCM") {
    throw new Error("Encrypted prediction blob algorithm must be AES-GCM");
  }

  if (candidate.kdf !== "HKDF-SHA-256") {
    throw new Error("Encrypted prediction blob kdf must be HKDF-SHA-256");
  }

  if (candidate.derivationMessage !== DERIVATION_MESSAGE) {
    throw new Error(`Encrypted prediction blob derivation message must be ${DERIVATION_MESSAGE}`);
  }

  assertNonEmptyString(candidate.iv, "iv");
  assertNonEmptyString(candidate.ciphertext, "ciphertext");
  assertNonEmptyString(candidate.createdAt, "createdAt");
}

async function derivePredictionKey(signature: string): Promise<CryptoKey> {
  assertNonEmptyString(signature, "signature");

  const cryptoApi = getCrypto();
  const keyMaterial = await cryptoApi.subtle.importKey(
    "raw",
    toArrayBuffer(encodeText(signature)),
    "HKDF",
    false,
    ["deriveKey"],
  );

  return cryptoApi.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: toArrayBuffer(encodeText(HKDF_SALT)),
      info: toArrayBuffer(encodeText(HKDF_INFO)),
    },
    keyMaterial,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"],
  );
}

export function createPredictionBlob({
  marketId,
  low,
  high,
  salt,
  createdAt = new Date().toISOString(),
}: CreatePredictionBlobInput): PredictionBlob {
  const blob = {
    version: PREDICTION_BLOB_VERSION,
    marketId,
    low,
    high,
    salt,
    createdAt,
  };

  validatePredictionBlob(blob);

  return blob;
}

export async function encryptPredictionBlob(
  blob: PredictionBlob,
  signature: string,
  options: EncryptPredictionBlobOptions = {},
): Promise<EncryptedPredictionBlob> {
  validatePredictionBlob(blob);

  const cryptoApi = getCrypto();
  const key = await derivePredictionKey(signature);
  const iv = options.iv ?? cryptoApi.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
  const plaintext = encodeText(JSON.stringify(blob));
  const ciphertext = await cryptoApi.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(iv),
    },
    key,
    toArrayBuffer(plaintext),
  );

  return {
    version: ENCRYPTED_BLOB_VERSION,
    algorithm: "AES-GCM",
    kdf: "HKDF-SHA-256",
    derivationMessage: DERIVATION_MESSAGE,
    iv: bytesToBase64Url(iv),
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
    createdAt: new Date().toISOString(),
  };
}

export async function decryptPredictionBlob(
  encrypted: EncryptedPredictionBlob,
  signature: string,
): Promise<PredictionBlob> {
  try {
    validateEncryptedPredictionBlob(encrypted);

    const cryptoApi = getCrypto();
    const key = await derivePredictionKey(signature);
    const plaintext = await cryptoApi.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: toArrayBuffer(base64UrlToBytes(encrypted.iv)),
      },
      key,
      toArrayBuffer(base64UrlToBytes(encrypted.ciphertext)),
    );

    const blob = JSON.parse(textDecoder.decode(plaintext));

    validatePredictionBlob(blob);

    return blob;
  } catch (error) {
    throw new Error(`Unable to decrypt prediction blob: ${error instanceof Error ? error.message : String(error)}`);
  }
}
