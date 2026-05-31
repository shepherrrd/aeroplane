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
  databasePublicEnabled: boolean;
  databasePublicHostname: null | string;
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

export type DatabaseRowValue = null | boolean | number | string;

export type DatabaseRow = Record<string, DatabaseRowValue>;

export type DatabaseTable = {
  id: string;
  schema: string;
  name: string;
  rowCount: number | null;
};

export type DatabaseColumn = {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
};

export type DatabaseFilterOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "is_empty"
  | "is_not_empty"
  | "greater_than"
  | "less_than";

export type DatabaseRowFilter = {
  column: string;
  operator: DatabaseFilterOperator;
  value: string;
};

export type DatabaseTablesResponse = {
  engine: string;
  supported: boolean;
  editable: boolean;
  tables: DatabaseTable[];
  message?: string;
};

export type DatabaseRowsResponse = {
  engine: string;
  editable: boolean;
  table: string;
  columns: DatabaseColumn[];
  rows: DatabaseRow[];
  limit: number;
  offset: number;
  totalRows: number;
};

export type DatabaseQueryResult = {
  engine: string;
  columns: string[];
  rows: DatabaseRow[];
  rowCount: number;
  message?: string;
  elapsedMs: number;
};

export type R2SettingsStatus = {
  connected: boolean;
  accountId: string;
  bucket: string;
  endpoint: string;
  accessKeyIdSuffix: string;
  connectedAt: null | string;
  updatedAt: null | string;
};

export type DatabaseBackup = {
  id: string;
  serviceId: string;
  engine: string;
  status: "running" | "succeeded" | "failed";
  storage: "disk" | "disk+r2";
  format: string;
  localPath: null | string;
  fileName: null | string;
  r2Key: null | string;
  sizeBytes: null | number;
  checksum: null | string;
  error: null | string;
  createdAt: string;
  startedAt: null | string;
  finishedAt: null | string;
};

export type ServiceImportSource = {
  id: string;
  serviceId: string;
  provider: string;
  externalProjectId: null | string;
  externalEnvironmentId: null | string;
  externalServiceId: string;
  externalServiceName: null | string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type PostgresDataImportResult = {
  ok: true;
  serviceId: string;
  source: "postgres-url" | "railway";
  sourceLabel: string;
  sourceVariableKey?: string;
  dumpSizeBytes: number;
  checksum: string;
  importedAt: string;
};

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export type AuthStatus = {
  setupComplete: boolean;
  authenticated: boolean;
  user: AuthUser | null;
  secretKeyConfigured: boolean;
  envPath: string;
  publicIp?: string;
  runtimeConfig?: {
    dataDir: string;
    deployDryRun: boolean;
    caddyConfigPath: string;
    caddyReloadCmd: string;
    port: number;
    publicUrl: string;
    controlPlaneHostname: string;
    buildkitHost: string;
    runtimeNetworkName: string;
  };
};

export type OnboardingPayload = {
  owner: {
    name: string;
    email: string;
    password: string;
  };
  env: {
    secretKey?: string;
    dataDir: string;
    deployDryRun: boolean;
    caddyConfigPath: string;
    caddyReloadCmd: string;
    port: number;
    publicUrl: string;
    controlPlaneHostname?: string;
    buildkitHost: string;
    runtimeNetworkName: string;
    githubAccessToken?: string;
    githubAppId?: string;
    githubAppClientId?: string;
    githubAppSlug?: string;
    githubAppPrivateKey?: string;
    githubWebhookSecret?: string;
  };
  rootDomain?: string;
  r2?: {
    accountId?: string;
    bucket?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    createBucket?: boolean;
  };
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
  installType: "git" | "image";
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
  updateCommand: null | string;
  canApplyUpdate: boolean;
};

export type MaintenanceCleanupTarget =
  | "docker-containers"
  | "docker-images"
  | "docker-build-cache"
  | "docker-volumes"
  | "apt-cache"
  | "journals"
  | "build-artifacts";

export type MaintenanceCommandResult = {
  label: string;
  ok: boolean;
  output: string;
};

export type MaintenanceDiskMetric = {
  mount: string;
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  usedPercent: number;
};

export type MaintenancePathMetric = {
  id: string;
  label: string;
  path: string;
  bytes: number | null;
  available: boolean;
  error: string | null;
};

export type MaintenanceDockerMetric = {
  type: string;
  totalCount: number | null;
  activeCount: number | null;
  sizeBytes: number | null;
  reclaimableBytes: number | null;
  rawSize: string;
  rawReclaimable: string;
};

export type MaintenanceHistoryPoint = {
  checkedAt: string;
  diskUsedPercent: number | null;
  dockerReclaimableBytes: number | null;
  buildArtifactsBytes: number | null;
};

export type SystemMaintenanceInfo = {
  checkedAt: string;
  disk: MaintenanceDiskMetric | null;
  docker: {
    available: boolean;
    error: string | null;
    rows: MaintenanceDockerMetric[];
    reclaimableBytes: number;
  };
  paths: MaintenancePathMetric[];
  history: MaintenanceHistoryPoint[];
  alerts: string[];
};

export type SystemMaintenanceCleanupResult = {
  ok: boolean;
  commands: MaintenanceCommandResult[];
  info: SystemMaintenanceInfo;
};

export type MigrationImportResult = {
  importedAt: string;
  projects: number;
  services: number;
  users: number;
  restoredDatabases: number;
  databaseDumps: Array<{
    serviceId: string;
    engine: string;
    format: string;
    path: string;
    sizeBytes: number;
    checksum: string;
  }>;
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

export type GitHubSettingsStatus = {
  status: GitHubStatus;
  statusError: string;
  settings: {
    githubAccessTokenSuffix: string;
    githubAppId: string;
    githubAppClientId: string;
    githubAppSlug: string;
    githubAppPrivateKeyConfigured: boolean;
    githubWebhookSecretSuffix: string;
    envPath: string;
  };
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
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

async function requestJsonError(response: Response, fallback: string) {
  const payload = await response.json().catch(() => ({}));
  return new Error((payload as { error?: string }).error ?? fallback);
}

function downloadFile(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  authStatus: () => request<AuthStatus>("/api/auth/status"),
  login: (body: { email: string; password: string }) =>
    request<{ ok: boolean; user: AuthUser }>("/api/auth/login", { method: "POST", body: JSON.stringify(body) }),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  setup: (body: OnboardingPayload) =>
    request<{ ok: boolean; user: AuthUser; envPath: string; restartRequired: boolean }>("/api/auth/setup", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  restartOnboarding: (body: Omit<OnboardingPayload, "owner">) =>
    request<{ ok: boolean; envPath: string; restartRequired: boolean }>("/api/system/onboarding/restart", {
      method: "POST",
      body: JSON.stringify(body)
    }),
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
  databaseTables: (serviceId: string, logicalDatabase?: number) => {
    const suffix = logicalDatabase === undefined ? "" : `?database=${encodeURIComponent(String(logicalDatabase))}`;
    return request<DatabaseTablesResponse>(`/api/services/${serviceId}/database/tables${suffix}`);
  },
  databaseRows: (serviceId: string, table: string, limit = 50, offset = 0, filters: DatabaseRowFilter[] = []) => {
    const params = new URLSearchParams({
      table,
      limit: String(limit),
      offset: String(offset)
    });
    if (filters.length > 0) params.set("filters", JSON.stringify(filters));
    return request<DatabaseRowsResponse>(`/api/services/${serviceId}/database/rows?${params.toString()}`);
  },
  databaseQuery: (serviceId: string, sql: string) =>
    request<DatabaseQueryResult>(`/api/services/${serviceId}/database/query`, {
      method: "POST",
      body: JSON.stringify({ sql })
    }),
  insertDatabaseRow: (serviceId: string, body: { table: string; values: DatabaseRow }) =>
    request<{ ok: boolean; table?: string; id?: string }>(`/api/services/${serviceId}/database/rows`, { method: "POST", body: JSON.stringify(body) }),
  updateDatabaseRow: (serviceId: string, body: { table: string; primaryKey: DatabaseRow; values: DatabaseRow }) =>
    request(`/api/services/${serviceId}/database/rows`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteDatabaseRow: (serviceId: string, body: { table: string; primaryKey: DatabaseRow }) =>
    request(`/api/services/${serviceId}/database/rows`, { method: "DELETE", body: JSON.stringify(body) }),
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
  systemSettings: () =>
    request<{
      settings: { rootDomain: string; controlPlaneHostname: string };
      publicIp: string;
      dnsStatus?: "active" | "pending";
      controlPlaneDnsStatus?: "active" | "pending";
    }>("/api/system/settings"),
  updateSystemSettings: (body: { rootDomain?: string; controlPlaneHostname?: string }) =>
    request<{ ok: boolean; settings: { rootDomain: string; controlPlaneHostname: string }; caddy?: { ok: boolean; detail: string } }>("/api/system/settings", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  r2Settings: () => request<{ r2: R2SettingsStatus }>("/api/system/r2"),
  updateR2Settings: (body: {
    accountId: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey?: string;
    createBucket?: boolean;
  }) =>
    request<{ ok: boolean; r2: R2SettingsStatus }>("/api/system/r2", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  disconnectR2: () => request<{ ok: boolean; r2: R2SettingsStatus }>("/api/system/r2", { method: "DELETE" }),
  githubSettings: () => request<GitHubSettingsStatus>("/api/system/github"),
  updateGithubSettings: (body: {
    githubAccessToken?: string;
    githubAppId?: string;
    githubAppClientId?: string;
    githubAppSlug?: string;
    githubAppPrivateKey?: string;
    githubWebhookSecret?: string;
  }) =>
    request<{ ok: boolean } & GitHubSettingsStatus>("/api/system/github", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  disconnectGithub: () => request<{ ok: boolean } & GitHubSettingsStatus>("/api/system/github", { method: "DELETE" }),
  systemUpdates: () => request<SystemUpdateInfo>("/api/system/updates"),
  applySystemUpdate: () =>
    request<{ ok: boolean; updateRun: SystemUpdateRun }>("/api/system/updates/apply", {
      method: "POST"
    }),
  systemMaintenance: () => request<SystemMaintenanceInfo>("/api/system/maintenance"),
  runSystemMaintenanceCleanup: (targets: MaintenanceCleanupTarget[]) =>
    request<SystemMaintenanceCleanupResult>("/api/system/maintenance/cleanup", {
      method: "POST",
      body: JSON.stringify({ targets })
    }),
  exportMigrationBundle: async (passphrase: string) => {
    const response = await fetch("/api/system/migration/export", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passphrase })
    });
    if (!response.ok) throw await requestJsonError(response, "Could not export migration bundle");

    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") ?? "";
    const fileName = disposition.match(/filename="([^"]+)"/)?.[1] ?? "aeroplane-export.aeroplane";
    downloadFile(blob, fileName);
    return { fileName, sizeBytes: blob.size };
  },
  importMigrationBundle: async (bundle: File, passphrase: string) => {
    const form = new FormData();
    form.set("bundle", bundle);
    form.set("passphrase", passphrase);
    const response = await fetch("/api/auth/migration/import", {
      method: "POST",
      credentials: "same-origin",
      body: form
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error((payload as { error?: string }).error ?? "Could not import migration bundle");
    }
    return payload as {
      ok: boolean;
      result: MigrationImportResult;
      user: AuthUser | null;
      queuedDeployments: string[];
      restartRequired: boolean;
    };
  },
  databaseBackups: (serviceId: string) =>
    request<{ backups: DatabaseBackup[]; r2: R2SettingsStatus }>(`/api/services/${serviceId}/database/backups`),
  createDatabaseBackup: (serviceId: string, storage: "disk" | "disk+r2") =>
    request<{ backup: DatabaseBackup }>(`/api/services/${serviceId}/database/backups`, {
      method: "POST",
      body: JSON.stringify({ storage })
    }),
  deleteDatabaseBackup: (serviceId: string, backupId: string) =>
    request<{ ok: boolean }>(`/api/services/${serviceId}/database/backups/${backupId}`, { method: "DELETE" }),
  databaseBackupDownloadUrl: (serviceId: string, backupId: string) =>
    `/api/services/${serviceId}/database/backups/${backupId}/download`,
  serviceImportSources: (serviceId: string) =>
    request<{ sources: ServiceImportSource[] }>(`/api/services/${serviceId}/import-sources`),
  importPostgresDataFromUrl: (serviceId: string, sourceUrl: string) =>
    request<{ result: PostgresDataImportResult }>(`/api/services/${serviceId}/database/import/postgres-url`, {
      method: "POST",
      body: JSON.stringify({ sourceUrl })
    }),
  importPostgresDataFromRailway: (serviceId: string, apiToken: string) =>
    request<{ result: PostgresDataImportResult }>(`/api/services/${serviceId}/database/import/railway`, {
      method: "POST",
      body: JSON.stringify({ apiToken })
    })
};
