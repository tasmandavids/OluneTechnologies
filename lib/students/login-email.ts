// ============================================================================
//  lib/students/login-email.ts
//
//  Generates a memorable auth login for students who don't have their own
//  email address: first-initial + last-initial + a 2-digit sequence number,
//  e.g. "Tasman Davids" -> td01@students.olune.local. The domain is a fake
//  placeholder (never delivered to — see lib/notify usage that filters
//  "%@%.olune.local" before sending real emails); it exists only to give
//  Supabase auth a unique identifier.
//
//  Uniqueness is enforced by attempting createUser with each candidate and
//  bumping the sequence on a duplicate-email error, so it's safe under
//  concurrent signups without a separate existence check.
// ============================================================================

import type { createAdminClient } from "@/lib/supabase/admin";

const STUDENT_LOGIN_DOMAIN = "students.olune.local";
const MAX_ATTEMPTS = 999;

function initialsFromName(fullName: string): string {
  const letters = fullName
    .trim()
    .split(/\s+/)
    .map((part) => part.match(/[a-zA-Z]/)?.[0]?.toLowerCase())
    .filter((c): c is string => Boolean(c));

  if (letters.length >= 2) return `${letters[0]}${letters[letters.length - 1]}`;
  if (letters.length === 1) return `${letters[0]}${letters[0]}`;
  return "xx";
}

function isDuplicateEmailError(message: string | undefined): boolean {
  if (!message) return false;
  return /already (been )?(registered|exists)|duplicate/i.test(message);
}

export async function createStudentAuthUser(
  admin: ReturnType<typeof createAdminClient>,
  fullName: string,
  userMetadata: Record<string, unknown> = {},
): Promise<{ userId: string; email: string }> {
  const initials = initialsFromName(fullName);
  let lastError: string | undefined;

  for (let seq = 1; seq <= MAX_ATTEMPTS; seq++) {
    const candidate = `${initials}${String(seq).padStart(2, "0")}@${STUDENT_LOGIN_DOMAIN}`;
    const { data, error } = await admin.auth.admin.createUser({
      email: candidate,
      email_confirm: true,
      user_metadata: userMetadata,
    });

    if (!error && data.user) {
      return { userId: data.user.id, email: candidate };
    }

    lastError = error?.message;
    if (!isDuplicateEmailError(error?.message)) {
      throw new Error(error?.message ?? "Could not create student login.");
    }
  }

  throw new Error(lastError ?? "Could not generate a unique student login.");
}
