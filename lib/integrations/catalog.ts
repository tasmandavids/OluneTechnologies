// ============================================================================
//  The connections catalog — every third-party system Olune knows about,
//  whether or not it's wired up yet.
//
//  This file is deliberately client-safe (no env, no node builtins) so the
//  Settings → Connections page can render the full landscape and the server
//  only has to supply per-studio state. Adding a new system is a matter of
//  appending an entry here: it appears in the hub immediately as "planned",
//  and flipping `stage` to "beta"/"live" once its connect path exists is the
//  only UI change needed.
//
//  Stage is a promise to the studio owner, so be honest with it:
//    live    — connect it and it does the job end to end
//    beta    — the connection is real and credentials are stored, but what we
//              do with them is partial. QuickBooks and MYOB are the only two
//              left here: they authenticate and store tokens, and no ledger
//              sync reads them yet.
//    planned — on the roadmap, no connect path; the card says so
// ============================================================================

import type { IntegrationCategory, IntegrationProvider } from "./types";

export const CATEGORY_META: Record<
  IntegrationCategory,
  { label: string; blurb: string }
> = {
  accounting: {
    label: "Accounting",
    blurb: "Push invoices and payments into the studio's ledger. One ledger at a time.",
  },
  payments: {
    label: "Payments & payouts",
    blurb: "Take money from families and settle it to the studio's own bank account.",
  },
  inbox: {
    label: "Email & inbox",
    blurb: "Bring the studio's mailbox into Olune so replies sit next to the family record.",
  },
  social: {
    label: "Social & advertising",
    blurb: "Publish posts and ads, and broadcast announcements to followers.",
  },
  marketing: {
    label: "Marketing & messaging",
    blurb: "Newsletters, SMS, and campaign tooling driven off the studio's roll.",
  },
  calendar: {
    label: "Calendars",
    blurb: "Mirror the class timetable into the calendars staff already live in.",
  },
  automation: {
    label: "Automation",
    blurb: "Fire Olune events at the rest of the studio's stack.",
  },
  intelligence: {
    label: "AI & analytics",
    blurb: "Bring your own model keys and measurement tools.",
  },
};

export const INTEGRATIONS: IntegrationProvider[] = [
  // ─── Accounting ──────────────────────────────────────────────────────────
  {
    id: "xero",
    name: "Xero",
    category: "accounting",
    tagline: "Sync invoices, payments and contacts with the studio's Xero organisation.",
    stage: "live",
    auth: { kind: "oauth", connectPath: "/api/xero/oauth/connect" },
    color: "#13B5EA",
    exclusiveGroup: "accounting",
    store: "xero_connections",
    capabilities: [
      "Invoices raised in Olune appear in Xero",
      "Payments and credit notes flow back",
      "Profit & loss, aged receivables and GST on the Money → Reports tab",
    ],
    usedBy: { href: "/portal/admin/money?tab=reports", label: "Money → Reports" },
    requiredEnv: ["XERO_CLIENT_ID", "XERO_CLIENT_SECRET"],
    docsUrl: "https://developer.xero.com/documentation/api/accounting/overview",
  },
  {
    id: "quickbooks",
    name: "QuickBooks Online",
    category: "accounting",
    tagline: "For studios that keep their books in QuickBooks instead of Xero.",
    // `planned`, not `beta`. OAuth completes and the realm is stored, but
    // ACCOUNTING_CAPABILITIES.syncSupported is false — no invoice is ever
    // pushed. Offering it next to a working Xero invited studios to connect
    // and code their whole catalogue for a ledger that receives nothing.
    // The connect route and driver stay in place; flip this back to "beta"
    // with `auth.connectPath` restored the day sync lands.
    stage: "planned",
    auth: { kind: "none" },
    color: "#2CA01C",
    exclusiveGroup: "accounting",
    store: "studio_integrations",
    capabilities: [
      "Invoice and payment sync is still being built",
      "Product ledger codes can already be entered, ready for when it lands",
    ],
    requiredEnv: ["QUICKBOOKS_CLIENT_ID", "QUICKBOOKS_CLIENT_SECRET"],
    docsUrl: "https://developer.intuit.com/app/developer/qbo/docs/develop",
  },
  {
    id: "myob",
    name: "MYOB Business",
    category: "accounting",
    tagline: "For AU/NZ studios running MYOB Business or AccountRight.",
    // See the QuickBooks entry above — same reason, same route back.
    stage: "planned",
    auth: { kind: "none" },
    color: "#6B2C91",
    exclusiveGroup: "accounting",
    store: "studio_integrations",
    capabilities: [
      "Invoice and payment sync is still being built",
      "Product ledger codes can already be entered, ready for when it lands",
    ],
    requiredEnv: ["MYOB_CLIENT_ID", "MYOB_CLIENT_SECRET"],
    docsUrl: "https://developer.myob.com/api/accountright/api-overview/",
  },

  // ─── Payments ────────────────────────────────────────────────────────────
  {
    id: "stripe",
    name: "Stripe",
    category: "payments",
    tagline: "Card payments, subscriptions and payouts straight to the studio's bank.",
    stage: "live",
    auth: { kind: "oauth", connectPath: "/api/stripe/connect" },
    color: "#635BFF",
    store: "stripe_connect_accounts",
    capabilities: [
      "Families pay invoices by card",
      "Payment plans and subscriptions bill automatically",
      "Balance and payout history on the Money → Payouts tab",
    ],
    usedBy: { href: "/portal/admin/money?tab=payouts", label: "Money → Payouts" },
    requiredEnv: ["STRIPE_SECRET_KEY"],
  },
  {
    id: "gocardless",
    name: "GoCardless",
    category: "payments",
    tagline: "Direct debit for termly fees, without the card surcharge.",
    stage: "planned",
    auth: { kind: "none" },
    color: "#F1F252",
    store: "studio_integrations",
  },
  {
    id: "windcave",
    name: "Windcave",
    category: "payments",
    tagline: "NZ-domiciled card processing for studios already on Windcave.",
    stage: "planned",
    auth: { kind: "none" },
    color: "#00B0F0",
    store: "studio_integrations",
  },

  // ─── Inbox ───────────────────────────────────────────────────────────────
  {
    id: "gmail",
    name: "Gmail",
    category: "inbox",
    tagline: "Read and reply to the studio mailbox from inside Olune.",
    stage: "live",
    auth: { kind: "oauth", connectPath: "/api/email/oauth/google" },
    color: "#EA4335",
    store: "email_accounts",
    capabilities: [
      "Threads matched to the parent or student who sent them",
      "Reply without leaving the family record",
    ],
    usedBy: { href: "/portal/admin/messages?tab=email", label: "Inbox → Email" },
    requiredEnv: ["GOOGLE_MAIL_CLIENT_ID", "GOOGLE_MAIL_CLIENT_SECRET"],
  },
  {
    id: "microsoft",
    name: "Microsoft 365",
    category: "inbox",
    tagline: "Outlook and Exchange mailboxes, same inbox view.",
    stage: "live",
    auth: { kind: "oauth", connectPath: "/api/email/oauth/microsoft" },
    color: "#0078D4",
    store: "email_accounts",
    usedBy: { href: "/portal/admin/messages?tab=email", label: "Inbox → Email" },
    requiredEnv: ["MICROSOFT_MAIL_CLIENT_ID", "MICROSOFT_MAIL_CLIENT_SECRET"],
  },
  {
    id: "icloud",
    name: "iCloud Mail",
    category: "inbox",
    tagline: "Connect with an app-specific password from your Apple ID.",
    stage: "live",
    auth: { kind: "credentials", dialog: "email-imap" },
    color: "#3B82F6",
    store: "email_accounts",
    usedBy: { href: "/portal/admin/messages?tab=email", label: "Inbox → Email" },
  },
  {
    id: "mailru",
    name: "Mail.ru",
    category: "inbox",
    tagline: "IMAP mailbox connected with an app password.",
    stage: "live",
    auth: { kind: "credentials", dialog: "email-imap" },
    color: "#005FF9",
    store: "email_accounts",
    usedBy: { href: "/portal/admin/messages?tab=email", label: "Inbox → Email" },
  },

  // ─── Social & advertising ────────────────────────────────────────────────
  {
    id: "facebook",
    name: "Facebook",
    category: "social",
    tagline: "Publish posts and run ads from the studio's Page.",
    stage: "live",
    auth: { kind: "oauth", connectPath: "/api/advertising/oauth/meta/connect" },
    color: "#1877F2",
    store: "social_connections",
    usedBy: { href: "/portal/admin/advertising", label: "Studio → Advertising" },
    requiredEnv: ["META_APP_ID", "META_APP_SECRET"],
  },
  {
    id: "instagram",
    name: "Instagram",
    category: "social",
    tagline: "Share ads and content to the linked Instagram Business account.",
    stage: "live",
    auth: { kind: "oauth", connectPath: "/api/advertising/oauth/meta/connect" },
    color: "#E4405F",
    store: "social_connections",
    usedBy: { href: "/portal/admin/advertising", label: "Studio → Advertising" },
    requiredEnv: ["META_APP_ID", "META_APP_SECRET"],
  },
  {
    id: "tiktok",
    name: "TikTok",
    category: "social",
    tagline: "Auto-publish video ads and organic posts.",
    stage: "live",
    auth: { kind: "oauth", connectPath: "/api/advertising/oauth/tiktok/connect" },
    color: "#000000",
    store: "social_connections",
    usedBy: { href: "/portal/admin/advertising", label: "Studio → Advertising" },
    requiredEnv: ["TIKTOK_APP_ID", "TIKTOK_APP_SECRET"],
  },
  {
    id: "telegram",
    name: "Telegram",
    category: "social",
    tagline: "Broadcast announcements to a studio channel via a bot.",
    stage: "live",
    auth: { kind: "credentials", dialog: "telegram-bot" },
    color: "#26A5E4",
    store: "social_connections",
    usedBy: { href: "/portal/admin/advertising", label: "Studio → Advertising" },
  },
  {
    id: "youtube",
    name: "YouTube",
    category: "social",
    tagline: "Publish recital and showcase footage to the studio channel.",
    stage: "planned",
    auth: { kind: "none" },
    color: "#FF0000",
    store: "studio_integrations",
  },

  // ─── Marketing & messaging ───────────────────────────────────────────────
  {
    id: "mailchimp",
    name: "Mailchimp",
    category: "marketing",
    tagline: "Keep an audience in sync with the studio roll for newsletters.",
    stage: "live",
    auth: {
      kind: "api_key",
      fields: [
        {
          key: "apiKey",
          label: "API key",
          type: "secret",
          placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-us21",
          hint: "Mailchimp → Account → Extras → API keys.",
        },
        {
          key: "audienceId",
          label: "Audience ID",
          type: "text",
          placeholder: "a1b2c3d4e5",
          optional: true,
          hint: "Leave blank if the account has only one audience — we'll use it.",
        },
      ],
    },
    color: "#FFE01B",
    store: "studio_integrations",
    capabilities: [
      "Parent contacts on the roll are pushed into the audience",
      "Syncs on connect; existing unsubscribes are never overwritten",
      "Students are never sent — the list is fee-payers only",
    ],
    docsUrl: "https://mailchimp.com/developer/marketing/guides/quick-start/",
  },
  {
    id: "twilio",
    name: "Twilio SMS",
    category: "marketing",
    tagline: "Text families about cancellations and last-minute changes.",
    stage: "live",
    auth: {
      kind: "api_key",
      fields: [
        { key: "accountSid", label: "Account SID", type: "text", placeholder: "AC…" },
        { key: "authToken", label: "Auth token", type: "secret" },
        {
          key: "fromNumber",
          label: "From number",
          type: "text",
          placeholder: "+64…",
          hint: "The Twilio number texts are sent from.",
        },
      ],
    },
    color: "#F22F46",
    store: "studio_integrations",
    capabilities: [
      "Notification texts send from your number, billed to your Twilio account",
      "Families still control which notifications reach them by SMS",
    ],
    usedBy: { href: "/portal/admin/settings", label: "Settings → Notifications" },
    docsUrl: "https://www.twilio.com/docs/messaging",
  },
  {
    id: "whatsapp",
    name: "WhatsApp Business",
    category: "marketing",
    tagline: "Class reminders on the channel most families actually read.",
    stage: "planned",
    auth: { kind: "none" },
    color: "#25D366",
    store: "studio_integrations",
  },

  // ─── Calendars ───────────────────────────────────────────────────────────
  {
    id: "google-calendar",
    name: "Google Calendar",
    category: "calendar",
    tagline: "Mirror the timetable into staff calendars, kept up to date.",
    stage: "planned",
    auth: { kind: "none" },
    color: "#4285F4",
    store: "studio_integrations",
  },
  {
    id: "outlook-calendar",
    name: "Outlook Calendar",
    category: "calendar",
    tagline: "Same timetable mirror for studios on Microsoft 365.",
    stage: "planned",
    auth: { kind: "none" },
    color: "#0078D4",
    store: "studio_integrations",
  },

  // ─── Automation ──────────────────────────────────────────────────────────
  {
    id: "zapier",
    name: "Zapier",
    category: "automation",
    tagline: "Trigger Zaps when a student enrols, a payment lands, or a class fills.",
    stage: "live",
    auth: {
      kind: "api_key",
      fields: [
        {
          key: "webhookUrl",
          label: "Catch hook URL",
          type: "url",
          placeholder: "https://hooks.zapier.com/hooks/catch/…",
          hint: "Create a 'Webhooks by Zapier' trigger and paste its URL.",
        },
      ],
    },
    color: "#FF4F00",
    store: "studio_integrations",
    capabilities: [
      "Fires on enrolment, waitlisting, class full, payment and invoice events",
      "Payloads carry ids and amounts only — never a child's details",
    ],
  },
  {
    id: "webhooks",
    name: "Custom webhook",
    category: "automation",
    tagline: "Post Olune events to any endpoint you control.",
    stage: "live",
    auth: {
      kind: "api_key",
      fields: [
        { key: "endpointUrl", label: "Endpoint URL", type: "url", placeholder: "https://…" },
        {
          key: "signingSecret",
          label: "Signing secret",
          type: "secret",
          optional: true,
          hint: "Used to HMAC the payload so you can verify it came from us.",
        },
      ],
    },
    color: "#64748B",
    store: "studio_integrations",
    capabilities: [
      "Same events as Zapier, posted to your endpoint",
      "Signed X-Olune-Signature: sha256 HMAC over '<timestamp>.<body>'",
      "X-Olune-Timestamp is signed too, so a captured payload can't be replayed",
    ],
  },

  // ─── AI & analytics ──────────────────────────────────────────────────────
  {
    id: "anthropic",
    name: "Anthropic",
    category: "intelligence",
    tagline: "Bring your own Claude key for ad copy and inbox summaries.",
    stage: "live",
    auth: {
      kind: "api_key",
      fields: [
        {
          key: "apiKey",
          label: "API key",
          type: "secret",
          placeholder: "sk-ant-…",
          hint: "From console.anthropic.com → API keys. Billed to your own account.",
        },
      ],
    },
    color: "#D97757",
    store: "studio_integrations",
    capabilities: [
      "Stored encrypted and only decrypted server-side",
      "Used for advertising copy and inbox summaries, billed to your account",
      "Takes precedence over an OpenAI key; falls back to the platform key when unset",
    ],
    usedBy: { href: "/portal/admin/advertising", label: "Studio → Advertising" },
    docsUrl: "https://docs.anthropic.com/en/api/overview",
  },
  {
    id: "openai",
    name: "OpenAI",
    category: "intelligence",
    tagline: "Alternative model key for studios standardised on OpenAI.",
    stage: "live",
    auth: {
      kind: "api_key",
      fields: [
        { key: "apiKey", label: "API key", type: "secret", placeholder: "sk-…" },
        {
          key: "organisation",
          label: "Organisation ID",
          type: "text",
          optional: true,
          placeholder: "org-…",
        },
      ],
    },
    color: "#10A37F",
    store: "studio_integrations",
    capabilities: [
      "Same features as the Anthropic key, on your OpenAI account",
      "Only used when no Anthropic key is connected",
    ],
    usedBy: { href: "/portal/admin/advertising", label: "Studio → Advertising" },
  },
  {
    id: "ga4",
    name: "Google Analytics 4",
    category: "intelligence",
    tagline: "Measurement on the studio website and enrolment funnel.",
    stage: "live",
    auth: {
      kind: "api_key",
      fields: [
        {
          key: "measurementId",
          label: "Measurement ID",
          type: "text",
          placeholder: "G-XXXXXXXXXX",
        },
      ],
    },
    color: "#E37400",
    store: "studio_integrations",
    capabilities: [
      "The gtag is loaded on your public website pages",
      "Page views are sent on every navigation, not just the first load",
      "Never loaded inside the admin or parent portal — those URLs contain family record ids",
    ],
  },
];

const BY_ID = new Map(INTEGRATIONS.map((p) => [p.id, p]));

export function getIntegration(id: string): IntegrationProvider | undefined {
  return BY_ID.get(id);
}

export function integrationsByCategory(category: IntegrationCategory): IntegrationProvider[] {
  return INTEGRATIONS.filter((p) => p.category === category);
}

/** Providers whose credentials live in the generic studio_integrations table. */
export function genericProviderIds(): string[] {
  return INTEGRATIONS.filter((p) => p.store === "studio_integrations").map((p) => p.id);
}

/** Providers a studio can actually connect right now (excludes `planned`). */
export function connectableIntegrations(): IntegrationProvider[] {
  return INTEGRATIONS.filter((p) => p.auth.kind !== "none");
}

export const ACCOUNTING_PROVIDER_IDS = ["xero", "quickbooks", "myob"] as const;
export type AccountingProviderId = (typeof ACCOUNTING_PROVIDER_IDS)[number];

export function isAccountingProviderId(id: string): id is AccountingProviderId {
  return (ACCOUNTING_PROVIDER_IDS as readonly string[]).includes(id);
}
