import { requirePortalSession } from "@/lib/portal/session";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { InquiryThread } from "@/components/network/InquiryThread";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";

export default async function InquiryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const justSent = sp.sent === "1";

  const { supabase, studioId, userId } = await requirePortalSession();

  const { data: inquiry } = await supabase
    .from("network_inquiries")
    .select(
      `id, subject, status, engagement_type, proposed_dates, location,
       proposed_rate_nzd, message, created_at,
       instructor:profiles!network_inquiries_instructor_id_fkey (
         id, full_name, headline, avatar_url, active_studio_id,
         studio:studios!profiles_active_studio_id_fkey ( slug )
       )`
    )
    .eq("id", id)
    .eq("studio_id", studioId)
    .single();

  if (!inquiry) notFound();

  const { data: messages } = await supabase
    .from("network_messages")
    .select("id, body, created_at, sender_id, sender:profiles!network_messages_sender_id_fkey ( full_name )")
    .eq("inquiry_id", id)
    .order("created_at", { ascending: true });

  const instructor = inquiry.instructor as unknown as {
    id: string;
    full_name: string | null;
    headline:  string | null;
    avatar_url: string | null;
    studio: { slug: string } | null;
  } | null;

  const instructorSlug = instructor?.studio?.slug ?? null;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {justSent && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800">
          Inquiry sent! The instructor will be notified.
        </div>
      )}

      {/* Back */}
      <Link href="/portal/admin/network/inquiries" className="text-xs text-muted hover:text-ink">
        ← All inquiries
      </Link>

      {/* Inquiry summary */}
      <GlassPanel className="!p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {instructor?.avatar_url ? (
              <Image src={instructor.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" width={40} height={40} />
            ) : (
              <div
                className="h-10 w-10 rounded-full flex items-center justify-center"
                style={{ background: "color-mix(in srgb, var(--brand) 14%, transparent)" }}
              >
                <span className="text-sm font-bold text-[--brand]">
                  {(instructor?.full_name ?? "?").charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <div>
              <p className="text-sm font-semibold text-ink">{instructor?.full_name ?? "Unknown"}</p>
              {instructor?.headline && (
                <p className="text-xs text-muted">{instructor.headline}</p>
              )}
            </div>
          </div>
          {instructorSlug && (
            <Link
              href={`/instructor/${instructorSlug}`}
              className="text-xs text-[--brand] hover:underline shrink-0"
            >
              View profile
            </Link>
          )}
        </div>

        <div className="border-t border-[--hair] pt-3 space-y-1.5">
          <p className="text-sm font-medium text-ink">{inquiry.subject}</p>
          {inquiry.engagement_type && (
            <Detail label="Type" value={inquiry.engagement_type} />
          )}
          {inquiry.proposed_dates && (
            <Detail label="Dates" value={inquiry.proposed_dates} />
          )}
          {inquiry.location && (
            <Detail label="Location" value={inquiry.location} />
          )}
          {inquiry.proposed_rate_nzd && (
            <Detail label="Rate" value={`NZD $${inquiry.proposed_rate_nzd}/day`} />
          )}
        </div>

        <div className="border-t border-[--hair] pt-3">
          <p className="text-xs font-medium text-muted mb-1">Opening message</p>
          <p className="text-sm text-ink whitespace-pre-line">{inquiry.message}</p>
        </div>
      </GlassPanel>

      {/* Thread */}
      <InquiryThread
        inquiryId={id}
        messages={(messages ?? []).map((m) => ({
          id:        m.id,
          body:      m.body,
          createdAt: m.created_at,
          senderId:  m.sender_id,
          senderName: (m.sender as unknown as { full_name: string | null } | null)?.full_name ?? "Unknown",
        }))}
        currentUserId={userId}
        status={inquiry.status}
      />
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="text-muted w-20 shrink-0">{label}</span>
      <span className="text-ink">{value}</span>
    </div>
  );
}
