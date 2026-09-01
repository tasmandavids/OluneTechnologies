// ============================================================================
//  mobile/app/sign-in.tsx — email + password against the same Supabase project
//  the web portal uses. Same accounts, same RLS, same rows.
//
//  Google and Sign in with Apple come next: Apple REQUIRES Sign in with Apple
//  on iOS wherever a third-party social login is offered, so Google cannot ship
//  here on its own.
// ============================================================================

import { useState } from "react";
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
import { supabase } from "../src/lib/supabase";
import { clearStudio } from "../src/lib/studio";
import { theme } from "../src/lib/theme";

export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (signInError) {
      // Supabase returns the same message for a wrong password and an unknown
      // address, deliberately — do not "improve" it into an account oracle.
      setError(signInError.message);
      return;
    }
    router.replace("/(tabs)");
  }

  async function switchStudio() {
    await clearStudio();
    router.replace("/choose-studio");
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.body}>
        <Text style={styles.title}>Sign in</Text>
        <Text style={styles.sub}>Use the same details as the Olune parent portal.</Text>

        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={theme.muted}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="username"
        />
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor={theme.muted}
          secureTextEntry
          autoCapitalize="none"
          // Lets iOS offer the password already saved for the web portal —
          // the webcredentials entitlement in app.config.ts is what links them.
          textContentType="password"
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={[styles.button, busy && { opacity: 0.6 }]}
          onPress={() => void submit()}
          disabled={busy || !email || !password}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Sign in</Text>
          )}
        </Pressable>

        <Pressable onPress={() => void switchStudio()} style={styles.link}>
          <Text style={styles.linkText}>Wrong studio?</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.base },
  body: { padding: 24, gap: 10 },
  title: { fontSize: 28, fontWeight: "700", color: theme.ink, letterSpacing: -0.5 },
  sub: { fontSize: 15, color: theme.muted, marginBottom: 14 },
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
  button: {
    backgroundColor: theme.brand,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  error: { color: "#AB4239", fontSize: 14, lineHeight: 19 },
  link: { alignItems: "center", paddingVertical: 12 },
  linkText: { color: theme.brand, fontSize: 14, fontWeight: "500" },
});
