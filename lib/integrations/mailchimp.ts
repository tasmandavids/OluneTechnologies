import "server-only";

// ============================================================================
//  Mailchimp audience sync.
//
//  The card promised "keep an audience in sync with the studio roll" and until
//  now only stored the key. This pushes the studio's parent contacts into the
//  chosen audience.
//
//  Two deliberate choices:
//
//  * Parents only. Students are children; their contact details are not
//    marketing list material, and the roll a studio wants to mail is the
//    fee-payers anyway.
//  * `status_if_new: "subscribed"`. Everyone on the roll is an existing
//    customer of the studio, which is the relationship Mailchimp's own terms
//    treat as consent. Contacts who already exist keep whatever status they
//    have — an unsubscribe is never overwritten by a sync.
// ============================================================================

import { createHash } from "node:crypto";
import { getStudioConnectionAdmin, hasValues, markConnectionResult } from "./credentials";

export type MailchimpAudience = { id: string; name: string; memberCount: number };

export type MailchimpSyncResult =
  | { ok: true; audienceId: string; created: number; updated: number; skipped: number }
  | { ok: false; error: string };

/**
 * Mailchimp keys end in `-<dc>` (e.g. `…-us21`) naming the data centre that
 * serves the account. There is no global host — the wrong one 401s.
 */
function dataCentre(apiKey: string): string | null {
  const dc = apiKey.split("-").pop();
  return dc && dc !== apiKey ? dc : null;
}

async function mailchimp<T>(
  apiKey: string,
  path: string,
  init?: { method: string; body: unknown },
): Promise<T> {
  const dc = dataCentre(apiKey);
  if (!dc) throw new Error("API key is missing its data-centre suffix (e.g. -us21)");

  const res = await fetch(`https://${dc}.api.mailchimp.com/3.0${path}`, {
    method: init?.method ?? "GET",
    headers: {
      // Mailchimp ignores the username on basic auth; "anystring" is what
      // their own docs use.
      Authorization: `Basic ${Buffer.from(`anystring:${apiKey}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: init ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });

  const text = await res.text();
  if (!res.ok) {
    // Mailchimp returns RFC 7807 problem details; `detail` is the human line.
    let detail = text.slice(0, 200);
    try {
      const parsed = JSON.parse(text) as { detail?: string };
      if (parsed.detail) detail = parsed.detail;
    } catch {
      /* keep the raw body */
    }
    throw new Error(`Mailchimp ${res.status}: ${detail}`);
  }

  return JSON.parse(text) as T;
}

/** The audiences on the account, so a studio can pick one (or we can). */
export async function listAudiences(apiKey: string): Promise<MailchimpAudience[]> {
  const json = await mailchimp<{
    lists?: { id: string; name: string; stats?: { member_count?: number } }[];
  }>(apiKey, "/lists?count=100&fields=lists.id,lists.name,lists.stats.member_count");

  return (json.lists ?? []).map((list) => ({
    id: list.id,
    name: list.name,
    memberCount: list.stats?.member_count ?? 0,
  }));
}

/** Mailchimp addresses a member by the MD5 of their lowercased email. */
function subscriberHash(email: string): string {
  return createHash("md5").update(email.trim().toLowerCase()).digest("hex");
}

function splitName(fullName: string | null): { first: string; last: string } {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

type ContactRow = { email: string | null; full_name: string | null };

/** Structural client type — see the note in ./state.ts. */
type RollQueryClient = { from: (table: string) => unknown };

type RollBuilder = {
  select: (cols: string) => {
    eq: (col: string, val: string) => {
      eq: (col: string, val: string) => PromiseLike<{ data: unknown }>;
    };
  };
};

/**
 * Push the studio's parent contacts into its Mailchimp audience.
 *
 * `supabase` must already be scoped to this studio — pass the caller's own
 * RLS-bound client. When `audienceId` was left blank at connect time and the
 * account has exactly one audience, that one is used; more than one and we
 * stop rather than guess which list to write into.
 */
export async function syncStudioAudience(
  supabase: RollQueryClient,
  studioId: string,
): Promise<MailchimpSyncResult> {
  const connection = await getStudioConnectionAdmin(studioId, "mailchimp");
  if (!hasValues(connection, "apiKey")) {
    return { ok: false, error: "Mailchimp isn't connected" };
  }
  const apiKey = connection.values.apiKey.trim();

  try {
    let audienceId = connection.values.audienceId?.trim() || "";
    if (!audienceId) {
      const audiences = await listAudiences(apiKey);
      if (audiences.length === 0) {
        return { ok: false, error: "This Mailchimp account has no audiences yet" };
      }
      if (audiences.length > 1) {
        return {
          ok: false,
          error: `Set the audience ID — this account has ${audiences.length} audiences`,
        };
      }
      audienceId = audiences[0].id;
    }

    const { data } = await (supabase.from("profiles") as RollBuilder)
      .select("email, full_name")
      .eq("studio_id", studioId)
      .eq("role", "parent");

    const rows = (data as ContactRow[] | null) ?? [];

    // Dedupe on the address Mailchimp keys by, so two profiles sharing a
    // household email don't collide inside one batch.
    const byEmail = new Map<string, ContactRow>();
    let skipped = 0;
    for (const row of rows) {
      const email = row.email?.trim().toLowerCase();
      if (!email || !email.includes("@")) {
        skipped += 1;
        continue;
      }
      if (!byEmail.has(email)) byEmail.set(email, row);
    }

    if (byEmail.size === 0) {
      await markConnectionResult(studioId, "mailchimp", { ok: true });
      return { ok: true, audienceId, created: 0, updated: 0, skipped };
    }

    const members = [...byEmail.entries()].map(([email, row]) => {
      const { first, last } = splitName(row.full_name);
      return {
        email_address: email,
        // Only applied to contacts Mailchimp doesn't already know — an
        // existing unsubscribe is never resurrected by a sync.
        status_if_new: "subscribed",
        merge_fields: { FNAME: first, LNAME: last },
      };
    });

    let created = 0;
    let updated = 0;

    // The batch-subscribe endpoint takes at most 500 members per call.
    for (let i = 0; i < members.length; i += 500) {
      const batch = members.slice(i, i + 500);
      const result = await mailchimp<{
        new_members?: unknown[];
        updated_members?: unknown[];
        errors?: { email_address?: string; error?: string }[];
      }>(apiKey, `/lists/${audienceId}`, {
        method: "POST",
        body: { members: batch, update_existing: true },
      });

      created += result.new_members?.length ?? 0;
      updated += result.updated_members?.length ?? 0;
      // Per-member rejections (a role address, a hard bounce) are reported
      // alongside the successes rather than failing the whole run.
      skipped += result.errors?.length ?? 0;
    }

    await markConnectionResult(studioId, "mailchimp", { ok: true });
    return { ok: true, audienceId, created, updated, skipped };
  } catch (e) {
    const error = e instanceof Error ? e.message : "Mailchimp sync failed";
    await markConnectionResult(studioId, "mailchimp", { ok: false, error });
    return { ok: false, error };
  }
}
