import { completeText } from "@/lib/integrations/ai";
import type { AdObjective, GeneratedAdCopy, SocialPlatform } from "./types";

type AdGenerationInput = {
  studioName: string;
  objective: AdObjective;
  platforms: SocialPlatform[];
  prompt: string;
  targetUrl?: string | null;
  /** Bills against the studio's own model key when it has connected one. */
  studioId?: string | null;
};

function buildHeuristicAdCopy(input: AdGenerationInput): GeneratedAdCopy {
  const { studioName, objective, platforms, prompt, targetUrl } = input;
  const topic = prompt.trim() || "dance classes and studio programmes";

  const objectiveCta: Record<AdObjective, string> = {
    awareness: "Discover us",
    traffic: "Learn more",
    engagement: "Join the conversation",
    conversions: "Enrol today",
    leads: "Book a free trial",
  };

  const headline = `${studioName} — ${topic.charAt(0).toUpperCase()}${topic.slice(1, 60)}`;
  const bodyText = [
    `Looking for ${topic}? ${studioName} welcomes dancers of all ages and levels.`,
    targetUrl ? `Visit ${targetUrl} to get started.` : "Tap to explore classes, events, and enrolment.",
  ].join(" ");

  const hashtags = ["#dance", "#dancestudio", "#dancelife"].slice(0, 3);

  const platformVariants: GeneratedAdCopy["platformVariants"] = {};
  for (const p of platforms) {
    if (p === "tiktok") {
      platformVariants.tiktok = {
        headline: headline.slice(0, 80),
        bodyText: `${bodyText.slice(0, 120)} ${hashtags.join(" ")}`,
      };
    } else if (p === "instagram") {
      platformVariants.instagram = {
        headline: headline.slice(0, 60),
        bodyText: `${bodyText.slice(0, 2000)}\n\n${hashtags.join(" ")}`,
      };
    } else if (p === "telegram") {
      platformVariants.telegram = {
        headline: headline.slice(0, 80),
        bodyText: `${bodyText.slice(0, 3500)}${targetUrl ? `\n\n→ ${targetUrl}` : ""}`,
      };
    } else {
      platformVariants.facebook = {
        headline: headline.slice(0, 40),
        bodyText: bodyText.slice(0, 500),
      };
    }
  }

  return {
    headline,
    bodyText,
    callToAction: objectiveCta[objective],
    hashtags,
    platformVariants,
  };
}

export async function generateAdCopy(input: AdGenerationInput): Promise<GeneratedAdCopy> {
  const fallback = buildHeuristicAdCopy(input);
  const platformList = input.platforms.join(", ");

  // Resolves to the studio's own Anthropic/OpenAI key when it connected one,
  // and the platform key otherwise. Null means no key anywhere — the heuristic
  // copy below is a real fallback, not a placeholder.
  const raw = await completeText({
    studioId: input.studioId,
    json: true,
    system: `You are an expert digital advertising copywriter for dance studios. Return JSON with keys: headline (string), bodyText (string), callToAction (string), hashtags (string array, 3-5 tags), platformVariants (object keyed by platform with headline and bodyText). Keep copy authentic, warm, and conversion-focused. Respect platform character limits: Facebook headline ~40 chars, Instagram caption ~2200 chars, TikTok caption ~150 chars, Telegram message ~4096 chars.`,
    user: `Studio: ${input.studioName}
Objective: ${input.objective}
Platforms: ${platformList}
Brief: ${input.prompt}
Target URL: ${input.targetUrl ?? "studio website"}`,
  });

  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw) as Partial<GeneratedAdCopy>;
    return {
      headline: parsed.headline?.trim() || fallback.headline,
      bodyText: parsed.bodyText?.trim() || fallback.bodyText,
      callToAction: parsed.callToAction?.trim() || fallback.callToAction,
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.map(String) : fallback.hashtags,
      platformVariants: { ...fallback.platformVariants, ...parsed.platformVariants },
    };
  } catch {
    return fallback;
  }
}
