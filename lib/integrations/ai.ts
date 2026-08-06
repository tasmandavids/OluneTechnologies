import "server-only";

// ============================================================================
//  Bring-your-own model keys.
//
//  The Anthropic and OpenAI cards in Settings → Connections promise that a
//  studio's own key is used and that we "fall back to the platform key when not
//  set". Until now nothing read those keys — both AI features went straight to
//  process.env.OPENAI_API_KEY. This module is the resolver that makes the
//  promise true.
//
//  Precedence, highest first:
//    1. the studio's own Anthropic key   → Claude
//    2. the studio's own OpenAI key      → OpenAI
//    3. the platform OPENAI_API_KEY      → OpenAI
//    4. nothing                          → null, and the caller uses its
//                                          non-AI fallback
//
//  Anthropic wins over OpenAI when a studio has pasted both: it's the card that
//  names the features by name, so it's the one they meant.
//
//  Raw fetch rather than a provider SDK, matching lib/notify/providers.ts and
//  the existing OpenAI calls — the two providers sit side by side in this file
//  and an SDK for one of them would be the odd one out.
// ============================================================================

import { getStudioConnectionAdmin, hasValues } from "./credentials";

export type AiCompletionInput = {
  /** Whose keys to use. Null/undefined goes straight to the platform key. */
  studioId?: string | null;
  system: string;
  user: string;
  /** Ask for a single JSON object back. Callers still parse defensively. */
  json?: boolean;
  /**
   * Ceiling on the whole response. On Claude this covers thinking as well as
   * the answer, so it is set well above the visible output these callers want
   * — a tight budget truncates the answer mid-sentence rather than erroring.
   */
  maxTokens?: number;
};

type ResolvedProvider =
  | { kind: "anthropic"; apiKey: string }
  | { kind: "openai"; apiKey: string; organisation: string | null };

const DEFAULT_MAX_TOKENS = 8000;

async function resolveProvider(
  studioId: string | null | undefined,
): Promise<ResolvedProvider | null> {
  if (studioId) {
    const [anthropic, openai] = await Promise.all([
      getStudioConnectionAdmin(studioId, "anthropic"),
      getStudioConnectionAdmin(studioId, "openai"),
    ]);

    if (hasValues(anthropic, "apiKey")) {
      return { kind: "anthropic", apiKey: anthropic.values.apiKey.trim() };
    }
    if (hasValues(openai, "apiKey")) {
      return {
        kind: "openai",
        apiKey: openai.values.apiKey.trim(),
        organisation: openai.values.organisation?.trim() || null,
      };
    }
  }

  const platformKey = process.env.OPENAI_API_KEY;
  if (platformKey) return { kind: "openai", apiKey: platformKey, organisation: null };
  return null;
}

async function completeWithAnthropic(
  provider: Extract<ResolvedProvider, { kind: "anthropic" }>,
  input: AiCompletionInput,
): Promise<string | null> {
  const system = input.json
    ? `${input.system}\n\nReturn a single JSON object and nothing else — no prose, no code fences.`
    : input.system;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": provider.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? "claude-opus-5",
      max_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
      // Short marketing copy and inbox summaries don't need deep reasoning;
      // low effort keeps latency and the studio's own bill down. Note that
      // temperature/top_p are rejected outright on this model — steering is
      // done through the prompt.
      output_config: { effort: "low" },
      system,
      messages: [{ role: "user", content: input.user }],
    }),
  });

  if (!res.ok) return null;

  const json = (await res.json().catch(() => null)) as {
    stop_reason?: string;
    content?: { type: string; text?: string }[];
  } | null;
  if (!json) return null;

  // A safety refusal is a successful 200 with empty or partial content — check
  // before reading, or a declined request looks like a malformed response.
  if (json.stop_reason === "refusal") return null;

  // Thinking blocks share the content array and carry no text by default, so
  // take the text blocks specifically rather than content[0].
  const text = (json.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("")
    .trim();

  return text || null;
}

async function completeWithOpenAI(
  provider: Extract<ResolvedProvider, { kind: "openai" }>,
  input: AiCompletionInput,
): Promise<string | null> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${provider.apiKey}`,
    "Content-Type": "application/json",
  };
  if (provider.organisation) headers["OpenAI-Organization"] = provider.organisation;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: process.env.OPENAI_SUMMARY_MODEL ?? "gpt-4o-mini",
      temperature: 0.4,
      ...(input.json ? { response_format: { type: "json_object" } } : {}),
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
    }),
  });

  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: string } }[];
  } | null;
  return json?.choices?.[0]?.message?.content?.trim() || null;
}

/**
 * One text completion on whichever provider this studio is entitled to.
 *
 * Returns null for every failure — no key anywhere, a revoked key, a refusal,
 * a network blip. Both callers have a non-AI fallback that is genuinely good
 * enough, so a null is a quiet degrade rather than an error to surface.
 */
export async function completeText(input: AiCompletionInput): Promise<string | null> {
  const provider = await resolveProvider(input.studioId);
  if (!provider) return null;

  try {
    return provider.kind === "anthropic"
      ? await completeWithAnthropic(provider, input)
      : await completeWithOpenAI(provider, input);
  } catch {
    return null;
  }
}

/**
 * Whether any model key is reachable for this studio. Lets a caller skip
 * building an expensive prompt it would only throw away.
 */
export async function hasModelAccess(studioId?: string | null): Promise<boolean> {
  return (await resolveProvider(studioId)) !== null;
}
