// ============================================================================
//  lib/analytics/attribution.ts
//
//  PURE first-touch attribution — no IO, fully unit-testable.
//
//  Every lead used to be stored with `source: "enrol-page"`, hardcoded. That
//  says where the form was, not where the family came from, so no studio could
//  ever answer "is the Instagram spend working" or "which of our channels
//  actually converts". The funnel had no top.
//
//  FIRST-touch, not last: a parent typically discovers a studio once (an ad, a
//  friend's link, a search) and then returns directly several times before
//  enquiring. Overwriting on the last visit would credit "direct" for almost
//  every conversion and quietly zero out the channel that actually worked.
//
//  Everything here is attacker-controlled — it arrives as query string and
//  Referer — so values are length-capped and the whole payload is size-bounded
//  before it can reach a cookie or the database.
// ============================================================================

/** Per-field cap. Long enough for real campaign names, short enough to be safe. */
const MAX_FIELD = 120;
/** Referrers and landing paths carry more structure, so they get more room. */
const MAX_URL_FIELD = 300;

export type Attribution = {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  /** External referring origin+path. Same-site referrers are dropped. */
  referrer: string | null;
  /** The path the visitor first landed on, without query or hash. */
  landingPath: string | null;
};

export const EMPTY_ATTRIBUTION: Attribution = {
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  utmTerm: null,
  utmContent: null,
  referrer: null,
  landingPath: null,
};

/** Cookie name. Readable by the client script that sets it, and by server actions. */
export const ATTRIBUTION_COOKIE = "olune_attr";
/** First touch should outlive a browsing session but not follow someone forever. */
export const ATTRIBUTION_MAX_AGE_SECONDS = 90 * 24 * 60 * 60; // 90 days

function clean(value: string | null | undefined, max = MAX_FIELD): string | null {
  if (typeof value !== "string") return null;
  // Strip control characters first: a newline smuggled through a query string
  // survives trim() in the middle of a value and would corrupt any log or CSV
  // this label is later written into.
  const trimmed = value.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

/**
 * Read attribution out of a landing URL and its referrer.
 *
 * `referrer` is dropped when it points at our own site: an internal navigation
 * is not a referral, and recording one would make every second-page enquiry
 * look like it came from us.
 */
export function attributionFromLanding(
  url: string,
  referrer: string | null,
  selfHost: string | null,
): Attribution {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ...EMPTY_ATTRIBUTION };
  }

  const q = parsed.searchParams;

  let referrerValue: string | null = null;
  if (referrer) {
    try {
      const ref = new URL(referrer);
      // `new URL` happily parses javascript:, data: and mailto:, which have no
      // host — so a host check alone would store "alert(1)" as a referrer.
      // Only a real web page can refer someone here.
      const isWeb = ref.protocol === "http:" || ref.protocol === "https:";
      const isSelf = selfHost ? ref.host === selfHost : ref.host === parsed.host;
      if (isWeb && !isSelf) referrerValue = clean(`${ref.host}${ref.pathname}`, MAX_URL_FIELD);
    } catch {
      // A non-URL referrer is meaningless; leave it null rather than guessing.
    }
  }

  return {
    // gclid/fbclid are how paid clicks arrive when the marketer forgot the UTMs.
    // Recording them as the source beats recording nothing.
    utmSource:
      clean(q.get("utm_source")) ??
      (q.get("gclid") ? "google" : null) ??
      (q.get("fbclid") ? "facebook" : null),
    utmMedium: clean(q.get("utm_medium")) ?? (q.get("gclid") || q.get("fbclid") ? "cpc" : null),
    utmCampaign: clean(q.get("utm_campaign")),
    utmTerm: clean(q.get("utm_term")),
    utmContent: clean(q.get("utm_content")),
    referrer: referrerValue,
    landingPath: clean(parsed.pathname, MAX_URL_FIELD),
  };
}

/** True when there's nothing worth storing. */
export function isEmptyAttribution(a: Attribution): boolean {
  return Object.values(a).every((v) => v === null);
}

/** Compact wire form — short keys keep the cookie well under any size limit. */
type Wire = {
  s?: string; m?: string; c?: string; t?: string; n?: string; r?: string; p?: string;
};

export function serializeAttribution(a: Attribution): string {
  const wire: Wire = {};
  if (a.utmSource) wire.s = a.utmSource;
  if (a.utmMedium) wire.m = a.utmMedium;
  if (a.utmCampaign) wire.c = a.utmCampaign;
  if (a.utmTerm) wire.t = a.utmTerm;
  if (a.utmContent) wire.n = a.utmContent;
  if (a.referrer) wire.r = a.referrer;
  if (a.landingPath) wire.p = a.landingPath;
  return JSON.stringify(wire);
}

/** Never throws — the cookie is user-editable and arrives as arbitrary text. */
export function parseAttribution(raw: string | null | undefined): Attribution {
  if (!raw) return { ...EMPTY_ATTRIBUTION };
  let wire: Wire;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return { ...EMPTY_ATTRIBUTION };
    wire = parsed as Wire;
  } catch {
    return { ...EMPTY_ATTRIBUTION };
  }
  return {
    utmSource: clean(wire.s),
    utmMedium: clean(wire.m),
    utmCampaign: clean(wire.c),
    utmTerm: clean(wire.t),
    utmContent: clean(wire.n),
    referrer: clean(wire.r, MAX_URL_FIELD),
    landingPath: clean(wire.p, MAX_URL_FIELD),
  };
}

/** Columns for a `leads` insert. Keys match migration 0116. */
export function attributionColumns(a: Attribution): Record<string, string | null> {
  return {
    utm_source: a.utmSource,
    utm_medium: a.utmMedium,
    utm_campaign: a.utmCampaign,
    utm_term: a.utmTerm,
    utm_content: a.utmContent,
    referrer: a.referrer,
    landing_path: a.landingPath,
  };
}

/**
 * One short label for a lead list: "instagram / cpc", "google", "olune.co.nz".
 * Returns null when there's genuinely nothing — the UI shows "Direct" then,
 * which is a claim worth making only when we know we have no signal.
 */
export function attributionLabel(a: Attribution): string | null {
  if (a.utmSource) {
    return a.utmMedium ? `${a.utmSource} / ${a.utmMedium}` : a.utmSource;
  }
  if (a.referrer) return a.referrer.split("/")[0];
  return null;
}
