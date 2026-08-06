"use client";

// ============================================================================
//  MusicCue — paste a Spotify or Apple Music URL → fetches metadata → shows card
// ============================================================================

import { useState, useTransition } from "react";
import Image from "next/image";
import {
  fetchMusicMetadata,
  saveActMusic,
  removeActMusic,
  type MusicCueData,
} from "@/app/portal/admin/events/actions";

const SOURCE_ICON = {
  spotify:     "🟢",
  apple_music: "🍎",
  other:       "🎵",
};

function formatDuration(secs: number | null): string {
  if (!secs) return "";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface MusicCueProps {
  actId:    string;
  music:    MusicCueData | null;
  onSave:   (music: MusicCueData) => void;
  onRemove: () => void;
}

export function MusicCue({ actId, music, onSave, onRemove }: MusicCueProps) {
  const [url, setUrl]     = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  const handleFetch = () => {
    if (!url.trim()) return;
    setError(null);
    start(async () => {
      const metaRes = await fetchMusicMetadata(url.trim());
      if (!metaRes.ok) { setError(metaRes.error); return; }

      const saveRes = await saveActMusic(actId, url.trim(), metaRes.meta);
      if (!saveRes.ok) { setError(saveRes.error); return; }

      onSave(saveRes.music);
      setUrl("");
    });
  };

  const handleRemove = () => {
    start(async () => {
      await removeActMusic(actId);
      onRemove();
    });
  };

  // ── Displaying saved music ──────────────────────────────────────────────────
  if (music) {
    return (
      <div className="box rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 p-3">
          {/* Thumbnail */}
          {music.thumbnailUrl ? (
            <Image
              src={music.thumbnailUrl}
              alt="Album art"
              className="w-12 h-12 rounded-lg object-cover shrink-0 shadow-sm"
              width={48}
              height={48}
            />
          ) : (
            <div className="w-12 h-12 rounded-lg bg-brand/10 flex items-center justify-center shrink-0 text-xl">
              {SOURCE_ICON[music.sourceType]}
            </div>
          )}

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-ink truncate">{music.trackTitle}</p>
            <p className="text-xs text-muted truncate">{music.artist}</p>
            {music.durationSecs && (
              <p className="text-xs text-muted/70 mt-0.5">
                {SOURCE_ICON[music.sourceType]} {formatDuration(music.durationSecs)}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            <a
              href={music.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg text-muted hover:text-brand hover:bg-brand/10 transition"
              title="Open in streaming app"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </a>
            <button
              onClick={handleRemove}
              disabled={isPending}
              title="Remove music cue"
              className="p-1.5 rounded-lg text-muted hover:text-red-500 hover:bg-red-50 transition"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── URL input ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="url"
          placeholder="Paste Spotify or Apple Music track URL…"
          value={url}
          onChange={e => { setUrl(e.target.value); setError(null); }}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleFetch(); } }}
          className="flex-1 rounded-xl border border-[--hair] bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition"
        />
        <button
          onClick={handleFetch}
          disabled={!url.trim() || isPending}
          className="rounded-xl bg-brand text-white px-3 py-2 text-sm font-semibold hover:bg-brand/90 transition disabled:opacity-40 shrink-0 flex items-center gap-1.5"
        >
          {isPending ? (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          )}
          {isPending ? "Fetching…" : "Add"}
        </button>
      </div>
      {error && (
        <p className="text-xs text-red-600 flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          {error}
        </p>
      )}
      <p className="text-[11px] text-muted/70">
        Works with Spotify and Apple Music track links · Album art, track name, and duration fetched automatically
      </p>
    </div>
  );
}
