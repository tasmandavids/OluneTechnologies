// ============================================================================
//  /portal/admin/passes — front-desk class-pass redemption (scan + redeem).
// ============================================================================

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PassScanner from "@/components/portal/admin/PassScanner";

export const dynamic = "force-dynamic";

export default async function PassesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "admin") redirect("/portal/admin");

  return (
    <div className="mx-auto max-w-lg px-6 py-10">
      <PassScanner />
    </div>
  );
}
