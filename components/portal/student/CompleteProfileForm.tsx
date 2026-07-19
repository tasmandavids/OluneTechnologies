"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { completeAdultProfile } from "@/app/portal/student/complete-profile/actions";

export default function CompleteProfileForm({
  initialFullName,
}: {
  initialFullName: string | null;
}) {
  const t = useTranslations("student.completeProfile");
  const [fullName, setFullName] = useState(initialFullName ?? "");
  const [birthday, setBirthday] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await completeAdultProfile({ fullName, birthday });
      if (res && !res.ok) setError(res.error);
    });
  }

  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-sm flex-col justify-center px-6 py-10">
      <h1 className="mb-1 text-xl font-black text-ink">{t("heading")}</h1>
      <p className="mb-6 text-sm text-muted">{t("subheading")}</p>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">
            {t("fullNameLabel")}
          </label>
          <input
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded-xl border border-[--hair] bg-base px-3 py-2.5 text-sm text-ink"
            autoComplete="name"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">
            {t("birthdayLabel")}
          </label>
          <input
            type="date"
            required
            value={birthday}
            onChange={(e) => setBirthday(e.target.value)}
            className="w-full rounded-xl border border-[--hair] bg-base px-3 py-2.5 text-sm text-ink"
          />
        </div>

        {error && (
          <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-500">{error}</p>
        )}

        <button
          type="submit"
          disabled={pending || !fullName.trim() || !birthday}
          className="mt-2 w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
        >
          {pending ? t("saving") : t("continue")}
        </button>
      </form>
    </div>
  );
}
