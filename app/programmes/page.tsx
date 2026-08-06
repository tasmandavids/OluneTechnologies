// ============================================================================
//  /programmes — Public class programme listing for the current tenant.
// ============================================================================

import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "@/lib/i18n/server";
import { resolveStudio } from "@/lib/tenant";
import { getSiteScheduleClasses } from "@/lib/public-classes";
import { formatMoney } from "@/lib/currency";
import { originForHost } from "@/lib/seo";
import { PoweredByOlune } from "@/components/brand/PoweredByOlune";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export async function generateMetadata(): Promise<Metadata> {
  const host = (await headers()).get("host");
  const studio = await resolveStudio(host);
  if (!studio) return { robots: { index: false, follow: false } };

  const t = await getTranslations("programmes");
  const title = `${t("title")} — ${studio.name}`;
  const description = t("body");
  const url = `${originForHost(host)}/programmes`;

  return {
    // A studio's schedule is their brand, not Olune's — skip the root
    // layout's "· Olune" title template.
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url },
  };
}

export default async function ProgrammesPage() {
  const t = await getTranslations("programmes");
  const host = (await headers()).get("host");
  const studio = await resolveStudio(host);

  // No tenant means the root marketing domain, where an empty class list is
  // just a thin duplicate of the home page. Send visitors somewhere real
  // rather than leaving it to be indexed (same pattern as /join).
  if (!studio) redirect("/");

  const classes = await getSiteScheduleClasses(studio.id);

  return (
    <div className="min-h-screen bg-base p-8 text-ink">
      <div className="mx-auto w-full max-w-3xl">
        <p className="text-xs uppercase tracking-widest text-muted">
          {t("eyebrow", { studioName: studio.name })}
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
