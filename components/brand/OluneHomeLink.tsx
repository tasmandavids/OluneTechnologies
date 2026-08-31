"use client";

// Wraps the Olune logo on auth screens (login / join / onboarding) so it acts
// as a "home" button back to the Olune marketing site. Always points at the
// Olune home — even on a studio subdomain — per product decision. Absolute URL
// (not next/link) because it can cross origins, e.g. academy.olune.co.nz →
// www.olune.co.nz.

import type { ReactNode } from "react";
import { canonicalAppUrl } from "@/lib/app-url";

// canonicalAppUrl() rather than the raw env var: NEXT_PUBLIC_APP_URL is stored
// in production without a scheme, and a bare `olune.co.nz` in href is a
// RELATIVE path — the logo would navigate to /olune.co.nz and 404.
const OLUNE_HOME = canonicalAppUrl();

export function OluneHomeLink({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <a
      href={OLUNE_HOME}
      aria-label="Go to the Olune home page"
      className={`inline-flex rounded-lg transition-opacity hover:opacity-70 focus-visible:opacity-70 ${className}`}
    >
      {children}
    </a>
  );
}
