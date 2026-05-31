import {
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Delete02Icon,
  GithubIcon,
  LinkSquare02Icon,
  PencilEdit02Icon
} from "@hugeicons/core-free-icons";
import { FormEvent, useEffect, useState } from "react";
import { api, type GitHubSettingsStatus } from "../../api";
import { AppIcon, FieldLabel, FormInput, shellButton, statusClass } from "../ui/primitives";

type GitHubFormState = {
  githubAccessToken: string;
  githubAppId: string;
  githubAppClientId: string;
  githubAppSlug: string;
  githubAppPrivateKey: string;
  githubWebhookSecret: string;
};

const emptyGithubSettings: GitHubSettingsStatus = {
  status: {
    appConfigured: false,
    connected: false,
    installationCount: 0,
    installed: false,
    installUrl: null,
    mode: "none"
  },
  statusError: "",
  settings: {
    githubAccessTokenSuffix: "",
    githubAppId: "",
    githubAppClientId: "",
    githubAppSlug: "",
    githubAppPrivateKeyConfigured: false,
    githubWebhookSecretSuffix: "",
    envPath: ""
  }
};

function formFromSettings(settings: GitHubSettingsStatus): GitHubFormState {
  return {
    githubAccessToken: settings.settings.githubAccessTokenSuffix ? `******${settings.settings.githubAccessTokenSuffix}` : "",
    githubAppId: settings.settings.githubAppId,
    githubAppClientId: settings.settings.githubAppClientId,
    githubAppSlug: settings.settings.githubAppSlug,
    githubAppPrivateKey: "",
    githubWebhookSecret: settings.settings.githubWebhookSecretSuffix ? `******${settings.settings.githubWebhookSecretSuffix}` : ""
  };
}

function modeLabel(settings: GitHubSettingsStatus) {
  if (settings.status.mode === "app") return settings.status.installed ? "GitHub App installed" : "GitHub App configured";
  if (settings.status.mode === "token") return "Access token connected";
  return "Not connected";
}

export function GitHubSettingsPanel({ open }: { open: boolean }) {
  const [github, setGithub] = useState<GitHubSettingsStatus>(emptyGithubSettings);
  const [form, setForm] = useState<GitHubFormState>(() => formFromSettings(emptyGithubSettings));
  const [editing, setEditing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const connected = github.status.connected || github.status.installed || github.status.mode === "token";
  const appConfigured = github.status.appConfigured || Boolean(github.settings.githubAppId || github.settings.githubAppPrivateKeyConfigured);
  const status = connected ? "active" : appConfigured ? "building" : "idle";

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError("");
    setSuccess("");

    void api.githubSettings()
      .then((result) => {
        if (cancelled) return;
        setGithub(result);
        setForm(formFromSettings(result));
        setEditing(!result.status.connected && !result.status.installed && result.status.mode !== "token");
        setDisconnecting(false);
      })
      .catch((issue) => {
        if (!cancelled) setError(issue instanceof Error ? issue.message : "Could not load GitHub settings");
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");

    try {
      const result = await api.updateGithubSettings({
        githubAccessToken: form.githubAccessToken,
        githubAppId: form.githubAppId,
        githubAppClientId: form.githubAppClientId,
        githubAppSlug: form.githubAppSlug,
        githubAppPrivateKey: form.githubAppPrivateKey,
        githubWebhookSecret: form.githubWebhookSecret
      });
      setGithub(result);
      setForm(formFromSettings(result));
      setEditing(false);
      setDisconnecting(false);
      setSuccess(result.statusError ? `GitHub settings saved. ${result.statusError}` : "GitHub settings saved.");
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not save GitHub settings");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError("");
    setSuccess("");

    try {
      const result = await api.disconnectGithub();
      setGithub(result);
      setForm(formFromSettings(result));
      setEditing(true);
      setDisconnecting(false);
      setSuccess("GitHub configuration removed.");
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not disconnect GitHub");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {!editing ? (
        <section className="border border-zinc-800 bg-zinc-950/45 p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center border border-[#4FB8B2]/35 bg-[#4FB8B2]/10 text-[#7fe3dd]">
                <AppIcon icon={GithubIcon} size={18} />
              </div>
              <div>
                <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">GitHub integration</div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <h3 className="font-hero text-xl tracking-tight text-zinc-100">{modeLabel(github)}</h3>
                  <span className={`px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] ${statusClass(status)}`}>
                    {connected ? "Connected" : appConfigured ? "Needs install" : "Not configured"}
                  </span>
                </div>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
                  Configure the GitHub credentials Aeroplane uses to browse repositories, read branches, and receive deployment webhooks.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="inline-flex h-9 w-9 items-center justify-center border border-zinc-700 bg-zinc-900 text-zinc-300 transition hover:border-[#4FB8B2]/45 hover:bg-[#4FB8B2]/10 hover:text-[#7fe3dd]" onClick={() => setEditing(true)} title="Edit GitHub settings" aria-label="Edit GitHub settings">
                <AppIcon icon={PencilEdit02Icon} size={15} />
              </button>
              {connected || appConfigured ? (
                <button type="button" className="inline-flex h-9 w-9 items-center justify-center border border-zinc-700 bg-zinc-900 text-zinc-300 transition hover:border-rose-500/45 hover:bg-rose-500/10 hover:text-rose-300" onClick={() => setDisconnecting(true)} title="Disconnect GitHub" aria-label="Disconnect GitHub">
                  <AppIcon icon={Delete02Icon} size={15} />
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="border border-zinc-800 bg-zinc-900/50 p-3">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-600">Mode</div>
              <div className="mt-2 font-mono text-xs text-zinc-200">{github.status.mode}</div>
            </div>
            <div className="border border-zinc-800 bg-zinc-900/50 p-3">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-600">Installations</div>
              <div className="mt-2 font-mono text-xs text-zinc-200">{github.status.installationCount}</div>
            </div>
            <div className="border border-zinc-800 bg-zinc-900/50 p-3">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-600">Env file</div>
              <div className="mt-2 truncate font-mono text-xs text-zinc-200">{github.settings.envPath || "Not available"}</div>
            </div>
          </div>

          {github.status.mode === "app" && github.status.installUrl && !github.status.installed ? (
            <a href={github.status.installUrl} target="_blank" rel="noreferrer" className={`${shellButton("primary")} mt-5`}>
              <AppIcon icon={GithubIcon} size={15} />
              Install GitHub App
            </a>
          ) : null}

          {disconnecting ? (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border border-rose-500/35 bg-rose-950/20 px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-rose-100">Disconnect GitHub?</div>
                <div className="mt-1 text-xs text-rose-200/75">Repository browsing and GitHub webhooks will stop until GitHub is configured again.</div>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" className="inline-flex h-9 w-9 items-center justify-center border border-rose-500/40 bg-rose-500/10 text-rose-200" onClick={() => void disconnect()} disabled={busy} title="Yes" aria-label="Yes">
                  <AppIcon icon={CheckmarkCircle02Icon} size={16} />
                </button>
                <button type="button" className="inline-flex h-9 w-9 items-center justify-center border border-zinc-700 bg-zinc-900 text-zinc-300" onClick={() => setDisconnecting(false)} disabled={busy} title="No" aria-label="No">
                  <AppIcon icon={Cancel01Icon} size={16} />
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {editing ? (
        <form onSubmit={saveSettings} className="space-y-5 border border-zinc-800 bg-zinc-950/45 p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center border border-[#4FB8B2]/35 bg-[#4FB8B2]/10 text-[#7fe3dd]">
                <AppIcon icon={GithubIcon} size={18} />
              </div>
              <div>
                <h3 className="font-hero text-lg tracking-tight text-zinc-100">Configure GitHub</h3>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-400">
                  Use either a GitHub App or a personal access token. App credentials are preferred for repository installs and webhooks.
                </p>
              </div>
            </div>
            <a
              href="https://github.com/settings/apps/new"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 w-fit items-center justify-center gap-2 border border-[#4FB8B2]/45 bg-[#4FB8B2]/12 px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9af4ee] transition hover:bg-[#4FB8B2]/20"
            >
              <AppIcon icon={LinkSquare02Icon} size={14} />
              Create GitHub App
            </a>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <FieldLabel>GITHUB_ACCESS_TOKEN</FieldLabel>
              <FormInput
                type="password"
                value={form.githubAccessToken}
                onChange={(event) => setForm({ ...form, githubAccessToken: event.target.value })}
                placeholder="GitHub personal access token"
                autoComplete="off"
              />
            </div>
            <div>
              <FieldLabel>GITHUB_WEBHOOK_SECRET</FieldLabel>
              <FormInput
                type="password"
                value={form.githubWebhookSecret}
                onChange={(event) => setForm({ ...form, githubWebhookSecret: event.target.value })}
                placeholder="Webhook secret"
                autoComplete="off"
              />
            </div>
            <div>
              <FieldLabel>GITHUB_APP_ID</FieldLabel>
              <FormInput value={form.githubAppId} onChange={(event) => setForm({ ...form, githubAppId: event.target.value })} placeholder="123456" />
            </div>
            <div>
              <FieldLabel>GITHUB_APP_CLIENT_ID</FieldLabel>
              <FormInput value={form.githubAppClientId} onChange={(event) => setForm({ ...form, githubAppClientId: event.target.value })} placeholder="Iv1.xxxxx" />
            </div>
            <div>
              <FieldLabel>GITHUB_APP_SLUG</FieldLabel>
              <FormInput value={form.githubAppSlug} onChange={(event) => setForm({ ...form, githubAppSlug: event.target.value })} placeholder="aeroplane" />
            </div>
            <div className="flex items-end">
              <p className="font-mono text-[10px] leading-relaxed text-zinc-500">
                Leave masked secrets unchanged to keep existing values. Clear a masked token or webhook secret to remove it.
              </p>
            </div>
            <div className="md:col-span-2">
              <FieldLabel>GITHUB_APP_PRIVATE_KEY</FieldLabel>
              <textarea
                value={form.githubAppPrivateKey}
                onChange={(event) => setForm({ ...form, githubAppPrivateKey: event.target.value })}
                placeholder={github.settings.githubAppPrivateKeyConfigured ? "Leave blank to keep current private key" : "-----BEGIN PRIVATE KEY-----"}
                className="min-h-28 w-full resize-y border border-zinc-700 bg-zinc-900 px-3 py-3 font-mono text-xs text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-[#4FB8B2]/60"
                spellCheck={false}
                autoComplete="off"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className={shellButton("primary")} disabled={busy}>
              <AppIcon icon={GithubIcon} size={15} />
              {busy ? "Saving..." : "Save GitHub settings"}
            </button>
            {connected || appConfigured ? (
              <button
                type="button"
                className={shellButton("ghost")}
                onClick={() => {
                  setForm(formFromSettings(github));
                  setEditing(false);
                }}
                disabled={busy}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      {github.statusError ? <div className="border border-amber-500/35 bg-amber-950/20 px-3.5 py-2.5 font-mono text-[10px] text-amber-200">{github.statusError}</div> : null}
      {error ? <div className="border border-rose-500/35 bg-rose-950/30 px-3.5 py-2.5 font-mono text-[10px] text-rose-300">{error}</div> : null}
      {success ? (
        <div className="flex items-center gap-2 border border-emerald-500/35 bg-emerald-950/30 px-3.5 py-2.5 font-mono text-[10px] text-emerald-300">
          <AppIcon icon={CheckmarkCircle02Icon} size={13} />
          {success}
        </div>
      ) : null}
    </div>
  );
}
