"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { completeStudioRegistration } from "@/app/join/actions";
import { OluneLogo } from "@/components/brand/OluneLogo";
import { OluneHomeLink } from "@/components/brand/OluneHomeLink";
import { AuthDivider, OAuthButtons } from "@/components/auth/OAuthButtons";

type Path = "parent" | "adult_student";

export function JoinStudioFlow({
  studioName,
  studioSlug,
  registrationRoles,
  signedIn,
  userEmail,
}: {
  studioName: string;
  studioSlug: string;
  registrationRoles: string[];
  signedIn: boolean;
  userEmail: string;
}) {
  const t = useTranslations("join");
  const tAuth = useTranslations("auth");
  const [path, setPath] = useState<Path | null>(null);

  // Restore path after mount so server and client initial HTML match (avoids hydration error).
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("olune:join-path");
      if (stored === "parent" || stored === "adult_student") setPath(stored);
    } catch {
      /* ignore */
    }
  }, []);
  const [email, setEmail] = useState(userEmail);
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [birthday, setBirthday] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [pending, startTransition] = useTransition();

  const allowParent = registrationRoles.includes("parent");
  const allowStudent = registrationRoles.includes("student");

  function selectPath(p: Path) {
    setPath(p);
    try {
      sessionStorage.setItem("olune:join-path", p);
    } catch {
      /* ignore */
    }
  }

  function clearPath() {
    setPath(null);
    try {
      sessionStorage.removeItem("olune:join-path");
    } catch {
      /* ignore */
    }
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setAuthBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    setAuthBusy(false);
    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    window.location.reload();
  }

  function finishRegistration() {
    if (!path) return;
    setError(null);
    startTransition(async () => {
      const res = await completeStudioRegistration({
        studioSlug,
        path,
        birthday: path === "adult_student" ? birthday : undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Refresh the JWT so it carries the new studio_id / user_role claims.
      // Without this the middleware sees a stale token (studio_id: null) and
      // redirect-loops between /portal/* and /onboarding.
      await createClient().auth.refreshSession();
      window.location.assign(path === "parent" ? "/portal/parent" : "/portal/student");
    });
  }

  return (
    <div className="grid min-h-screen place-items-center bg-base px-5 py-10 text-ink">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex justify-center">
          <OluneHomeLink>
            <OluneLogo variant="stacked" size="md" />
          </OluneHomeLink>
        </div>
        <div className="rounded-3xl border border-[--hair] bg-surface p-7 shadow-2xl">
          <p className="text-[0.62rem] font-semibold uppercase tracking-widest text-brand">{studioName}</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>

          {!path && (
            <div className="mt-6 space-y-3">
              {allowParent && (
                <button
                  type="button"
                  onClick={() => selectPath("parent")}
                  className="w-full rounded-2xl border border-[--hair] bg-base px-5 py-4 text-left transition hover:border-brand"
                >
                  <p className="font-bold text-ink">{t("pathParentTitle")}</p>
                  <p className="mt-1 text-xs text-muted">{t("pathParentDescription")}</p>
                </button>
              )}
              {allowStudent && (
                <button
                  type="button"
                  onClick={() => selectPath("adult_student")}
                  className="w-full rounded-2xl border border-[--hair] bg-base px-5 py-4 text-left transition hover:border-brand"
                >
                  <p className="font-bold text-ink">{t("pathAdultTitle")}</p>
                  <p className="mt-1 text-xs text-muted">{t("pathAdultDescription")}</p>
                </button>
              )}
            </div>
          )}

          {path && (
            <div className="mt-6 space-y-4">
              <button
                type="button"
                onClick={clearPath}
                className="text-xs text-muted underline"
              >
                {t("changePath")}
              </button>

              {path === "adult_student" && (
                <div>
                  <label className="mb-1 block text-xs font-semibold">{t("yourBirthday")}</label>
                  <input
                    type="date"
                    required
                    value={birthday}
                    onChange={(e) => setBirthday(e.target.value)}
                    className="field-premium w-full"
                  />
                </div>
              )}

              {!signedIn ? (
                <>
                  <OAuthButtons next="/join" disabled={authBusy || pending} />
                  <AuthDivider />
                  <form onSubmit={signUp} className="space-y-3">
                    <input
                      className="field-premium w-full"
                      required
                      placeholder={t("fullNamePlaceholder")}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                    <input
                      className="field-premium w-full"
                      type="email"
                      required
                      placeholder={tAuth("emailPlaceholder")}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                    <input
                      className="field-premium w-full"
                      type="password"
                      required
                      minLength={8}
                      placeholder={tAuth("passwordPlaceholder")}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="submit"
                      disabled={authBusy}
                      className="btn-glow btn-glow--solid w-full justify-center disabled:opacity-60"
                    >
                      {authBusy ? t("creatingAccount") : t("createAccount")}
                    </button>
                  </form>
                  <p className="text-center text-xs text-muted">
                    {t("alreadyHaveAccount")}{" "}
                    <Link href="/login?next=/join" className="underline text-ink">
                      {tAuth("signInWithEmail")}
                    </Link>
                  </p>
                </>
              ) : (
                <button
                  type="button"
                  onClick={finishRegistration}
                  disabled={pending || (path === "adult_student" && !birthday)}
                  className="btn-glow btn-glow--solid w-full justify-center disabled:opacity-60"
                >
                  {pending ? t("joining") : t("completeRegistration")}
                </button>
              )}

              {error && (
                <p className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-400">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
