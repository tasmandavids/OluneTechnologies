"use client";

// ============================================================================
//  AttributionCapture — record how a visitor first found this studio.
//
//  Runs once on the first page of a visit, writes a first-touch cookie, and
//  never overwrites it. Server actions that create a lead read that cookie, so
//  attribution doesn't have to be threaded through every form.
//
//  Why a cookie rather than a hidden form field: the family who clicks an
//  Instagram ad on Tuesday and enquires on Thursday is the normal case, and a
//  form field only knows about the page the form is on.
//
//  No third party is involved and nothing identifies a person — it stores the
//  campaign tags the visitor arrived with, the referring host, and the landing
//  path. SameSite=Lax, no Secure flag only on localhost so dev works over HTTP.
// ============================================================================

import { useEffect } from "react";
import {
  ATTRIBUTION_COOKIE,
  ATTRIBUTION_MAX_AGE_SECONDS,
  attributionFromLanding,
  isEmptyAttribution,
  serializeAttribution,
} from "@/lib/analytics/attribution";

function hasAttributionCookie(): boolean {
  return document.cookie.split("; ").some((c) => c.startsWith(`${ATTRIBUTION_COOKIE}=`));
}

export function AttributionCapture() {
  useEffect(() => {
    try {
      // First touch wins. A returning visitor keeps whatever brought them
      // originally, which is the channel that deserves the credit.
      if (hasAttributionCookie()) return;

      const attribution = attributionFromLanding(
        window.location.href,
        document.referrer || null,
        window.location.host,
      );

      // Nothing to record: a direct visit with no referrer. Writing an empty
      // cookie would only stop us capturing a real campaign click later.
      if (isEmptyAttribution(attribution)) return;

      const value = encodeURIComponent(serializeAttribution(attribution));
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie =
        `${ATTRIBUTION_COOKIE}=${value}; Path=/; Max-Age=${ATTRIBUTION_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
    } catch {
      // Attribution is nice to have. It must never break a page load.
    }
  }, []);

  return null;
}
