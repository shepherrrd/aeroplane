import { useState, useEffect } from "react";
import {
  AddSquareIcon,
  ArrowLeft01Icon,
  CheckmarkCircle02Icon,
  Search01Icon,
  WorkflowSquare07Icon,
  Globe02Icon,
  Settings01Icon
} from "@hugeicons/core-free-icons";
import { useNavigate } from "@tanstack/react-router";
import { api } from "../../api";
import { ModalShell } from "../../components/modals/modal-shell";
import { AppIcon, FieldLabel, FormInput, FormSelect, shellButton } from "../../components/ui/primitives";

interface RailwayProject {
  id: string;
  name: string;
  description: string;
  serviceCount: number;
}

interface RailwayImportModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function RailwayImportModal({ open, onClose, onSuccess }: RailwayImportModalProps) {
  const navigate = useNavigate();
  const [step, setStep] = useState<"auth" | "select" | "configure" | "importing" | "success">("auth");
  const [apiToken, setApiToken] = useState("");
  const [projects, setProjects] = useState<RailwayProject[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProject, setSelectedProject] = useState<RailwayProject | null>(null);
  const [importedSlug, setImportedSlug] = useState("");
  const [rememberToken, setRememberToken] = useState(() => {
    const saved = localStorage.getItem("railway_remember_token");
    return saved !== "false";
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Configuration step states
  const [projectDetails, setProjectDetails] = useState<{
    services: Array<{ id: string; name: string }>;
    environments: Array<{ id: string; name: string }>;
  } | null>(null);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<string>("");
  const [excludeRailwayVars, setExcludeRailwayVars] = useState(true);
  const [importDatabases, setImportDatabases] = useState(true);

  useEffect(() => {
    if (open) {
      const savedToken = localStorage.getItem("railway_api_token");
      if (savedToken) {
        setApiToken(savedToken);
      }
    }
  }, [open]);

  const filteredProjects = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  async function handleConnect() {
    if (!apiToken.trim()) return;
    setBusy(true);
    setError("");
    try {
      const data = await api.railwayProjects(apiToken.trim());
      localStorage.setItem("railway_remember_token", rememberToken ? "true" : "false");
      if (rememberToken) {
        localStorage.setItem("railway_api_token", apiToken.trim());
      } else {
        localStorage.removeItem("railway_api_token");
      }
      setProjects(data.projects);
      setStep("select");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid Railway API Token or connection failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleSelectProject(project: RailwayProject) {
    setSelectedProject(project);
    setBusy(true);
    setError("");
    try {
      const data = await api.railwayProjectDetails(apiToken.trim(), project.id);
      const details = data.details;
      setProjectDetails(details);
      
      // Initialize defaults
      setSelectedServiceIds(details.services.map(s => s.id));
      setSelectedEnvironmentId(details.environments[0]?.id || "");
      setExcludeRailwayVars(true);
      setImportDatabases(true);
      
      setStep("configure");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load project details");
    } finally {
      setBusy(false);
    }
  }

  async function handleExecuteImport() {
    if (!selectedProject) return;
    setStep("importing");
    setBusy(true);
    setError("");
    try {
      const config = {
        environmentId: selectedEnvironmentId,
        excludeRailwayVars,
        importDatabases,
        selectedServiceIds
      };
      const result = await api.railwayImport(apiToken.trim(), selectedProject.id, config);
      setImportedSlug(result.projectSlug);
      setStep("success");
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Migration failed");
      setStep("configure");
    } finally {
      setBusy(false);
    }
  }

  function handleClose() {
    setStep("auth");
    setApiToken("");
    setProjects([]);
    setSearchQuery("");
    setSelectedProject(null);
    setImportedSlug("");
    setError("");
    setProjectDetails(null);
    setSelectedServiceIds([]);
    setSelectedEnvironmentId("");
    onClose();
  }

  const modalIcon =
    step === "auth"
      ? Settings01Icon
      : step === "select"
      ? Search01Icon
      : step === "configure"
      ? Settings01Icon
      : step === "importing"
      ? WorkflowSquare07Icon
      : CheckmarkCircle02Icon;

  return (
    <ModalShell
      open={open}
      onClose={handleClose}
      icon={modalIcon}
      title="Import Project from Railway"
      meta={
        step === "auth"
          ? "Step 1: Authenticate"
          : step === "select"
          ? "Step 2: Choose Project"
          : step === "configure"
          ? "Step 3: Configure Migration"
          : step === "importing"
          ? "Migration In Progress"
          : "Migration Complete"
      }
      width="max-w-xl"
      bodyClassName="min-h-0 flex flex-1 flex-col overflow-hidden"
    >
      {step === "auth" && (
        <div className="space-y-5">
          <div className="text-sm text-zinc-300 leading-relaxed">
            Migrate your entire Railway stack to your self-hosted Aeroplane control plane in seconds. All services, environment variables, database engines, and configurations will be imported natively.
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <FieldLabel>Railway Personal API Token</FieldLabel>
              <a
                href="https://railway.app/account/tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] font-mono text-[#E93D82] hover:underline uppercase tracking-wider"
              >
                Get token →
              </a>
            </div>
            <FormInput
              type="password"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder="rg_pat_..."
              disabled={busy}
              autoComplete="new-password"
              required
            />
            <div className="flex items-center gap-2 mt-3 select-none">
              <input
                type="checkbox"
                id="remember-token"
                checked={rememberToken}
                onChange={(e) => setRememberToken(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-700 bg-zinc-950 text-[#E93D82] focus:ring-[#E93D82] focus:ring-offset-zinc-900 focus:outline-none"
              />
              <label htmlFor="remember-token" className="text-xs text-zinc-400 cursor-pointer font-mono uppercase tracking-wider">
                Remember my Railway token
              </label>
            </div>
          </div>

          {error && (
            <div className="border border-rose-500/35 bg-rose-950/20 px-4 py-3 text-xs text-rose-300 font-mono">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 border-t border-zinc-800 pt-4 mt-5">
            <button type="button" className={shellButton("ghost")} onClick={handleClose} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 border border-[#E93D82]/50 bg-[#E93D82]/15 px-4 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-[#E93D82] transition hover:bg-[#E93D82]/25 disabled:opacity-60"
              onClick={handleConnect}
              disabled={busy || !apiToken.trim()}
            >
              Connect to Railway
            </button>
          </div>
        </div>
      )}

      {step === "select" && (
        <div className="flex flex-col min-h-full">
          <div className="relative mb-4">
            <AppIcon icon={Search01Icon} size={16} className="pointer-events-none absolute left-3 top-3 text-zinc-500" />
            <FormInput
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Railway projects"
              className="pl-10"
            />
          </div>

          {error && (
            <div className="border border-rose-500/35 bg-rose-950/20 px-4 py-3 text-xs text-rose-300 font-mono mb-4">
              {error}
            </div>
          )}

          <div className="overflow-hidden border border-zinc-700 bg-zinc-900/85 flex-1 min-h-0">
            <div className="max-h-[300px] overflow-y-auto">
              {filteredProjects.length === 0 ? (
                <div className="px-5 py-8 text-center font-mono text-xs text-zinc-400">
                  No Railway projects found.
                </div>
              ) : (
                filteredProjects.map((project) => (
                  <div
                    key={project.id}
                    className="flex items-center justify-between gap-4 border-b border-zinc-800 px-4 py-3.5 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-zinc-100">{project.name}</div>
                      <div className="text-[11px] text-zinc-400 truncate max-w-sm mt-0.5">
                        {project.description || "No description"}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center gap-2 border border-[#E93D82]/50 bg-[#E93D82]/12 px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#E93D82] transition hover:bg-[#E93D82]/20"
                      onClick={() => void handleSelectProject(project)}
                      disabled={busy}
                    >
                      Configure Import
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex justify-start border-t border-zinc-800 pt-4 mt-5">
            <button
              type="button"
              className={shellButton("ghost")}
              onClick={() => setStep("auth")}
              disabled={busy}
            >
              <AppIcon icon={ArrowLeft01Icon} size={16} />
              Back
            </button>
          </div>
        </div>
      )}

      {step === "configure" && projectDetails && (
        <div className="flex flex-col min-h-full space-y-4">
          <div className="text-sm text-zinc-300 leading-relaxed mb-1">
            Customize how <strong>{selectedProject?.name}</strong> is migrated to your self-hosted stack.
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel>Target Environment</FieldLabel>
              <FormSelect
                value={selectedEnvironmentId}
                onChange={(e) => setSelectedEnvironmentId(e.target.value)}
                disabled={busy}
              >
                {projectDetails.environments.map((env) => (
                  <option key={env.id} value={env.id}>
                    {env.name}
                  </option>
                ))}
              </FormSelect>
              <div className="text-[10px] text-zinc-500 font-mono mt-1 uppercase tracking-wider">
                Pull variables from this env
              </div>
            </div>

            <div className="flex flex-col justify-end space-y-2.5 pb-1">
              <label className="flex items-center gap-2 select-none cursor-pointer">
                <input
                  type="checkbox"
                  checked={excludeRailwayVars}
                  onChange={(e) => setExcludeRailwayVars(e.target.checked)}
                  disabled={busy}
                  className="h-4 w-4 rounded border-zinc-700 bg-zinc-950 text-[#E93D82] focus:ring-[#E93D82] focus:ring-offset-zinc-900 focus:outline-none"
                />
                <span className="text-xs text-zinc-300 font-semibold font-mono uppercase tracking-wider">
                  Exclude RAILWAY_* variables
                </span>
              </label>

              <label className="flex items-center gap-2 select-none cursor-pointer">
                <input
                  type="checkbox"
                  checked={importDatabases}
                  onChange={(e) => setImportDatabases(e.target.checked)}
                  disabled={busy}
                  className="h-4 w-4 rounded border-zinc-700 bg-zinc-950 text-[#E93D82] focus:ring-[#E93D82] focus:ring-offset-zinc-900 focus:outline-none"
                />
                <span className="text-xs text-zinc-300 font-semibold font-mono uppercase tracking-wider">
                  Migrate database engines
                </span>
              </label>
            </div>
          </div>

          <div>
            <FieldLabel>Services to Import ({selectedServiceIds.length} selected)</FieldLabel>
            <div className="border border-zinc-700 bg-zinc-900/85 overflow-hidden">
              <div className="max-h-[160px] overflow-y-auto divide-y divide-zinc-800">
                {projectDetails.services.map((service) => {
                  const isChecked = selectedServiceIds.includes(service.id);
                  const lowercase = service.name.toLowerCase();
                  const isDb = lowercase.includes("postgres") || lowercase.includes("mysql") || lowercase.includes("redis") || lowercase.includes("mongo");
                  
                  return (
                    <label
                      key={service.id}
                      className="flex items-center justify-between px-4 py-2.5 hover:bg-zinc-800/40 cursor-pointer select-none transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setSelectedServiceIds(selectedServiceIds.filter(id => id !== service.id));
                            } else {
                              setSelectedServiceIds([...selectedServiceIds, service.id]);
                            }
                          }}
                          disabled={busy}
                          className="h-4 w-4 rounded border-zinc-700 bg-zinc-950 text-[#E93D82] focus:ring-[#E93D82] focus:ring-offset-zinc-900 focus:outline-none"
                        />
                        <span className="text-xs font-semibold text-zinc-100 font-mono">{service.name}</span>
                      </div>
                      <span className={`px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider font-semibold border ${
                        isDb 
                          ? "border-[#4FB8B2]/30 bg-[#4FB8B2]/5 text-[#4FB8B2]" 
                          : "border-purple-500/30 bg-purple-500/5 text-purple-400"
                      }`}>
                        {isDb ? "Database" : "App Service"}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          {error && (
            <div className="border border-rose-500/35 bg-rose-950/20 px-4 py-3 text-xs text-rose-300 font-mono">
              {error}
            </div>
          )}

          <div className="flex justify-between gap-3 border-t border-zinc-800 pt-4 mt-5">
            <button
              type="button"
              className={shellButton("ghost")}
              onClick={() => setStep("select")}
              disabled={busy}
            >
              <AppIcon icon={ArrowLeft01Icon} size={16} />
              Back
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 border border-[#E93D82]/50 bg-[#E93D82]/15 px-5 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-[#E93D82] transition hover:bg-[#E93D82]/25 disabled:opacity-60"
              onClick={handleExecuteImport}
              disabled={busy || selectedServiceIds.length === 0}
            >
              <AppIcon icon={Globe02Icon} size={16} />
              Start Migration
            </button>
          </div>
        </div>
      )}

      {step === "importing" && (
        <div className="py-8 flex flex-col items-center justify-center text-center space-y-4">
          <div className="relative flex items-center justify-center">
            <div className="h-12 w-12 rounded-full border-2 border-t-2 border-zinc-700 border-t-[#E93D82] animate-spin" />
            <AppIcon icon={WorkflowSquare07Icon} size={18} className="absolute text-[#E93D82]" />
          </div>
          <div>
            <h3 className="font-semibold text-zinc-100 text-base">Migrating Project Stacks</h3>
            <p className="text-xs text-zinc-400 font-mono mt-1">
              Importing services from "{selectedProject?.name}"...
            </p>
          </div>
          <div className="w-64 h-1 border border-zinc-800 bg-zinc-950 overflow-hidden relative">
            <div className="absolute inset-y-0 bg-gradient-to-r from-[#E93D82] to-[#7871FF] w-1/2 rounded-full animate-marquee" />
          </div>
          <div className="text-[10px] text-zinc-500 font-mono space-y-1">
            <div>Fetching services and variable maps...</div>
            <div>Configuring self-hosted database containers...</div>
            <div>Generating transparent Caddy reverse proxies...</div>
          </div>
        </div>
      )}

      {step === "success" && (
        <div className="py-6 flex flex-col items-center justify-center text-center space-y-5">
          <div className="h-14 w-14 rounded-full border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-center text-emerald-400">
            <AppIcon icon={CheckmarkCircle02Icon} size={30} />
          </div>
          <div>
            <h3 className="font-hero text-xl font-bold text-zinc-100">Migration Completed!</h3>
            <p className="text-sm text-zinc-300 max-w-sm mt-2">
              Successfully migrated all services, environment configurations, and databases from "{selectedProject?.name}" into your local stack.
            </p>
          </div>

          <button
            type="button"
            className={shellButton("primary")}
            onClick={() => {
              handleClose();
              void navigate({ to: "/$projectSlug", params: { projectSlug: importedSlug } });
            }}
          >
            <AppIcon icon={WorkflowSquare07Icon} size={16} />
            Go to Project Dashboard
          </button>
        </div>
      )}
    </ModalShell>
  );
}
