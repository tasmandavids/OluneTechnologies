"use client";

// ============================================================================
//  The studio's own GA4 tag, on the studio's own public pages.
//
//  Two things this deliberately does not do:
//
//  * It does not load inside /portal or /platform. Those paths carry student
//    and family record ids in the URL; shipping them to Google as page paths
//    would leak who is enrolled where to a third party the family never
//    agreed to. This is the studio's marketing tag, so it belongs on the
//    marketing site only.
//  * It does not let gtag send its own page_view. App Router navigations are
//    client-side, so the automatic one fires on the first load and never
//    again. Sending them from the pathname effect is what makes the funnel
//    numbers in the studio's GA account real.
// ============================================================================

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/** Paths that are the app, not the studio's website. */
function isPrivatePath(pathname: string): boolean {
  return (
    pathname === "/portal" ||
    pathname.startsWith("/portal/") ||
    pathname === "/platform" ||
    pathname.startsWith("/platform/")
  );
}

export function StudioAnalytics({ measurementId }: { measurementId: string }) {
  const pathname = usePathname();
  const excluded = isPrivatePath(pathname);

  useEffect(() => {
    if (excluded || !window.gtag) return;
    window.gtag("event", "page_view", {
      page_path: pathname,
      page_location: window.location.href,
    });
  }, [pathname, excluded]);

  if (excluded) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = gtag;
gtag('js', new Date());
gtag('config', '${measurementId}', { send_page_view: false });
        `}
      </Script>
    </>
  );
}
