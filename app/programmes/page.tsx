// ============================================================================
//  /programmes — Public class programme listing for the current tenant.
// ============================================================================

import { headers } from "next/headers";
import Link from "next/link";
import { getTranslations } from "@/lib/i18n/server";
import { resolveStudio } from "@/lib/tenant";
import { getSiteScheduleClasses } from "@/lib/public-classes";
import { formatMoney } from "@/lib/currency";
import { PoweredByOlune } from "@/components/brand/PoweredByOlune";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function ProgrammesPage() {
  const t = await getTranslations("programmes");
  const host = (await headers()).get("host");
  const studio = await resolveStudio(host);
  const classes = studio ? await getSiteScheduleClasses(studio.id) : [];

  return (
    <div className="min-h-screen bg-base p-8 text-ink">
      <div className="mx-auto w-full max-w-3xl">
        <p className="text-xs uppercase tracking-widest text-muted">
          {t("eyebrow", { studioName: studio?.name ?? "Olune" })}
        </p>
        <h1 className="mt-3 text-4xl font-black uppercase tracking-tight">
          {t("title")}
        </h1>
        <p className="mt-3 max-w-[42ch] text-sm leading-relaxed text-muted">
          {t("body")}
        </p>

        {classes.length > 0 ? (
          <ul className="mt-10 divide-y divide-[--hair] border-y border-[--hair]">
            {classes.map((cls) => (
              <li key={cls.id} className="flex flex-wrap items-baseline justify-between gap-2 py-4">
                <div>
                  <p className="font-semibold text-ink">{cls.name}</p>
                  <p className="text-sm text-muted">
                    {[
                      cls.discipline,
                      cls.level,
                      cls.dayOfWeek != null ? DAYS[cls.dayOfWeek] : null,
                      cls.startTime?.slice(0, 5),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                {cls.priceCents > 0 && (
                  <p className="text-sm font-semibold text-brand">
                    {formatMoney(cls.priceCents)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-10 text-sm text-muted">{t("empty")}</p>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/enrol" className="btn-glow btn-glow--solid px-6 py-3 text-sm">
            {t("bookTrial")}
          </Link>
          <Link href="/" className="btn-glow px-6 py-3 text-sm">
            {t("backHome")}
          </Link>
        </div>
        <div className="mt-12 flex justify-center">
          <PoweredByOlune />
        </div>
      </div>
    </div>
  );
}
