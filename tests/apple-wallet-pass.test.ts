// ============================================================================
//  Apple Wallet check-in pass — signing, artwork and payload.
//
//  Signs against a throwaway self-signed pair generated at run time rather than
//  a committed fixture: no private key ever lands in the repo, and the test
//  still exercises the real passkit-generator + PKCS#7 path. iOS would reject
//  a pass signed this way, which is fine — what's under test is that we build
//  a well-formed, correctly-populated bundle, not Apple's trust chain.
// ============================================================================

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";

import { discPng, hexToRgb, isLightColor } from "@/lib/apple-wallet/png";

const ENV_KEYS = [
  "APPLE_WALLET_PASS_TYPE_ID",
  "APPLE_WALLET_TEAM_ID",
  "APPLE_WALLET_SIGNER_CERT",
  "APPLE_WALLET_SIGNER_KEY",
  "APPLE_WALLET_SIGNER_KEY_PASSPHRASE",
  "APPLE_WALLET_WWDR_CERT",
] as const;

const savedEnv = new Map<string, string | undefined>();
let workDir: string | null = null;

/** Walks a zip's local file headers. Enough for a .pkpass (a handful of small
 *  entries, no zip64, no encryption) — not a general-purpose zip reader. */
function readZipEntries(zip: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();
  let offset = 0;

  while (offset + 30 <= zip.length && zip.readUInt32LE(offset) === 0x04034b50) {
    const method = zip.readUInt16LE(offset + 8);
    const compressedSize = zip.readUInt32LE(offset + 18);
    const nameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);

    const name = zip.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
    const dataStart = offset + 30 + nameLength + extraLength;
    const data = zip.subarray(dataStart, dataStart + compressedSize);

    entries.set(name, method === 8 ? inflateRawSync(data) : data);
    offset = dataStart + compressedSize;
  }

  return entries;
}

function selfSigned(dir: string, name: string, cn: string) {
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048",
    "-keyout", join(dir, `${name}-key.pem`),
    "-out", join(dir, `${name}-cert.pem`),
    "-days", "1", "-nodes", "-subj", `/CN=${cn}`,
  ], { stdio: "ignore" });
}

beforeAll(() => {
  for (const key of ENV_KEYS) savedEnv.set(key, process.env[key]);

  workDir = mkdtempSync(join(tmpdir(), "olune-wallet-"));
  selfSigned(workDir, "wwdr", "Test WWDR");
  selfSigned(workDir, "signer", "Test Pass Signer");

  process.env.APPLE_WALLET_PASS_TYPE_ID = "pass.co.olune.checkin";
  process.env.APPLE_WALLET_TEAM_ID = "ABCDE12345";
  process.env.APPLE_WALLET_SIGNER_CERT = readFileSync(join(workDir, "signer-cert.pem"), "utf8");
  process.env.APPLE_WALLET_SIGNER_KEY = readFileSync(join(workDir, "signer-key.pem"), "utf8");
  // Deliberately base64 — covers the branch for secret stores that mangle newlines.
  process.env.APPLE_WALLET_WWDR_CERT = readFileSync(join(workDir, "wwdr-cert.pem")).toString("base64");
  delete process.env.APPLE_WALLET_SIGNER_KEY_PASSPHRASE;
});

afterAll(() => {
  for (const [key, value] of savedEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  if (workDir) rmSync(workDir, { recursive: true, force: true });
});

const CARD = {
  cardId: "11111111-2222-3333-4444-555555555555",
  cardToken: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  studentName: "Ada Lovelace",
  studioName: "Nova Dance Academy",
  brandColor: "#6B66C9",
  issuedAt: "2026-08-01T09:00:00Z",
};

describe("appleWalletConfig", () => {
  it("is configured once every secret is present", async () => {
    const { isAppleWalletConfigured, appleWalletConfig } = await import("@/lib/apple-wallet/config");
    expect(isAppleWalletConfigured()).toBe(true);
    // The base64-supplied WWDR must come back out as a usable PEM.
    expect(appleWalletConfig()?.wwdr).toContain("-----BEGIN CERTIFICATE-----");
  });

  it("goes dark rather than throwing when a secret is missing", async () => {
    const { isAppleWalletConfigured } = await import("@/lib/apple-wallet/config");
    const saved = process.env.APPLE_WALLET_SIGNER_KEY;
    delete process.env.APPLE_WALLET_SIGNER_KEY;
    expect(isAppleWalletConfigured()).toBe(false);
    process.env.APPLE_WALLET_SIGNER_KEY = saved;
  });

  it("rejects a value that decodes to something that isn't a PEM", async () => {
    const { isAppleWalletConfigured } = await import("@/lib/apple-wallet/config");
    const saved = process.env.APPLE_WALLET_WWDR_CERT;
    process.env.APPLE_WALLET_WWDR_CERT = "not-a-certificate";
    expect(isAppleWalletConfigured()).toBe(false);
    process.env.APPLE_WALLET_WWDR_CERT = saved;
  });
});

describe("buildCheckinPass", () => {
  it("produces a signed zip carrying the card token as its barcode", async () => {
    const { buildCheckinPass } = await import("@/lib/apple-wallet/pass");
    const pkpass = await buildCheckinPass(CARD);

    // Zip local-file-header magic.
    expect(pkpass.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));

    const entries = readZipEntries(pkpass);
    for (const name of [
      "pass.json",
      "manifest.json",
      "signature",
      "icon.png",
      "icon@2x.png",
      "icon@3x.png",
      "logo.png",
      "logo@2x.png",
    ]) {
      expect(entries.has(name)).toBe(true);
    }
    expect(entries.get("signature")!.length).toBeGreaterThan(0);

    // Every non-manifest, non-signature file must be listed in the manifest —
    // iOS rejects the pass outright otherwise.
    const manifest = JSON.parse(entries.get("manifest.json")!.toString("utf8"));
    for (const name of entries.keys()) {
      if (name === "manifest.json" || name === "signature") continue;
      expect(manifest[name]).toMatch(/^[a-f0-9]{40}$/);
    }

    const passJson = JSON.parse(entries.get("pass.json")!.toString("utf8"));
    expect(passJson.passTypeIdentifier).toBe("pass.co.olune.checkin");
    expect(passJson.teamIdentifier).toBe("ABCDE12345");
    expect(passJson.serialNumber).toBe(CARD.cardId);
    expect(passJson.organizationName).toBe(CARD.studioName);
    expect(passJson.backgroundColor).toBe("rgb(107, 102, 201)");
    expect(passJson.generic.primaryFields[0].value).toBe(CARD.studentName);
    expect(passJson.barcodes[0]).toMatchObject({
      format: "PKBarcodeFormatQR",
      message: CARD.cardToken,
    });

    // The whole point of the omission — see lib/apple-wallet/pass.ts.
    expect(passJson.nfc).toBeUndefined();
  });

  it("refuses to build when Apple Wallet isn't configured", async () => {
    const { buildCheckinPass } = await import("@/lib/apple-wallet/pass");
    const saved = process.env.APPLE_WALLET_TEAM_ID;
    delete process.env.APPLE_WALLET_TEAM_ID;
    await expect(buildCheckinPass(CARD)).rejects.toThrow(/not configured/i);
    process.env.APPLE_WALLET_TEAM_ID = saved;
  });
});

describe("pass artwork", () => {
  it("emits a PNG whose IHDR matches the requested size", () => {
    const png = discPng(58, "#6B66C9");
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(png.subarray(12, 16).toString("ascii")).toBe("IHDR");
    expect(png.readUInt32BE(16)).toBe(58);
    expect(png.readUInt32BE(20)).toBe(58);
    expect(png[24]).toBe(8); // bit depth
    expect(png[25]).toBe(6); // RGBA
    expect(png.subarray(png.length - 8, png.length - 4).toString("ascii")).toBe("IEND");
  });

  it("parses hex colours and picks readable pass text", () => {
    expect(hexToRgb("#6B66C9")).toEqual([107, 102, 201]);
    expect(hexToRgb("#fff")).toEqual([255, 255, 255]);
    expect(isLightColor("#FFFFFF")).toBe(true);
    expect(isLightColor("#111111")).toBe(false);
  });
});
