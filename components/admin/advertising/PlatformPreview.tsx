"use client";

import { PLATFORM_META } from "@/lib/advertising/config";
import type { SocialPlatform } from "@/lib/advertising/types";

type PreviewProps = {
  platform: SocialPlatform;
  headline: string;
  bodyText: string;
  callToAction: string;
  imageUrl?: string;
  accountName?: string;
};

function FacebookPreview({ headline, bodyText, callToAction, imageUrl, accountName }: Omit<PreviewProps, "platform">) {
  return (
    <div className="overflow-hidden rounded-2xl border border-(--hair) bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5">
        <div className="grid h-8 w-8 place-items-center rounded-full bg-[#1877F2] text-xs font-black text-white">f</div>
        <div>
          <p className="text-xs font-bold text-slate-900">{accountName ?? "Your Studio Page"}</p>
          <p className="text-[0.6rem] text-slate-400">Just now · 🌐</p>
        </div>
      </div>
      <div className="px-3 py-2.5">
        {headline && <p className="text-sm font-bold text-slate-900">{headline}</p>}
        <p className="mt-1 text-xs leading-relaxed text-slate-700">{bodyText || "Your post copy will appear here…"}</p>
      </div>
      {imageUrl && (
        <div className="aspect-video bg-slate-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="" className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
        </div>
      )}
      {callToAction && (
        <div className="border-t border-slate-100 px-3 py-2">
          <span className="inline-block rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">{callToAction}</span>
        </div>
      )}
    </div>
  );
}

function InstagramPreview({ bodyText, imageUrl, accountName }: Omit<PreviewProps, "platform" | "headline" | "callToAction">) {
  const caption = bodyText || "Your caption will appear here…";
  return (
    <div className="overflow-hidden rounded-2xl border border-(--hair) bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5">
        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-[#f09433] via-[#e6683c] to-[#bc1888]" />
        <p className="text-xs font-bold text-slate-900">{accountName ?? "yourstudio"}</p>
      </div>
      <div className="aspect-square bg-slate-100">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">Add an image for Instagram</div>
        )}
      </div>
      <div className="px-3 py-2.5">
        <p className="text-xs leading-relaxed text-slate-800">
          <span className="font-bold">{accountName ?? "yourstudio"}</span>{" "}
          {caption.slice(0, 120)}{caption.length > 120 ? "…" : ""}
        </p>
      </div>
    </div>
  );
}

function TelegramPreview({ headline, bodyText, imageUrl, accountName }: Omit<PreviewProps, "platform" | "callToAction">) {
  const text = [headline, bodyText].filter(Boolean).join("\n\n") || "Your announcement will appear here…";
  return (
    <div className="overflow-hidden rounded-2xl border border-(--hair) shadow-sm" style={{ background: "#17212b" }}>
      <div className="border-b border-white/10 px-3 py-2.5">
        <p className="text-xs font-bold text-white">{accountName ?? "Studio Channel"}</p>
        <p className="text-[0.6rem] text-white/40">channel · 1.2k subscribers</p>
      </div>
      <div className="p-3">
        <div className="max-w-[90%] overflow-hidden rounded-xl rounded-tl-sm bg-[#2b5278]">
          {imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" className="w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          )}
          <p className="whitespace-pre-wrap px-3 py-2 text-xs leading-relaxed text-white">{text}</p>
        </div>
      </div>
    </div>
  );
}

function TiktokPreview({ bodyText, accountName }: Omit<PreviewProps, "platform" | "headline" | "callToAction" | "imageUrl">) {
  return (
    <div className="overflow-hidden rounded-2xl border border-(--hair) bg-black shadow-sm">
      <div className="flex aspect-[9/16] items-end p-3">
        <div>
          <p className="text-xs font-bold text-white">@{accountName ?? "yourstudio"}</p>
          <p className="mt-1 text-xs text-white/90">{bodyText?.slice(0, 100) || "Video caption…"}</p>
        </div>
      </div>
    </div>
  );
}

export function PlatformPreview({
  platform,
  headline,
  bodyText,
  callToAction,
  imageUrl,
  accountName,
}: PreviewProps) {
  const meta = PLATFORM_META[platform];
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} />
        <span className="text-[0.65rem] font-bold uppercase tracking-wide text-muted">{meta.label}</span>
      </div>
      {platform === "facebook" && (
        <FacebookPreview headline={headline} bodyText={bodyText} callToAction={callToAction} imageUrl={imageUrl} accountName={accountName} />
      )}
      {platform === "instagram" && (
        <InstagramPreview bodyText={bodyText} imageUrl={imageUrl} accountName={accountName} />
      )}
      {platform === "telegram" && (
        <TelegramPreview headline={headline} bodyText={bodyText} imageUrl={imageUrl} accountName={accountName} />
      )}
      {platform === "tiktok" && (
        <TiktokPreview bodyText={bodyText} accountName={accountName} />
      )}
    </div>
  );
}

export function PlatformPreviewGrid({
  platforms,
  headline,
  bodyText,
  callToAction,
  imageUrl,
  connections,
}: {
  platforms: SocialPlatform[];
  headline: string;
  bodyText: string;
  callToAction: string;
  imageUrl?: string;
  connections: { platform: SocialPlatform; accountName: string | null }[];
}) {
  if (platforms.length === 0) return null;
  const nameMap = new Map(connections.map((c) => [c.platform, c.accountName]));

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {platforms.map((p) => (
        <PlatformPreview
          key={p}
          platform={p}
          headline={headline}
          bodyText={bodyText}
          callToAction={callToAction}
          imageUrl={imageUrl}
          accountName={nameMap.get(p) ?? undefined}
        />
      ))}
    </div>
  );
}
