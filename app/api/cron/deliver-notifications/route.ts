// ============================================================================
//  GET /api/cron/deliver-notifications   (Session 16 — EMAIL/SMS delivery)
//
//  Flushes un-delivered `notifications` rows to their external channels (email
//  via Resend, SMS via Twilio). In-app notifications already exist as rows; this
//  is purely the outbound fan-out. Channel routing per type lives in
//  lib/notify/messages.ts (channelsForType).
//
//  Per row:
//    • No outbound channels (e.g. message_received) → marked delivered (in-app
//      only), nothing sent.
//    • A channel with no recipient address, or a provider that isn't configured
//      (no API keys) → treated as terminal for that channel (won't retry).
//    • A real send error → left queued with a `next_attempt_at` set from the
//      backoff schedule in lib/notify/backoff.ts, and retried once that time
//      passes. After the budget is exhausted (~4h20m across 5 attempts) it's
//      marked delivered with the last error kept.
//
//  This route is safe to run frequently: the batch is bounded, every write is
//  keyed by row id, and a row waiting out a backoff is skipped rather than
//  re-sent. It is scheduled every 5 minutes.
//
//  Auth: `Authorization: Bearer <CRON_SECRET>` or `?secret=<CRON_SECRET>`.
//  Fails closed in production when CRON_SECRET is unset. Service-role client.
//
//  Requires env: SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET.
//  Optional env (delivery no-ops without them): RESEND_API_KEY + RESEND_FROM,
//  TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizedCron } from "@/lib/cron/auth";
import {
  channelsForType,
  renderNotificationEmail,
  renderNotificationSms,
  type DeliverableNotification,
} from "@/lib/notify/messages";
import { sendEmail, sendSms } from "@/lib/notify/providers";
import { nextAttemptAt } from "@/lib/notify/backoff";

export const dynamic = "force-dynamic";

const DEFAULT_BATCH = 200;

type ProfileContact = { id: string; email: string | null; phone: string | null };

export async function GET(req: NextRequest) {
  if (!authorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let supabase;
  try {
    supabase = createAdminClient();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Admin client unavailable" },
      { status: 500 },
    );
  }

  const limitParam = Number(req.nextUrl.searchParams.get("limit"));
  const batch =
    Number.isFinite(limitParam) && limitParam > 0 && limitParam <= 1000
      ? Math.floor(limitParam)
      : DEFAULT_BATCH;

  const summary = {
    processed: 0,
    emailsSent: 0,
    smsSent: 0,
    inAppOnly: 0,
    failedRetained: 0,
    gaveUp: 0,
  };

  // 1. Pull the un-delivered queue that is due now (oldest first).
  //
  //    `next_attempt_at` (0117) is null until a row first fails, so a fresh
  //    notification is always due. A row waiting out a backoff is skipped by
  //    value rather than by a separate query — see lib/notify/backoff.ts.
  //
  //    nullsFirst matters: never-attempted rows must sort ahead of rows already
  //    carrying failures, or a provider outage would fill the batch with its
  //    own retries and starve new notifications behind them.
  const dueBeforeIso = new Date().toISOString();
  const { data: rows, error: fetchErr } = await supabase
    .from("notifications")
    .select("id, type, title, body, link, user_id, studio_id, delivery_attempts")
    .is("delivered_at", null)
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${dueBeforeIso}`)
    .order("next_attempt_at", { ascending: true, nullsFirst: true })
    .order("sent_at", { ascending: true })
    .limit(batch);

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!rows || rows.length === 0) {
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), summary });
  }

  // 2. Resolve recipient contact details + notification preferences in one go.
  const userIds = [...new Set(rows.map((r) => r.user_id as string))];
  const [{ data: profiles }, { data: prefRows }] = await Promise.all([
    supabase.from("profiles").select("id, email, phone").in("id", userIds),
    supabase
      .from("notification_preferences")
      .select("user_id, notification_type, email_enabled, sms_enabled")
      .in("user_id", userIds),
  ]);
  const contacts = new Map<string, ProfileContact>(
    (profiles ?? []).map((p) => [
      p.id as string,
      { id: p.id as string, email: p.email as string | null, phone: p.phone as string | null },
    ]),
  );
  // prefKey = `${userId}:${type}` → { emailEnabled, smsEnabled }
  const prefMap = new Map<string, { emailEnabled: boolean; smsEnabled: boolean }>(
    (prefRows ?? []).map((p) => [
      `${p.user_id}:${p.notification_type}`,
      { emailEnabled: Boolean(p.email_enabled), smsEnabled: Boolean(p.sms_enabled) },
    ]),
  );
  function channelEnabled(userId: string, type: string, channel: "email" | "sms"): boolean {
    const pref = prefMap.get(`${userId}:${type}`);
    if (!pref) return true; // default on when no explicit preference saved
    return channel === "email" ? pref.emailEnabled : pref.smsEnabled;
  }

  const nowIso = new Date().toISOString();

  // 3. Deliver each row.
  for (const row of rows) {
    summary.processed += 1;
    const channels = channelsForType(row.type as string);
    const attempts = ((row.delivery_attempts as number) ?? 0) + 1;
    const update: Record<string, unknown> = { delivery_attempts: attempts };

    if (channels.length === 0) {
      // In-app only — nothing to send, mark done.
      update.delivered_at = nowIso;
      summary.inAppOnly += 1;
      await supabase.from("notifications").update(update).eq("id", row.id);
      continue;
    }

    const notif: DeliverableNotification = {
      id: row.id as string,
      type: row.type as string,
      title: row.title as string,
      body: (row.body as string | null) ?? null,
      link: (row.link as string | null) ?? null,
    };
    const contact = contacts.get(row.user_id as string);
    const errors: string[] = [];
    let retryable = false;

    if (channels.includes("email") && channelEnabled(row.user_id as string, row.type as string, "email")) {
      if (contact?.email) {
        const r = await sendEmail({ to: contact.email, ...renderNotificationEmail(notif) });
        if (r.ok) {
          update.email_sent_at = nowIso;
          summary.emailsSent += 1;
        } else if (!r.skipped) {
          errors.push(`email: ${r.error}`);
          retryable = true;
        }
        // r.skipped (no keys) → terminal, no retry.
      }
      // no email address → terminal for this channel.
    }

    if (channels.includes("sms") && channelEnabled(row.user_id as string, row.type as string, "sms")) {
      if (contact?.phone) {
        const r = await sendSms({
          to: contact.phone,
          body: renderNotificationSms(notif),
          // Studios with their own connected Twilio account send from their own
          // number; everyone else falls back to the platform credentials.
          studioId: (row.studio_id as string | null) ?? null,
        });
        if (r.ok) {
          update.sms_sent_at = nowIso;
          summary.smsSent += 1;
        } else if (!r.skipped) {
          errors.push(`sms: ${r.error}`);
          retryable = true;
        }
      }
    }

    if (errors.length) update.delivery_error = errors.join(" | ");

    if (!retryable) {
      update.delivered_at = nowIso;
    } else {
      // Schedule the retry rather than relying on "the next pass" — at a
      // 5-minute cadence that would burn the whole budget inside a blip.
      const retryAt = nextAttemptAt(attempts);
      if (retryAt === null) {
        update.delivered_at = nowIso; // budget exhausted; keep last error.
        summary.gaveUp += 1;
      } else {
        update.next_attempt_at = retryAt.toISOString();
        summary.failedRetained += 1;
      }
    }

    await supabase.from("notifications").update(update).eq("id", row.id);
  }

  return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), summary });
}
