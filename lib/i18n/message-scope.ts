import type { AbstractIntlMessages } from "next-intl";

/** Preserve locale context when a nested layout adds its own message namespaces. */
export function scopedMessageConfig(
  locale: string,
  shared: AbstractIntlMessages,
  scoped: AbstractIntlMessages,
) {
  return {
    locale,
    messages: { ...shared, ...scoped },
  };
}
