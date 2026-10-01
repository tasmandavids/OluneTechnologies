"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useDateTimeFormat } from "@/lib/i18n/format";
import { syncNowAction } from "@/app/portal/admin/books/actions";
import { secondaryButton, secondaryButtonStyle } from "./ui";

export function SyncNowButton({ lastSyncedAt }: { lastSyncedAt: string | null }) {
  const t = useTranslations("books.sync");
  const dateTime = useDateTimeFormat();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted" aria-live="polite">
        {message ?? (lastSyncedAt ? t("last", { time: dateTime.format(new Date(lastSyncedAt)) }) : t("never"))}
      </span>
      <button
        type="button"
        className={secondaryButton}
        style={secondaryButtonStyle}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await syncNowAction();
            if (res.ok && res.data) {
              setMessage(t("done", { posted: res.data.posted + res.data.reposted, errors: res.data.errors }));
            } else if (!res.ok) {
              setMessage(res.error);
            }
            router.refresh();
          })
        }
      >
        {pending ? t("syncing") : t("button")}
      </button>
    </div>
  );
}
