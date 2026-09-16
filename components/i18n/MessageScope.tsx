"use client";
import { NextIntlClientProvider, useMessages, type AbstractIntlMessages } from "next-intl";
import type { ReactNode } from "react";

/** Layout-owned namespaces merge with shared messages without resending them. */
export function MessageScope({ messages, children }: { messages: AbstractIntlMessages; children: ReactNode }) {
  const shared = useMessages();
  return <NextIntlClientProvider messages={{ ...shared, ...messages }}>{children}</NextIntlClientProvider>;
}
