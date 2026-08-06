"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { PlatformTask } from "@/lib/platform/types";
import { PLATFORM_TASK_TYPES } from "@/lib/platform/types";
import { createTask, updateTaskStatus } from "@/app/platform/tasks/actions";

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
  const [showForm, setShowForm] = useState(false);
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

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-ink">{t("title")}</h1>
          <p className="text-sm text-muted">{t("subtitle")}</p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded-full bg-brand px-5 py-2 text-xs font-bold uppercase text-white"
        >
          {showForm ? t("cancel") : t("newTask")}
        </button>
      </header>

      {showForm && (
        <div className="box rounded-2xl p-5 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-xs uppercase tracking-widest text-muted">{t("type")}</span>
              <select
                value={taskType}
                onChange={(e) => setTaskType(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[--hair] bg-base px-3 py-2"
              >
                {PLATFORM_TASK_TYPES.map((task) => (
                  <option key={task.key} value={task.key}>
                    {task.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-xs uppercase tracking-widest text-muted">{t("priority")}</span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as PlatformTask["priority"])}
                className="mt-1 w-full rounded-xl border border-[--hair] bg-base px-3 py-2"
              >
                {(["low", "normal", "high", "urgent"] as const).map((p) => (
                  <option key={p} value={p}>
                    {t(`priorities.${p}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-sm">
            <span className="text-xs uppercase tracking-widest text-muted">{t("titleLabel")}</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[--hair] bg-base px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs uppercase tracking-widest text-muted">{t("studioOptional")}</span>
            <select
              value={studioId}
              onChange={(e) => setStudioId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[--hair] bg-base px-3 py-2"
            >
              <option value="">{t("platformWide")}</option>
              {studios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder={t("detailsPlaceholder")}
            className="w-full rounded-xl border border-[--hair] bg-base px-3 py-2 text-sm"
          />
          <button
            onClick={addTask}
            disabled={pending}
            className="rounded-full border border-[--hair] px-4 py-1.5 text-xs font-bold uppercase"
          >
            {t("createTask")}
          </button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-4">
        {COLUMN_IDS.map((colId) => {
          const colTasks = tasks.filter((task) => task.status === colId);
          return (
            <div key={colId} className="box rounded-2xl p-3">
              <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">
                {t(`columns.${colId}`)} ({colTasks.length})
              </h2>
              <ul className="space-y-2">
                {colTasks.map((task) => (
                  <li key={task.id} className="box rounded-xl p-3 text-sm">
                    <p className="font-semibold text-ink">{task.title}</p>
                    <p className="text-[0.65rem] uppercase text-muted">
                      {task.taskType.replace(/_/g, " ")}
                    </p>
                    {task.studioName && (
                      <p className="mt-1 text-xs text-muted">{task.studioName}</p>
                    )}
                    <select
                      value={task.status}
                      onChange={(e) => moveTask(task.id, e.target.value as PlatformTask["status"])}
                      disabled={pending}
                      className="mt-2 w-full rounded-lg border border-[--hair] bg-surface px-2 py-1 text-[0.65rem]"
                    >
                      {COLUMN_IDS.map((c) => (
                        <option key={c} value={c}>
                          {t(`columns.${c}`)}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
