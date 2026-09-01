#!/usr/bin/env bash
# ============================================================================
#  mobile/bootstrap.sh — install dependencies at versions that match whatever
#  Expo SDK is current.
#
#  Dependencies are deliberately NOT pinned in package.json. Every Expo package
#  has one version per SDK, and a hand-written version that is one minor out
#  produces a native build failure with a stack trace that points nowhere near
#  the cause. `npx expo install` resolves each package against the installed
#  SDK, which is the only reliable way to get this right.
#
#  Run once, from this directory:  bash bootstrap.sh
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")"

echo "→ Installing the Expo SDK"
npm install expo@latest

echo "→ Installing runtime dependencies at SDK-matched versions"
npx expo install \
  expo-router \
  expo-constants \
  expo-linking \
  expo-secure-store \
  expo-notifications \
  expo-device \
  expo-build-properties \
  expo-status-bar \
  react-native-safe-area-context \
  react-native-screens \
  @react-native-async-storage/async-storage \
  react \
  react-native

echo "→ Installing packages Expo does not manage"
npm install @supabase/supabase-js react-native-url-polyfill

echo "→ Installing dev dependencies"
npx expo install --dev typescript @types/react

echo "→ Aligning every version with the installed SDK"
npx expo install --fix

echo "→ Checking the project"
npx expo-doctor || true

cat <<'NEXT'

Done. Next:
  1. Copy .env.example to .env and fill it in.
  2. npx eas login && npx eas init      (writes EAS_PROJECT_ID)
  3. npm start                          (Expo Go — push will not work, see README)
  4. npm run build:preview              (a real build, on a real device)
NEXT
