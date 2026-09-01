// ============================================================================
//  mobile/app/choose-studio.tsx — the screen the web never needs.
//
//  A parent types their studio's name, or the code from their welcome email
//  (which is the studio's slug — the same string that is its subdomain on the
//  web). Runs signed out, against the public lookup route.
// ============================================================================

import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { saveStudio, searchStudios, type StudioSummary } from "../src/lib/studio";
import { theme } from "../src/lib/theme";

export default function ChooseStudio() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StudioSummary[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    // Debounced: this fires on every keystroke and each one is a network call.
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      void searchStudios(query).then((found) => {
        if (cancelled) return;
        setResults(found);
        setSearching(false);
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  async function pick(studio: StudioSummary) {
    await saveStudio(studio);
    router.replace("/sign-in");
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.body}>
        <Text style={styles.title}>Find your studio</Text>
        <Text style={styles.sub}>
          Search by name, or enter the code from your welcome email.
        </Text>

        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Aurora Dance"
          placeholderTextColor={theme.muted}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
        />

        {searching && <ActivityIndicator color={theme.brand} style={{ marginTop: 20 }} />}

        {!searching &&
          results.map((studio) => (
            <Pressable key={studio.id} style={styles.row} onPress={() => void pick(studio)}>
              <Text style={styles.rowName}>{studio.name}</Text>
              <Text style={styles.rowSlug}>{studio.slug}</Text>
            </Pressable>
          ))}

        {!searching && query.trim().length >= 2 && results.length === 0 && (
          <Text style={styles.empty}>
            No studios match that. Check the spelling, or ask your studio for their Olune code.
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.base },
  body: { padding: 24, gap: 8 },
  title: { fontSize: 28, fontWeight: "700", color: theme.ink, letterSpacing: -0.5 },
  sub: { fontSize: 15, color: theme.muted, marginBottom: 16 },
  input: {
    backgroundColor: theme.surface,
    borderColor: theme.hairline,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    color: theme.ink,
  },
  row: {
    backgroundColor: theme.surface,
    borderColor: theme.hairline,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginTop: 8,
  },
  rowName: { fontSize: 16, fontWeight: "600", color: theme.ink },
  rowSlug: { fontSize: 13, color: theme.muted, marginTop: 2 },
  empty: { fontSize: 14, color: theme.muted, marginTop: 20, lineHeight: 20 },
});
