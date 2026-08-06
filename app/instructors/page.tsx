import { createClient } from "@/lib/supabase/server";
import { InstructorDirectory } from "@/components/network/InstructorDirectory";
import { rootUrl } from "@/lib/seo";
import type { Metadata } from "next";

export const metadata: Metadata = {
  // Already carries "Olune" in the string — bypass the root layout's
  // "· Olune" title template so it isn't appended twice.
  title: { absolute: "Find an Instructor — Olune Network" },
  description:
    "Browse dance and fitness instructors available for cover classes and guest teaching through the Olune Network.",
  alternates: { canonical: rootUrl("/instructors") },
};

export type DirectoryInstructor = {
  slug: string;
  fullName: string;
  headline: string | null;
  locationCity: string | null;
  disciplines: string[];
  syllabusСerts: string[];
  engagementTypes: string[];
  availabilityType: string[];
  avatarUrl: string | null;
  networkVerified: boolean;
  rateMinNzd: number | null;
  rateMaxNzd: number | null;
};

export default async function InstructorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const discipline = sp.discipline ?? null;
  const availability = sp.availability ?? null;
  const engagement = sp.engagement ?? null;

  const supabase = await createClient();

  // Join profiles with their instructor studio slug
  let query = supabase
    .from("profiles")
    .select(
      `full_name, headline, location_city, disciplines, syllabus_certs,
       engagement_types, availability_type, avatar_url, network_verified,
       rate_min_nzd, rate_max_nzd,
       studio:studios!profiles_active_studio_id_fkey ( slug )`
    )
    .eq("profile_public", true)
    .eq("account_kind", "instructor");

  const { data: rows } = await query.order("network_verified", { ascending: false });

  let instructors: DirectoryInstructor[] = (rows ?? []).flatMap((r) => {
    const studioRow = (r.studio as unknown as { slug: string } | null);
    if (!studioRow?.slug) return [];

    const disciplines = (r.disciplines as string[] | null) ?? [];
    const syllabusСerts = (r.syllabus_certs as string[] | null) ?? [];
    const engagementTypes = (r.engagement_types as string[] | null) ?? [];
    const availabilityType = (r.availability_type as string[] | null) ?? [];

    if (discipline && !disciplines.includes(discipline)) return [];
    if (availability && !availabilityType.includes(availability)) return [];
    if (engagement && !engagementTypes.includes(engagement)) return [];

    return [{
      slug:            studioRow.slug,
      fullName:        r.full_name ?? "Unknown",
      headline:        r.headline ?? null,
      locationCity:    r.location_city ?? null,
      disciplines,
      syllabusСerts,
      engagementTypes,
      availabilityType,
      avatarUrl:       r.avatar_url ?? null,
      networkVerified: r.network_verified ?? false,
      rateMinNzd:      r.rate_min_nzd ?? null,
      rateMaxNzd:      r.rate_max_nzd ?? null,
    }];
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Find an instructor</h1>
          <p className="text-sm text-gray-500 mt-1">
            Connect with qualified performing arts instructors for cover teaching, workshops, and guest intensives.
          </p>
        </div>
        <InstructorDirectory instructors={instructors} activeFilters={{ discipline, availability, engagement }} />
      </div>
    </div>
  );
}
