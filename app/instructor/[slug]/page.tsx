import { cache } from "react";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import Image from "next/image";
import { JsonLd } from "@/components/seo/JsonLd";
import { originForHost, personJsonLd } from "@/lib/seo";

// Both generateMetadata and the page body need the same two rows; cache()
// collapses them into one round trip per request.
const getInstructor = cache(async (slug: string) => {
  const supabase = await createClient();

  const { data: studio } = await supabase
    .from("studios")
    .select("id, name, kind")
    .eq("slug", slug)
    .eq("kind", "instructor")
    .single();

  if (!studio) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      `full_name, headline, bio, disciplines, syllabus_certs, training_institutions,
       age_groups, engagement_types, availability_type, location_city, website_url,
       avatar_url, profile_public, teaching_video_url, rate_min_nzd, rate_max_nzd,
       network_verified`
    )
    .eq("active_studio_id", studio.id)
    .eq("profile_public", true)
    .single();

  return profile ? { studio, profile } : null;
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await getInstructor(slug);
  if (!data) return { robots: { index: false, follow: false } };

  const { profile } = data;
  const name = profile.full_name ?? "Instructor";
  const where = profile.location_city ? ` · ${profile.location_city}` : "";
  const title = `${name}${profile.headline ? ` — ${profile.headline}` : ""}${where}`;
  const description =
    profile.bio?.slice(0, 180) ??
    `${name} is available for cover classes and guest teaching through the Olune Network.`;
  const url = `${originForHost((await headers()).get("host"))}/instructor/${slug}`;

  return {
    title: { absolute: `${title} | Olune Network` },
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "profile",
      ...(profile.avatar_url ? { images: [profile.avatar_url] } : {}),
    },
  };
}

function youtubeEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      return v ? `https://www.youtube.com/embed/${v}` : null;
    }
    if (u.hostname.includes("youtu.be")) {
      return `https://www.youtube.com/embed${u.pathname}`;
    }
    if (u.hostname.includes("vimeo.com")) {
      const id = u.pathname.replace("/", "");
      return `https://player.vimeo.com/video/${id}`;
    }
  } catch {
    // ignore
  }
  return null;
}

export default async function PublicInstructorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getInstructor(slug);
  if (!data) notFound();

  const { studio, profile } = data;

  const disciplines         = (profile.disciplines as string[] | null) ?? [];
  const syllabusСerts       = (profile.syllabus_certs as string[] | null) ?? [];
  const trainingInstitutions = (profile.training_institutions as string[] | null) ?? [];
  const ageGroups           = (profile.age_groups as string[] | null) ?? [];
  const engagementTypes     = (profile.engagement_types as string[] | null) ?? [];
  const availabilityType    = (profile.availability_type as string[] | null) ?? [];
  const embedUrl            = profile.teaching_video_url
    ? youtubeEmbedUrl(profile.teaching_video_url)
    : null;

  const rateLabel =
    profile.rate_min_nzd && profile.rate_max_nzd
      ? `NZD $${profile.rate_min_nzd}–$${profile.rate_max_nzd} per day`
      : profile.rate_min_nzd
      ? `From NZD $${profile.rate_min_nzd} per day`
      : null;

  const origin = originForHost((await headers()).get("host"));

  return (
    <div className="min-h-screen bg-gray-50">
      <JsonLd
        data={personJsonLd({
          url: `${origin}/instructor/${slug}`,
          name: profile.full_name ?? studio.name,
          jobTitle: profile.headline,
          description: profile.bio,
          image: profile.avatar_url,
          areaServed: profile.location_city,
          knowsAbout: [...disciplines, ...syllabusСerts],
          worksFor: { name: "Olune Network", url: `${origin}/instructors` },
        })}
      />
      <div className="max-w-2xl mx-auto py-10 px-4 sm:px-6 space-y-4">
        {/* Header card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="h-24 bg-gradient-to-r from-indigo-500 to-purple-600" />
          <div className="px-6 pb-6">
            <div className="-mt-12 flex items-end justify-between">
              <div className="flex items-end gap-4">
                {profile.avatar_url ? (
                  <Image
                    src={profile.avatar_url}
                    alt={profile.full_name ?? ""}
                    className="h-20 w-20 rounded-full border-4 border-white object-cover shadow-sm"
                    width={80}
                    height={80}
                  />
                ) : (
                  <div className="h-20 w-20 rounded-full border-4 border-white bg-indigo-100 flex items-center justify-center shadow-sm">
                    <span className="text-2xl font-bold text-indigo-600">
                      {(profile.full_name ?? "?").charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
              </div>
              {profile.network_verified && (
                <span className="mt-14 text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-3 py-1 font-medium">
                  ✓ Verified
                </span>
              )}
            </div>

            <div className="mt-3">
              <h1 className="text-xl font-bold text-gray-900">{profile.full_name}</h1>
              {profile.headline && (
                <p className="text-sm text-gray-500 mt-0.5">{profile.headline}</p>
              )}
              {profile.location_city && (
                <p className="text-xs text-gray-400 mt-1">📍 {profile.location_city}</p>
              )}
            </div>

            {disciplines.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {disciplines.map((d) => (
                  <span
                    key={d}
                    className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium"
                  >
                    {d}
                  </span>
                ))}
              </div>
            )}

            {/* Inquiry CTA */}
            <Link
              href={`/instructor/${slug}/inquire`}
              className="mt-5 inline-flex items-center gap-2 bg-indigo-600 text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              Send inquiry
            </Link>
          </div>
        </div>

        {/* Bio */}
        {profile.bio && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">About</h2>
            <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{profile.bio}</p>
          </div>
        )}

        {/* Teaching video */}
        {embedUrl && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Teaching video</h2>
            <div className="aspect-video rounded-lg overflow-hidden">
              <iframe
                src={embedUrl}
                title="Teaching video"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full"
              />
            </div>
          </div>
        )}

        {/* Details grid */}
        {(syllabusСerts.length > 0 ||
          trainingInstitutions.length > 0 ||
          ageGroups.length > 0 ||
          engagementTypes.length > 0 ||
          availabilityType.length > 0 ||
          rateLabel) && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Details</h2>

            {syllabusСerts.length > 0 && (
              <DetailRow label="Syllabus certifications" values={syllabusСerts} />
            )}
            {trainingInstitutions.length > 0 && (
              <DetailRow label="Training" values={trainingInstitutions} />
            )}
            {ageGroups.length > 0 && (
              <DetailRow label="Age groups" values={ageGroups} />
            )}
            {engagementTypes.length > 0 && (
              <DetailRow label="Available for" values={engagementTypes} />
            )}
            {availabilityType.length > 0 && (
              <DetailRow label="Travel" values={availabilityType} />
            )}
            {rateLabel && (
              <div className="flex gap-3 items-baseline">
                <span className="text-xs text-gray-500 w-36 shrink-0">Rate (indicative)</span>
                <span className="text-sm text-gray-800">{rateLabel}</span>
              </div>
            )}
          </div>
        )}

        {/* Website */}
        {profile.website_url && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">Links</h2>
            <a
              href={profile.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-indigo-600 hover:underline break-all"
            >
              {profile.website_url}
            </a>
          </div>
        )}

        {/* Back to directory */}
        <div className="flex items-center justify-between pt-2">
          <Link href="/instructors" className="text-xs text-gray-400 hover:text-gray-600">
            ← Browse all instructors
          </Link>
          <p className="text-xs text-gray-400">Powered by Olune</p>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="flex gap-3 items-start">
      <span className="text-xs text-gray-500 w-36 shrink-0 pt-0.5">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span
            key={v}
            className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full"
          >
            {v}
          </span>
        ))}
      </div>
    </div>
  );
}
