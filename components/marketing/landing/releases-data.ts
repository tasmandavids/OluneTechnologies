// ============================================================================
//  components/marketing/landing/releases-data.ts
//  The public release notes shown in the landing page's UPDATES section.
//
//  Newest first — RELEASES[0] is rendered as the "latest release" hero card,
//  the rest fall onto the timeline beneath it. Add a new release by putting a
//  new object at the top; nothing else needs changing.
//
//  English-only, like the product-mockup micro-copy on the landing page and
//  the FAQ / Team / Card pages.
// ============================================================================

export type Release = {
  /** Marketing version, e.g. "2.0". Rendered as the big numeral. */
  version: string;
  /** Codename — the italic display line under the version. */
  name: string;
  /** Human date, already formatted for display. */
  date: string;
  /** One or two sentences: what this release changed, in plain words. */
  summary: string;
  /** The headline changes. Keep to 3–4 — this is a highlight reel, not a changelog. */
  points: string[];
};

export const RELEASES: Release[] = [
  {
    version: "2.0",
    name: "Aurora Glass",
    date: "6 August 2026",
    summary:
      "The whole studio workspace rebuilt on one glass surface. Ambient aurora light behind every screen, a single unified top bar, and a Today dashboard you arrange yourself.",
    points: [
      "Aurora Glass across every studio-owner screen, tinted to your studio's own colour",
      "A Today dashboard you can drag, drop and resize — keep the widgets you actually use",
      "⌘K command palette wired to real data: jump straight to a student, teacher, parent or class",
      "One unified top bar, and softened content boxes site-wide",
    ],
  },
  {
    version: "1.9",
    name: "Studio Sites",
    date: "5 August 2026",
    summary:
      "The website builder rewritten around fixed templates. Pick a template, fill in your studio, publish — no blocks to wrangle, no canvas to fight.",
    points: [
      "Fixed-template builder replaces both the old block editor and the canvas Studio",
      "Your timetable, classes and enrolment links stay in step with the site automatically",
      "Studio Settings rebuilt around connections and integrations",
    ],
  },
  {
    version: "1.8",
    name: "Money",
    date: "3 August 2026",
    summary:
      "Invoices, payouts and reports pulled into one Money hub, with payments landing in your studio's own Stripe account instead of ours.",
    points: [
      "One Money hub: invoicing, payouts and reporting side by side",
      "Stripe Connect — fees and payouts run through your studio's own account",
      "Xero stays in step: pricing changes flow onto invoices you've already sent",
    ],
  },
  {
    version: "1.7",
    name: "Pocket",
    date: "2 August 2026",
    summary:
      "The parent and teacher phone app, plus the tap-to-check-in membership card — the studio, on the way in the door.",
    points: [
      "The mobile app: timetable, messages, invoices and passes in a parent's pocket",
      "The NFC check-in card — one tap at the door instead of a clipboard",
      "Unread messages surfaced on the parent home hub",
    ],
  },
  {
    version: "1.6",
    name: "Packs",
    date: "27 July 2026",
    summary:
      "Olune stopped being dance-only. Studios pick their vertical at signup and only ever see the surfaces that belong to them.",
    points: [
      "Vertical packs — dance, swim, and the shared core underneath both",
      "Module gating enforced on the server, not just hidden in the menu",
      "A vertical picker in signup, so a new studio starts on the right shape",
    ],
  },
  {
    version: "1.5",
    name: "The Door",
    date: "17 July 2026",
    summary:
      "Casual attendance without an enrolment. Buy a class pass, show the QR code, walk in.",
    points: [
      "Class passes, bought online and redeemed at the door by QR",
      "A pass scanner for the front desk and a My Passes wallet for the dancer",
      "Passes reconcile back to invoices, so casual income lands in the books",
    ],
  },
];

/** The forward-looking line under the timeline. */
export const NEXT_UP = {
  label: "Next up",
  title: "General release",
  date: "December 2026",
  body: "Everything above is live and free to use while we finish. General release lands in December — nothing you build in the meantime gets thrown away.",
};
