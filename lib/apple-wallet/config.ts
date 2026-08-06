// ============================================================================
//  lib/apple-wallet/config.ts
//
//  Apple Wallet signing secrets, kept in their own module so a page that only
//  needs to know *whether* the feature is on doesn't drag passkit-generator
//  (and node-forge, and joi) into its server bundle.
//
//  Every value is optional: with none set, isAppleWalletConfigured() is false
//  and the portals simply never offer the button. Missing certificates are a
//  deployment state, not an error. See docs/APPLE_WALLET.md.
// ============================================================================

export type AppleWalletConfig = {
  passTypeIdentifier: string;
  teamIdentifier: string;
  wwdr: string;
  signerCert: string;
  signerKey: string;
  signerKeyPassphrase?: string;
};

/** PEMs are multi-line, which several secret stores mangle — accept base64 too. */
function readPem(name: string): string | null {
  const raw = process.env[name];
  if (!raw?.trim()) return null;
  if (raw.includes("-----BEGIN")) return raw.replace(/\\n/g, "\n");
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    return decoded.includes("-----BEGIN") ? decoded : null;
  } catch {
    return null;
  }
}

/** Null whenever any required secret is missing or malformed. */
export function appleWalletConfig(): AppleWalletConfig | null {
  const passTypeIdentifier = process.env.APPLE_WALLET_PASS_TYPE_ID?.trim();
  const teamIdentifier = process.env.APPLE_WALLET_TEAM_ID?.trim();
  const wwdr = readPem("APPLE_WALLET_WWDR_CERT");
  const signerCert = readPem("APPLE_WALLET_SIGNER_CERT");
  const signerKey = readPem("APPLE_WALLET_SIGNER_KEY");

  if (!passTypeIdentifier || !teamIdentifier || !wwdr || !signerCert || !signerKey) return null;

  return {
    passTypeIdentifier,
    teamIdentifier,
    wwdr,
    signerCert,
    signerKey,
    signerKeyPassphrase: process.env.APPLE_WALLET_SIGNER_KEY_PASSPHRASE?.trim() || undefined,
  };
}

export function isAppleWalletConfigured(): boolean {
  return appleWalletConfig() !== null;
}
