// ============================================================================
//  mobile/app/(tabs)/index.tsx — Today.
//
//  SCAFFOLD. Reads the signed-in parent's children straight from Supabase to
//  prove the whole chain end to end: keychain session → RLS → real rows. The
//  real Today screen (today's classes, what needs the parent, the costume
//  banner) is phase 3 — see the plan artifact.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../../src/lib/supabase";
import { revokePush } from "../../src/lib/push";
import { clearStudio, savedStudio, type StudioSummary } from "../../src/lib/studio";
import { theme } from "../../src/lib/theme";

type Child = { studentId: string; name: string | null };

export default function Today() {
  const router = useRouter();
  const [studio, setStudio] = useState<StudioSummary | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [studioRow, { data, error: queryError }] = await Promise.all([
      savedStudio(),
      // No studio filter: RLS already scopes guardianships to this parent.
      // Filtering here as well would be belt-and-braces that silently returns
      // nothing the day a parent has children at two studios.
      supabase.from("guardianships").select("student_id, students(full_name)"),
    ]);
    setStudio(studioRow);
    if (queryError) {
      setError(queryError.message);
    } else {
      setChildren(
        (data ?? []).map((row) => ({
          studentId: row.student_id as string,
          name:
            (row.students as { full_name?: string } | null)?.full_name ?? null,
        })),
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function signOut() {
    await revokePush();
    await supabase.auth.signOut();
    await clearStudio();
    router.replace("/choose-studio");
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={theme.brand} />
        }
      >
        <Text style={styles.title}>Today</Text>
        {studio && <Text style={styles.sub}>{studio.name}</Text>}

        {loading && <ActivityIndicator color={theme.brand} style={{ marginTop: 24 }} />}
        {error && <Text style={styles.error}>{error}</Text>}

        {!loading && !error && children.length === 0 && (
          <Text style={styles.empty}>
            No children are linked to this account yet. Your studio can add them.
          </Text>
        )}

        {children.map((child) => (
          <View key={child.studentId} style={styles.card}>
            <Text style={styles.cardName}>{child.name ?? "Unnamed student"}</Text>
          </View>
        ))}

        <Pressable onPress={() => void signOut()} style={styles.link}>
          <Text style={styles.linkText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.base },
  body: { padding: 24, gap: 8 },
  title: { fontSize: 30, fontWeight: "700", color: theme.ink, letterSpacing: -0.6 },
  sub: { fontSize: 15, color: theme.muted, marginBottom: 12 },
  card: {
    backgroundColor: theme.surface,
    borderColor: theme.hairline,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginTop: 8,
  },
  cardName: { fontSize: 16, fontWeight: "600", color: theme.ink },
  empty: { fontSize: 14, color: theme.muted, marginTop: 20, lineHeight: 20 },
  error: { color: "#AB4239", fontSize: 14, marginTop: 16, lineHeight: 19 },
  link: { alignItems: "center", paddingVertical: 20, marginTop: 20 },
  linkText: { color: theme.brand, fontSize: 14, fontWeight: "500" },
});
