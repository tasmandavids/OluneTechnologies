// ============================================================================
//  GET /api/studios/lookup?q=<name or code>
//
//  The native app's first screen. One binary has no hostname, so before a
//  parent can sign in the app has to ask which studio they are with — and this
//  is the only call it can make while signed out.
//
//  ── Why this is public
//  It exposes nothing new. `studios` already has an RLS policy admitting a
//  public read of every non-suspended row (0001), which is what makes tenant
//  resolution work pre-login on the web today. This route is that same read
//  reached by a query instead of by a hostname.
//
//  Results are capped and the term is sanitized in lib/tenant-search.ts; a
//  query shorter than two characters returns an empty list rather than most of
//  the table.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { findStudios } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const studios = await findStudios(req.nextUrl.searchParams.get("q"));

  return NextResponse.json(
    {
      // Deliberately narrower than the Studio type: the app needs enough to
      // show a pick-list and remember a choice. custom_domain and status are
      // deployment detail and stay server-side.
      studios: studios.map((s) => ({ id: s.id, name: s.name, slug: s.slug })),
    },
    {
      // Studio names change about never, and this is the one request every cold
      // app launch makes. Cache it at the edge, keep it out of private caches.
      headers: { "Cache-Control": "public, max-age=60, s-maxage=300" },
    },
  );
}
