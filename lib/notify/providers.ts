// ============================================================================
//  lib/notify/providers.ts
//
//  Thin IO wrappers around Resend (email) + Twilio (SMS), both via their REST
//  APIs using `fetch` — no SDK dependencies. Each call returns a discriminated
//  result; when the provider isn't configured it returns `{ skipped: true }`
//  rather than throwing, so the delivery cron degrades gracefully in any
//  environment that hasn't set the keys.
//
//  SMS resolves credentials per studio first: a studio that connected its own
//  Twilio account in Settings → Connections sends from its own number and is
//  billed on its own account. The platform env vars remain the fallback for
//  studios that haven't, so behaviour is unchanged for everyone else.
//
//  Server-only. Never import into client components.
// ============================================================================

import { getStudioConnectionAdmin, hasValues } from "@/lib/integrations/credentials";
import { getEmailConfig, getSmsConfig, type SmsConfig } from "./config";

export type SendResult =
  | { ok: true; skipped?: false; id?: string }
  | { ok: false; skipped: true } // provider not configured — no-op
  | { ok: false; skipped?: false; error: string };

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
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
