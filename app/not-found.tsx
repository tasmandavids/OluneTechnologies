// ============================================================================
//  app/not-found.tsx — friendly 404 for public site routes on the root domain.
// ============================================================================

import Link from "next/link";
import { headers } from "next/headers";
import { getTranslations } from "@/lib/i18n/server";
import { resolveStudio } from "@/lib/tenant";
import { PoweredByOlune } from "@/components/brand/PoweredByOlune";
import { OluneLogo } from "@/components/brand/OluneLogo";

export default async function NotFound() {
  const t = await getTranslations("errors.notFound");
  const host = (await headers()).get("host");
  const studio = await resolveStudio(host);
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost";

  return (
    <div className="grid min-h-screen place-items-center bg-base px-6 text-ink">
      <div className="max-w-md text-center">
        {!studio && (
          <div className="mb-8 flex justify-center">
            <OluneLogo variant="stacked" size="md" />
          </div>
        )}
        <p className="text-sm font-semibold uppercase tracking-widest text-brand">{t("eyebrow")}</p>
        <h1 className="mt-2 text-2xl font-bold">{t("title")}</h1>
        {!studio ? (
          <>
            <p className="mt-3 text-sm text-muted">
              {t.rich("platformBody", {
                localhost: (chunks) => (
                  <strong className="text-ink">{chunks}</strong>
                ),
              })}
            </p>
            <p className="mt-4 rounded-xl border border-(--hair) bg-surface px-4 py-3 text-left text-sm text-muted">
              {t("exampleLabel")}{" "}
              <code className="text-ink">https://your-slug.{root}:3000/about</code>
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link href="/" className="btn-glow btn-glow--solid px-5 py-2 text-sm">
                {t("oluneHome")}
              </Link>
              <Link href="/login" className="rounded-full border border-(--hair) px-5 py-2 text-sm text-ink">
                {t("signIn")}
              </Link>
              <Link href="/portal/admin/site" className="rounded-full border border-(--hair) px-5 py-2 text-sm text-ink">
                {t("websiteAdmin")}
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm text-muted">{t("studioBody")}</p>
            <Link href="/" className="btn-glow btn-glow--solid mt-6 inline-flex px-5 py-2 text-sm">
              {t("backHome")}
            </Link>
          </>
        )}
        <div className="mt-10 flex justify-center">
          <PoweredByOlune />
        </div>
      </div>
    </div>
  );
}
