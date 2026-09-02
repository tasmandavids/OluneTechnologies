export const locales = ["en", "fr", "it", "ru", "zh", "es", "ja", "ko"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

export const LOCALE_COOKIE = "olune_locale";

export const localeLabels: Record<Locale, string> = {
  en: "English",
  fr: "Français",
  it: "Italiano",
  ru: "Русский",
  zh: "中文",
  es: "Español",
  ja: "日本語",
  ko: "한국어",
};

export function isLocale(value: string | null | undefined): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}
