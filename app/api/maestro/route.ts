// ============================================================================
//  POST /api/maestro — the owner's AI assistant. Streams a tool-calling agent
//  scoped to the signed-in owner's studio. Read-only in Phase 1.
// ============================================================================

import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from "ai";
import { getPortalSession } from "@/lib/portal/session";
import { resolveAppOriginFromHeaders } from "@/lib/xero/app-origin";
import { MAESTRO_MODEL } from "@/lib/maestro/model";
import { buildMaestroSystemPrompt } from "@/lib/maestro/prompt";
import { buildMaestroTools } from "@/lib/maestro/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Agent loops (model → tool → model) can exceed the default; give it room.
export const maxDuration = 120;

export async function POST(req: Request) {
  const session = await getPortalSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Owner-only tool. Finances and (later) email are not for every role.
  if (session.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { messages }: { messages: UIMessage[] } = await req.json();

  const origin = await resolveAppOriginFromHeaders();
  const studio = session.memberships.find((m) => m.studioId === session.studioId);

  const result = streamText({
    model: MAESTRO_MODEL,
    system: buildMaestroSystemPrompt({
      studioName: studio?.studioName ?? "your studio",
      today: new Date().toISOString().slice(0, 10),
    }),
    messages: await convertToModelMessages(messages),
    tools: buildMaestroTools({ session, origin }),
    // Multi-hop questions (findParent -> getParentDetail, or several financial
    // tools combined) need more than a single tool round trip.
    stopWhen: stepCountIs(8),
  });

  return result.toUIMessageStreamResponse();
}
