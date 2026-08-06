// ============================================================================
//  Shared types for the studio connections hub (Settings → Connections).
//
//  The catalog (./catalog.ts) is pure client-safe data: it describes every
//  system Olune can talk to, including ones that aren't wired up yet. The
//  runtime state (./state.ts, server-only) says what a given studio has
//  actually connected. Keeping those apart is what lets the UI list a provider
//  months before its sync code exists.
// ============================================================================

/** Where a provider sits in the hub. Order here is the order on the page. */
export const INTEGRATION_CATEGORIES = [
  "accounting",
  "payments",
  "inbox",
  "social",
  "marketing",
  "calendar",
  "automation",
  "intelligence",
] as const;

export type IntegrationCategory = (typeof INTEGRATION_CATEGORIES)[number];

/**
 * How far along a provider is.
 *  - live      fully wired: connect it and it does its job
 *  - beta      connects and stores credentials, but the sync/actions are partial
 *  - planned   listed so studios can see it's coming; no connect path yet
 */
export type IntegrationStage = "live" | "beta" | "planned";

/** A field on an API-key/credential form. */
export type IntegrationField = {
  key: string;
  label: string;
  /** `secret` renders masked and is never sent back to the browser once saved. */
  type: "text" | "secret" | "url";
  placeholder?: string;
  hint?: string;
  optional?: boolean;
};

export type IntegrationAuth =
  /** Redirect to `connectPath`, provider hands back tokens. */
  | { kind: "oauth"; connectPath: string }
  /** Studio pastes keys into a form; stored encrypted in studio_integrations. */
  | { kind: "api_key"; fields: IntegrationField[] }
  /** Host/username/password style (IMAP, SMTP). Handled by a bespoke dialog. */
  | { kind: "credentials"; dialog: "email-imap" | "telegram-bot" }
  /** Nothing to connect yet. */
  | { kind: "none" };

export type IntegrationProvider = {
  id: string;
  name: string;
  category: IntegrationCategory;
  /** One line, sentence case, says what connecting it gets you. */
  tagline: string;
  stage: IntegrationStage;
  auth: IntegrationAuth;
  /** Brand colour used for the mark tile. */
  color: string;
  /** Short bullets shown when the card is expanded. */
  capabilities?: string[];
  /**
   * Only one provider per group can be connected at a time (e.g. one ledger).
   * The UI greys out siblings and explains why.
   */
  exclusiveGroup?: "accounting";
  /**
   * Where the connection's data actually lives. `studio_integrations` is the
   * generic table; the others are the pre-existing bespoke tables.
   */
  store:
    | "studio_integrations"
    | "xero_connections"
    | "stripe_connect_accounts"
    | "email_accounts"
    | "social_connections";
  /** Deep link to where the connected data shows up in the app. */
  usedBy?: { href: string; label: string };
  docsUrl?: string;
  /** Env vars an operator must set before this provider can be offered. */
  requiredEnv?: string[];
};

/** Runtime state of one provider for one studio. */
export type IntegrationState = {
  providerId: string;
  connected: boolean;
  /** Provider is in the catalog but the platform env isn't configured for it. */
  configured: boolean;
  /** Account name / email / org shown under the provider name. */
  accountLabel: string | null;
  status: "connected" | "pending" | "error" | "disconnected";
  lastActivityAt: string | null;
  error: string | null;
};

export type IntegrationStateMap = Record<string, IntegrationState>;

export function emptyState(providerId: string, configured: boolean): IntegrationState {
  return {
    providerId,
    connected: false,
    configured,
    accountLabel: null,
    status: "disconnected",
    lastActivityAt: null,
    error: null,
  };
}
