"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { StudioMembership } from "@/lib/account/memberships";
import { acceptInviteToken } from "@/app/portal/teacher/affiliations/actions";

export function AffiliationsPanel({ memberships }: { memberships: StudioMembership[] }) {
  const t = useTranslations("teacher.affiliations");
  const router = useRouter();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const affiliated = memberships.filter((m) => m.studioKind !== "instructor");
  const home = memberships.find((m) => m.isPrimary && m.studioKind === "instructor");

  function onAccept(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await acceptInviteToken({ token });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setToken("");
      setSuccess(t("acceptSuccess"));
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      <header>
        <h1 className="text-2xl font-black tracking-tight text-ink">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
      </header>

      {home && (
        <section className="box rounded-2xl p-5">
          <p className="text-xs uppercase tracking-widest text-muted">{t("homeWorkspace")}</p>
          <p className="mt-1 font-black text-ink">{home.studioName}</p>
          <p className="text-xs text-muted">{home.studioSlug}.olune.app</p>
        </section>
      )}

      <section className="box rounded-2xl p-5">
        <h2 className="text-sm font-black text-ink">{t("linkedStudios")}</h2>
        {affiliated.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{t("noneYet")}</p>
        ) : (
          <ul className="mt-4 flex flex-col">
            {affiliated.map((m) => (
              <li key={m.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="font-semibold text-ink">{m.studioName}</p>
                  <p className="text-xs text-muted">
                    {t("roleAtStudio", { role: m.role })} · {m.studioSlug}.olune.app
                  </p>
                </div>
                <span className="box-pill px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide text-muted">
                  {m.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="box rounded-2xl p-5">
        <h2 className="text-sm font-black text-ink">{t("acceptInvite")}</h2>
        <p className="mt-1 text-sm text-muted">{t("acceptInviteHint")}</p>
        <form onSubmit={onAccept} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            className="field-premium flex-1"
            type="text"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={t("tokenPlaceholder")}
            required
          />
          <button
            type="submit"
            disabled={pending || !token.trim()}
            className="btn-glow btn-glow--solid shrink-0 justify-center disabled:opacity-60"
          >
            {pending ? t("accepting") : t("acceptButton")}
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        {success && <p className="mt-2 text-sm" style={{ color: "var(--brand-hot)" }}>{success}</p>}
      </section>
    </div>
  );
}
