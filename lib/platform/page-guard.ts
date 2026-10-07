// Per-page operator gate for /platform.
//
// App Router renders a page in parallel with its layout, and on segment (RSC)
// navigations the layout does not run at all, so the layout check alone does
// not stop a page's service-role queries. Every /platform page calls this
// before it reads anything.

import { redirect } from "next/navigation";
import { requirePlatformOperator } from "@/lib/platform/auth";

/**
 * Returns true when the caller is an operator with a verified second factor.
 * Returns false for an operator who has not completed MFA yet: the layout is
 * showing the MFA gate, and the page must render and read nothing. Anyone else
 * is redirected to sign in.
 */
export async function requirePlatformPage(): Promise<boolean> {
  const auth = await requirePlatformOperator();
  if (auth.ok) return true;
  if (auth.reason === "mfa_required") return false;
  redirect("/login?next=/platform");
}
