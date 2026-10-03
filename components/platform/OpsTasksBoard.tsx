"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { PlatformTask } from "@/lib/platform/types";
import { PLATFORM_TASK_TYPES } from "@/lib/platform/types";
import { createTask, updateTaskStatus } from "@/app/platform/tasks/actions";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import { RippleButton } from "@/components/portal/admin/glass/RippleButton";
import { PlatformPageHeader, SectionLabel, StatusPill, fieldClass, type PillTone } from "./glass/ui";

const PRIORITY_TONE: Record<string, PillTone> = { urgent: "danger", high: "warm", normal: "brand", low: "neutral" };

const COLUMN_IDS = ["todo", "in_progress", "blocked", "done"] as const;

export function OpsTasksBoard({
  tasks: initialTasks,
  studios,
}: {
  tasks: PlatformTask[];
  studios: { id: string; name: string }[];
}) {
  const t = useTranslations("platform.tasks");
  const [tasks, setTasks] = useState(initialTasks);
  // "+ New › New task" in the top bar links here with ?new=1.
  const searchParams = useSearchParams();
  const [showForm, setShowForm] = useState(searchParams?.get("new") === "1");
  const [taskType, setTaskType] = useState<string>(PLATFORM_TASK_TYPES[0].key);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [studioId, setStudioId] = useState("");
  const [priority, setPriority] = useState<PlatformTask["priority"]>("normal");
  const [pending, startTransition] = useTransition();

  function moveTask(id: string, status: PlatformTask["status"]) {
    startTransition(async () => {
      const res = await updateTaskStatus({ taskId: id, status });
      if (res.ok) {
        setTasks((prev) => prev.map((task) => (task.id === id ? { ...task, status } : task)));
      }
    });
  }

  function addTask() {
    if (!title.trim()) return;
    startTransition(async () => {
      const res = await createTask({
        taskType,
        title: title.trim(),
        description: description.trim() || undefined,
        studioId: studioId || undefined,
        priority,
      });
      if (res.ok && res.task) {
        setTasks((prev) => [res.task!, ...prev]);
        setShowForm(false);
        setTitle("");
        setDescription("");
        setStudioId("");
      }
    });
  }

  const labelCls = "mb-2 block text-[9.5px] font-semibold uppercase tracking-[0.16em] text-muted";

  return (
    <div className="py-2">
      <PlatformPageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <RippleButton variant="solid" size="lg" onClick={() => setShowForm((s) => !s)} aria-expanded={showForm}>
            {showForm ? t("cancel") : t("newTask")}
          </RippleButton>
        }
      />

      {showForm && (
        <GlassPanel className="mb-3.5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={labelCls}>{t("type")}</span>
              <select value={taskType} onChange={(e) => setTaskType(e.target.value)} className={fieldClass}>
                {PLATFORM_TASK_TYPES.map((task) => (
                  <option key={task.key} value={task.key}>
                    {task.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelCls}>{t("priority")}</span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as PlatformTask["priority"])}
                className={fieldClass}
              >
                {(["low", "normal", "high", "urgent"] as const).map((p) => (
                  <option key={p} value={p}>
                    {t(`priorities.${p}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="mt-3 block">
            <span className={labelCls}>{t("titleLabel")}</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={fieldClass} />
          </label>
          <label className="mt-3 block">
            <span className={labelCls}>{t("studioOptional")}</span>
            <select value={studioId} onChange={(e) => setStudioId(e.target.value)} className={fieldClass}>
              <option value="">{t("platformWide")}</option>
              {studios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <textarea
            aria-label={t("detailsPlaceholder")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder={t("detailsPlaceholder")}
            className={`${fieldClass} mt-3`}
          />
          <RippleButton variant="solid" className="mt-3" onClick={addTask} disabled={pending}>
            {t("createTask")}
          </RippleButton>
        </GlassPanel>
      )}

      <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {COLUMN_IDS.map((colId) => {
          const colTasks = tasks.filter((task) => task.status === colId);
          return (
            <GlassPanel key={colId} className="!p-3">
              <div className="flex items-center justify-between px-1 pb-3 pt-1">
                <SectionLabel>{t(`columns.${colId}`)}</SectionLabel>
                <span
                  className="grid h-[22px] min-w-[22px] place-items-center rounded-full px-1.5 text-[11px] font-semibold text-ink"
                  style={{ background: "var(--t2)" }}
                >
                  {colTasks.length}
                </span>
              </div>
              <ul className="flex flex-col gap-2">
                {colTasks.map((task) => (
                  <li
                    key={task.id}
                    className="rounded-2xl border p-3.5 text-sm"
                    style={{ borderColor: "var(--edge)", background: "var(--glass2)", boxShadow: "inset 0 1px 0 var(--sheen)" }}
                  >
                    <p className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted">
                      {task.taskType.replace(/_/g, " ")}
                    </p>
                    <p className="mt-2 font-semibold leading-snug text-ink">{task.title}</p>
                    {task.studioName && <p className="mt-1 text-xs text-muted">{task.studioName}</p>}
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <StatusPill tone={PRIORITY_TONE[task.priority] ?? "neutral"}>{t(`priorities.${task.priority}`)}</StatusPill>
                      <select
                        value={task.status}
                        onChange={(e) => moveTask(task.id, e.target.value as PlatformTask["status"])}
                        disabled={pending}
                        aria-label={t("title")}
                        className={`${fieldClass} !w-auto !rounded-lg !px-2 !py-1 text-[11.5px]`}
                      >
                        {COLUMN_IDS.map((c) => (
                          <option key={c} value={c}>
                            {t(`columns.${c}`)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </li>
                ))}
              </ul>
            </GlassPanel>
          );
        })}
      </div>
    </div>
  );
}
