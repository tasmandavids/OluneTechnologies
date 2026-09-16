// ============================================================================
//  /platform layout — Olune platform operator console.
//  Only accessible to users in platform_operators or PLATFORM_OPERATOR_EMAILS.
// ============================================================================

import { MessageScope } from "@/components/i18n/MessageScope";
import { getMessages } from "next-intl/server";
import { redirect } from "next/navigation";
import { PlatformShell } from "@/components/platform/PlatformShell";
import { requirePlatformOperator } from "@/lib/platform/auth";

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await requirePlatformOperator();
  if (!auth.ok) redirect("/login?next=/platform");

  const messages = await getMessages();
  return (
    <MessageScope messages={{ platform: messages.platform, admin: messages.admin }}>
    <PlatformShell operatorName={auth.name}>{children}</PlatformShell>
    </MessageScope>
  );
}
