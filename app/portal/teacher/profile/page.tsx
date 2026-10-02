import { requirePortalSession } from "@/lib/portal/session";
import { InstructorProfileEditor } from "@/components/portal/teacher/InstructorProfileEditor";

export type InstructorProfileData = {
  fullName: string;
  headline: string | null;
  bio: string | null;
  disciplines: string[];
  syllabusCerts: string[];
  trainingInstitutions: string[];
  ageGroups: string[];
  engagementTypes: string[];
  availabilityType: string[];
  teachingVideoUrl: string | null;
  rateMinNzd: number | null;
  rateMaxNzd: number | null;
  locationCity: string | null;
  websiteUrl: string | null;
  avatarUrl: string | null;
  profilePublic: boolean;
  slug: string | null;
};

export default async function InstructorProfilePage() {
  const { supabase, userId } = await requirePortalSession();

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      `full_name, headline, bio, disciplines, syllabus_certs, training_institutions,
       age_groups, engagement_types, availability_type, teaching_video_url,
       rate_min_nzd, rate_max_nzd, location_city, website_url, avatar_url,
       profile_public, active_studio_id`
    )
    .eq("id", userId)
    .single();

  // Get the studio slug for the public profile link
  let slug: string | null = null;
  if (profile?.active_studio_id) {
    const { data: studio } = await supabase
      .from("studios")
      .select("slug")
      .eq("id", profile.active_studio_id)
      .single();
    slug = studio?.slug ?? null;
  }

  const data: InstructorProfileData = {
    fullName:             profile?.full_name ?? "",
    headline:             profile?.headline ?? null,
    bio:                  profile?.bio ?? null,
    disciplines:          (profile?.disciplines as string[] | null) ?? [],
    syllabusCerts:        (profile?.syllabus_certs as string[] | null) ?? [],
    trainingInstitutions: (profile?.training_institutions as string[] | null) ?? [],
    ageGroups:            (profile?.age_groups as string[] | null) ?? [],
    engagementTypes:      (profile?.engagement_types as string[] | null) ?? [],
    availabilityType:     (profile?.availability_type as string[] | null) ?? [],
    teachingVideoUrl:     profile?.teaching_video_url ?? null,
    rateMinNzd:           profile?.rate_min_nzd ?? null,
    rateMaxNzd:           profile?.rate_max_nzd ?? null,
    locationCity:         profile?.location_city ?? null,
    websiteUrl:           profile?.website_url ?? null,
    avatarUrl:            profile?.avatar_url ?? null,
    profilePublic:        profile?.profile_public ?? false,
    slug,
  };

  return <InstructorProfileEditor profile={data} />;
}
