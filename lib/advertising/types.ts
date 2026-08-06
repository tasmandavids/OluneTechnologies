export type SocialPlatform = "facebook" | "instagram" | "tiktok" | "telegram";

export type AdCampaignStatus = "draft" | "scheduled" | "active" | "paused" | "completed" | "failed";

export type AdObjective = "awareness" | "traffic" | "engagement" | "conversions" | "leads";

export type SocialConnection = {
  id: string;
  platform: SocialPlatform;
  accountId: string | null;
  accountName: string | null;
  lastSyncAt: string | null;
  syncError: string | null;
};

export type AdCampaign = {
  id: string;
  name: string;
  objective: AdObjective;
  status: AdCampaignStatus;
  platforms: SocialPlatform[];
  headline: string | null;
  bodyText: string | null;
  callToAction: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  targetUrl: string | null;
  // No budget field. Publishing here is ORGANIC — Page feed, Instagram media,
  // Telegram broadcast, TikTok video (see lib/advertising/publish.ts). Nothing
  // in this product spends money on a platform, so carrying a budget through
  // the UI told studio owners we were spending theirs. The `budget_cents`
  // column still exists, unread, for whenever paid ads are actually built.
  scheduledAt: string | null;
  publishedAt: string | null;
  platformIds: Record<string, string>;
  publishError: string | null;
  aiGenerated: boolean;
  createdAt: string;
  updatedAt: string;
};

export type GeneratedAdCopy = {
  headline: string;
  bodyText: string;
  callToAction: string;
  hashtags: string[];
  platformVariants: Partial<Record<SocialPlatform, { headline: string; bodyText: string }>>;
};

export type SocialCredentials = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scopes?: string[];
  meta?: Record<string, string>;
};
