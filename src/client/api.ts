export type Framework = {
  slug: string;
  name: string;
  logoUrl: null | string;
  website: null | string;
};

export type Service = {
  id: string;
  projectId: string;
  name: string;
  slug: string;
  repoFullName: null | string;
  repoUrl: string;
  branch: string;
  rootDir: null | string;
  hasGithubToken: boolean;
  installCommand: null | string;
  buildCommand: null | string;
  startCommand: null | string;
  staticOutput: null | string;
  internalPort: number;
  hostPort: number;
  status: string;
  reachable: boolean;
  localUrl: string;
  primaryUrl: string;
  preferredDomain: { hostname: string; status: string } | null;
  framework: Framework | null;
  lastDeployedAt: null | string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectCard = {
  id: string;
  name: string;
  slug: string;
  description: null | string;
  status: string;
  serviceCount: number;
  lastUpdatedAt: string;
  services: Service[];
};

export type ProjectDetail = ProjectCard;

export type Deployment = {
  id: string;
  serviceId: string;
  commitSha: null | string;
  status: string;
  trigger: string;
  imageTag: null | string;
  containerName: null | string;
  startedAt: null | string;
  finishedAt: null | string;
  createdAt: string;
};

export type DeploymentLog = {
  id: number;
  deploymentId: string;
  line: string;
  stream: string;
  createdAt: string;
};

export type RuntimeLog = {
  id: number;
  line: string;
  stream: string;
  createdAt: string;
};

export type EnvVar = {
  id: string;
  key: string;
  hasValue: boolean;
  value?: string;
  resolvedValue?: string;
  createdAt: string;
  updatedAt: string;
};

export type Domain = {
  id: string;
  serviceId: string;
  hostname: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type ToolCheck = {
  name: string;
  ok: boolean;
  detail: string;
};

export type SystemUpdateCommit = {
  sha: string;
  shortSha: string;
  title: string;
  author: string;
  date: string;
  url: null | string;
};

export type SystemUpdateRun = {
  status: "idle" | "running" | "succeeded" | "failed";
  startedAt: null | string;
  finishedAt: null | string;
  targetCommit: null | string;
  restartQueued: boolean;
  logs: string[];
  error: null | string;
};

export type SystemUpdateInfo = {
  repo: string;
  repoUrl: string;
  branch: string;
  currentCommit: null | string;
  currentShortCommit: null | string;
  remoteCommit: null | string;
  remoteShortCommit: null | string;
  status: "current" | "available" | "diverged" | "unknown";
  dirty: boolean;
  commits: SystemUpdateCommit[];
  checkedAt: string;
  error: null | string;
  updateRun: SystemUpdateRun;
};

export type ServiceOverview = {
  service: Service;
  deployments: Deployment[];
  env: EnvVar[];
  domains: Domain[];
  publicIp?: string;
};

export type GitHubRepo = {
  id: string;
  fullName: string;
  name: string;
  private: boolean;
  defaultBranch: string;
  updatedAt: string;
  cloneUrl: string;
};

export type GitHubDirectory = {
  path: string;
  name: string;
  depth: number;
  hasChildren: boolean;
};

export type GitHubStatus = {
  appConfigured: boolean;
  connected: boolean;
  installationCount: number;
  installed: boolean;
  installUrl: null | string;
  mode: "app" | "token" | "none";
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {})
    }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((payload as { error?: string }).error ?? "Request failed");
  }

  return payload as T;
}

export const api = {
  system: () => request<{ tools: ToolCheck[] }>("/api/system"),
  githubStatus: () => request<GitHubStatus>("/api/github/status"),
  githubRepos: (query = "") => request<{ repos: GitHubRepo[] }>(`/api/github/repos?q=${encodeURIComponent(query)}`),
  githubBranches: (repoFullName: string) => request<{ branches: string[] }>(`/api/github/branches?repo=${encodeURIComponent(repoFullName)}`),
  githubDirectories: (repoFullName: string, branch: string, path = "") =>
    request<{ directories: GitHubDirectory[] }>(
      `/api/github/directories?repo=${encodeURIComponent(repoFullName)}&branch=${encodeURIComponent(branch)}&path=${encodeURIComponent(path)}`
    ),
  projects: () => request<{ projects: ProjectCard[] }>("/api/projects"),
  project: (slug: string) => request<{ project: ProjectDetail }>(`/api/projects/${slug}`),
  createProject: (body: unknown) => request<{ project: ProjectDetail }>("/api/projects", { method: "POST", body: JSON.stringify(body) }),
  updateProject: (projectId: string, body: unknown) =>
    request<{ project: ProjectDetail }>(`/api/projects/${projectId}`, { method: "PATCH", body: JSON.stringify(body) }),
  createService: (projectId: string, body: unknown) =>
    request<{ service: Service }>(`/api/projects/${projectId}/services`, { method: "POST", body: JSON.stringify(body) }),
  deleteProject: (projectId: string) => request(`/api/projects/${projectId}`, { method: "DELETE" }),
  serviceOverview: (serviceId: string) => request<ServiceOverview>(`/api/services/${serviceId}/overview`),
  updateService: (serviceId: string, body: unknown) =>
    request<{ service: Service }>(`/api/services/${serviceId}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteService: (serviceId: string) => request(`/api/services/${serviceId}`, { method: "DELETE" }),
  createDeployment: (serviceId: string) =>
    request<{ deployment: Deployment }>(`/api/services/${serviceId}/deployments`, { method: "POST" }),
  abortDeployment: (deploymentId: string) =>
    request<{ accepted: boolean }>(`/api/deployments/${deploymentId}/abort`, { method: "POST" }),
  deploymentLogs: (deploymentId: string) => request<{ logs: DeploymentLog[] }>(`/api/deployments/${deploymentId}/logs`),
  upsertEnv: (serviceId: string, body: unknown) =>
    request(`/api/services/${serviceId}/env`, { method: "POST", body: JSON.stringify(body) }),
  deleteEnv: (serviceId: string, envId: string) => request(`/api/services/${serviceId}/env/${envId}`, { method: "DELETE" }),
  suggestionKeys: (serviceId: string) =>
    request<{ suggestions: Array<{ key: string; label: string }> }>(`/api/services/${serviceId}/suggestion-keys`),
  addDomain: (serviceId: string, body: unknown) =>
    request(`/api/services/${serviceId}/domains`, { method: "POST", body: JSON.stringify(body) }),
  deleteDomain: (serviceId: string, domainId: string) =>
    request(`/api/services/${serviceId}/domains/${domainId}`, { method: "DELETE" }),
  updateDomain: (serviceId: string, domainId: string, body: { hostname: string }) =>
    request(`/api/services/${serviceId}/domains/${domainId}`, { method: "PATCH", body: JSON.stringify(body) }),
  railwayProjects: (apiToken: string) =>
    request<{ projects: Array<{ id: string; name: string; description: string; serviceCount: number }> }>(
      "/api/integrations/railway/projects",
      { method: "POST", body: JSON.stringify({ apiToken }) }
    ),
  railwayProjectDetails: (apiToken: string, projectId: string) =>
    request<{
      details: {
        id: string;
        name: string;
        description: string;
        services: Array<{ id: string; name: string }>;
        environments: Array<{ id: string; name: string }>;
      };
    }>("/api/integrations/railway/project-details", {
      method: "POST",
      body: JSON.stringify({ apiToken, projectId })
    }),
  railwayImport: (apiToken: string, projectId: string, config?: unknown) =>
    request<{ ok: boolean; projectSlug: string }>("/api/integrations/railway/import", {
      method: "POST",
      body: JSON.stringify({ apiToken, projectId, config })
    }),
  systemSettings: () => request<{ settings: { rootDomain: string }; publicIp: string; dnsStatus?: "active" | "pending" }>("/api/system/settings"),
  updateSystemSettings: (body: { rootDomain: string }) =>
    request<{ ok: boolean; settings: { rootDomain: string } }>("/api/system/settings", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  systemUpdates: () => request<SystemUpdateInfo>("/api/system/updates"),
  applySystemUpdate: () =>
    request<{ ok: boolean; updateRun: SystemUpdateRun }>("/api/system/updates/apply", {
      method: "POST"
    })
};
