// ============================================================================
//  mobile/src/lib/secure-storage.ts
//
//  The storage adapter Supabase's auth client persists a session into.
//
//  ── Why this is not four lines around SecureStore
//  expo-secure-store is backed by the iOS keychain and Android EncryptedSharedS
//  preferences, and it warns above 2048 bytes per value. A Supabase session is
//  an access token plus a refresh token plus the decoded user — comfortably
//  past that once a user has app_metadata, and it grows as claims are added.
//  Over the limit the behaviour is not a clean throw: Android has been observed
//  to store a truncated value, which comes back as unparseable JSON and reads
//  to the app as "signed out". The user is silently logged out on next launch
//  and nothing anywhere says why.
//
//  So values are chunked. A key holds a small manifest (how many chunks), and
//  the chunks live beside it. Reads reassemble; writes replace and clean up any
//  chunks a previous, longer value left behind.
//
//  ── Why not AsyncStorage
//  It is unencrypted on disk. A refresh token is a long-lived credential for a
//  parent's children's data; on a rooted or jailbroken device, or in an
//  unencrypted backup, plain AsyncStorage hands it over.
// ============================================================================

import * as SecureStore from "expo-secure-store";

/** Comfortably under the 2048-byte warning, leaving room for key overhead. */
const CHUNK_SIZE = 1536;

/** Bounded so a corrupt manifest cannot spin us through thousands of reads. */
const MAX_CHUNKS = 32;

const manifestKey = (key: string) => `${key}.manifest`;
const chunkKey = (key: string, i: number) => `${key}.${i}`;

/**
 * SecureStore rejects keys containing characters outside [A-Za-z0-9._-]. The
 * Supabase storage key is `sb-<project-ref>-auth-token`, which is already safe,
 * but the adapter is generic and a caller should not have to know that.
 */
function safeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, "_");
}

async function clearChunks(key: string, from = 0): Promise<void> {
  for (let i = from; i < MAX_CHUNKS; i += 1) {
    // deleteItemAsync on a missing key is a no-op, so this is safe to run past
    // the end; stopping early would strand chunks from a longer previous value.
    await SecureStore.deleteItemAsync(chunkKey(key, i));
  }
}

export const secureStorageAdapter = {
  async getItem(rawKey: string): Promise<string | null> {
    const key = safeKey(rawKey);
    try {
      const manifest = await SecureStore.getItemAsync(manifestKey(key));
      if (!manifest) return null;

      const count = Number(manifest);
      if (!Number.isInteger(count) || count < 1 || count > MAX_CHUNKS) {
        // A manifest we cannot trust means a value we cannot reassemble.
        // Treat it as absent and tidy up rather than returning half a session.
        await this.removeItem(rawKey);
        return null;
      }

      const parts: string[] = [];
      for (let i = 0; i < count; i += 1) {
        const part = await SecureStore.getItemAsync(chunkKey(key, i));
        // A missing chunk is the truncation case this file exists to survive.
        // Half a session is worse than none: it parses far enough to look
        // signed in and then fails on the first authenticated request.
        if (part == null) {
          await this.removeItem(rawKey);
          return null;
        }
        parts.push(part);
      }
      return parts.join("");
    } catch {
      // Keychain unavailable (device locked during a background refresh, or a
      // simulator quirk). Reporting "signed out" is recoverable; throwing here
      // takes the whole auth client down.
      return null;
    }
  },

  async setItem(rawKey: string, value: string): Promise<void> {
    const key = safeKey(rawKey);
    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE));
    }
    if (chunks.length > MAX_CHUNKS) {
      throw new Error(
        `secureStorageAdapter: value for "${rawKey}" needs ${chunks.length} chunks, over the ${MAX_CHUNKS} limit`,
      );
    }

    // Chunks first, then the manifest. A crash between the two leaves a stale
    // manifest pointing at a complete-or-missing set, and getItem treats a
    // missing chunk as absent — so the failure mode is "signed out", never
    // "signed in as a mangled session".
    for (let i = 0; i < chunks.length; i += 1) {
      await SecureStore.setItemAsync(chunkKey(key, i), chunks[i]);
    }
    await SecureStore.setItemAsync(manifestKey(key), String(chunks.length));
    // Drop any chunks left by a longer previous value.
    await clearChunks(key, chunks.length);
  },

  async removeItem(rawKey: string): Promise<void> {
    const key = safeKey(rawKey);
    // Manifest first: without it getItem returns null immediately, so the value
    // is gone the instant this line lands even if the rest is interrupted.
    await SecureStore.deleteItemAsync(manifestKey(key));
    await clearChunks(key);
  },
};
