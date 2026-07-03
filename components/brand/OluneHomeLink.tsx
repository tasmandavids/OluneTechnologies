"use client";

// Wraps the Olune logo on auth screens (login / join / onboarding) so it acts
// as a "home" button back to the Olune marketing site. Always points at the
// Olune home — even on a studio subdomain — per product decision. Absolute URL
// (not next/link) because it can cross origins, e.g. academy.olune.co.nz →
// www.olune.co.nz.

import type { ReactNode } from "react";

const OLUNE_HOME = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://olune.co.nz";

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
