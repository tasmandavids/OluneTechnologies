// ============================================================================
//  mobile/app/(tabs)/_layout.tsx — the five-tab shell.
//
//  expo-router's Tabs renders each platform's own idiom for free: a UITabBar on
//  iOS, a Material navigation bar on Android. That is most of the argument for
//  Expo over a webview in one component.
//
//  Push registration lives here rather than in sign-in, because tokens rotate
//  (restore to a new device, reinstall, credential change) and a token captured
//  once at sign-in goes stale silently. See src/lib/push.ts.
// ============================================================================

import { useEffect } from "react";
import { Tabs } from "expo-router";
import { Redirect } from "expo-router";
import { useAuth } from "../../src/lib/auth-context";
import { registerForPush } from "../../src/lib/push";
import { savedStudio } from "../../src/lib/studio";
import { theme } from "../../src/lib/theme";

export default function TabsLayout() {
  const { session, loading } = useAuth();

  useEffect(() => {
    if (!session) return;
    void savedStudio().then((studio) => {
      // Fire-and-forget: a parent who declined notifications still has a
      // working app, so this must never block or throw into the render path.
      void registerForPush(studio?.id ?? null);
    });
  }, [session]);

  if (loading) return null;
  if (!session) return <Redirect href="/sign-in" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.brand,
        tabBarInactiveTintColor: theme.muted,
        tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.hairline },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Today" }} />
    </Tabs>
  );
}
