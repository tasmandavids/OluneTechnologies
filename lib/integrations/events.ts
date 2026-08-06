import "server-only";

// ============================================================================
//  Outbound event dispatch — Zapier and custom webhooks.
//
//  Both providers stored a URL that nothing ever posted to. This is the sender.
//  A studio connects a Zapier catch hook, or its own endpoint plus a signing
//  secret, and the events below land there as they happen.
//
//  Three rules the callers depend on:
//
//    1. Dispatch never throws. It is called from the middle of enrolment and
//       payment paths; a studio's broken Zap must not fail a real enrolment or
//       a Stripe webhook. Every failure is swallowed and recorded on the
//       connection instead, where the hub's card can show it.
//    2. Dispatch is not awaited by default (see `dispatchStudioEvent`). The
//       caller returns as soon as its own work is done.
//    3. Payloads carry ids and amounts, never names, addresses or anything
//       else about a child. The endpoint is the studio's, but it is still off
//       our infrastructure — an id the studio can look up is enough.
// ============================================================================

import { createHmac, randomUUID } from "node:crypto";
import { getStudioConnectionAdmin, markConnectionResult } from "./credentials";

/**
 * Every event Olune emits. Adding one is a new member here plus a call at the
 * point it happens — the transport below doesn't need to change.
 */
export type OluneEventType =
  | "enrolment.created"
  | "enrolment.waitlisted"
  | "enrolment.cancelled"
  | "class.filled"
  | "payment.succeeded"
  | "payment.failed"
  | "invoice.sent";

export type OluneEvent = {
  type: OluneEventType;
  studioId: string;
  /** Ids and amounts only — see rule 3 above. */
  data: Record<string, string | number | boolean | null>;
};

type Envelope = {
  id: string;
  type: OluneEventType;
  studioId: string;
  occurredAt: string;
  data: Record<string, unknown>;
};

/** Long enough for a slow endpoint, short enough not to hold up a webhook. */
const TIMEOUT_MS = 5000;

function envelope(event: OluneEvent): Envelope {
  return {
    // Lets a receiver dedupe if we ever retry, and gives the studio something
    // to quote when an event looks wrong.
    id: randomUUID(),
    type: event.type,
    studioId: event.studioId,
    occurredAt: new Date().toISOString(),
    data: event.data,
  };
}

/**
 * `sha256=<hex>` over `<timestamp>.<body>`.
 *
 * The timestamp is inside the signed string so a captured payload can't be
 * replayed later — the receiver rejects a stale timestamp and can't forge a
 * fresh one without the secret.
 *
 * Exported because it is a contract, not an implementation detail: a studio
 * reimplements exactly this on its own endpoint to verify us. Changing the
 * format silently breaks every receiver, so it is pinned by a test.
 */
export function signWebhookPayload(secret: string, timestamp: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

async function post(
  url: string,
  body: string,
  signingSecret: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Olune-Webhooks/1",
    "X-Olune-Timestamp": timestamp,
  };
  if (signingSecret) {
    headers["X-Olune-Signature"] = signWebhookPayload(signingSecret, timestamp, body);
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, error: `${res.status} ${detail.slice(0, 200)}`.trim() };
    }
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "request failed";
    // AbortSignal.timeout surfaces as a TimeoutError, which reads as nothing
    // useful on the connection card without this.
    return { ok: false, error: message === "The operation was aborted due to timeout" ? `no response within ${TIMEOUT_MS}ms` : message };
  }
}

/**
 * Deliver one event to every endpoint this studio has connected.
 *
 * Resolves only once every endpoint has been tried — await it when you need
 * that (tests, a cron that reports what it sent). In request paths prefer
 * `dispatchStudioEvent`, which drops the promise.
 */
export async function dispatchStudioEventSync(event: OluneEvent): Promise<void> {
  const [zapier, webhook] = await Promise.all([
    getStudioConnectionAdmin(event.studioId, "zapier"),
    getStudioConnectionAdmin(event.studioId, "webhooks"),
  ]);

  const targets: { provider: string; url: string; secret: string | null }[] = [];

  const zapierUrl = zapier?.values.webhookUrl?.trim();
  // Zapier catch hooks are unauthenticated by design — the URL is the secret,
  // so there is nothing to sign with.
  if (zapierUrl) targets.push({ provider: "zapier", url: zapierUrl, secret: null });

  const endpointUrl = webhook?.values.endpointUrl?.trim();
  if (endpointUrl) {
    targets.push({
      provider: "webhooks",
      url: endpointUrl,
      secret: webhook?.values.signingSecret?.trim() || null,
    });
  }

  if (targets.length === 0) return;

  const body = JSON.stringify(envelope(event));

  await Promise.all(
    targets.map(async (target) => {
      const result = await post(target.url, body, target.secret);
      await markConnectionResult(
        event.studioId,
        target.provider,
        result.ok ? { ok: true } : { ok: false, error: `${event.type}: ${result.error}` },
      );
    }),
  );
}

/**
 * Fire an event without waiting for it.
 *
 * The rejection handler is not optional decoration: an unhandled rejection
 * from a dropped promise takes down the Node process on some runtimes, and
 * this is called from paths where that would mean losing a Stripe webhook.
 */
export function dispatchStudioEvent(event: OluneEvent): void {
  void dispatchStudioEventSync(event).catch((e) => {
    console.warn(
      `[integrations] dispatch failed for ${event.type}:`,
      e instanceof Error ? e.message : e,
    );
  });
}
