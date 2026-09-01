// ============================================================================
//  mobile/src/lib/supabase.ts — the app's Supabase client.
//
//  Same project, same RLS, same rows as the web portal. The differences are all
//  about where the session lives and who refreshes it:
//
//    • storage      — the encrypted, chunked keychain adapter, not cookies.
//    • autoRefresh  — ON here. On the web, middleware owns refresh and the
//                     server client disables it to avoid a race; in the app
//                     there is no middleware, so the client must do it.
//    • detectSessionInUrl — OFF. That is a browser concept; leaving it on makes
//                     auth-js look for a hash fragment that never exists.
// ============================================================================

import Constants from "expo-constants";
import { AppState } from "react-native";
import { createClient } from "@supabase/supabase-js";
import { secureStorageAdapter } from "./secure-storage";

const extra = Constants.expoConfig?.extra ?? {};

const url = extra.supabaseUrl as string | undefined;
const anonKey = extra.supabaseAnonKey as string | undefined;

if (!url || !anonKey) {
  // Failing loudly at import beats a blank screen and a network error later:
  // this only ever happens when the EXPO_PUBLIC_* vars are missing from the
  // build profile, which is a build-time mistake with a build-time fix.
  throw new Error(
    "Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in the EAS build profile.",
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: secureStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/**
 * Refresh only while the app is actually in front.
 *
 * Left to itself the client keeps a refresh timer running in the background,
 * which on iOS fires while the device is locked — at which point the keychain
 * is unavailable, the write fails, and the session can be lost. Tying the timer
 * to foreground state is the documented remedy.
 */
export function startAuthAutoRefresh(): () => void {
  const subscription = AppState.addEventListener("change", (state) => {
    if (state === "active") {
      void supabase.auth.startAutoRefresh();
    } else {
      void supabase.auth.stopAutoRefresh();
    }
  });
  void supabase.auth.startAutoRefresh();
  return () => subscription.remove();
}

/** The access token to put in `Authorization: Bearer …` for /api/* calls. */
export async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
