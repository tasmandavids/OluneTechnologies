import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { requireSecret } from "@/lib/env/required-secret";

// Same AES-256-GCM envelope as lib/email/crypto.ts and lib/advertising/crypto.ts,
// over an arbitrary JSON record instead of a provider-specific shape — the
// generic studio_integrations table stores whatever fields a provider's form
// declares in the catalog.
const ALGO = "aes-256-gcm";

export type IntegrationSecrets = Record<string, string>;

function encryptionKey(): Buffer {
  const secret = requireSecret(
    "INTEGRATIONS_TOKEN_ENCRYPTION_KEY",
    process.env.EMAIL_TOKEN_ENCRYPTION_KEY ?? process.env.CRON_SECRET,
  );
  return createHash("sha256").update(secret).digest();
}

export function encryptIntegrationSecrets(secrets: IntegrationSecrets): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, encryptionKey(), iv);
  const payload = Buffer.from(JSON.stringify(secrets), "utf8");
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptIntegrationSecrets(blob: string): IntegrationSecrets {
  const raw = Buffer.from(blob, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = createDecipheriv(ALGO, encryptionKey(), iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8")) as IntegrationSecrets;
}

/**
 * Last 4 characters of a secret, for showing "•••• a21f" in the UI without
 * ever sending the value itself to the browser.
 */
export function secretTail(value: string): string {
  const trimmed = value.trim();
  return trimmed.length <= 4 ? "••••" : trimmed.slice(-4);
}
