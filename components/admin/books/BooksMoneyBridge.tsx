// Where Money hands over to Olune Books: the Reconcile and Reports tabs point
// at the built-in ledger when it's on, and offer it when no ledger is.

import Link from "next/link";
import { getTranslations } from "@/lib/i18n/server";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";

const LINKS = {
  reconcile: [{ href: "/portal/admin/books/bank", key: "openBank" }],
  reports: [
    { href: "/portal/admin/books/reports?report=pl", key: "openPl" },
    { href: "/portal/admin/books/reports?report=bs", key: "openBs" },
    { href: "/portal/admin/books/tax", key: "openTax" },
  ],
  setup: [{ href: "/portal/admin/books/setup", key: "setUp" }],
} as const;

export async function BooksMoneyBridge({ variant }: { variant: keyof typeof LINKS }) {
  const t = await getTranslations("books.bridge");
  return (
    <div className="mx-auto max-w-6xl p-6">
      <GlassPanel className="!p-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">{t("eyebrow")}</p>
        <p className="mt-1 text-lg font-semibold text-ink">{t(`${variant}.title`)}</p>
        <p className="mt-1 max-w-2xl text-sm text-muted">{t(`${variant}.body`)}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {LINKS[variant].map((l, i) => (
            <Link
              key={l.href}
              href={l.href}
              className={i === 0 ? "btn-brand rounded-xl px-4 py-2 text-sm font-semibold" : "rounded-xl border px-4 py-2 text-sm font-semibold text-ink"}
              style={i === 0 ? undefined : { borderColor: "var(--hair)" }}
            >
              {t(l.key)}
            </Link>
          ))}
        </div>
      </GlassPanel>
    </div>
  );
}
