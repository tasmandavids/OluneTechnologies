"use client";
import {
  NextIntlClientProvider,
  useLocale,
  useMessages,
  type AbstractIntlMessages,
} from "next-intl";
import type { ReactNode } from "react";
import { scopedMessageConfig } from "@/lib/i18n/message-scope";

/** Layout-owned namespaces merge with shared messages without resending them. */
export function MessageScope({ messages, children }: { messages: AbstractIntlMessages; children: ReactNode }) {
  const locale = useLocale();
  const shared = useMessages();
  return (
    <NextIntlClientProvider {...scopedMessageConfig(locale, shared, messages)}>
      {children}
    </NextIntlClientProvider>
  );
}
