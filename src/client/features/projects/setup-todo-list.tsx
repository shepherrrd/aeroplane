import {
  AlertCircleIcon,
  CloudUploadIcon,
  GithubIcon,
  Globe02Icon,
  Settings01Icon
} from "@hugeicons/core-free-icons";
import type { GitHubStatus, R2SettingsStatus, ToolCheck } from "../../api";
import type { SystemSettingsTab } from "../../components/modals/system-settings-types";
import { AppIcon } from "../../components/ui/primitives";

type DomainSettingsSummary = {
  settings: {
    rootDomain: string;
    controlPlaneHostname: string;
  };
  dnsStatus?: "active" | "pending";
  controlPlaneDnsStatus?: "active" | "pending";
};

type SetupTodo = {
  key: string;
  icon: unknown;
  title: string;
  detail: string;
  tone: "amber" | "rose" | "cyan";
  actionLabel: string;
  onAction: () => void;
};

function todoToneClass(tone: SetupTodo["tone"]) {
  if (tone === "rose") return "border-rose-500/35 bg-rose-950/20 text-rose-200";
  if (tone === "amber") return "border-amber-500/35 bg-amber-950/20 text-amber-200";
  return "border-[#4FB8B2]/35 bg-[#4FB8B2]/10 text-[#9af4ee]";
}

function SetupTodoSkeleton() {
  return (
    <section className="border border-zinc-800 bg-zinc-950/55">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="p-4">
          <div className="h-3 w-28 animate-pulse bg-zinc-800" />
          <div className="mt-3 h-4 w-56 animate-pulse bg-zinc-800" />
        </div>
        <div className="mr-4 h-7 w-24 animate-pulse bg-zinc-800" />
      </div>
      <div className="border-t border-zinc-800">
        <div className="h-16 animate-pulse border-b border-zinc-800 bg-zinc-900/45" />
        <div className="h-16 animate-pulse border-b border-zinc-800 bg-zinc-900/35" />
        <div className="h-16 animate-pulse bg-zinc-900/25" />
      </div>
    </section>
  );
}

export function SetupTodoList({
  loading,
  domainSettings,
  githubStatus,
  r2Status,
  tools,
  onOpenSettings,
  onOpenGitHubInstall
}: {
  loading: boolean;
  domainSettings: DomainSettingsSummary | null;
  githubStatus: GitHubStatus | null;
  r2Status: R2SettingsStatus | null;
  tools: ToolCheck[];
  onOpenSettings: (tab?: SystemSettingsTab) => void;
  onOpenGitHubInstall: () => void;
}) {
  if (loading) return <SetupTodoSkeleton />;

  const todos: SetupTodo[] = [];
  const dashboardHostname = domainSettings?.settings.controlPlaneHostname ?? "";
  const rootDomain = domainSettings?.settings.rootDomain ?? "";
  const brokenTools = tools.filter((tool) => !tool.ok);

  if (!dashboardHostname) {
    todos.push({
      key: "dashboard-domain",
      icon: Globe02Icon,
      title: "Add dashboard domain",
      detail: "Serve Aeroplane from a hostname instead of only the server IP.",
      tone: "cyan",
      actionLabel: "Set domain",
      onAction: () => onOpenSettings("root-domain")
    });
  } else if (domainSettings?.controlPlaneDnsStatus !== "active") {
    todos.push({
      key: "dashboard-dns",
      icon: Globe02Icon,
      title: "Finish dashboard DNS",
      detail: `${dashboardHostname} is saved, but DNS has not resolved to this VPS yet.`,
      tone: "amber",
      actionLabel: "View DNS",
      onAction: () => onOpenSettings("root-domain")
    });
  }

  if (!rootDomain) {
    todos.push({
      key: "root-domain",
      icon: Globe02Icon,
      title: "Add wildcard root domain",
      detail: "Generate service hostnames like api.pilot.example.com automatically.",
      tone: "cyan",
      actionLabel: "Set wildcard",
      onAction: () => onOpenSettings("root-domain")
    });
  } else if (domainSettings?.dnsStatus !== "active") {
    todos.push({
      key: "root-dns",
      icon: Globe02Icon,
      title: "Finish wildcard DNS",
      detail: `*.${rootDomain} is saved, but the wildcard record is not active yet.`,
      tone: "amber",
      actionLabel: "View DNS",
      onAction: () => onOpenSettings("root-domain")
    });
  }

  if (!githubStatus?.connected && !githubStatus?.installed) {
    todos.push({
      key: "github",
      icon: GithubIcon,
      title: githubStatus?.mode === "app" ? "Install GitHub App" : "Connect GitHub",
      detail: githubStatus?.mode === "app" ? "The app is configured, but it is not installed on any repositories." : "Connect GitHub to browse repos, branches, and directories.",
      tone: "amber",
      actionLabel: githubStatus?.mode === "app" && githubStatus.installUrl ? "Install app" : "Open setup",
      onAction: () => {
        if (githubStatus?.mode === "app" && githubStatus.installUrl) {
          onOpenGitHubInstall();
        } else {
          onOpenSettings("github");
        }
      }
    });
  }

  if (!r2Status?.connected) {
    todos.push({
      key: "r2",
      icon: CloudUploadIcon,
      title: "Connect R2 backups",
      detail: "Store R2 credentials in Aeroplane so database backups can upload.",
      tone: "cyan",
      actionLabel: "Set storage",
      onAction: () => onOpenSettings("storage")
    });
  }

  if (brokenTools.length > 0) {
    todos.push({
      key: "tools",
      icon: Settings01Icon,
      title: "Fix host tools",
      detail: brokenTools.map((tool) => tool.name).join(", "),
      tone: "rose",
      actionLabel: "Open settings",
      onAction: () => onOpenSettings()
    });
  }

  if (todos.length === 0) return null;

  return (
    <section className="border border-zinc-800 bg-zinc-950/55">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-500">Setup todo</div>
          <div className="mt-1 text-sm text-zinc-300">
            {todos.length} item{todos.length === 1 ? "" : "s"} still need attention.
          </div>
        </div>
        <div className="inline-flex items-center gap-2 border border-amber-500/25 bg-amber-500/10 px-2.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-200">
          <AppIcon icon={AlertCircleIcon} size={13} />
          Action needed
        </div>
      </div>

      <ul className="border-t border-zinc-800">
        {todos.map((todo) => (
          <li key={todo.key} className={`border-b border-zinc-800 last:border-b-0 ${todoToneClass(todo.tone)}`}>
            <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center border border-current/25 bg-black/15">
                  <AppIcon icon={todo.icon} size={14} />
                </div>
                <div className="min-w-0">
                  <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em]">{todo.title}</div>
                  <p className="mt-1 text-xs leading-5 text-zinc-400">{todo.detail}</p>
                </div>
              </div>
              <button
                type="button"
                className="w-fit shrink-0 border border-current/30 bg-black/15 px-2.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] transition hover:bg-black/25"
                onClick={todo.onAction}
              >
                {todo.actionLabel}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
