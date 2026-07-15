"use client";

import { confirmDialog, toast } from "@/lib/feedback";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { deleteStudent } from "@/app/portal/admin/students/actions";

export default function DeleteStudentButton({
  studentId,
  studentName,
}: {
  studentId: string;
  studentName: string | null;
}) {
  const t = useTranslations("admin.students.detail");
  const tShared = useTranslations("admin.shared");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!(await confirmDialog({ title: t("deleteConfirm", { name: studentName ?? tShared("unknown") }), destructive: true }))) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteStudent(studentId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(tShared("deleted"));
      router.push("/portal/admin/students");
      router.refresh();
    });
  };

  return (
    <section className="rounded-2xl border border-red-400/30 bg-red-400/5 p-5">
      <h2 className="mb-1 text-sm font-semibold text-red-600">{t("dangerZone")}</h2>
      <p className="mb-3 text-sm text-muted">{t("deleteDescription")}</p>
      {error && (
        <p className="mb-3 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-400">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={handleDelete}
        disabled={pending}
        className="rounded-xl border border-red-400/40 px-4 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-400/10 disabled:opacity-60"
      >
        {pending ? tShared("deleting") : t("deleteStudent")}
      </button>
    </section>
  );
}
