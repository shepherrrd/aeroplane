import { GithubIcon, LinkSquare02Icon } from "@hugeicons/core-free-icons";
import { AppIcon } from "../../components/ui/primitives";
import type { OnboardingForm } from "./onboarding-types";
import { OnboardingSection, TextAreaField, TextField } from "./onboarding-fields";

export function GitHubStep({
  form,
  update
}: {
  form: OnboardingForm;
  update: (patch: Partial<OnboardingForm>) => void;
}) {
  return (
    <OnboardingSection
      eyebrow="Step 03"
      title="GitHub integration"
      description="These are optional. You can start with a token, or leave this blank and configure the GitHub App from system settings later."
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border border-zinc-800 bg-zinc-950/70 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-9 w-9 place-items-center border border-zinc-700 bg-zinc-900 text-zinc-300">
            <AppIcon icon={GithubIcon} size={16} />
          </div>
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">Need an app?</div>
            <div className="text-sm text-zinc-200">Create a GitHub App, then paste its credentials here.</div>
          </div>
        </div>
        <a
          href="https://github.com/settings/apps/new"
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 items-center justify-center gap-2 border border-[#4FB8B2]/45 bg-[#4FB8B2]/12 px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9af4ee] transition hover:bg-[#4FB8B2]/20"
        >
          <AppIcon icon={LinkSquare02Icon} size={14} />
          Create GitHub App
        </a>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="GITHUB_ACCESS_TOKEN" value={form.githubAccessToken} onChange={(githubAccessToken) => update({ githubAccessToken })} type="password" />
        <TextField label="GITHUB_WEBHOOK_SECRET" value={form.githubWebhookSecret} onChange={(githubWebhookSecret) => update({ githubWebhookSecret })} type="password" />
        <TextField label="GITHUB_APP_ID" value={form.githubAppId} onChange={(githubAppId) => update({ githubAppId })} />
        <TextField label="GITHUB_APP_CLIENT_ID" value={form.githubAppClientId} onChange={(githubAppClientId) => update({ githubAppClientId })} />
        <TextField label="GITHUB_APP_SLUG" value={form.githubAppSlug} onChange={(githubAppSlug) => update({ githubAppSlug })} />
        <div />
        <div className="md:col-span-2">
          <TextAreaField
            label="GITHUB_APP_PRIVATE_KEY"
            value={form.githubAppPrivateKey}
            onChange={(githubAppPrivateKey) => update({ githubAppPrivateKey })}
            placeholder="-----BEGIN PRIVATE KEY-----"
          />
        </div>
      </div>
    </OnboardingSection>
  );
}
