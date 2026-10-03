"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { setPortalTheme } from "@/app/actions/portal-theme";
import type { ThemeBase } from "@/lib/types";

type Props = {
  value: ThemeBase;
  className?: string;
};

export function ThemeSwitcher({ value, className = "" }: Props) {
  const t = useTranslations("shell");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onChange(next: string) {
    if (next !== "light" && next !== "dark") return;
    if (next === value) return;

    startTransition(async () => {
      await setPortalTheme(next);
      router.refresh();
    });
  }

  return (
    <label className={`inline-flex items-center gap-2 ${className}`}>
      <span className="text-[0.62rem] font-semibold uppercase tracking-widest text-muted">
        {t("theme")}
      </span>
      <select
        value={value}
        disabled={pending}
        aria-label={t("selectTheme")}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-(--hair) bg-surface px-2 py-1.5 text-xs text-ink outline-none transition hover:bg-base disabled:opacity-60"
      >
        <option value="light">{t("themeLight")}</option>
        <option value="dark">{t("themeDark")}</option>
      </select>
    </label>
  );
}
