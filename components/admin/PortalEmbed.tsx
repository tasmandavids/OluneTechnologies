"use client";

// ============================================================================
//  PortalEmbed — surfaces ready-to-share portal links for studios that run
//  their OWN website (i.e. don't use the Olune site builder). Gives each
//  destination a copyable URL, a paste-ready HTML button, and a QR code.
//
//  Why links and not an <iframe>: the app sends X-Frame-Options: SAMEORIGIN
//  (next.config.ts) and auth relies on first-party cookies, so framing the
//  portal on a third-party site would both be blocked and break sign-in.
//  A link/button that opens in a new tab is the correct, secure pattern.
// ============================================================================

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

type Props = {
  slug: string;
  customDomain: string | null;
  root: string;
  registrationEnabled: boolean;
};

function buttonSnippet(url: string, label: string): string {
  return `<a href="${url}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 24px;border-radius:9999px;background:#111111;color:#ffffff;font:600 15px/1.2 system-ui,-apple-system,sans-serif;text-decoration:none;">${label}</a>`;
}

export default function PortalEmbed({ slug, customDomain, root, registrationEnabled }: Props) {
  const t = useTranslations("admin.settings.embed");

  // Prefer the studio's own domain when connected; fall back to the subdomain.
  const host = customDomain || `${slug}.${root}`;
  const base = `https://${host}`;
  const loginUrl = `${base}/login`;
  const joinUrl = `${base}/join`;

  const [qr, setQr] = useState<Record<string, string>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const QRCode = (await import("qrcode")).default;
        const entries = await Promise.all(
          [loginUrl, joinUrl].map(
            async (url) =>
              [url, await QRCode.toDataURL(url, { width: 320, margin: 1 })] as const,
          ),
        );
        if (!cancelled) setQr(Object.fromEntries(entries));
      } catch {
        /* QR is a nice-to-have; the links/snippet still work without it. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loginUrl, joinUrl]);

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 2000);
    } catch {
      /* clipboard blocked (insecure context) — user can still select manually */
    }
  }

  function downloadQr(url: string, filename: string) {
    const dataUrl = qr[url];
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    a.click();
  }

  const cards = [
    {
      id: "login",
      label: t("loginLabel"),
      help: t("loginHelp"),
      url: loginUrl,
      snippet: buttonSnippet(loginUrl, t("buttonTextLogin")),
      qrFile: `${slug}-portal-login.png`,
      disabled: false,
      note: null as string | null,
    },
    {
      id: "join",
      label: t("joinLabel"),
      help: t("joinHelp"),
      url: joinUrl,
      snippet: buttonSnippet(joinUrl, t("buttonTextJoin")),
      qrFile: `${slug}-portal-join.png`,
      disabled: !registrationEnabled,
      note: registrationEnabled ? null : t("joinDisabledNote"),
    },
  ];

  return (
    <section className="box space-y-6 rounded-2xl p-6">
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted">{t("title")}</h2>
        <p className="mt-1 text-sm text-muted">{t("description")}</p>
      </div>

      {cards.map((card) => (
        <div
          key={card.id}
          className={`space-y-4 ${card.disabled ? "opacity-60" : ""}`}
        >
          <div>
            <h3 className="text-sm font-semibold text-ink">{card.label}</h3>
            <p className="text-xs text-muted">{card.note ?? card.help}</p>
          </div>

          {/* Link */}
          <div className="space-y-1.5">
            <span className="block text-[0.7rem] font-medium uppercase tracking-wider text-muted">
              {t("linkHeading")}
            </span>
            <div className="flex items-center gap-2">
              <code className="box flex-1 overflow-x-auto rounded-lg px-3 py-2 text-xs text-ink">
                {card.url}
              </code>
              <CopyButton
                onClick={() => copy(`${card.id}-link`, card.url)}
                copied={copiedKey === `${card.id}-link`}
                copiedLabel={t("copied")}
                label={t("copyLink")}
              />
            </div>
          </div>

          {/* Button snippet */}
          <div className="space-y-1.5">
            <span className="block text-[0.7rem] font-medium uppercase tracking-wider text-muted">
              {t("snippetHeading")}
            </span>
            <p className="text-xs text-muted">{t("snippetHelp")}</p>
            <textarea
              readOnly
              rows={3}
              value={card.snippet}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full resize-none rounded-lg border border-[--hair] bg-base px-3 py-2 font-mono text-[0.7rem] leading-relaxed text-ink"
            />
            <CopyButton
              onClick={() => copy(`${card.id}-snippet`, card.snippet)}
              copied={copiedKey === `${card.id}-snippet`}
              copiedLabel={t("copied")}
              label={t("copySnippet")}
            />
          </div>

          {/* QR code */}
          <div className="flex items-start gap-4">
            {qr[card.url] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qr[card.url]}
                alt={`${card.label} QR code`}
                width={88}
                height={88}
                className="rounded-lg border border-[--hair] bg-white p-1"
              />
            ) : (
              <div className="box h-[88px] w-[88px] rounded-lg" />
            )}
            <div className="space-y-2">
              <span className="block text-[0.7rem] font-medium uppercase tracking-wider text-muted">
                {t("qrHeading")}
              </span>
              <p className="text-xs text-muted">{t("qrHelp")}</p>
              <button
                type="button"
                onClick={() => downloadQr(card.url, card.qrFile)}
                disabled={!qr[card.url]}
                className="box-pill px-3 py-1.5 text-xs font-medium text-ink transition disabled:opacity-50"
              >
                {t("downloadQr")}
              </button>
            </div>
          </div>
        </div>
      ))}

      <p className="pt-4 text-xs text-muted">{t("iframeNote")}</p>
    </section>
  );
}

function CopyButton({
  onClick,
  copied,
  label,
  copiedLabel,
}: {
  onClick: () => void;
  copied: boolean;
  label: string;
  copiedLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="box-pill shrink-0 px-3 py-1.5 text-xs font-medium text-ink transition"
    >
      {copied ? `✓ ${copiedLabel}` : label}
    </button>
  );
}
