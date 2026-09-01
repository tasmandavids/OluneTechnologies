// ============================================================================
//  Pure helpers for studio-owner → parent mass email.
//  No IO — unit-testable rendering + recipient filters.
// ============================================================================

import { escapeHtml } from "@/lib/notify/messages";

/** Placeholder auth emails created when a parent has no real address. */
export function isGhostEmail(email: string | null | undefined): boolean {
  if (!email) return true;
  return /@.+\.olune\.local$/i.test(email.trim());
}

/**
 * TLDs that cannot receive mail because they do not exist in the public DNS
 * root, so every send to them is an instant hard bounce rather than a delayed
 * one.
 *
 * This matters more than it looks. A sending domain earns its reputation from
 * scratch, and mailbox providers (and Resend itself) judge on bounce RATE, not
 * count — so a single "email everyone" click against a studio full of seeded
 * demo parents can put the domain in the penalty box before the first real
 * parent is ever contacted. Filtering here is cheaper than recovering from it.
 *
 * `test`/`example`/`invalid`/`localhost` are reserved by RFC 2606 and RFC 6761;
 * `local` by RFC 6762 (this is also what catches the `@*.olune.local` ghost
 * addresses). `demo` is not reserved but is genuinely undelegated — verified
 * against the root: `.app`, `.nz` and `.kiwi` return NS + SOA records and
 * `.demo` returns neither. It is in this list because the seed data uses
 * `@auroradance.demo`.
 */
const NON_ROUTABLE_TLDS = new Set([
  "test",
  "example",
  "invalid",
  "localhost",
  "local",
  "demo",
]);

/** An address whose domain provably cannot accept mail. */
export function isNonRoutableEmail(email: string | null | undefined): boolean {
  const at = email?.trim().lastIndexOf("@") ?? -1;
  if (!email || at < 1) return true;
  const domain = email.trim().slice(at + 1).toLowerCase();
  if (!domain.includes(".")) return true;
  const tld = domain.slice(domain.lastIndexOf(".") + 1);
  return NON_ROUTABLE_TLDS.has(tld);
}

export function isSendableParentEmail(email: string | null | undefined): boolean {
  if (!email?.trim()) return false;
  if (isGhostEmail(email)) return false;
  return !isNonRoutableEmail(email);
}

/** Escape plaintext and preserve line breaks as <br>. */
export function plaintextToHtml(body: string): string {
  return escapeHtml(body).replace(/\r\n|\r|\n/g, "<br>\n");
}

export type MassParentEmailInput = {
  studioName: string;
  subject: string;
  body: string;
  parentName: string | null;
};

export type RenderedMassEmail = {
  subject: string;
  html: string;
  text: string;
};

export function renderMassParentEmail(input: MassParentEmailInput): RenderedMassEmail {
  const greetingName = (input.parentName ?? "").trim() || "there";
  const studio = input.studioName.trim() || "your studio";
  const subject = input.subject.trim();
  const body = input.body.trim();

  const html = `<div style="font-family:system-ui,-apple-system,sans-serif;color:#111;max-width:560px">
  <p style="font-size:15px;line-height:1.55;margin:0 0 16px">Hi ${escapeHtml(greetingName)},</p>
  <div style="font-size:15px;line-height:1.55;margin:0 0 24px">${plaintextToHtml(body)}</div>
  <p style="font-size:13px;line-height:1.45;margin:0;color:#666">— ${escapeHtml(studio)}</p>
</div>`;

  const text = `Hi ${greetingName},\n\n${body}\n\n— ${studio}`;

  return { subject, html, text };
}

export type ParentEmailCandidate = {
  id: string;
  email: string | null;
  full_name: string | null;
};

/** Deduplicate by email (case-insensitive); keep first occurrence. */
export function dedupeParentsByEmail(
  parents: ParentEmailCandidate[],
): ParentEmailCandidate[] {
  const seen = new Set<string>();
  const out: ParentEmailCandidate[] = [];
  for (const p of parents) {
    if (!isSendableParentEmail(p.email)) continue;
    const key = p.email!.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}
