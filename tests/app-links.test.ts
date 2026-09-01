// ============================================================================
//  tests/app-links.test.ts
//
//  The association files are cached aggressively — Apple's CDN serves the AASA
//  it fetched, and Android caches verification results across installs. A wrong
//  value here does not fail loudly; it silently stops links opening the app for
//  as long as the cache lives. So the rule these tests enforce is: absent is
//  fine, wrong is not.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  APP_LINK_EXCLUSIONS,
  APP_LINK_PATHS,
  buildAppleAppSiteAssociation,
  buildAssetLinks,
  getAndroidFingerprints,
  getAndroidPackageName,
  getAppleAppId,
} from "@/lib/mobile/app-links";

const FINGERPRINT_A =
  "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99";
const FINGERPRINT_B =
  "11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00";

const saved = { ...process.env };

beforeEach(() => {
  delete process.env.APPLE_APP_ID;
  delete process.env.ANDROID_PACKAGE_NAME;
  delete process.env.ANDROID_SHA256_FINGERPRINTS;
});

afterEach(() => {
  process.env = { ...saved };
});

describe("getAppleAppId", () => {
  it("accepts a well-formed <TeamID>.<BundleID>", () => {
    process.env.APPLE_APP_ID = "A1B2C3D4E5.nz.co.olune.parent";
    expect(getAppleAppId()).toBe("A1B2C3D4E5.nz.co.olune.parent");
  });

  it("rejects a bundle id with no team prefix", () => {
    process.env.APPLE_APP_ID = "nz.co.olune.parent";
    expect(getAppleAppId()).toBeNull();
  });

  it("rejects a team id of the wrong length", () => {
    process.env.APPLE_APP_ID = "A1B2C3.nz.co.olune.parent";
    expect(getAppleAppId()).toBeNull();
  });

  it("rejects a lowercase team id — Apple's are uppercase alphanumeric", () => {
    process.env.APPLE_APP_ID = "a1b2c3d4e5.nz.co.olune.parent";
    expect(getAppleAppId()).toBeNull();
  });

  it("is null when unset", () => {
    expect(getAppleAppId()).toBeNull();
  });
});

describe("getAndroidPackageName", () => {
  it("accepts reverse-DNS", () => {
    process.env.ANDROID_PACKAGE_NAME = "nz.co.olune.parent";
    expect(getAndroidPackageName()).toBe("nz.co.olune.parent");
  });

  it("rejects a single segment — Play requires at least one dot", () => {
    process.env.ANDROID_PACKAGE_NAME = "olune";
    expect(getAndroidPackageName()).toBeNull();
  });

  it("rejects uppercase and hyphens, which a package name cannot contain", () => {
    process.env.ANDROID_PACKAGE_NAME = "nz.co.Olune.parent";
    expect(getAndroidPackageName()).toBeNull();
    process.env.ANDROID_PACKAGE_NAME = "nz.co.olune-parent";
    expect(getAndroidPackageName()).toBeNull();
  });
});

describe("getAndroidFingerprints", () => {
  it("parses a comma-separated list and upper-cases it", () => {
    process.env.ANDROID_SHA256_FINGERPRINTS = `${FINGERPRINT_A.toLowerCase()}, ${FINGERPRINT_B}`;
    expect(getAndroidFingerprints()).toEqual([FINGERPRINT_A, FINGERPRINT_B]);
  });

  // Publishing only the upload key is the classic reason App Links verify in
  // internal testing and then fail in production, where Google re-signs.
  it("keeps both keys rather than collapsing to one", () => {
    process.env.ANDROID_SHA256_FINGERPRINTS = `${FINGERPRINT_A},${FINGERPRINT_B}`;
    expect(getAndroidFingerprints()).toHaveLength(2);
  });

  it("drops malformed entries instead of emitting them", () => {
    process.env.ANDROID_SHA256_FINGERPRINTS = `${FINGERPRINT_A},not-a-fingerprint,AA:BB`;
    expect(getAndroidFingerprints()).toEqual([FINGERPRINT_A]);
  });

  it("is empty when unset", () => {
    expect(getAndroidFingerprints()).toEqual([]);
  });
});

describe("buildAppleAppSiteAssociation", () => {
  it("returns null rather than a placeholder when unconfigured", () => {
    expect(buildAppleAppSiteAssociation()).toBeNull();
  });

  it("builds the association Apple's schema expects", () => {
    process.env.APPLE_APP_ID = "A1B2C3D4E5.nz.co.olune.parent";
    const aasa = buildAppleAppSiteAssociation()!;
    expect(aasa.applinks.apps).toEqual([]); // required, and required to be empty
    expect(aasa.applinks.details).toHaveLength(1);
    expect(aasa.applinks.details[0].appID).toBe("A1B2C3D4E5.nz.co.olune.parent");
    expect(aasa.webcredentials.apps).toEqual(["A1B2C3D4E5.nz.co.olune.parent"]);
  });

  // iOS evaluates paths in order and a NOT entry only wins if it comes first.
  it("puts every exclusion ahead of every claimed path", () => {
    process.env.APPLE_APP_ID = "A1B2C3D4E5.nz.co.olune.parent";
    const paths = buildAppleAppSiteAssociation()!.applinks.details[0].paths;
    const lastExclusion = Math.max(...APP_LINK_EXCLUSIONS.map((p) => paths.indexOf(p)));
    const firstClaim = Math.min(...APP_LINK_PATHS.map((p) => paths.indexOf(p)));
    expect(lastExclusion).toBeLessThan(firstClaim);
  });

  it("claims the parent portal and leaves the auth and API paths to the browser", () => {
    process.env.APPLE_APP_ID = "A1B2C3D4E5.nz.co.olune.parent";
    const paths = buildAppleAppSiteAssociation()!.applinks.details[0].paths;
    expect(paths).toContain("/portal/parent/*");
    expect(paths).toContain("NOT /auth/*");
    expect(paths).toContain("NOT /api/*");
  });

  // Paying in-app is the point, and it is what makes the physical-service
  // exemption legible. It must not get excluded by a later edit.
  it("does not exclude billing", () => {
    process.env.APPLE_APP_ID = "A1B2C3D4E5.nz.co.olune.parent";
    const paths = buildAppleAppSiteAssociation()!.applinks.details[0].paths;
    expect(paths.some((p) => p.startsWith("NOT ") && p.includes("billing"))).toBe(false);
  });

  it("is host-independent — one app, many studios", () => {
    process.env.APPLE_APP_ID = "A1B2C3D4E5.nz.co.olune.parent";
    expect(JSON.stringify(buildAppleAppSiteAssociation())).not.toMatch(/olune\.app|\.co\.nz/);
  });
});

describe("buildAssetLinks", () => {
  it("is empty unless both the package and at least one fingerprint are set", () => {
    expect(buildAssetLinks()).toEqual([]);
    process.env.ANDROID_PACKAGE_NAME = "nz.co.olune.parent";
    expect(buildAssetLinks()).toEqual([]);
    process.env.ANDROID_SHA256_FINGERPRINTS = FINGERPRINT_A;
    expect(buildAssetLinks()).toHaveLength(1);
  });

  it("builds the statement Digital Asset Links expects", () => {
    process.env.ANDROID_PACKAGE_NAME = "nz.co.olune.parent";
    process.env.ANDROID_SHA256_FINGERPRINTS = `${FINGERPRINT_A},${FINGERPRINT_B}`;
    const [statement] = buildAssetLinks();
    expect(statement.relation).toEqual(["delegate_permission/common.handle_all_urls"]);
    expect(statement.target.namespace).toBe("android_app");
    expect(statement.target.package_name).toBe("nz.co.olune.parent");
    expect(statement.target.sha256_cert_fingerprints).toEqual([FINGERPRINT_A, FINGERPRINT_B]);
  });

  it("stays empty when the package name is malformed", () => {
    process.env.ANDROID_PACKAGE_NAME = "Olune";
    process.env.ANDROID_SHA256_FINGERPRINTS = FINGERPRINT_A;
    expect(buildAssetLinks()).toEqual([]);
  });
});
