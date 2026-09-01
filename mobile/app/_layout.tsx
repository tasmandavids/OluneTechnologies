// ============================================================================
//  mobile/app/_layout.tsx — root layout. Owns the two things that must be true
//  for the whole app: a live auth session, and a foreground-tied refresh timer.
// ============================================================================

import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import * as Notifications from "expo-notifications";
import type { Session } from "@supabase/supabase-js";
import { supabase, startAuthAutoRefresh } from "../src/lib/supabase";
import { AuthContext } from "../src/lib/auth-context";

// Show pushes that land while the app is open. Without this the OS suppresses
// them in the foreground and a parent watching the screen sees nothing.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stop = startAuthAutoRefresh();

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => {
      sub.subscription.unsubscribe();
      stop();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ session, loading }}>
      <Stack screenOptions={{ headerShown: false }} />
    </AuthContext.Provider>
  );
}
