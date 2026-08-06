"use client";

// ============================================================================
//  ConnectionCard — one provider, whatever its stage or auth style.
//
//  Every branch of the card is driven by catalog data plus the per-studio
//  state, so a `planned` provider added to the catalog renders correctly with
//  no code change here: mark, name, tagline, a "Planned" chip and no button.
// ============================================================================

import type { IntegrationProvider, IntegrationState } from "@/lib/integrations/types";
import { ProviderMark } from "./ProviderMark";

const STAGE_CHIP: Record<
  IntegrationProvider["stage"],
  { label: string; fg: string; bg: string } | null
> = {
  live: null,
  beta: { label: "Partial", fg: "#92400e", bg: "rgba(245,158,11,0.16)" },
  planned: { label: "Planned", fg: "var(--muted)", bg: "var(--t2)" },
};

function StatusDot({ state }: { state: IntegrationState }) {
  const color =
    state.status === "connected"
      ? "#22c55e"
      : state.status === "error"
        ? "#ef4444"
        : state.status === "pending"
          ? "#f59e0b"
          : "var(--muted)";
  const label =
    state.status === "connected"
      ? "Connected"
      : state.status === "error"
        ? "Needs attention"
        : state.status === "pending"
          ? "Finishing setup"
          : "Not connected";
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function relativeTime(iso: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function ConnectionCard({
  provider,
  state,
  missingEnv,
  blockedBy,
  busy,
  onConnect,
  onManage,
  onDisconnect,
}: {
  provider: IntegrationProvider;
  state: IntegrationState;
  missingEnv: string[];
  /** Name of the sibling holding this provider's exclusive slot, if any. */
  blockedBy: string | null;
  busy: boolean;
  onConnect: () => void;
  onManage: () => void;
  onDisconnect: () => void;
}) {
  const chip = STAGE_CHIP[provider.stage];
  const planned = provider.stage === "planned";
  // Deleting the Stripe Connect row would orphan live subscriptions and
  // in-flight payouts — that one is unwound from Stripe's own dashboard.
  const canDisconnect = provider.store !== "stripe_connect_accounts";
  const unavailable = !state.connected && (!state.configured || planned);
  const last = relativeTime(state.lastActivityAt);

  return (
    <div
      id={`connection-${provider.id}`}
      className="flex scroll-mt-24 flex-col rounded-[18px] border p-[16px] transition-colors"
      style={{
        background: state.connected ? "var(--surface)" : "var(--t1)",
        borderColor: state.status === "error" ? "rgba(239,68,68,0.4)" : "var(--hair)",
        opacity: planned && !state.connected ? 0.72 : 1,
      }}
    >
      <div className="flex items-start gap-3">
        <ProviderMark name={provider.name} color={provider.color} dimmed={planned} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold text-ink">{provider.name}</p>
            {chip && (
              <span
                className="rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider"
                style={{ color: chip.fg, background: chip.bg }}
              >
                {chip.label}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{provider.tagline}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <StatusDot state={state} />
        {state.accountLabel && (
          <span className="truncate text-[11.5px] text-muted">{state.accountLabel}</span>
        )}
        {last && state.connected && <span className="text-[11px] text-muted">· {last}</span>}
      </div>

      {state.error && (
        <p className="mt-2 rounded-lg px-2.5 py-1.5 text-[11.5px] leading-snug text-red-600"
           style={{ background: "rgba(239,68,68,0.08)" }}>
          {state.error}
        </p>
      )}

      {!state.connected && !state.configured && !planned && (
        <p className="mt-2 text-[11.5px] leading-snug text-muted">
          Not available on this deployment
          {missingEnv.length > 0 && <> — missing {missingEnv.join(", ")}</>}.
        </p>
      )}

      {blockedBy && !state.connected && (
        <p className="mt-2 text-[11.5px] leading-snug text-muted">
          {blockedBy} is already the studio&apos;s ledger. Disconnect it first.
        </p>
      )}

      {provider.capabilities && provider.capabilities.length > 0 && (
        <ul className="mt-3 space-y-1">
          {provider.capabilities.map((cap) => (
            <li key={cap} className="flex gap-2 text-[11.5px] leading-snug text-muted">
              <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full" style={{ background: "var(--ring)" }} />
              {cap}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        {state.connected ? (
          <>
            {state.status === "pending" && provider.auth.kind === "oauth" && (
              <button
                type="button"
                onClick={onConnect}
                disabled={busy}
                className="rounded-full px-4 py-1.5 text-[12px] font-semibold text-white transition disabled:opacity-50"
                style={{
                  background:
                    "linear-gradient(150deg, var(--tg), var(--brand) 60%, var(--brand-deep))",
                }}
              >
                Finish setup
              </button>
            )}
            {provider.auth.kind === "api_key" && (
              <button
                type="button"
                onClick={onManage}
                disabled={busy}
                className="rounded-full border px-3.5 py-1.5 text-[12px] font-semibold text-ink transition hover:bg-[--t2] disabled:opacity-50"
                style={{ borderColor: "var(--ring)" }}
              >
                Update keys
              </button>
            )}
            {provider.usedBy && (
              <a
                href={provider.usedBy.href}
                className="rounded-full border px-3.5 py-1.5 text-[12px] font-semibold text-ink transition hover:bg-[--t2]"
                style={{ borderColor: "var(--ring)" }}
              >
                {provider.usedBy.label}
              </a>
            )}
            {canDisconnect ? (
              <button
                type="button"
                onClick={onDisconnect}
                disabled={busy}
                className="ml-auto text-[12px] font-semibold text-muted transition hover:text-red-600 disabled:opacity-50"
              >
                Disconnect
              </button>
            ) : (
              <span className="ml-auto text-[11px] text-muted">Managed in Stripe</span>
            )}
          </>
        ) : planned ? (
          <span className="text-[12px] font-semibold text-muted">Not available yet</span>
        ) : (
          <button
            type="button"
            onClick={onConnect}
            disabled={busy || unavailable || Boolean(blockedBy)}
            className="rounded-full px-4 py-1.5 text-[12px] font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              background: "linear-gradient(150deg, var(--tg), var(--brand) 60%, var(--brand-deep))",
            }}
          >
            {provider.auth.kind === "api_key" ? "Add keys" : `Connect ${provider.name}`}
          </button>
        )}
      </div>
    </div>
  );
}
