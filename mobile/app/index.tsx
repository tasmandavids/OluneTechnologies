// ============================================================================
//  mobile/app/index.tsx — the launch gate.
//
//  Three questions in order, because each depends on the last:
//    1. Which studio?  (no hostname to tell us — see src/lib/studio.ts)
//    2. Signed in?
//    3. Then the tabs.
// ============================================================================

import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { savedStudio, type StudioSummary } from "../src/lib/studio";
import { useAuth } from "../src/lib/auth-context";
import { theme } from "../src/lib/theme";

export default function Index() {
  const { session, loading } = useAuth();
  const [studio, setStudio] = useState<StudioSummary | null>(null);
  const [checkedStudio, setCheckedStudio] = useState(false);

  useEffect(() => {
    void savedStudio().then((s) => {
      setStudio(s);
      setCheckedStudio(true);
    });
  }, []);

  if (loading || !checkedStudio) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.base }}>
        <ActivityIndicator color={theme.brand} />
      </View>
    );
  }

  if (!studio) return <Redirect href="/choose-studio" />;
  if (!session) return <Redirect href="/sign-in" />;
  return <Redirect href="/(tabs)" />;
}
