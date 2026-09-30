"use server";

// Platform operator authentication — env allowlist + platform_operators table.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type PlatformAuthResult =
  | {
      ok: true;
      userId: string;
      email: string | null;
      name: string | null;
      assuranceLevel: string | null;
    }
  | {
      ok: false;
      error: string;
      reason: "signed_out" | "not_operator" | "mfa_required" | "auth_error";
    };

type PlatformAuthOptions = {
  /** Layouts may render the enrollment/challenge gate; mutations must not opt out. */
  requireMfa?: boolean;
};

function emailAllowlist(): Set<string> {
  const raw = process.env.PLATFORM_OPERATOR_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function isPlatformOperator(userId: string, email?: string | null): Promise<boolean> {
  if (email && emailAllowlist().has(email.toLowerCase())) return true;

  const admin = createAdminClient();
  const { data } = await admin
    .from("platform_operators")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  return !!data;
}

/** Guard for platform server actions and pages. Defaults to mandatory AAL2. */
export async function requirePlatformOperator(
  options: PlatformAuthOptions = {},
): Promise<PlatformAuthResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "Not signed in.", reason: "signed_out" };

  const allowed = await isPlatformOperator(user.id, user.email);
  if (!allowed) {
    return {
      ok: false,
      error: "Platform operator access required.",
      reason: "not_operator",
    };
  }

  const { data: assurance, error: assuranceError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError) {
    return {
      ok: false,
      error: "Unable to verify multi-factor authentication.",
      reason: "auth_error",
    };
  }
  if (options.requireMfa !== false && assurance.currentLevel !== "aal2") {
    return {
      ok: false,
      error: "Multi-factor authentication required.",
      reason: "mfa_required",
    };
  }

  const { data: op } = await supabase
    .from("platform_operators")
    .select("full_name")
    .eq("user_id", user.id)
    .maybeSingle();

  return {
    ok: true,
    userId: user.id,
    email: user.email ?? null,
    name: op?.full_name ?? user.user_metadata?.full_name ?? null,
    assuranceLevel: assurance.currentLevel,
  };
}
