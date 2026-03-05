import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const hex = process.env.ONBOARDING_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("ONBOARDING_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)");
  }
  return Buffer.from(hex, "hex");
}

export function encryptSensitive(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString("base64");
}

export function decryptSensitive(ciphertext: string): string {
  const key = getKey();
  const combined = Buffer.from(ciphertext, "base64");
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

export function isEncrypted(value: string): boolean {
  if (!value) return false;
  if (value.includes(":") && value.length < 20) return false;
  try {
    const buf = Buffer.from(value, "base64");
    return buf.length > IV_LENGTH + AUTH_TAG_LENGTH;
  } catch {
    return false;
  }
}

export function decryptOrFallback(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!isEncrypted(value)) {
    return value;
  }
  try {
    return decryptSensitive(value);
  } catch {
    return value;
  }
}

export function maskSSN(value: string | null | undefined): string | null {
  if (!value) return null;
  const decrypted = decryptOrFallback(value);
  if (!decrypted) return null;
  const digits = decrypted.replace(/\D/g, "");
  if (digits.length >= 4) {
    return `***-**-${digits.slice(-4)}`;
  }
  if (decrypted.includes(":")) {
    return `***-**-${decrypted.split(":").pop()}`;
  }
  return `***-**-${decrypted.slice(-4)}`;
}

export function maskBankNumber(value: string | null | undefined): string | null {
  if (!value) return null;
  const decrypted = decryptOrFallback(value);
  if (!decrypted) return null;
  const digits = decrypted.replace(/\D/g, "");
  if (digits.length >= 4) {
    return `****${digits.slice(-4)}`;
  }
  if (decrypted.includes(":")) {
    return `****${decrypted.split(":").pop()}`;
  }
  return `****${decrypted.slice(-4)}`;
}
