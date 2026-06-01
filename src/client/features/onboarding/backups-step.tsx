import { LinkSquare02Icon } from "@hugeicons/core-free-icons";
import { AppIcon } from "../../components/ui/primitives";
import type { OnboardingForm } from "./onboarding-types";
import { OnboardingSection, TextField, ToggleField } from "./onboarding-fields";

const accountIdDocsUrl = "https://developers.cloudflare.com/fundamentals/setup/find-account-and-zone-ids/";
const r2TokenDocsUrl = "https://developers.cloudflare.com/r2/api/tokens/";

function ExternalLabelLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-zinc-500 transition hover:text-[#7fe3dd]"
      aria-label={label}
      title={label}
    >
      <AppIcon icon={LinkSquare02Icon} size={12} />
    </a>
  );
}

export function BackupsStep({
  form,
  update
}: {
  form: OnboardingForm;
  update: (patch: Partial<OnboardingForm>) => void;
}) {
  const hasR2Input = [form.r2AccountId, form.r2Bucket, form.r2AccessKeyId, form.r2SecretAccessKey].some((value) => value.trim());

  function skipR2() {
    update({
      r2AccountId: "",
      r2Bucket: "",
      r2AccessKeyId: "",
      r2SecretAccessKey: "",
      r2CreateBucket: false
    });
  }

  return (
    <OnboardingSection
      eyebrow="Step 05"
      title="Database backups"
      description="R2 is optional. Fill all four R2 fields to enable remote backups, or skip this step and use disk backups only."
    >
      {hasR2Input ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border border-zinc-800 bg-zinc-950/60 px-4 py-3">
          <p className="text-sm leading-6 text-zinc-400">
            Want to finish setup without Cloudflare R2? Clear these fields and Aeroplane will use disk backups.
          </p>
          <button
            type="button"
            className="inline-flex h-9 items-center justify-center border border-zinc-700 px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-300 transition hover:border-[#4FB8B2]/45 hover:bg-[#4FB8B2]/10 hover:text-[#7fe3dd]"
            onClick={skipR2}
          >
            Skip R2
          </button>
        </div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <TextField
          label={
            <span className="inline-flex items-center gap-2">
              R2 account ID
              <ExternalLabelLink href={accountIdDocsUrl} label="Find your Cloudflare account ID" />
            </span>
          }
          value={form.r2AccountId}
          onChange={(r2AccountId) => update({ r2AccountId })}
          placeholder="023e105f4ecef8ad9ca31a8372d0c353"
        />
        <TextField label="R2 bucket" value={form.r2Bucket} onChange={(r2Bucket) => update({ r2Bucket })} placeholder="aeroplane-backups" />
        <TextField
          label={
            <span className="inline-flex items-center gap-2">
              R2 access key ID
              <ExternalLabelLink href={r2TokenDocsUrl} label="Create or find R2 API token credentials" />
            </span>
          }
          value={form.r2AccessKeyId}
          onChange={(r2AccessKeyId) => update({ r2AccessKeyId })}
          placeholder="Access Key ID from R2 API token"
        />
        <TextField
          label={
            <span className="inline-flex items-center gap-2">
              R2 secret access key
              <ExternalLabelLink href={r2TokenDocsUrl} label="Create or find R2 API token credentials" />
            </span>
          }
          value={form.r2SecretAccessKey}
          onChange={(r2SecretAccessKey) => update({ r2SecretAccessKey })}
          type="password"
          placeholder="Secret Access Key from R2 API token"
        />
        <div className="md:col-span-2">
          <ToggleField
            label="Create or verify R2 bucket"
            checked={form.r2CreateBucket}
            onChange={(r2CreateBucket) => update({ r2CreateBucket })}
            description="Aeroplane will make a direct Cloudflare R2 request during setup when R2 fields are filled."
          />
        </div>
      </div>
    </OnboardingSection>
  );
}
