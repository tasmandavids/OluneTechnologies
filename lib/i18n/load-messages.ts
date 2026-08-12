import type { Locale } from "@/lib/i18n/config";

const MESSAGE_MODULES = [
  "core",
  "errors",
  "onboarding",
  "plan",
  "setup",
  "marketing",
  "enrol",
  "join",
  "programmes",
  "admin",
  "parent",
  "portal",
  "teacher",
  "student",
  "platform",
  "site",
  "payments",
  "office",
  "timeclock",
] as const;

function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...base };
  for (const key of Object.keys(override)) {
    const baseVal = base[key];
    const overrideVal = override[key];
    if (
      overrideVal &&
      typeof overrideVal === "object" &&
      !Array.isArray(overrideVal) &&
      baseVal &&
      typeof baseVal === "object" &&
      !Array.isArray(baseVal)
    ) {
      result[key] = deepMerge(
        baseVal as Record<string, unknown>,
        overrideVal as Record<string, unknown>,
      );
    } else {
      result[key] = overrideVal;
    }
  }
  return result;
}

async function loadLocaleParts(locale: Locale): Promise<Record<string, unknown>[]> {
  return Promise.all(
    MESSAGE_MODULES.map(async (mod) => {
      try {
        return (await import(`../../messages/${locale}/${mod}.json`)).default as Record<
          string,
          unknown
        >;
      } catch {
        return {};
      }
    }),
  );
}

export async function loadMessages(locale: Locale): Promise<Record<string, unknown>> {
  const enParts = await loadLocaleParts("en");
  const en = enParts.reduce((acc, part) => deepMerge(acc, part), {});

  if (locale === "en") return en;

  const localeParts = await loadLocaleParts(locale);
  const localized = localeParts.reduce((acc, part) => deepMerge(acc, part), {});
  return deepMerge(en, localized);
}
