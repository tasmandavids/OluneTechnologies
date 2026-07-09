// ============================================================================
//  Maestro — the studio owner's AI operations assistant.
//  Model is resolved through the Vercel AI Gateway (plain "provider/model"
//  strings), so no provider SDK is wired directly. Auth to the gateway is via
//  AI_GATEWAY_API_KEY locally, or Vercel OIDC in deployed environments.
// ============================================================================

/**
 * Default model for the owner-facing agent, routed through the AI Gateway.
 * Nemotron 3 nano (a small MoE) is ~100x cheaper than Opus; the trade-off is
 * weaker multi-step tool-calling, so watch that it reliably drives the tool
 * loop as more tools are added. Override per-env with MAESTRO_MODEL
 * (e.g. "anthropic/claude-opus-4.8" for the highest-quality chat).
 */
export const MAESTRO_MODEL =
  process.env.MAESTRO_MODEL?.trim() || "nvidia/nemotron-3-nano-30b-a3b";
