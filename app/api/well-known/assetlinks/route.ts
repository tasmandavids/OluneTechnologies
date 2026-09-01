// ============================================================================
//  GET /.well-known/assetlinks.json   (rewritten here, see next.config.ts)
//
//  The Android half of the same story. Android verifies App Links per host, so
//  this has to answer on every studio subdomain and every custom domain — the
//  same reason the Apple file does.
//
//  Note for custom domains: Android 12+ re-verifies on install and on network
//  change. A studio whose custom domain is behind a proxy that blocks
//  Googlebot-style fetches will fail verification silently, and links will open
//  in Chrome instead of the app. That is the first thing to check when one
//  studio's links misbehave and everyone else's are fine.
// ============================================================================

import { NextResponse } from "next/server";
import { buildAssetLinks } from "@/lib/mobile/app-links";

export const dynamic = "force-dynamic";

export async function GET() {
  const statements = buildAssetLinks();

  // Same reasoning as the Apple file: absent beats wrong.
  if (statements.length === 0) {
    return new NextResponse(null, { status: 404 });
  }

  return NextResponse.json(statements, {
    headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" },
  });
}
