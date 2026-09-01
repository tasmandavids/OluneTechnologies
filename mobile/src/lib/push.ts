// ============================================================================
//  mobile/src/lib/push.ts — registering this install for push.
//
//  Talks to POST/DELETE /api/devices, which fronts the register_device_token
//  RPC (migration 0120). The interesting rules live server-side; what this file
//  owes the backend is a correct token, a correct platform, and a revoke on
//  sign-out.
//
//  ── Why registration runs on every foreground, not just after sign-in
//  Expo push tokens are not permanent. They rotate when the app is restored to
//  a new device, reinstalled, or when FCM/APNs credentials change. A token
//  captured once at sign-in goes stale silently — the server keeps sending to
//  it and Expo keeps answering DeviceNotRegistered until the row is revoked, by
//  which point the parent has had no notifications for weeks and no error
//  anywhere says so. Re-registering is idempotent by design (the RPC upserts on
//  a live-token unique index), so the cheap fix is to just do it every time.
// ============================================================================

import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { api } from "./api";

export type PushRegistration = { ok: true; id: string } | { ok: false; reason: string };

/**
 * Ask for permission and hand the resulting token to the server.
 *
 * Never throws: a parent who declines notifications still has a working app,
 * and a failure here must not block the launch path.
 */
export async function registerForPush(studioId?: string | null): Promise<PushRegistration> {
  // A simulator cannot receive a push token at all. Returning a clear reason
  // beats an opaque Expo error every time someone tests on one.
  if (!Device.isDevice) {
    return { ok: false, reason: "Push notifications need a physical device." };
  }

  try {
    // Android 13+ requires a notification channel to exist before the runtime
    // prompt shows, and a push with no channel is delivered silently.
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Studio updates",
        importance: Notifications.AndroidImportance.DEFAULT,
        lightColor: "#5A55BD",
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    // Only prompt when we have not been answered yet. Asking again after a
    // decline does nothing on either platform except look broken.
    if (status !== "granted" && existing.canAskAgain) {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== "granted") {
      return { ok: false, reason: "Notifications are turned off for Olune." };
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    if (!projectId) {
      return { ok: false, reason: "EAS project id is missing from the build." };
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    const result = await api<{ ok: true; id: string }>("/api/devices", {
      method: "POST",
      body: JSON.stringify({
        token,
        platform: Platform.OS === "ios" ? "ios" : "android",
        deviceName: Device.deviceName ?? Device.modelName,
        appVersion: Constants.expoConfig?.version,
        studioId: studioId ?? null,
      }),
    });

    return { ok: true, id: result.id };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Could not register for push." };
  }
}

/**
 * Retire this install's registration on sign-out.
 *
 * Best-effort by design: the sign-out itself must not fail because the network
 * did. If this never lands, the server learns the token is dead the next time
 * Expo answers DeviceNotRegistered.
 */
export async function revokePush(): Promise<void> {
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    if (!projectId) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api("/api/devices", { method: "DELETE", body: JSON.stringify({ token }) });
  } catch {
    /* best effort — see above */
  }
}
