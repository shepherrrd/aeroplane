import {
  ArrowLeft01Icon,
  ArrowRight02Icon,
  CheckmarkCircle02Icon,
  CloudUploadIcon,
  GithubIcon,
  Globe02Icon,
  Settings01Icon,
  ShieldUserIcon
} from "@hugeicons/core-free-icons";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, type AuthStatus, type OnboardingPayload } from "../api";
import { BrandMark } from "../components/ui/brand-mark";
import { AppIcon } from "../components/ui/primitives";
import { BackupsStep } from "../features/onboarding/backups-step";
import { GitHubStep } from "../features/onboarding/github-step";
import { MigrationImportPanel } from "../features/onboarding/migration-import-panel";
import { OnboardingThread } from "../features/onboarding/onboarding-thread";
import { OwnerStep } from "../features/onboarding/owner-step";
import { RootDomainStep } from "../features/onboarding/root-domain-step";
import { RuntimeStep } from "../features/onboarding/runtime-step";
import { defaultOnboardingForm, type OnboardingForm } from "../features/onboarding/onboarding-types";
import { usePageTitle } from "../lib/page-title";
import { isWildcardRootDomain, normalizeRootDomain, wildcardRootDomain } from "../lib/root-domain";

type OnboardingStepKey = "owner" | "runtime" | "github" | "root-domain" | "backups";

const firstRunSteps: Array<{ key: OnboardingStepKey; label: string; icon: unknown }> = [
  { key: "owner", label: "Owner", icon: ShieldUserIcon },
  { key: "runtime", label: "Runtime", icon: Settings01Icon },
  { key: "github", label: "GitHub", icon: GithubIcon },
  { key: "root-domain", label: "Root Domain", icon: Globe02Icon },
  { key: "backups", label: "Backups", icon: CloudUploadIcon }
];

const restartSteps = firstRunSteps.filter((item) => item.key !== "owner");

function clean(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function buildPayload(form: OnboardingForm): OnboardingPayload {
  const r2Provided = Boolean(form.r2AccountId || form.r2Bucket || form.r2AccessKeyId || form.r2SecretAccessKey);
  return {
    owner: {
      name: form.ownerName.trim(),
      email: form.ownerEmail.trim(),
      password: form.ownerPassword
    },
    env: {
      secretKey: clean(form.secretKey),
      dataDir: form.dataDir.trim(),
      deployDryRun: form.deployDryRun,
      caddyConfigPath: form.caddyConfigPath.trim(),
      caddyReloadCmd: form.caddyReloadCmd.trim(),
      port: Number(form.port),
      publicUrl: form.publicUrl.trim(),
      controlPlaneHostname: clean(form.controlPlaneHostname),
      buildkitHost: form.buildkitHost.trim(),
      runtimeNetworkName: form.runtimeNetworkName.trim(),
      githubAccessToken: clean(form.githubAccessToken),
      githubAppId: clean(form.githubAppId),
      githubAppClientId: clean(form.githubAppClientId),
      githubAppSlug: clean(form.githubAppSlug),
      githubAppPrivateKey: clean(form.githubAppPrivateKey),
      githubWebhookSecret: clean(form.githubWebhookSecret)
    },
    rootDomain: clean(normalizeRootDomain(form.rootDomain)),
    r2: r2Provided
      ? {
          accountId: clean(form.r2AccountId),
          bucket: clean(form.r2Bucket),
          accessKeyId: clean(form.r2AccessKeyId),
          secretAccessKey: clean(form.r2SecretAccessKey),
          createBucket: form.r2CreateBucket
        }
      : undefined
  };
}

function buildRestartPayload(form: OnboardingForm): Omit<OnboardingPayload, "owner"> {
  const payload = buildPayload(form);
  return {
    env: payload.env,
    rootDomain: payload.rootDomain,
    r2: payload.r2
  };
}

export function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(defaultOnboardingForm);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  usePageTitle("Onboarding");

  const update = (patch: Partial<OnboardingForm>) => setForm((current) => ({ ...current, ...patch }));
  const restartMode = Boolean(authStatus?.setupComplete && authStatus.authenticated);
  const activeSteps = restartMode ? restartSteps : firstRunSteps;
  const activeStep = activeSteps[step]?.key ?? (restartMode ? "runtime" : "owner");

  useEffect(() => {
    let cancelled = false;
    void api.authStatus().then((status) => {
      if (!cancelled) setAuthStatus(status);
    }).catch(() => {
      if (!cancelled) setAuthStatus(null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!authStatus || hydrated) return;
    setHydrated(true);

    const runtime = authStatus.runtimeConfig;
    if (runtime) {
      setForm((current) => ({
        ...current,
        dataDir: runtime.dataDir,
        deployDryRun: runtime.deployDryRun,
        caddyConfigPath: runtime.caddyConfigPath,
        caddyReloadCmd: runtime.caddyReloadCmd,
        port: String(runtime.port),
        publicUrl: runtime.publicUrl,
        controlPlaneHostname: runtime.controlPlaneHostname,
        buildkitHost: runtime.buildkitHost,
        runtimeNetworkName: runtime.runtimeNetworkName
      }));
    }

    if (authStatus.setupComplete && authStatus.authenticated) {
      void api.systemSettings().then((result) => {
        setForm((current) => ({
          ...current,
          controlPlaneHostname: result.settings.controlPlaneHostname || current.controlPlaneHostname,
          rootDomain: wildcardRootDomain(result.settings.rootDomain)
        }));
      }).catch(() => undefined);
    }
  }, [authStatus, hydrated]);

  useEffect(() => {
    if (step >= activeSteps.length) setStep(0);
  }, [activeSteps.length, step]);

  const stepError = useMemo(() => {
    if (activeStep === "owner") {
      if (!form.ownerName.trim() || !form.ownerEmail.trim() || !form.ownerPassword) return "Create the owner account first.";
      if (form.ownerPassword.length < 8) return "Password must be at least 8 characters.";
      if (form.ownerPassword !== form.ownerPasswordConfirm) return "Passwords do not match.";
    }
    if (activeStep === "runtime") {
      if (!form.dataDir.trim() || !form.publicUrl.trim() || !form.caddyConfigPath.trim() || !form.caddyReloadCmd.trim()) return "Runtime fields are required.";
    }
    if (activeStep === "root-domain" && !isWildcardRootDomain(form.rootDomain)) {
      return "Root domain must be a wildcard hostname like *.pilot.aeroplane.run.";
    }
    if (activeStep === "backups") {
      const r2Values = [form.r2AccountId, form.r2Bucket, form.r2AccessKeyId, form.r2SecretAccessKey].filter((value) => value.trim());
      if (r2Values.length > 0 && r2Values.length < 4) return "Fill all R2 fields or leave R2 blank.";
    }
    return "";
  }, [activeStep, form]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (step < activeSteps.length - 1) {
      if (stepError) {
        setError(stepError);
        return;
      }
      setError("");
      setStep((value) => value + 1);
      return;
    }

    if (stepError) {
      setError(stepError);
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      if (restartMode) {
        await api.restartOnboarding(buildRestartPayload(form));
      } else {
        await api.setup(buildPayload(form));
      }
      window.location.replace("/onboarding/success");
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not finish setup");
      setSubmitting(false);
    }
  }

  return (
    <main className="relative isolate min-h-dvh overflow-hidden bg-zinc-950 px-5 py-8 text-zinc-100">
      <div aria-hidden className="hero-noise pointer-events-none absolute inset-0" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_60%_at_0%_0%,rgba(79,184,178,0.12),transparent),radial-gradient(ellipse_70%_50%_at_100%_100%,rgba(120,113,255,0.08),transparent)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:72px_72px]"
      />

      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-5">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center border border-[#4FB8B2]/35 bg-[#4FB8B2]/10 text-[#4FB8B2]">
              <BrandMark />
            </div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-zinc-500">{restartMode ? "Re-run setup" : "First run"}</div>
              <h1 className="font-hero text-2xl tracking-tight text-zinc-100">{restartMode ? "Restart onboarding" : "Set up Aeroplane"}</h1>
            </div>
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">Step {step + 1} of {activeSteps.length}</div>
        </header>

        {!restartMode ? <MigrationImportPanel /> : null}

        <OnboardingThread steps={activeSteps} activeStep={step} onStepChange={setStep} />

        <form onSubmit={submit} className="space-y-5">
          {activeStep === "owner" ? <OwnerStep form={form} update={update} /> : null}
          {activeStep === "runtime" ? <RuntimeStep form={form} update={update} /> : null}
          {activeStep === "github" ? <GitHubStep form={form} update={update} /> : null}
          {activeStep === "root-domain" ? <RootDomainStep form={form} update={update} /> : null}
          {activeStep === "backups" ? <BackupsStep form={form} update={update} /> : null}

          {error ? <div className="border border-rose-500/35 bg-rose-950/30 px-4 py-3 font-mono text-xs text-rose-300">{error}</div> : null}

          <div className="flex items-center justify-between border-t border-zinc-800 pt-5">
            <button
              type="button"
              disabled={step === 0 || submitting}
              className="inline-flex h-10 items-center justify-center gap-2 px-3 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-300 transition hover:bg-zinc-800 hover:text-white disabled:opacity-40"
              onClick={() => {
                setError("");
                setStep((value) => Math.max(0, value - 1));
              }}
            >
              <AppIcon icon={ArrowLeft01Icon} size={15} />
              Back
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-10 items-center justify-center gap-2 border border-[#4FB8B2]/50 bg-[#4FB8B2]/15 px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7fe3dd] transition-colors hover:bg-[#4FB8B2]/25 disabled:opacity-60"
            >
              <AppIcon icon={step === activeSteps.length - 1 ? CheckmarkCircle02Icon : ArrowRight02Icon} size={15} />
              {step === activeSteps.length - 1 ? (submitting ? "Saving" : restartMode ? "Save setup" : "Finish setup") : "Continue"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
