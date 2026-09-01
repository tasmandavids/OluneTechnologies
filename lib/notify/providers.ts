// ============================================================================
//  lib/notify/providers.ts
//
//  Thin IO wrappers around Resend (email), Twilio (SMS) and Expo (push), all
//  via their REST APIs using `fetch` — no SDK dependencies. Each call returns a
//  discriminated result; when the provider isn't configured it returns
//  `{ skipped: true }` rather than throwing, so the delivery cron degrades
//  gracefully in any environment that hasn't set the keys.
//
//  SMS resolves credentials per studio first: a studio that connected its own
//  Twilio account in Settings → Connections sends from its own number and is
//  billed on its own account. The platform env vars remain the fallback for
//  studios that haven't, so behaviour is unchanged for everyone else.
//
//  Server-only. Never import into client components.
// ============================================================================

import { getStudioConnectionAdmin, hasValues } from "@/lib/integrations/credentials";
import { getEmailConfig, getPushConfig, getSmsConfig, type SmsConfig } from "./config";

export type SendResult =
  | { ok: true; skipped?: false; id?: string }
  | { ok: false; skipped: true } // provider not configured — no-op
  | { ok: false; skipped?: false; error: string };

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
  /**
   * Overrides RESEND_REPLY_TO for this message. Studio-branded mail passes the
   * studio's own address here (see lib/notify/reply-to.ts); the global default
   * is Olune's own support address and is only right for Olune's own mail.
   */
  replyTo?: string;
}): Promise<SendResult> {
  const cfg = getEmailConfig();
  if (!cfg) return { ok: false, skipped: true };
  if (!params.to) return { ok: false, error: "missing recipient email" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: cfg.from,
        to: [params.to],
        subject: params.subject,
        html: params.html,
        text: params.text,
        // Per-send wins over the global default; omitted entirely when neither
        // is set, since Resend treats an empty reply_to as a validation error
        // rather than as "no reply-to".
        ...(params.replyTo?.trim() || cfg.replyTo
          ? { reply_to: params.replyTo?.trim() || cfg.replyTo }
          : {}),
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, error: `resend ${res.status}: ${detail.slice(0, 200)}` };
    }
    const json = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: json.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "email send failed" };
  }
}

/**
 * The studio's own Twilio connection, if it has one and it's complete.
 *
 * A half-filled connection (say the number was never saved) falls through to
 * the platform account rather than erroring — the studio still gets its texts,
 * and the hub's card is where the gap gets reported.
 */
async function studioSmsConfig(studioId: string): Promise<SmsConfig | null> {
  const connection = await getStudioConnectionAdmin(studioId, "twilio");
  if (!hasValues(connection, "accountSid", "authToken", "fromNumber")) return null;
  return {
    accountSid: connection.values.accountSid.trim(),
    authToken: connection.values.authToken.trim(),
    from: connection.values.fromNumber.trim(),
  };
}

export async function sendSms(params: {
  to: string;
  body: string;
  /** Send from this studio's own Twilio account when it has connected one. */
  studioId?: string | null;
}): Promise<SendResult> {
  const cfg = (params.studioId ? await studioSmsConfig(params.studioId) : null) ?? getSmsConfig();
  if (!cfg) return { ok: false, skipped: true };
  if (!params.to) return { ok: false, error: "missing recipient phone" };

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`;
    const form = new URLSearchParams({ To: params.to, From: cfg.from, Body: params.body });
    const auth = Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString("base64");
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, error: `twilio ${res.status}: ${detail.slice(0, 200)}` };
    }
    const json = (await res.json().catch(() => ({}))) as { sid?: string };
    return { ok: true, id: json.sid };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "sms send failed" };
  }
}

// ============================================================================
//  PUSH — Expo
// ============================================================================
//  Push is the one channel that is genuinely multi-recipient: a parent signs in
//  on a phone and an iPad, and both are the same notification. Expo answers
//  per-message, so `sendPush` returns a ticket per token rather than the single
//  SendResult the other two providers use — the caller needs to know *which*
//  device failed in order to revoke it.
//
//  The revocation half matters as much as the send. Expo replies
//  `DeviceNotRegistered` once an app is uninstalled, and a project that keeps
//  pushing to dead tokens gets rate-limited. `unregistered` on a ticket is the
//  signal to soft-revoke that row (see 0120).
// ============================================================================

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/** Expo rejects requests carrying more than 100 messages. */
const EXPO_BATCH_LIMIT = 100;

export type PushTicket =
  | { token: string; ok: true; id?: string }
  | {
      token: string;
      ok: false;
      /** Worth another attempt later (transport blip, Expo 5xx, throttling). */
      retryable: boolean;
      /** The token is dead or malformed — revoke it, never retry. */
      unregistered: boolean;
      error: string;
    };

export type PushResult =
  | { skipped: true; tickets?: undefined }
  | { skipped: false; tickets: PushTicket[] };

export type PushMessage = {
  tokens: string[];
  title: string;
  body: string;
  /** Deep-link payload the app reads on tap. Keep it small — Expo caps at 4KiB. */
  data?: Record<string, unknown>;
  /** Android notification channel; must exist in the app or the push is silent. */
  channelId?: string;
};

/** Expo's own shape for a per-message receipt in the send response. */
type ExpoTicket = {
  status?: string;
  id?: string;
  message?: string;
  details?: { error?: string };
};

/**
 * Errors Expo reports that mean "stop sending to this token", as opposed to
 * "try again later". Anything else is treated as retryable, which is the safe
 * default: retrying a live token costs one more request, whereas revoking a
 * live token silently stops a parent's notifications for good.
 */
function isTerminalPushError(detail: string | undefined, message: string): boolean {
  if (detail === "DeviceNotRegistered") return true;
  // Expo returns no `details.error` for a malformed token — only prose.
  return /is not a valid expo push token/i.test(message);
}

export async function sendPush(params: PushMessage): Promise<PushResult> {
  const cfg = getPushConfig();
  if (!cfg) return { skipped: true };

  const tokens = params.tokens.filter((t) => t.trim().length > 0);
  if (tokens.length === 0) return { skipped: false, tickets: [] };

  const tickets: PushTicket[] = [];

  for (let i = 0; i < tokens.length; i += EXPO_BATCH_LIMIT) {
    const batch = tokens.slice(i, i + EXPO_BATCH_LIMIT);
    const messages = batch.map((to) => ({
      to,
      title: params.title,
      body: params.body,
      data: params.data ?? {},
      sound: "default",
      ...(params.channelId ? { channelId: params.channelId } : {}),
    }));

    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
        },
        body: JSON.stringify(messages),
      });

      if (!res.ok) {
        // A non-200 fails the whole batch — Expo never partially applied it.
        const detail = await res.text().catch(() => "");
        const error = `expo ${res.status}: ${detail.slice(0, 200)}`;
        // 4xx other than 429 is our bug (bad auth, malformed body) and will
        // fail identically on every retry; don't burn the row's retry budget.
        const retryable = res.status === 429 || res.status >= 500;
        for (const token of batch) {
          tickets.push({ token, ok: false, retryable, unregistered: false, error });
        }
        continue;
      }

      const json = (await res.json().catch(() => ({}))) as { data?: ExpoTicket[] };
      const data = Array.isArray(json.data) ? json.data : [];

      batch.forEach((token, idx) => {
        const ticket = data[idx];
        if (!ticket) {
          // Expo returned fewer tickets than messages — shouldn't happen, but
          // guessing "delivered" would hide a real outage.
          tickets.push({
            token,
            ok: false,
            retryable: true,
            unregistered: false,
            error: "expo: no ticket returned for message",
          });
          return;
        }
        if (ticket.status === "ok") {
          tickets.push({ token, ok: true, id: ticket.id });
          return;
        }
        const message = ticket.message ?? "push rejected";
        tickets.push({
          token,
          ok: false,
          unregistered: isTerminalPushError(ticket.details?.error, message),
          retryable: !isTerminalPushError(ticket.details?.error, message),
          error: `expo: ${message}`.slice(0, 200),
        });
      });
    } catch (e) {
      const error = e instanceof Error ? e.message : "push send failed";
      for (const token of batch) {
        tickets.push({ token, ok: false, retryable: true, unregistered: false, error });
      }
    }
  }

  return { skipped: false, tickets };
}
