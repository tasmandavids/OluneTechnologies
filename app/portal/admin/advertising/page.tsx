import { requirePortalSession } from "@/lib/portal/session";
import { isMetaConfigured, isTiktokConfigured } from "@/lib/advertising/config";
import type { AdCampaign, SocialConnection } from "@/lib/advertising/types";
import { AdvertisingHub } from "@/components/admin/advertising/AdvertisingHub";

export default async function AdvertisingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string }>;
}) {
  const { supabase, studioId } = await requirePortalSession();
  const params = await searchParams;

  const [connectionsRes, campaignsRes] = await Promise.all([
    supabase
      .from("social_connections")
      .select("id, platform, account_id, account_name, last_sync_at, sync_error")
      .eq("studio_id", studioId),
    supabase
      .from("ad_campaigns")
      .select("*")
      .eq("studio_id", studioId)
      .order("updated_at", { ascending: false }),
  ]);

  const connections: SocialConnection[] = (connectionsRes.data ?? []).map((r) => ({
    id: r.id as string,
    platform: r.platform as SocialConnection["platform"],
    accountId: r.account_id as string | null,
    accountName: r.account_name as string | null,
    lastSyncAt: r.last_sync_at as string | null,
    syncError: r.sync_error as string | null,
  }));

  const campaigns: AdCampaign[] = (campaignsRes.data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    objective: r.objective as AdCampaign["objective"],
    status: r.status as AdCampaign["status"],
    platforms: r.platforms as AdCampaign["platforms"],
    headline: r.headline as string | null,
    bodyText: r.body_text as string | null,
    callToAction: r.call_to_action as string | null,
    imageUrl: r.image_url as string | null,
    videoUrl: r.video_url as string | null,
    targetUrl: r.target_url as string | null,
    budgetCents: r.budget_cents as number | null,
    scheduledAt: r.scheduled_at as string | null,
    publishedAt: r.published_at as string | null,
    platformIds: (r.platform_ids ?? {}) as Record<string, string>,
    publishError: r.publish_error as string | null,
    aiGenerated: r.ai_generated as boolean,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }));

  return (
    <AdvertisingHub
      connections={connections}
      campaigns={campaigns}
      metaConfigured={isMetaConfigured()}
      tiktokConfigured={isTiktokConfigured()}
      bannerError={params.error ?? null}
      bannerConnected={params.connected ?? null}
    />
  );
}
