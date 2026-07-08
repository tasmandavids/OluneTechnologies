// ============================================================================
//  Root layout — the single place a tenant's brand enters the DOM.
// ============================================================================

import "./globals.css";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { getTranslations } from "@/lib/i18n/server";
import { resolveStudio } from "@/lib/tenant";
import { fontsForBranding } from "@/lib/fonts";
import { getBrandingCached, brandingToCssVars, DEFAULT_BRANDING } from "@/lib/branding";
import { OluneMoonDefs } from "@/components/brand/OluneMoonDefs";
import { FeedbackHost } from "@/components/ui/FeedbackHost";
import { MotionProvider } from "@/components/ui/MotionProvider";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import type { CSSProperties } from "react";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "olune.app";

// Brand-correct fallback metadata. Routes that need their own title/
// description/canonical (homepage, [siteSlug] pages, faq, team) set them via
// their own generateMetadata, which Next merges over these defaults.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  const title = t("title");
  const description = t("description");
  return {
    metadataBase: new URL(`https://${ROOT_DOMAIN}`),
    title: { default: title, template: "%s · Olune" },
    description,
    openGraph: {
      type: "website",
      siteName: "Olune",
      title,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [host, locale, messages] = await Promise.all([
    headers().then((h) => h.get("host")),
    getLocale(),
    getMessages(),
  ]);
  const studio = await resolveStudio(host);

  const branding = studio
    ? await getBrandingCached(studio.id)
    : { ...DEFAULT_BRANDING };

  const fonts = fontsForBranding(branding.fontDisplay, branding.fontBody);
  const vars = brandingToCssVars(branding) as CSSProperties;

  return (
    <html lang={locale} data-base={branding.base} style={vars}>
      <head>
        {fonts.stylesheetUrl ? (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
            <link rel="stylesheet" href={fonts.stylesheetUrl} />
          </>
        ) : null}
      </head>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <OluneMoonDefs />
          <MotionProvider>
            {children}
            <FeedbackHost />
          </MotionProvider>
          <SpeedInsights />
          <Analytics />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
