"use client";

// Step 2: Sign studio waivers (required waivers only).
// Pure file split from EnrollModal.tsx (1.6.1) — no logic changes.

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { getActiveWaivers, signWaiver, type Waiver } from "@/app/portal/parent/enroll/actions";

export function Step2SignWaivers({
  childName,
  childId,
  onNext,
  onBack,
}: {
  childName: string | null;
  childId: string;
  onNext: () => void;
  onBack: () => void;
}) {
  const t = useTranslations("parent.enroll");
  const [waivers, setWaivers] = useState<Waiver[]>([]);
  const [agreed, setAgreed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getActiveWaivers().then((res) => {
      if (res.ok) setWaivers(res.data);
      else setError(res.error);
      setLoading(false);
    });
  }, []);

  // If no waivers, skip this step automatically
  useEffect(() => {
    if (!loading && waivers.length === 0) onNext();
  }, [loading, waivers.length, onNext]);

  const allAgreed = waivers.every((w) => agreed.has(w.id));

  function handleSubmit() {
    startSaving(async () => {
      for (const w of waivers) {
        if (agreed.has(w.id)) {
          const res = await signWaiver(w.id, childId, w.version);
          if (!res.ok) { setError(res.error); return; }
        }
      }
      onNext();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-base font-bold text-ink">{t("waiversTitle")}</h3>
      <p className="text-sm text-muted">
        {t.rich("waiversIntro", {
          name: childName ?? t("yourDancer"),
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
      </p>

      {loading ? (
        <div className="py-8 text-center text-sm text-muted animate-pulse">{t("loadingWaivers")}</div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>
      ) : waivers.length === 0 ? (
        <div className="box rounded-lg p-4 text-sm text-muted">
          {t("noWaiversRequired")}
        </div>
      ) : (
        <div className="space-y-4">
          {waivers.map((w) => (
            <div key={w.id} className="box rounded-xl p-4">
              <p className="mb-2 font-semibold text-ink">{w.title}</p>
              <div className="mb-3 max-h-32 overflow-y-auto rounded-lg bg-base p-3 text-xs text-muted leading-relaxed whitespace-pre-wrap">
                {w.content}
              </div>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreed.has(w.id)}
                  onChange={(e) => {
                    setAgreed((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(w.id);
                      else next.delete(w.id);
                      return next;
                    });
                  }}
                  className="mt-0.5 shrink-0 accent-[--brand]"
                />
                <span className="text-xs text-ink">
                  {t.rich("agreeWaiver", {
                    title: w.title,
                    strong: (chunks) => <strong>{chunks}</strong>,
                  })}
                </span>
              </label>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 rounded-xl border border-[--hair] py-3 text-sm font-semibold text-muted transition-colors hover:border-[--brand] hover:text-ink"
        >
          {t("back")}
        </button>
        <button
          type="button"
          disabled={!allAgreed || saving}
          onClick={handleSubmit}
          className="flex-1 rounded-xl py-3 text-sm font-bold text-white transition-opacity disabled:opacity-40"
          style={{ background: "var(--brand)" }}
        >
          {saving ? t("signing") : t("acceptContinue")}
        </button>
      </div>
    </div>
  );
}
