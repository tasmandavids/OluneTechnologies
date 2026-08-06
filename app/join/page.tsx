// ============================================================================
//  /join — Tenant-scoped open registration (parent vs adult student).
// ============================================================================

import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveStudio, slugFromHost } from "@/lib/tenant";
import { originForHost } from "@/lib/seo";
import { JoinStudioFlow } from "@/components/join/JoinStudioFlow";
import { getStudioRegistrationInfo } from "@/app/join/actions";

export async function generateMetadata(): Promise<Metadata> {
  const host = (await headers()).get("host");
  const studio = await resolveStudio(host);
  const slug = studio?.slug ?? slugFromHost(host);
  if (!slug) return { robots: { index: false, follow: false } };

  const studioInfo = await getStudioRegistrationInfo(slug);
  // Registration closed renders a dead-end notice — nothing worth indexing.
  if (!studioInfo?.registration_enabled) return { robots: { index: false, follow: false } };

  const title = `Join ${studioInfo.name}`;
  const description = `Register online with ${studioInfo.name} — set up your account and enrol in classes.`;
  const url = `${originForHost(host)}/join`;

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url },
  };
}

export default async function JoinPage() {
  const host = (await headers()).get("host");
  const studio = await resolveStudio(host);
  const slug = studio?.slug ?? slugFromHost(host);

  if (!slug) {
    redirect("/onboarding");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const studioInfo = await getStudioRegistrationInfo(slug);

  if (!studioInfo?.registration_enabled) {
    return (
      <div className="grid min-h-screen place-items-center bg-base px-5 text-ink">
        <div className="box max-w-md rounded-3xl p-8 text-center">
          <h1 className="text-xl font-black">Registration closed</h1>
          <p className="mt-2 text-sm text-muted">
            {studioInfo?.name ?? "This studio"} is not accepting online registrations right now.
            Please contact the studio directly.
          </p>
        </div>
      </div>
    );
  }

  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("studio_id, role, self_managed")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };

  if (profile?.studio_id && user) {
    const { data: existingMembership } = studioInfo?.id
      ? await supabase
          .from("studio_memberships")
          .select("id")
          .eq("user_id", user.id)
          .eq("studio_id", studioInfo.id)
          .eq("status", "active")
          .maybeSingle()
      : { data: null };

    if (existingMembership) {
      if (profile.role === "student" && profile.self_managed) redirect("/portal/student");
      if (profile.role === "parent") redirect("/portal/parent");
      redirect("/portal");
    }
  }

  return (
    <JoinStudioFlow
      studioName={studioInfo.name}
      studioSlug={studioInfo.slug}
      registrationRoles={(studioInfo.registration_roles as string[]) ?? ["parent", "student"]}
      signedIn={!!user}
      userEmail={user?.email ?? ""}
    />
  );
}
