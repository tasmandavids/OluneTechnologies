"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { resumeSetup } from "@/app/setup/actions";
import type { SetupStepId } from "@/lib/setup/constants";

export function SetupResumeBanner({
  setupStep,
  snoozed,
}: {
  setupStep: SetupStepId | null;
  snoozed: boolean;
}) {
  const t = useTranslations("setup");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const stepLabel = setupStep
    ? t(`steps.${setupStep}`)
    : t("resume.defaultStep");

  function onResume() {
    startTransition(async () => {
      if (snoozed) await resumeSetup();
      router.push("/setup");
      router.refresh();
    });
  }

  return (
    <div className="border-b border-brand/25 bg-brand/8 px-4 py-3 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">{t("resume.title")}</p>
          <p className="text-xs text-muted">
            {t("resume.body", { step: stepLabel })}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            href="/setup"
            className="box-pill px-4 py-1.5 text-xs font-semibold text-muted hover:text-ink"
          >
            {t("resume.openWizard")}
          </Link>
          <button
            type="button"
            onClick={onResume}
            disabled={pending}
            className="rounded-full bg-brand px-4 py-1.5 text-xs font-bold text-white disabled:opacity-60"
          >
            {pending ? t("resume.opening") : t("resume.resume")}
          </button>
        </div>
      </div>
    </div>
  );
}
