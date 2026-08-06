// ============================================================================
//  lib/apple-wallet/pass.ts
//
//  Builds the signed .pkpass a student/parent adds to Apple Wallet after a
//  physical NFC check-in card has been issued (0103_nfc_checkin.sql).
//
//  ── What this pass is, and what it is NOT ─────────────────────────────────
//  The pass carries a QR barcode of the *same* nfc_cards.token that was
//  written to the physical tag, so scanning it hits the identical
//  performTap() path (lib/checkin/tap.ts) the door reader uses.
//
//  It deliberately does NOT set the `nfc` dictionary. Apple Wallet passes can
//  only transmit over NFC with a Pass Type ID that carries Apple's NFC
//  entitlement (granted case-by-case to approved merchants), and even then
//  they only talk to VAS-capable readers — not the generic NTAG reader this
//  system is built around. Adding an `nfc` block without the entitlement gets
//  the pass rejected at add time, so the wallet copy is a scan credential and
//  the plastic card stays the tap credential. Both resolve to one token, so a
//  freeze/revoke kills them together.
//
//  ── Configuration ────────────────────────────────────────────────────────
//  Signing needs an Apple Pass Type ID certificate (lib/apple-wallet/config.ts);
//  without it the feature stays dark — isAppleWalletConfigured() is false and
//  the portals never render the button. See docs/APPLE_WALLET.md.
// ============================================================================

import { PKPass } from "passkit-generator";
import { appleWalletConfig } from "@/lib/apple-wallet/config";
import { discPng, hexToRgb, isLightColor } from "@/lib/apple-wallet/png";

const rgb = (hex: string) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${r}, ${g}, ${b})`;
};

export type CheckinPassInput = {
  cardId: string;
  cardToken: string;
  studentName: string;
  studioName: string;
  brandColor: string;
  issuedAt: string | null;
};

/**
 * @throws if Apple Wallet isn't configured — check isAppleWalletConfigured()
 *         first rather than catching this.
 */
export async function buildCheckinPass(input: CheckinPassInput): Promise<Buffer> {
  const config = appleWalletConfig();
  if (!config) throw new Error("Apple Wallet is not configured for this deployment.");

  const ink = isLightColor(input.brandColor) ? "rgb(17, 17, 17)" : "rgb(255, 255, 255)";

  const pass = new PKPass(
    {
      // Apple's required + expected artwork, rasterised from the studio's
      // brand colour so a studio never has to upload pass-specific assets.
      "icon.png": discPng(29, input.brandColor),
      "icon@2x.png": discPng(58, input.brandColor),
      "icon@3x.png": discPng(87, input.brandColor),
      "logo.png": discPng(50, input.brandColor),
      "logo@2x.png": discPng(100, input.brandColor),
    },
    {
      wwdr: config.wwdr,
      signerCert: config.signerCert,
      signerKey: config.signerKey,
      signerKeyPassphrase: config.signerKeyPassphrase,
    },
    {
      // Serial is the card row id: re-downloading after a re-issue replaces the
      // old pass in Wallet instead of stacking a second one.
      serialNumber: input.cardId,
      description: `${input.studioName} check-in card`,
      organizationName: input.studioName,
      passTypeIdentifier: config.passTypeIdentifier,
      teamIdentifier: config.teamIdentifier,
      logoText: input.studioName,
      backgroundColor: rgb(input.brandColor),
      foregroundColor: ink,
      labelColor: ink,
      sharingProhibited: true,
    },
  );

  pass.type = "generic";

  pass.primaryFields.push({
    key: "student",
    label: "Dancer",
    value: input.studentName,
  });

  pass.secondaryFields.push({
    key: "studio",
    label: "Studio",
    value: input.studioName,
  });

  if (input.issuedAt) {
    pass.auxiliaryFields.push({
      key: "issued",
      label: "Issued",
      value: input.issuedAt,
      dateStyle: "PKDateStyleMedium",
    });
  }

  pass.backFields.push(
    {
      key: "howto",
      label: "How to check in",
      value:
        "Show this QR code to the reader at the studio entrance to check in and out. " +
        "Your physical card taps the reader directly and works the same way.",
    },
    {
      key: "lost",
      label: "Lost your card?",
      value:
        "Tell the front desk. Freezing or revoking the card stops this pass working too — " +
        "delete it and add the replacement once a new card is issued.",
    },
  );

  pass.setBarcodes({
    format: "PKBarcodeFormatQR",
    message: input.cardToken,
    messageEncoding: "iso-8859-1",
    altText: input.studentName,
  });

  return pass.getAsBuffer();
}
