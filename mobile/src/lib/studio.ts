// ============================================================================
//  mobile/src/lib/studio.ts — which studio is this family with?
//
//  The web never asks: the hostname answers it (lib/tenant.ts). A single binary
//  has no hostname, so this is the first screen, and the answer is remembered.
//
//  Stored in plain AsyncStorage-style preferences rather than the keychain: a
//  studio id is not a secret, it is public-readable by RLS, and putting it in
//  secure storage would mean a keychain read on every cold launch for nothing.
// ============================================================================

import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

const STUDIO_KEY = "olune.studio";

const BASE = (Constants.expoConfig?.extra?.apiBaseUrl as string) ?? "";

export type StudioSummary = { id: string; name: string; slug: string };

/**
 * Search studios by name or by the code on a welcome email (the slug).
 *
 * Unauthenticated on purpose — a parent has to choose a studio before they can
 * sign in. `studios` is already public-readable for non-suspended rows, which
 * is what makes host-based resolution work pre-login on the web.
 */
export async function searchStudios(query: string): Promise<StudioSummary[]> {
  if (query.trim().length < 2) return [];
  const res = await fetch(`${BASE}/api/studios/lookup?q=${encodeURIComponent(query.trim())}`);
  if (!res.ok) return [];
  const body = (await res.json()) as { studios?: StudioSummary[] };
  return body.studios ?? [];
}

export async function savedStudio(): Promise<StudioSummary | null> {
  try {
    const raw = await AsyncStorage.getItem(STUDIO_KEY);
    return raw ? (JSON.parse(raw) as StudioSummary) : null;
  } catch {
    return null;
  }
}

export async function saveStudio(studio: StudioSummary): Promise<void> {
  await AsyncStorage.setItem(STUDIO_KEY, JSON.stringify(studio));
}

export async function clearStudio(): Promise<void> {
  await AsyncStorage.removeItem(STUDIO_KEY);
}
