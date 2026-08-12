"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

/**
 * Trial countdown above the portal.
 *
 * Two tones rather than one: a fortnight out this is information, and inside
 * TRIAL_WARNING_DAYS it is a deadline. A studio that discovers the trial ended
 * by being locked out on a Monday morning had no warning worth the name.
 */
export function TrialBanner({
  daysLeft,
  urgent,
}: {
  daysLeft: number | null;
  urgent: boolean;
}) {
  const t = useTranslations("plan");

  return (
    <div
      className={
        urgent
          ? "border-b border-amber-500/40 bg-amber-500/10 px-4 py-3 sm:px-6"
          : "border-b border-brand/25 bg-brand/8 px-4 py-3 sm:px-6"
      }
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">
            {daysLeft === null
              ? t("banner.titleUnknown")
              : t("banner.title", { days: daysLeft })}
          </p>
          <p className="text-xs text-muted">{t("banner.body")}</p>
        </div>
        <Link
          href="/portal/admin/plan"
          className="shrink-0 rounded-full bg-brand px-4 py-1.5 text-xs font-bold text-white"
        >
          {t("banner.cta")}
        </Link>
      </div>
    </div>
  );
}
