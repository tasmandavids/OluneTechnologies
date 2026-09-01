import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// Allow next/image to optimise images served from the studio's Supabase
// Storage bucket (public site-images). Derived from NEXT_PUBLIC_SUPABASE_URL so
// it tracks the configured project automatically.
function supabaseImageHostname(): string | null {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
  } catch {
    return null;
  }
}

const supaHost = supabaseImageHostname();

// @vercel/analytics and @vercel/speed-insights only hit va.vercel-scripts.com
// in development (the .debug.js builds). In production both are proxied through
// same-origin paths, which 'self' already covers — so this host is allowed in
// dev only rather than widening the production policy for nothing.
const devOnlySources = process.env.NODE_ENV === "development" ? " https://va.vercel-scripts.com" : "";

// Baseline HTTP security headers applied to every response. Deliberately
// conservative — no Content-Security-Policy (which needs per-app tuning to
// avoid breaking inline styles/scripts). HSTS is ignored by browsers over
// plain http://localhost, so it's safe in dev and correct in production.
const securityHeaders = [
  // Stop MIME-sniffing responses away from their declared content-type.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Disallow the app being framed by other origins (clickjacking).
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Don't leak full URLs/paths to third parties via the Referer header.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Drop powerful browser features the app doesn't use. camera=() is
  // intentionally open enough for QR scanning via getUserMedia on admin
  // ticket-check pages — Permissions-Policy still blocks mic/geo.
  {
    key: "Permissions-Policy",
    value: "microphone=(), geolocation=(), browsing-topics=()",
  },
  // Force HTTPS for 2 years incl. subdomains.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // Baseline CSP — allows Stripe Elements, Supabase, and Next inline bootstraps.
  // Tighten further once nonce-based script loading is wired.
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'self'",
      "form-action 'self'",
      "img-src 'self' data: blob: https:",
      // fonts.gstatic.com serves the actual .woff2 files that the
      // fonts.googleapis.com stylesheet points at — tenant typography is
      // studio-configurable, so both hosts are needed on every page.
      "font-src 'self' data: https://js.stripe.com https://fonts.gstatic.com",
      "style-src 'self' 'unsafe-inline' https://js.stripe.com https://fonts.googleapis.com",
      // googletagmanager.com is the studio's own GA4 tag (StudioAnalytics),
      // loaded only when a studio has connected Google Analytics.
      `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://maps.googleapis.com https://www.googletagmanager.com${devOnlySources}`,
      `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://maps.googleapis.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com${devOnlySources}`,
      "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com https://calendly.com https://form.typeform.com https://docs.google.com",
      "worker-src 'self' blob:",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // Monorepo-adjacent lockfile at ~/package-lock.json confuses output tracing.
  outputFileTracingRoot: import.meta.dirname,
  typescript: {
    ignoreBuildErrors: false,
  },
  // Tree-shake heavy barrel-export libraries so each route only bundles the
  // components it actually imports. framer-motion is pulled into ~66 client
  // components; recharts into the admin dashboards. Build-time only — no
  // runtime or auth behaviour change.
  experimental: {
    optimizePackageImports: ["framer-motion", "recharts"],
  },
  images: {
    remotePatterns: supaHost
      ? [
          {
            protocol: "https",
            hostname: supaHost,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },
  async headers() {
    return [
      {
        source: "/:path*\\.(svg|jpg|jpeg|png|webp|gif|ico|woff|woff2)",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  // Deep-link association files. Rewritten rather than served from public/
  // because Apple requires `apple-app-site-association` to have no extension
  // AND a Content-Type of application/json — static serving gives one or the
  // other, never both. Route handlers set it explicitly.
  //
  // These resolve on every tenant host, which is the point: iOS and Android
  // each fetch the association from the origin of the link they are opening,
  // so a studio subdomain and a studio's custom domain both have to answer.
  async rewrites() {
    return [
      {
        source: "/.well-known/apple-app-site-association",
        destination: "/api/well-known/apple-app-site-association",
      },
      {
        source: "/.well-known/assetlinks.json",
        destination: "/api/well-known/assetlinks",
      },
    ];
  },
};

export default withNextIntl(nextConfig);
