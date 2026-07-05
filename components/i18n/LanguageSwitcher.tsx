"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { setLocale } from "@/app/actions/locale";
import { localeLabels, locales, type Locale } from "@/lib/i18n/config";

type Props = {
  className?: string;
  compact?: boolean;
};

export function LanguageSwitcher({ className = "", compact = false }: Props) {
  const t = useTranslations("common");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onChange(next: string) {
    if (next === locale || !locales.includes(next as Locale)) return;

    startTransition(async () => {
      await setLocale(next as Locale);
      router.refresh();
    });
  }

  return (
    <label className={`inline-flex items-center gap-2 ${className}`}>
      {!compact && (
        <span className="text-[0.62rem] font-semibold uppercase tracking-widest text-muted">
          {t("language")}
        </span>
      )}
      <select
        value={locale}
        disabled={pending}
        aria-label={t("selectLanguage")}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-[--hair] bg-surface px-2 py-1.5 text-xs font-bold text-ink outline-none transition hover:bg-base disabled:opacity-60"
      >
        {locales.map((code) => (
          <option key={code} value={code}>
            {localeLabels[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
