"use client";

import { confirmDialog } from "@/lib/feedback";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { adminCancelSubscription } from "@/app/portal/admin/subscriptions/actions";

export type CancelableSubscription = {
  id: string;
  stripeSubscriptionId: string | null;
  planLabel: string | null;
  payerName: string | null;
  status: string;
  cancelAtPeriodEnd: boolean;
};

export function SubscriptionCancelActions({
  subscription,
  onCanceled,
  align = "end",
}: {
  subscription: CancelableSubscription;
  onCanceled: (id: string, immediate: boolean) => void;
  align?: "start" | "end";
}) {
  const t = useTranslations("admin.subscriptions");
  const tShared = useTranslations("admin.shared");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const stripeId = subscription.stripeSubscriptionId;
  const isCanceled = subscription.status === "canceled";
  const canCancelAtPeriodEnd = !isCanceled && !subscription.cancelAtPeriodEnd && Boolean(stripeId);
  const canCancelNow = !isCanceled && Boolean(stripeId);

  if (!canCancelAtPeriodEnd && !canCancelNow) {
    return <span className="text-xs text-muted">{tShared("dash")}</span>;
  }

  const runCancel = async (immediate: boolean) => {
    if (!stripeId) return;
    const label = subscription.planLabel ?? subscription.payerName ?? t("defaultPlan");
    const confirmMessage = immediate
      ? t("cancelNowConfirm", { plan: label })
      : t("cancelAtPeriodEndConfirm", { plan: label });
    if (!(await confirmDialog({ title: confirmMessage, destructive: true }))) return;

    setErr(null);
    startTransition(async () => {
      const result = await adminCancelSubscription(stripeId, immediate);
      if (result.ok) onCanceled(subscription.id, immediate);
      else setErr(result.error);
    });
  };

  const alignClass = align === "start" ? "items-start" : "items-end";

  return (
    <div className={`flex flex-col gap-0.5 ${alignClass}`}>
      <div className={`flex gap-2 ${align === "end" ? "justify-end" : "justify-start"}`}>
        {canCancelAtPeriodEnd && (
          <button
            type="button"
            onClick={() => runCancel(false)}
            disabled={pending}
            className="rounded-lg border border-[--hair] px-2.5 py-1 text-[0.7rem] font-semibold text-muted hover:bg-surface disabled:opacity-50"
            title={tShared("cancelAtPeriodEndTitle")}
          >
            {pending ? "…" : tShared("cancelAtPeriodEnd")}
          </button>
        )}
        {canCancelNow && (
          <button
            type="button"
            onClick={() => runCancel(true)}
            disabled={pending}
            className="rounded-lg border border-[--hair] px-2.5 py-1 text-[0.7rem] font-semibold text-[#dc2626] hover:bg-[#fee2e2] disabled:opacity-50"
            title={tShared("cancelImmediatelyTitle")}
          >
            {pending ? "…" : tShared("cancelNow")}
          </button>
        )}
      </div>
      {err && <span className="text-[0.65rem] text-[#dc2626]">{err}</span>}
    </div>
  );
}
