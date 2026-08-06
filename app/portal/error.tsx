"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

// Segment-level boundary: a crash inside a portal page keeps the user inside
// the portal shell (sidebar stays) instead of ejecting to the root error page.
export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors.portal");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="box grid min-h-[50vh] place-items-center rounded-2xl px-6">
        <div className="max-w-md py-14 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--brand)_10%,transparent)]">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden>
              <path d="M12 8v5" stroke="var(--brand)" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="12" cy="16.5" r="1" fill="var(--brand)" />
              <path
                d="M10.3 4.6 3.5 16.9A2 2 0 0 0 5.2 20h13.6a2 2 0 0 0 1.7-3.1L13.7 4.6a2 2 0 0 0-3.4 0Z"
                stroke="var(--brand)"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <h1 className="mt-4 text-lg font-bold text-ink">{t("title")}</h1>
          <p className="mt-2 text-sm text-muted">{t("body")}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={reset}
              className="rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90"
            >
              {t("retry")}
            </button>
            <Link
              href="/portal"
              className="rounded-xl border border-[--hair] px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-base"
            >
              {t("goToPortal")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
