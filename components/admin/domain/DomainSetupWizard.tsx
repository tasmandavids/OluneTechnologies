"use client";

// ============================================================================
//  DomainSetupWizard — plain-language guide to connect a custom domain.
//  Separate from the website content setup wizard.
// ============================================================================

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  checkDomainDns,
  removeCustomDomain,
  saveCustomDomain,
} from "@/app/portal/admin/site/domain/actions";
import {
  DOMAIN_KIND_OPTIONS,
  DOMAIN_WIZARD_STEPS,
  buildDnsRecords,
  domainTargets,
  normalizeDomainInput,
  publicCustomDomainUrl,
  publicSubdomainUrl,
  validateCustomDomain,
  type DomainKind,
  type DomainWizardStep,
} from "@/lib/domain-setup";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";

type Props = {
  studioName: string;
  slug: string;
  customDomain: string | null;
  rootDomain: string;
};

export function DomainSetupWizard({ studioName, slug, customDomain, rootDomain }: Props) {
  const t = useTranslations("site.domain");
  const [step, setStep] = useState<DomainWizardStep>(customDomain ? "done" : "intro");
  const [wantsCustom, setWantsCustom] = useState<boolean | null>(customDomain ? true : null);
  const [kind, setKind] = useState<DomainKind>("www");
  const [domainInput, setDomainInput] = useState(customDomain ?? "");
  const [savedDomain, setSavedDomain] = useState<string | null>(customDomain);
  const [dnsMessage, setDnsMessage] = useState<string | null>(null);
  const [dnsOk, setDnsOk] = useState<boolean | null>(null);
  // Extra records the host occasionally wants to prove domain ownership. Empty
  // for almost every studio, but when it isn't, nothing else works until added.
  const [verification, setVerification] = useState<
    { type: string; domain: string; value: string }[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const subdomainUrl = publicSubdomainUrl(slug, rootDomain);
  const targets = domainTargets();
  const normalizedDomain = normalizeDomainInput(domainInput);
  const domainError = domainInput.trim() ? validateCustomDomain(domainInput, rootDomain) : null;

  const dnsRecords = useMemo(() => {
    if (!normalizedDomain || domainError) return [];
    return buildDnsRecords(normalizedDomain, kind, targets);
  }, [normalizedDomain, kind, targets, domainError]);

  const stepIndex = DOMAIN_WIZARD_STEPS.indexOf(step);

  function go(next: DomainWizardStep) {
    setError(null);
    setStep(next);
  }

  function nextFromDecide(useCustom: boolean) {
    setWantsCustom(useCustom);
    go(useCustom ? "kind" : "done");
  }

  function saveAndConnect() {
    if (domainError) {
      setError(domainError);
      return;
    }
    startTransition(async () => {
      setError(null);
      setWarning(null);
      const res = await saveCustomDomain({ domain: normalizedDomain, kind });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSavedDomain(res.data.domain);
      setWarning(res.data.warning ?? null);
      go("done");
    });
  }

  function runDnsCheck() {
    const d = savedDomain ?? normalizedDomain;
    if (!d) return;
    startTransition(async () => {
      setError(null);
      const res = await checkDomainDns({ domain: d, kind });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDnsOk(res.data.ok);
      setDnsMessage(res.data.message);
      setVerification(res.data.verification ?? []);
    });
  }

  function disconnect() {
    startTransition(async () => {
      setError(null);
      const res = await removeCustomDomain();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSavedDomain(null);
      setDomainInput("");
      setDnsOk(null);
      setDnsMessage(null);
      setVerification([]);
      setWarning(null);
      setWantsCustom(null);
      go("intro");
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand">{t("eyebrow")}</p>
        <h1 className="text-2xl font-bold text-ink">{t("title")}</h1>
        <p className="text-sm text-muted">{t("subtitle", { studio: studioName })}</p>
      </header>

      <StepProgress current={step} />

      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-500">
          {error}
        </p>
      )}

      {warning && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-600">
          {warning}
        </p>
      )}

      {step === "intro" && (
        <StepCard
          title={t("intro.title")}
          subtitle={t("intro.subtitle")}
        >
          <div className="rounded-xl border border-brand/30 bg-brand/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted">{t("intro.freeAddress")}</p>
            <a
              href={subdomainUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block break-all text-lg font-semibold text-brand underline"
            >
              {subdomainUrl.replace(/^https?:\/\//, "")}
            </a>
            <p className="mt-2 text-sm text-muted">{t("intro.shareToday")}</p>
          </div>
          <p className="text-sm text-muted">
            {t("intro.wantOwn", {
              example: `www.${studioName.toLowerCase().replace(/\s+/g, "")}.co.nz`,
            })}
          </p>
          <StepActions onNext={() => go("decide")} nextLabel={t("continue")} />
        </StepCard>
      )}

      {step === "decide" && (
        <StepCard title={t("decide.title")} subtitle={t("decide.subtitle")}>
          <div className="grid gap-3 sm:grid-cols-2">
            <ChoiceButton
              selected={wantsCustom === true}
              title={t("decide.yesTitle")}
              description={t("decide.yesDesc")}
              onClick={() => nextFromDecide(true)}
            />
            <ChoiceButton
              selected={wantsCustom === false}
              title={t("decide.noTitle")}
              description={t("decide.noDesc", {
                address: `${slug}.${rootDomain === "localhost" ? "localhost" : rootDomain}`,
              })}
              onClick={() => nextFromDecide(false)}
            />
          </div>
          <StepActions onBack={() => go("intro")} />
        </StepCard>
      )}

      {step === "kind" && (
        <StepCard title={t("kind.title")} subtitle={t("kind.subtitle")}>
          <div className="space-y-2">
            {DOMAIN_KIND_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setKind(opt.id);
                  if (!domainInput || domainInput === customDomain) {
                    const base = studioName.toLowerCase().replace(/[^a-z0-9]+/g, "");
                    if (opt.id === "www") setDomainInput(`www.${base}.co.nz`);
                    else if (opt.id === "apex") setDomainInput(`${base}.co.nz`);
                    else setDomainInput(`book.${base}.co.nz`);
                  }
                }}
                className={`w-full rounded-xl p-4 text-left transition ${
                  kind === opt.id ? "box-tint" : "box"
                }`}
              >
                <span className="font-semibold text-ink">{t(`kind.${opt.id}.label`)}</span>
                <p className="mt-0.5 font-mono text-sm text-brand">{opt.example}</p>
                <p className="mt-1 text-xs text-muted">{t(`kind.${opt.id}.hint`)}</p>
              </button>
            ))}
          </div>
          <StepActions onBack={() => go("decide")} onNext={() => go("domain")} nextLabel={t("continue")} />
        </StepCard>
      )}

      {step === "domain" && (
        <StepCard title={t("domain.title")} subtitle={t("domain.subtitle")}>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-ink">{t("domain.label")}</span>
            <input
              value={domainInput}
              onChange={(e) => setDomainInput(e.target.value)}
              placeholder={t("domain.placeholder")}
              className="field-premium font-mono"
              autoFocus
            />
            {domainError && <span className="mt-1 block text-xs text-red-500">{domainError}</span>}
            {!domainError && normalizedDomain && (
              <span className="mt-1 block text-xs text-muted">
                {t("domain.familiesVisit", { url: publicCustomDomainUrl(normalizedDomain) })}
              </span>
            )}
          </label>
          <StepActions
            onBack={() => go("kind")}
            onNext={() => (domainError ? setError(domainError) : go("dns"))}
            nextLabel={t("dns.showSteps")}
            nextDisabled={!domainInput.trim() || !!domainError}
          />
        </StepCard>
      )}

      {step === "dns" && (
        <StepCard title={t("dns.title")} subtitle={t("dns.subtitle")}>
          <ol className="space-y-3 text-sm text-muted">
            <li>
              <strong className="text-ink">1.</strong> {t("dns.step1")}
            </li>
            <li>
              <strong className="text-ink">2.</strong> {t("dns.step2")}
            </li>
            <li>
              <strong className="text-ink">3.</strong> {t("dns.step3")}
            </li>
          </ol>

          {dnsRecords.map((rec) => (
            <DnsRecordCard key={`${rec.type}-${rec.host}`} record={rec} />
          ))}

          <p className="rounded-lg bg-base px-3 py-2 text-xs text-muted">{t("dns.tip")}</p>

          <StepActions onBack={() => go("domain")} onNext={() => go("connect")} nextLabel={t("dns.nextLabel")} />
        </StepCard>
      )}

      {step === "connect" && (
        <StepCard title={t("connect.title")} subtitle={t("connect.subtitle")}>
          <div className="box rounded-xl p-4 font-mono text-sm text-ink">
            {normalizedDomain}
          </div>
          <p className="text-sm text-muted">{t("connect.hint")}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveAndConnect}
              disabled={pending || !!domainError}
              className="btn-glow btn-glow--solid px-6 py-2.5 text-sm disabled:opacity-50"
            >
              {pending ? t("connect.connecting") : t("connect.connectDomain")}
            </button>
            <button
              type="button"
              onClick={runDnsCheck}
              disabled={pending}
              className="btn-glow px-6 py-2.5 text-sm disabled:opacity-50"
            >
              {t("connect.checkDns")}
            </button>
          </div>
          {dnsMessage && (
            <p className={`text-sm ${dnsOk ? "text-green-600" : "text-muted"}`} role="status">
              {dnsMessage}
            </p>
          )}
          <VerificationRecords records={verification} />
          <StepActions onBack={() => go("dns")} />
        </StepCard>
      )}

      {step === "done" && (
        <StepCard
          title={savedDomain ? t("done.connectedTitle") : t("done.readyTitle")}
          subtitle={savedDomain ? t("done.connectedSubtitle") : t("done.readySubtitle")}
        >
          {savedDomain ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted">{t("done.customDomain")}</p>
                <a
                  href={publicCustomDomainUrl(savedDomain)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block break-all text-lg font-semibold text-brand underline"
                >
                  {savedDomain}
                </a>
              </div>
              <button
                type="button"
                onClick={runDnsCheck}
                disabled={pending}
                className="btn-glow px-5 py-2 text-sm disabled:opacity-50"
              >
                {pending ? t("done.checking") : t("done.checkAgain")}
              </button>
              {dnsMessage && (
                <p className={`text-sm ${dnsOk ? "text-green-600" : "text-muted"}`}>{dnsMessage}</p>
              )}
              <VerificationRecords records={verification} />
              <button
                type="button"
                onClick={disconnect}
                disabled={pending}
                className="text-xs text-red-500 underline disabled:opacity-50"
              >
                {t("done.removeDomain")}
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-brand/30 bg-brand/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted">{t("done.yourAddress")}</p>
              <a
                href={subdomainUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block break-all font-semibold text-brand underline"
              >
                {subdomainUrl.replace(/^https?:\/\//, "")}
              </a>
              <p className="mt-2 text-sm text-muted">{t("done.connectAnytime")}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <Link href="/portal/admin/site" className="btn-glow btn-glow--solid px-6 py-2.5 text-sm">
              {t("done.backToWebsite")}
            </Link>
            {!savedDomain && (
              <button type="button" onClick={() => go("decide")} className="btn-glow px-6 py-2.5 text-sm">
                {t("done.connectDomain")}
              </button>
            )}
          </div>
        </StepCard>
      )}

      {stepIndex > 0 && step !== "done" && (
        <p className="text-center text-xs text-muted">
          {t("stepOf", { current: stepIndex + 1, total: DOMAIN_WIZARD_STEPS.length })}
        </p>
      )}
    </div>
  );
}

function StepProgress({ current }: { current: DomainWizardStep }) {
  const t = useTranslations("site.domain");
  const labels: Partial<Record<DomainWizardStep, string>> = {
    intro: t("steps.intro"),
    decide: t("steps.decide"),
    kind: t("steps.kind"),
    domain: t("steps.domain"),
    dns: t("steps.dns"),
    connect: t("steps.connect"),
    done: t("steps.done"),
  };
  const visible = DOMAIN_WIZARD_STEPS.filter((s) => s !== "done" || current === "done");
  const idx = visible.indexOf(current);

  return (
    <div className="flex gap-1 overflow-x-auto pb-1">
      {visible.map((s, i) => (
        <div
          key={s}
          className={`shrink-0 rounded-full px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-wider ${
            i <= idx ? "bg-brand/15 text-brand" : "bg-base text-muted"
          }`}
        >
          {labels[s]}
        </div>
      ))}
    </div>
  );
}

function StepCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <GlassPanel className="space-y-5 !p-6">
      <div>
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        <p className="mt-1 text-sm text-muted">{subtitle}</p>
      </div>
      {children}
    </GlassPanel>
  );
}

function StepActions({
  onBack,
  onNext,
  nextLabel,
  nextDisabled,
}: {
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
}) {
  const t = useTranslations("site.domain");
  return (
    <div className="flex flex-wrap gap-2 pt-2">
      {onBack && (
        <button type="button" onClick={onBack} className="btn-glow px-5 py-2 text-sm">
          {t("back")}
        </button>
      )}
      {onNext && (
        <button
          type="button"
          onClick={onNext}
          disabled={nextDisabled}
          className="btn-glow btn-glow--solid px-6 py-2 text-sm disabled:opacity-50"
        >
          {nextLabel ?? t("continue")}
        </button>
      )}
    </div>
  );
}

function ChoiceButton({
  selected,
  title,
  description,
  onClick,
}: {
  selected: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl p-4 text-left transition ${
        selected ? "box-tint" : "box"
      }`}
    >
      <span className="font-semibold text-ink">{title}</span>
      <p className="mt-1 text-xs text-muted">{description}</p>
    </button>
  );
}

/**
 * Ownership-challenge records, shown only when the host asks for one. Rendered
 * with the same copy-field treatment as the main DNS record so it reads as one
 * more row to add rather than a new kind of problem.
 */
function VerificationRecords({
  records,
}: {
  records: { type: string; domain: string; value: string }[];
}) {
  const t = useTranslations("site.domain");
  if (records.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">
        {t("verification.title")}
      </p>
      {records.map((rec) => (
        <DnsRecordCard
          key={`${rec.type}-${rec.domain}-${rec.value}`}
          record={{
            type: rec.type.toUpperCase(),
            host: rec.domain,
            value: rec.value,
            note: t("verification.note"),
          }}
        />
      ))}
    </div>
  );
}

function DnsRecordCard({ record }: { record: { type: string; host: string; value: string; note: string } }) {
  const t = useTranslations("site.domain");
  return (
    <div className="box space-y-2 rounded-xl p-4">
      <p className="text-xs text-muted">{record.note}</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <CopyField label={t("dnsFields.type")} value={record.type} />
        <CopyField label={t("dnsFields.host")} value={record.host} />
        <CopyField label={t("dnsFields.value")} value={record.value} />
      </div>
    </div>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const t = useTranslations("site.domain");
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-w-0">
      <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted">{label}</span>
      <div className="mt-1 flex items-center gap-1">
        <code className="min-w-0 flex-1 truncate rounded bg-surface px-2 py-1.5 text-xs text-ink">
          {value}
        </code>
        <button
          type="button"
          onClick={copy}
          className="box-pill shrink-0 px-2 py-1.5 text-[0.65rem] font-medium text-ink"
        >
          {copied ? t("dnsFields.copied") : t("dnsFields.copy")}
        </button>
      </div>
    </div>
  );
}
