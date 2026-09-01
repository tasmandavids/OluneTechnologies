// ============================================================================
//  GET /.well-known/apple-app-site-association   (rewritten here, see
//  next.config.ts — the public path has no file extension, which static
//  serving cannot give the right content-type for.)
//
//  Served from EVERY tenant host: aurora.olune.app, book.mystudio.co.nz, all
//  of them. iOS fetches this from the origin of the link it is about to open,
//  so a single central file would only ever make links on one studio's domain
//  open the app. The payload is host-independent — one app, many studios.
//
//  Apple's requirements, all of which this satisfies:
//    • Content-Type: application/json, and NO .json extension on the path.
//    • Plain 200, no redirect. (The middleware matcher skips /.well-known.)
//    • No authentication.
// ============================================================================

import { NextResponse } from "next/server";
import { buildAppleAppSiteAssociation } from "@/lib/mobile/app-links";

export const dynamic = "force-dynamic";

export async function GET() {
  const association = buildAppleAppSiteAssociation();

  // Unconfigured is a deployment state, not an error — but it must be a 404,
  // never a placeholder. Apple's CDN caches this file, and a wrong app id
  // silently stops links opening the app for as long as that cache lives.
  if (!association) {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(JSON.stringify(association), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      // Apple's CDN caches independently; this is for our own edge.
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });
}
