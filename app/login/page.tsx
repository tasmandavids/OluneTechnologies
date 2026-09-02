"use client";

// Minimal starter sign-in. Middleware routes you to the right /portal/<role>.

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient, createImplicitClient } from "@/lib/supabase/client";
import { sanitizeNextPath } from "@/lib/auth/oauth";
import { isTenantHost } from "@/lib/tenant-host";
import { OluneLogo } from "@/components/brand/OluneLogo";
import { OluneHomeLink } from "@/components/brand/OluneHomeLink";
import { AuthDivider, OAuthButtons } from "@/components/auth/OAuthButtons";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";

function LoginForm() {
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");
  const searchParams = useSearchParams();
  // Same guard the OAuth routes apply: `next` is a public query param, and
  // after signInWithPassword we hand it straight to location.assign(). An
  // absolute or protocol-relative value would navigate the just-signed-in
  // user off this origin (a stale http://127.0.0.1:3000 next strands a studio
  // on a dead tab; an attacker-supplied one is an open redirect).
  const next = sanitizeNextPath(searchParams?.get("next"));
  const callbackError = searchParams?.get("error") === "auth_callback_error";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loginFailed, setLoginFailed] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // On a studio site (subdomain / custom domain) hide the create-a-studio and
  // platform links — clients should only ever join THIS studio. Computed after
  // mount so server and client initial HTML match.
  const [onStudioSite, setOnStudioSite] = useState(false);
  useEffect(() => {
    setOnStudioSite(isTenantHost(window.location.host));
  }, []);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: signInError } = await createClient().auth.signInWithPassword({
      email,
      password,
    });
    setBusy(false);
    if (signInError) {
      setError(signInError.message);
      setLoginFailed(true);
      return;
    }
    // Full navigation so middleware sees the fresh session cookie.
    window.location.assign(next);
  }

  async function sendResetLink() {
    setResetBusy(true);
    setResetError(null);
    const { error: resetErr } = await createImplicitClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetBusy(false);
    if (resetErr) return setResetError(t("resetLinkError"));
    setResetSent(true);
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex-1" />
        <OluneHomeLink>
          <OluneLogo variant="stacked" size="md" />
        </OluneHomeLink>
        <div className="flex flex-1 justify-end">
          <LanguageSwitcher compact />
        </div>
      </div>
      <div className="box rounded-3xl p-7">
        <h1 className="text-2xl font-black tracking-tight">{t("welcomeBack")}</h1>
        <p className="mt-1 text-sm text-muted">{t("signInSubtitle")}</p>

        <div className="mt-6">
          <OAuthButtons next={next} disabled={busy} callbackError={callbackError} />
        </div>

        <AuthDivider />

        <form onSubmit={signIn}>
          {error && (
            <div className="mb-4 space-y-2">
              <p className="box-warn rounded-lg px-3 py-2 text-sm text-red-400">
                {error}
              </p>
              <p className="text-center text-sm text-muted">{t("emailLoginGoogleHint")}</p>
            </div>
          )}
          <div className="space-y-3">
            <input
              className="field-premium"
              type="email"
              required
              placeholder={t("emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              className="field-premium"
              type="password"
              required
              placeholder={t("passwordPlaceholder")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="btn-glow btn-glow--solid mt-6 w-full justify-center disabled:opacity-60"
          >
            {busy ? t("signingIn") : t("signInWithEmail")}
          </button>
        </form>

        {loginFailed && (
          <div className="mt-4 text-center">
            {resetSent ? (
              <p className="text-sm text-green-500">{t("resetLinkSent")}</p>
            ) : (
              <>
                {resetError && (
                  <p className="mb-2 text-sm text-red-400">{resetError}</p>
                )}
                <button
                  type="button"
                  onClick={sendResetLink}
                  disabled={resetBusy}
                  className="text-sm text-muted underline underline-offset-2 hover:text-ink disabled:opacity-50"
                >
                  {resetBusy ? t("sendingResetLink") : t("forgotPassword")}
                </button>
              </>
            )}
          </div>
        )}

        <p className="mt-4 text-center text-sm text-muted">
          {t("joinStudio")}{" "}
          <Link href="/join" className="text-ink underline">
            {t("joinLink")}
          </Link>
        </p>
        {!onStudioSite && (
          <>
            <p className="mt-4 text-center text-sm text-muted">
              {t("newStudio")}{" "}
              <Link href="/onboarding" className="text-ink underline">
                {t("getStarted")}
              </Link>
            </p>
            <p className="mt-3 text-center text-xs text-muted">
              {t("platformAdmin")}{" "}
              <Link href="/login?next=/platform" className="text-ink underline">
                {t("signInToPlatform")}
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  const tCommon = useTranslations("common");

  return (
    <div className="grid min-h-screen place-items-center bg-base px-5 text-ink">
      <Suspense
        fallback={
          <div className="box w-full max-w-sm rounded-3xl p-7 text-center text-sm text-muted">
            {tCommon("loading")}
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
