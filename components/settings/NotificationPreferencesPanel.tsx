"use client";

import { useState, useTransition } from "react";
import { saveNotificationPreference } from "@/app/settings/notifications/actions";

type PrefEntry = {
  type: string;
  label: string;
  description: string;
  supportsEmail: boolean;
  supportsSms: boolean;
  supportsPush: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
};

type Channel = "email" | "sms" | "push";

function Toggle({
  enabled,
  onChange,
  disabled,
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={enabled}
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:opacity-40 ${enabled ? "bg-brand" : "bg-base-300"}`}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}

export function NotificationPreferencesPanel({ prefs: initial }: { prefs: PrefEntry[] }) {
  const [prefs, setPrefs] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleToggle(type: string, channel: Channel, value: boolean) {
    setPrefs(prev => prev.map(p => p.type === type ? { ...p, [`${channel}Enabled`]: value } : p));
    setSaved(false);
    setError(null);
    startTransition(async () => {
      const res = await saveNotificationPreference(type, channel, value);
      if (res?.error) { setError(res.error); return; }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-base-content">Notification preferences</h1>
        <p className="text-sm text-base-content/60 mt-0.5">
          In-app notifications are always on. Choose which ones also reach your email, your phone
          as a text, or the Olune app as a push notification.
        </p>
      </div>

      {error && <p className="text-sm text-red-500 bg-red-50 rounded p-2">{error}</p>}
      {saved && <p className="text-sm text-green-600 bg-green-50 rounded p-2">Saved.</p>}

      <div className="bg-surface rounded-xl shadow-sm divide-y divide-base-200">
        {/* Header row */}
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-6 px-5 py-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-base-content/40">Notification</span>
          <span className="text-xs font-semibold uppercase tracking-wide text-base-content/40 w-12 text-center">Email</span>
          <span className="text-xs font-semibold uppercase tracking-wide text-base-content/40 w-12 text-center">SMS</span>
          <span className="text-xs font-semibold uppercase tracking-wide text-base-content/40 w-12 text-center">Push</span>
        </div>

        {prefs.map(p => (
          <div key={p.type} className="grid grid-cols-[1fr_auto_auto_auto] gap-6 items-center px-5 py-4">
            <div>
              <p className="text-sm font-medium text-base-content">{p.label}</p>
              <p className="text-xs text-base-content/50 mt-0.5">{p.description}</p>
            </div>
            <div className="w-12 flex justify-center">
              {p.supportsEmail ? (
                <Toggle
                  enabled={p.emailEnabled}
                  onChange={v => handleToggle(p.type, "email", v)}
                  disabled={pending}
                />
              ) : (
                <span className="text-xs text-base-content/30">—</span>
              )}
            </div>
            <div className="w-12 flex justify-center">
              {p.supportsSms ? (
                <Toggle
                  enabled={p.smsEnabled}
                  onChange={v => handleToggle(p.type, "sms", v)}
                  disabled={pending}
                />
              ) : (
                <span className="text-xs text-base-content/30">—</span>
              )}
            </div>
            <div className="w-12 flex justify-center">
              {p.supportsPush ? (
                <Toggle
                  enabled={p.pushEnabled}
                  onChange={v => handleToggle(p.type, "push", v)}
                  disabled={pending}
                />
              ) : (
                <span className="text-xs text-base-content/30">—</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-base-content/40">
        SMS delivery requires a phone number on your profile and studio SMS configuration. Push
        notifications reach the Olune app on any device you are signed in to.
      </p>
    </div>
  );
}
