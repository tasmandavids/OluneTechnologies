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
import { AttributionCapture } from "@/components/analytics/AttributionCapture";
import { StudioAnalytics } from "@/components/analytics/StudioAnalytics";
import { getStudioMeasurementId } from "@/lib/integrations/analytics";
import { rootUrl } from "@/lib/seo";
import type { CSSProperties } from "react";

// Brand-correct fallback metadata. Routes that need their own title/
// description/canonical (homepage, [siteSlug] pages, faq, team) set them via
// their own generateMetadata, which Next merges over these defaults.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  const title = t("title");
  const description = t("description");
  return {
    // Canonical host, not the apex — relative metadata URLs (opengraph-image,
    // twitter-image) resolve against this, and the apex only 308s to www.
    metadataBase: new URL(rootUrl()),
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
  const sharedMessages = Object.fromEntries(Object.entries(messages).filter(([key]) => key !== "admin" && key !== "platform"));
  const studio = await resolveStudio(host);

  const [branding, measurementId] = studio
    ? await Promise.all([getBrandingCached(studio.id), getStudioMeasurementId(studio.id)])
    : [{ ...DEFAULT_BRANDING }, null];

  const fonts = fontsForBranding(branding.fontDisplay, branding.fontBody);
  const vars = brandingToCssVars(branding) as CSSProperties;

  return (
    <html lang={locale} data-base={branding.base} style={vars}>
      <head>
        {fonts.stylesheetUrl ? (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
            <link rel="stylesheet" href={fonts.stylesheetUrl} fetchPriority="high" />
          </>
        ) : null}
      </head>
      <body>
        <NextIntlClientProvider locale={locale} messages={sharedMessages}>
          <OluneMoonDefs />
          <MotionProvider>
            {children}
            <FeedbackHost />
          </MotionProvider>
          <SpeedInsights />
          <Analytics />
          {measurementId ? <StudioAnalytics measurementId={measurementId} /> : null}
          {/* First-touch capture runs regardless of GA4: the studio's own lead
              attribution shouldn't depend on them having connected Google. */}
          <AttributionCapture />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
