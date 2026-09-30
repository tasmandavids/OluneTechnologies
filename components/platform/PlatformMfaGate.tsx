"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { signOut } from "@/app/portal/actions";
import { OluneLogo } from "@/components/brand/OluneLogo";
import { createClient } from "@/lib/supabase/client";

type Enrollment = {
  factorId: string;
  qrCode: string;
  secret: string;
};

export function PlatformMfaGate({ email }: { email: string | null }) {
  const t = useTranslations("platform.mfa");
  const clientRef = useRef<ReturnType<typeof createClient> | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function prepare() {
      const supabase = createClient();
      clientRef.current = supabase;
      const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
      if (cancelled) return;
      if (listError) {
        setError(t("loadError"));
        setLoading(false);
        return;
      }

      const verified = factors.totp[0];
      if (verified) {
        setFactorId(verified.id);
        setLoading(false);
        return;
      }

      // An interrupted setup leaves an unusable unverified factor because its
      // secret is intentionally not retrievable. Remove it before issuing a new
      // secret so repeated attempts do not exhaust the account's factor limit.
      for (const stale of factors.all.filter(
        (factor) => factor.factor_type === "totp" && factor.status === "unverified",
      )) {
        const { error: removeError } = await supabase.auth.mfa.unenroll({ factorId: stale.id });
        if (removeError) {
          if (!cancelled) {
            setError(t("loadError"));
            setLoading(false);
          }
          return;
        }
      }

      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Olune platform",
        issuer: "Olune",
      });
      if (cancelled) return;
      if (enrollError) {
        setError(t("enrollError"));
      } else {
        setFactorId(data.id);
        setEnrollment({
          factorId: data.id,
          qrCode: data.totp.qr_code,
          secret: data.totp.secret,
        });
      }
      setLoading(false);
    }

    void prepare();
    return () => {
      cancelled = true;
    };
  }, [t]);

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    if (!factorId || code.length !== 6 || verifying) return;
    setVerifying(true);
    setError(null);
    const supabase = clientRef.current ?? createClient();
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code,
    });
    if (verifyError) {
      setCode("");
      setError(t("invalidCode"));
      setVerifying(false);
      return;
    }
    window.location.reload();
  }

  return (
    <main className="grid min-h-screen place-items-center bg-base px-5 py-10 text-ink">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <OluneLogo variant="stacked" size="md" />
        </div>
        <section className="box rounded-3xl p-7" aria-labelledby="platform-mfa-title">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand">
            {t("eyebrow")}
          </p>
          <h1 id="platform-mfa-title" className="mt-2 text-2xl font-black tracking-tight">
            {enrollment ? t("setupTitle") : t("verifyTitle")}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            {enrollment ? t("setupBody") : t("verifyBody")}
          </p>
          {email && <p className="mt-2 text-xs text-muted">{email}</p>}

          {loading ? (
            <p className="mt-8 text-sm text-muted">{t("loading")}</p>
          ) : (
            <>
              {enrollment && (
                <div className="mt-6 space-y-4">
                  {/* Supabase returns a local data URI; it never reaches an image host. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={enrollment.qrCode}
                    alt={t("qrAlt")}
                    className="mx-auto h-52 w-52 rounded-2xl bg-white p-3"
                  />
                  <div>
                    <p className="text-xs font-semibold text-muted">{t("manualLabel")}</p>
                    <code className="mt-1 block break-all rounded-xl bg-base px-3 py-2 text-xs text-ink">
                      {enrollment.secret}
                    </code>
                  </div>
                </div>
              )}

              <form onSubmit={verify} className="mt-6">
                <label htmlFor="platform-mfa-code" className="text-sm font-semibold text-ink">
                  {t("codeLabel")}
                </label>
                <input
                  id="platform-mfa-code"
                  className="field-premium mt-2 w-full text-center text-lg tracking-[0.35em]"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                  autoFocus={!enrollment}
                />
                {error && (
                  <p role="alert" className="mt-3 text-sm text-red-400">
                    {error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={!factorId || code.length !== 6 || verifying}
                  className="btn-glow btn-glow--solid mt-5 w-full justify-center disabled:opacity-60"
                >
                  {verifying ? t("verifying") : t("continue")}
                </button>
              </form>
            </>
          )}

          <form action={signOut} className="mt-5 text-center">
            <button type="submit" className="text-xs text-muted underline underline-offset-2">
              {t("signOut")}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
