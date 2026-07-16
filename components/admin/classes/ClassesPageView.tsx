"use client";

// ============================================================================
//  ClassesPageView — List/Schedule toggle wrapping the Classes page. The
//  drag-and-drop weekly schedule editor (ScheduleBoard) moved here from the
//  admin dashboard; ClassesManager's table view is unchanged.
// ============================================================================

import { useState } from "react";
import { useTranslations } from "next-intl";
import ClassesManager from "./ClassesManager";
import { ScheduleBoard } from "@/components/admin/dashboard/ScheduleBoard";
import type { ClassRow, TeacherOption } from "@/app/portal/admin/classes/page";
import type { XeroAccountOption, XeroItemOption } from "@/lib/xero/chart-of-accounts";

type View = "list" | "schedule";

export function ClassesPageView({
  studioId,
  classes,
  teachers,
  xeroAccounts,
  xeroItems,
  readOnly = false,
}: {
  studioId: string;
  classes: ClassRow[];
  teachers: TeacherOption[];
  xeroAccounts: XeroAccountOption[];
  xeroItems: XeroItemOption[];
  readOnly?: boolean;
}) {
  const t = useTranslations("admin.classes");
  const [view, setView] = useState<View>("list");

  return (
    <div>
      <div className="mx-auto flex max-w-5xl justify-end px-6 pt-6">
        <div className="inline-flex rounded-xl border border-[--hair] bg-surface p-1">
          {(["list", "schedule"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                view === v
                  ? "bg-[color-mix(in_srgb,var(--brand)_14%,var(--surface))] text-[--brand-deep]"
                  : "text-muted hover:text-ink"
              }`}
            >
              {v === "list" ? t("viewList") : t("viewSchedule")}
            </button>
          ))}
        </div>
      </div>

      {view === "list" ? (
        <ClassesManager
          classes={classes}
          teachers={teachers}
          xeroAccounts={xeroAccounts}
          xeroItems={xeroItems}
          readOnly={readOnly}
        />
      ) : (
        <div className="mx-auto max-w-5xl px-6 pb-6 pt-4">
          <ScheduleBoard studioId={studioId} classes={classes} teachers={teachers} />
        </div>
      )}
    </div>
  );
}
