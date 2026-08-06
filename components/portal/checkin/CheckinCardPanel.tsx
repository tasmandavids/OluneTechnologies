"use client";

// ============================================================================
//  CheckinCardPanel — the issued NFC check-in card, surfaced at the top of the
//  parent and student portals so a card someone was handed at the front desk
//  actually shows up somewhere they can see it.
//
//  In the parent portal this renders one card per child with an issued card;
//  in the student portal it's the single self card. Both share this component
//  so the two views can't diverge.
//
//  The QR encodes the same token as the physical tag, so it resolves through
//  the identical tap path — it's the fallback for "card left at home", not a
//  second credential. Frozen cards deliberately render without a QR.
// ============================================================================

import { useState } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useFormatDateMedium } from "@/lib/i18n/client";
import type { PortalCheckinCard } from "@/lib/portal/checkin-card-data";

function WalletGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="2.5" y="5.5" width="19" height="13" rx="3" />
      <path d="M2.5 10.5h19" />
      <path d="M16.5 14.5h2" strokeLinecap="round" />
    </svg>
  );
}

function OneCard({ card, appleWalletEnabled }: { card: PortalCheckinCard; appleWalletEnabled: boolean }) {
  const t = useTranslations("portal.checkinCard");
  const formatDate = useFormatDateMedium();
  const [enlarged, setEnlarged] = useState(false);

  const active = card.status === "active";
  const name = card.studentName?.trim() || t("unnamedDancer");

  return (
    <div className="box rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: active ? "#22c55e" : "#3b82f6" }}
            />
            <p className="truncate font-bold text-ink">{name}</p>
          </div>

          <p className="mt-1 text-xs text-muted">
            {active ? t("statusActive") : t("statusFrozen")}
            {card.issuedAt ? ` · ${t("issued", { date: formatDate(card.issuedAt) })}` : ""}
          </p>

          <p className="mt-3 text-sm text-muted">{active ? t("qrHint") : t("frozenHint")}</p>

          {active && appleWalletEnabled && (
            <>
              <a
                href={`/api/apple-wallet/checkin-card/${card.cardId}`}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
              >
                <WalletGlyph />
                {t("addToWallet")}
              </a>
              <p className="mt-2 text-[0.7rem] text-muted">{t("walletHint")}</p>
            </>
          )}
        </div>

        {card.qrDataUrl && (
          <button
            type="button"
            onClick={() => setEnlarged((v) => !v)}
            aria-expanded={enlarged}
            className="shrink-0 rounded-xl border border-[--hair] bg-white p-2 transition hover:opacity-90"
            title={enlarged ? t("shrink") : t("enlarge")}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- data: URL, nothing for the image optimiser to do */}
            <img
              src={card.qrDataUrl}
              alt={t("qrAlt", { name })}
              className="transition-all"
              style={{ width: enlarged ? 220 : 96, height: enlarged ? 220 : 96 }}
            />
          </button>
        )}
      </div>
    </div>
  );
}

export default function CheckinCardPanel({
  cards,
  appleWalletEnabled,
}: {
  cards: PortalCheckinCard[];
  appleWalletEnabled: boolean;
}) {
  const t = useTranslations("portal.checkinCard");
  if (cards.length === 0) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-5xl px-6 pt-6"
    >
      <h2 className="mb-3 text-xs uppercase tracking-widest text-muted">{t("title")}</h2>
      <div className={cards.length > 1 ? "grid gap-4 sm:grid-cols-2" : ""}>
        {cards.map((card) => (
          <OneCard key={card.cardId} card={card} appleWalletEnabled={appleWalletEnabled} />
        ))}
      </div>
    </motion.section>
  );
}
