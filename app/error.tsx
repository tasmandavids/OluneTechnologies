"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

function needsAuthRecovery(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname === "/join" || pathname.startsWith("/portal");
}

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  const t = useTranslations("errors.generic");
  const tAuth = useTranslations("auth");
  const [busy, setBusy] = useState(false);
  const recoverToLogin = needsAuthRecovery(pathname);

  useEffect(() => {
    console.error(error);
  }, [error]);

  async function handleRetry() {
    if (!recoverToLogin) {
      reset();
      return;
    }

    setBusy(true);
    const next = pathname?.startsWith("/portal") ? pathname : "/join";
    try {
      await createClient().auth.signOut();
    } catch {
      /* still send the user to login */
    }
    window.location.assign(`/login?next=${encodeURIComponent(next)}`);
  }

  return (
    <div className="grid min-h-screen place-items-center bg-base px-6 text-ink">
      <div className="max-w-md text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-brand">{t("eyebrow")}</p>
        <h1 className="mt-2 text-2xl font-bold">{t("title")}</h1>
        <p className="mt-3 text-sm text-muted">{t("body")}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={handleRetry}
            disabled={busy}
            className="btn-glow btn-glow--solid px-5 py-2 text-sm disabled:opacity-60"
          >
            {busy ? tAuth("signingIn") : recoverToLogin ? t("signInAgain") : t("retry")}
          </button>
          <Link href="/" className="rounded-full border border-(--hair) px-5 py-2 text-sm text-ink">
            {t("goHome")}
          </Link>
        </div>
      </div>
    </div>
  );
}
