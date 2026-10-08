// Invite links that survive the PKCE login page (audit A-04).
//
// Supabase's own invite email carries an implicit-flow link: the token sits in
// the URL fragment, which /auth/callback (it reads ?code=) can never see. So
// every invite landed on /login?error=auth_callback_error. Instead we ask GoTrue
// for the hashed token and build a link that /auth/callback redeems server-side
// with verifyOtp.

import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalAppUrl } from "@/lib/app-url";

export type InviteLink = { userId: string; url: string };

export function buildTokenHashUrl(
  hashedToken: string,
  type: "invite" | "recovery" | "magiclink" | "signup",
  next = "/welcome",
): string {
  const params = new URLSearchParams({ token_hash: hashedToken, type, next });
  return `${canonicalAppUrl()}/auth/callback?${params.toString()}`;
}

/** Create (or re-issue for) an invitee and return a link our callback can redeem. */
export async function createInviteLink(
  admin: SupabaseClient,
  email: string,
  data?: Record<string, unknown>,
  next = "/welcome",
): Promise<{ ok: true; link: InviteLink } | { ok: false; error: string }> {
  const { data: res, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: data ? { data } : undefined,
  });
  const hashed = res?.properties?.hashed_token;
  if (error || !res?.user || !hashed) {
    return { ok: false, error: error?.message ?? "Could not create invite link." };
  }
  return { ok: true, link: { userId: res.user.id, url: buildTokenHashUrl(hashed, "invite", next) } };
}

export async function sendInviteEmail(params: {
  to: string;
  url: string;
  name?: string | null;
  replyTo?: string;
}) {
  const { sendEmail } = await import("@/lib/notify/providers");
  const safe = (params.name ?? "there").replace(/[<>&"]/g, "");
  return sendEmail({
    to: params.to,
    replyTo: params.replyTo,
    subject: "You've been invited to Olune",
    html: `<p>Hi ${safe},</p>
<p>You've been added to your studio's Olune portal. Click the link below to set your password and get started:</p>
<p><a href="${params.url}">Accept invitation &amp; set password</a></p>
<p>This link expires in 24 hours.</p>
<p>If you didn't expect this email, you can ignore it.</p>`,
    text: `Hi ${safe},\n\nYou've been added to your studio's Olune portal.\n\nAccept your invitation and set a password here:\n${params.url}\n\nThis link expires in 24 hours.`,
  });
}
