// ============================================================================
//  /portal/admin/messages — the admin Inbox: one door for studio comms.
//  Tabs: Messages (internal/parent chat) | Email (connected studio inbox).
//  Backends stay separate — this is a UI-level merge only (1.6.1 IA).
// ============================================================================

import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "@/lib/i18n/server";
import { isStudioOpsRole } from "@/lib/portal/access";
import { requirePortalSession } from "@/lib/portal/session";
import { MessagesTab } from "./messages-tab";
import { EmailTab } from "./email-tab";

export const dynamic = "force-dynamic";

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    with?: string;
    topic?: string;
    error?: string;
    connected?: string;
  }>;
}) {
  const params = await searchParams;
  const { role } = await requirePortalSession();

  if (!isStudioOpsRole(role)) {
    redirect(role === "office" ? "/portal/office" : "/portal/admin");
  }

  // The email inbox is admin-only (office staff keep messages only).
  const canEmail = role === "admin";
  const tab = canEmail && params.tab === "email" ? "email" : "messages";
  const t = await getTranslations("admin.inbox");

  // The admin shell reserves 70px of bottom padding for every page; the inbox is
  // a full-height app pane, so it claims most of that back (leaving a 26px
  // gutter matching the shell's side padding) and runs to the bottom of the view.
  return (
    <div className="-mb-[44px] flex h-[calc(100%+44px)] min-h-0 flex-col">
      {canEmail && (
        <div className="mb-2.5 flex w-fit shrink-0 items-center gap-1.5 rounded-2xl border bg-surface p-1" style={{ borderColor: "var(--hair)" }}>
          {(
            [
              { id: "messages", href: "/portal/admin/messages", label: t("tabs.messages") },
              {
                id: "email",
                href: "/portal/admin/messages?tab=email",
                label: t("tabs.email"),
              },
            ] as const
          ).map(({ id, href, label }) => (
            <Link
              key={id}
              href={href}
              scroll={false}
              className={`rounded-full px-5 py-2 text-sm font-bold transition ${
                tab === id ? "bg-brand text-white" : "text-muted hover:bg-base hover:text-ink"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1">
        {tab === "email" ? (
          <EmailTab
            bannerError={params.error ? safeDecodeURIComponent(params.error) : null}
            bannerConnected={params.connected ?? null}
          />
        ) : (
          <MessagesTab
            withParam={params.with ?? null}
            topicParam={params.topic ?? null}
          />
        )}
      </div>
    </div>
  );
}
