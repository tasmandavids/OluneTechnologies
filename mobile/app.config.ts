// ============================================================================
//  mobile/app.config.ts — the Olune parent app's native configuration.
//
//  This file is what App Store Connect and Play Console actually read about the
//  app: identifiers, entitlements, permission strings, privacy declarations and
//  export compliance. Most of what a first submission gets rejected for is
//  decided here rather than in any screen.
//
//  ── One app, many studios
//  There is a single bundle identifier and a single store listing. A studio is
//  chosen inside the app (see src/lib/studio.ts) and its branding is themed at
//  runtime from the studios row — the web's per-studio subdomains have no
//  equivalent in a binary and are deliberately not modelled here.
//
//  A per-studio white-label build is a later paid tier. Everything identity-
//  shaped below reads from `process.env`, so that build is a different env file
//  and an EAS profile, not a fork of this file.
//
//  ── Associated domains are a short, static list, and that is not an accident
//  Olune only ever sends parents links on the canonical origin — see
//  lib/app-url.ts on the web, where canonicalAppUrl() deliberately returns one
//  stable host for every notification link rather than the studio's subdomain,
//  because OAuth needs a fixed callback. So the app only has to claim that one
//  origin. `*.olune.app` is claimed as well for hand-written studio links; a
//  studio's own custom domain (book.mystudio.co.nz) CANNOT be claimed without
//  shipping a new binary, which is the one real limitation of the single-app
//  model. Links on those domains open the browser, which still works.
// ============================================================================

import type { ExpoConfig, ConfigContext } from "expo/config";

/** Reverse-DNS of olune.co.nz. Identical on both platforms, deliberately. */
const BUNDLE_ID = process.env.OLUNE_BUNDLE_ID ?? "nz.co.olune.parent";

/** The one origin Olune sends parents links on. Must match NEXT_PUBLIC_APP_URL. */
const CANONICAL_HOST = process.env.OLUNE_CANONICAL_HOST ?? "www.olune.co.nz";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Olune",
  slug: "olune-parent",
  scheme: "olune", // OAuth + push deep links: olune://…
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  // No `newArchEnabled` — the New Architecture is the only one SDK 57
  // ships, so the flag was removed from the config type.

  // Both stores read these; keep them in step with the web's NZ-first framing.
  primaryColor: "#5A55BD",

  ios: {
    bundleIdentifier: BUNDLE_ID,
    supportsTablet: true, // families share iPads — see the device_tokens design
    associatedDomains: [
      `applinks:${CANONICAL_HOST}`,
      "applinks:olune.co.nz",
      "applinks:*.olune.app",
      // Lets the app fill and save credentials against the same origin the web
      // portal uses, so a parent's saved password works in both.
      `webcredentials:${CANONICAL_HOST}`,
    ],
    infoPlist: {
      // EXPORT COMPLIANCE. Without this, every single upload stops and asks.
      // False is correct here: the app uses only HTTPS/TLS, which is exempt.
      ITSAppUsesNonExemptEncryption: false,

      // Permission strings. iOS shows these verbatim; a vague one is a
      // rejection under 5.1.1, and there is no permission the app asks for
      // that a parent should have to guess the reason for.
      NSCameraUsageDescription:
        "Olune uses the camera to scan your check-in pass and to add a photo to your child's profile.",
      NSPhotoLibraryUsageDescription:
        "Olune needs access to your photos so you can add a profile photo for your child.",
      NSFaceIDUsageDescription:
        "Olune uses Face ID to unlock the app without re-entering your password.",
    },

    // Apple has required a privacy manifest on upload since May 2024. Each
    // entry pairs an API category with the reason code that justifies it; the
    // four below are what Expo's own modules and Supabase's storage touch.
    // https://developer.apple.com/documentation/bundleresources/privacy_manifest_files
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      NSPrivacyCollectedDataTypes: [
        {
          NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypeEmailAddress",
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: ["NSPrivacyCollectedDataTypePurposeAppFunctionality"],
        },
        {
          NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypeName",
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: ["NSPrivacyCollectedDataTypePurposeAppFunctionality"],
        },
        {
          NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypePhoneNumber",
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: ["NSPrivacyCollectedDataTypePurposeAppFunctionality"],
        },
        {
          // Children's names, classes and attendance. Declared as "other user
          // content" because that is what it is; the account holder is an adult.
          NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypeOtherUserContent",
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: ["NSPrivacyCollectedDataTypePurposeAppFunctionality"],
        },
      ],
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryUserDefaults",
          NSPrivacyAccessedAPITypeReasons: ["CA92.1"], // app's own settings
        },
        {
          NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryFileTimestamp",
          NSPrivacyAccessedAPITypeReasons: ["C617.1"], // files inside the container
        },
        {
          NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategorySystemBootTime",
          NSPrivacyAccessedAPITypeReasons: ["35F9.1"], // measuring elapsed time
        },
        {
          NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryDiskSpace",
          NSPrivacyAccessedAPITypeReasons: ["E174.1"], // write failure handling
        },
      ],
    },
  },

  android: {
    package: BUNDLE_ID,
    // No `edgeToEdgeEnabled` — SDK 57 enforces edge-to-edge on Android
    // unconditionally and dropped the opt-in flag from the config type.
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#FAF8F3",
    },
    // App Links. autoVerify makes Android fetch /.well-known/assetlinks.json
    // from each host — which the web app now serves on every tenant host (see
    // app/api/well-known/assetlinks). A host that fails verification opens in
    // Chrome instead of the app, silently, so keep this list and the entitlement
    // above in step.
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          { scheme: "https", host: CANONICAL_HOST },
          { scheme: "https", host: "olune.co.nz" },
          { scheme: "https", host: "*.olune.app" },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
    permissions: [
      "android.permission.POST_NOTIFICATIONS", // Android 13+ runtime prompt
      "android.permission.CAMERA",
      "android.permission.USE_BIOMETRIC",
    ],
    // Explicitly dropped: Expo's defaults add RECORD_AUDIO and the storage
    // permissions via transitive modules. Play's data-safety review asks about
    // every permission in the manifest, and none of these are used.
    blockedPermissions: [
      "android.permission.RECORD_AUDIO",
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
    ],
  },

  plugins: [
    "expo-router",
    "expo-secure-store",
    [
      "expo-notifications",
      {
        icon: "./assets/notification-icon.png",
        color: "#5A55BD",
      },
    ],
    [
      // SDK 52 moved the splash screen out of the top-level `splash` key and
      // into this plugin. Same three values, different home.
      "expo-splash-screen",
      {
        image: "./assets/splash.png",
        resizeMode: "contain",
        backgroundColor: "#FAF8F3",
      },
    ],
    [
      "expo-build-properties",
      {
        // Play requires apps to target a recent API level; pinning it here
        // stops an SDK bump from silently changing what we submit.
        android: { compileSdkVersion: 35, targetSdkVersion: 35 },
        // SDK 57 refuses to build below 16.4 — expo-build-properties
        // validates this at config time, not at build time.
        ios: { deploymentTarget: "16.4" },
      },
    ],
  ],

  extra: {
    router: {},
    eas: { projectId: process.env.EAS_PROJECT_ID },
    // Read at runtime by src/lib/supabase.ts. EXPO_PUBLIC_* is inlined into the
    // bundle, which is correct for the anon key (it is public by design and
    // RLS is the boundary) and would be catastrophic for the service key —
    // that never appears in this project.
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? `https://${CANONICAL_HOST}`,
  },

  icon: "./assets/icon.png",
});
