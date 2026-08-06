# Apple Wallet check-in passes

Once the front desk issues an NFC check-in card (`nfc_cards`, migration `0103`),
the student or their guardian can add a copy of it to Apple Wallet from the top
of their portal. This doc covers what the pass can and can't do, and how to get
the signing certificate that switches the feature on.

## What the pass actually is

The pass carries a **QR barcode of the same `nfc_cards.token`** that was written
to the physical tag, so scanning it runs through the identical `performTap()`
path (`lib/checkin/tap.ts`) as a card tap. Freeze or revoke the card and both
credentials die together — there is only ever one token.

**The pass cannot tap the reader over NFC.** Apple Wallet passes only transmit
over NFC when the Pass Type ID carries Apple's NFC entitlement, which is granted
case-by-case to approved merchants, and even then they only talk to VAS-capable
readers — not the generic NTAG reader this system is built around. So
`lib/apple-wallet/pass.ts` deliberately omits the `nfc` dictionary (including it
without the entitlement gets the pass rejected by iOS at add time).

Practically: **plastic card taps, wallet pass scans.** The wallet copy is the
"left my card at home" fallback. To accept it at the door the studio needs
something that can read a QR and POST the decoded token to `/api/checkin/tap` —
the endpoint already takes `cardToken`, so no server change is needed.

Passes are also not push-updatable: there's no `webServiceURL`, so a card frozen
after someone added the pass will still *look* valid in Wallet until they delete
it. The tap endpoint rejects it either way, which is the part that matters.

## Getting the certificate

Everything below needs an Apple Developer Program membership.

1. **Create a Pass Type ID** — [developer.apple.com](https://developer.apple.com)
   → Certificates, Identifiers & Profiles → Identifiers → `+` → *Pass Type IDs*.
   Use a reverse-DNS identifier, e.g. `pass.co.olune.checkin`. That string is
   `APPLE_WALLET_PASS_TYPE_ID`.

2. **Find the Team ID** — Membership details → Team ID (10 characters). That's
   `APPLE_WALLET_TEAM_ID`.

3. **Issue a certificate for the Pass Type ID.** Generate a Certificate Signing
   Request in Keychain Access (*Certificate Assistant → Request a Certificate
   From a Certificate Authority*, "Saved to disk"), upload it against the Pass
   Type ID, then download the resulting `.cer`.

4. **Export cert + key as PEM.** Double-click the `.cer` to install it, then in
   Keychain Access export the certificate *and* its private key as a single
   `.p12`. Convert:

   ```bash
   openssl pkcs12 -in pass.p12 -clcerts -nokeys -out signerCert.pem -legacy
   openssl pkcs12 -in pass.p12 -nocerts -nodes -out signerKey.pem -legacy
   ```

   `signerCert.pem` → `APPLE_WALLET_SIGNER_CERT`,
   `signerKey.pem` → `APPLE_WALLET_SIGNER_KEY`. Leave
   `APPLE_WALLET_SIGNER_KEY_PASSPHRASE` unset when exporting with `-nodes`.

5. **Get the WWDR intermediate.** Download *Worldwide Developer Relations —
   G4* from [Apple's authority page](https://www.apple.com/certificateauthority/)
   and convert:

   ```bash
   openssl x509 -inform der -in AppleWWDRCAG4.cer -out wwdr.pem
   ```

   `wwdr.pem` → `APPLE_WALLET_WWDR_CERT`.

PEM values may be pasted with real newlines or base64-encoded — `lib/apple-wallet/config.ts`
accepts both, since some secret stores mangle multi-line values:

```bash
base64 -i signerCert.pem | tr -d '\n'
```

## Behaviour when unconfigured

`isAppleWalletConfigured()` returns false if *any* of the five required values
is missing or malformed. In that state the portals render the check-in card and
its QR as normal but omit the "Add to Apple Wallet" button, and
`GET /api/apple-wallet/checkin-card/[cardId]` returns 503. Missing certificates are a
deployment state, never an error — nothing logs or throws.

## Certificate expiry

Pass Type ID certificates last one year. When one expires, previously-added
passes keep working but no new pass can be signed — the download route starts
returning 500 and logs `[apple-wallet] pkpass build failed`. Re-issue from step 3 and
replace the two signer values.

## Files

| Path | Role |
| --- | --- |
| `lib/apple-wallet/config.ts` | Reads + validates the env secrets; no heavy imports |
| `lib/apple-wallet/pass.ts` | Builds and signs the `.pkpass` |
| `lib/apple-wallet/png.ts` | Rasterises the brand-coloured pass icon/logo |
| `app/api/apple-wallet/checkin-card/[cardId]/route.ts` | RLS-authorised download route |
| `lib/portal/checkin-card-data.ts` | Shared portal fetch + QR rendering |
| `components/portal/checkin/CheckinCardPanel.tsx` | The parent/student portal card UI |
| `components/portal/admin/checkin/IssueCardButton.tsx` | Staff-side download, next to the issuance controls |

## Who can download a pass

`GET /api/apple-wallet/checkin-card/[cardId]` reads the card with the caller's
own session, so `0103`'s `nfc_cards` select policies are the entire access
rule — no separate check to keep in sync:

- **the student**, via `nfc_cards_self_read` (widened in `0108` so minors are
  covered too)
- **a guardian**, via `nfc_cards_parent_read`
- **studio admin / office**, via `nfc_cards_ops_all`

Staff get the same file the family does, from the student's detail page, so the
front desk can hand it over (AirDrop, email) rather than talking someone
through finding it. Anyone else gets a 404 — RLS turns "not yours" into "not
found" and the route keeps it that way.
