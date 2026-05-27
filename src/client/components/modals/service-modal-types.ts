export type ModalTab = "overview" | "deployments" | "logs" | "environment" | "domains" | "data" | "sql" | "settings";

export const modalTabs: ModalTab[] = ["overview", "deployments", "logs", "environment", "domains", "data", "sql", "settings"];

export type ServiceRouteTab = "overview" | "deployments" | "logs" | "variables" | "domains" | "data" | "console" | "settings";

export const serviceRouteTabs: ServiceRouteTab[] = ["overview", "deployments", "logs", "variables", "domains", "data", "console", "settings"];

export const modalTabToRouteSegment: Record<ModalTab, ServiceRouteTab> = {
  overview: "overview",
  deployments: "deployments",
  logs: "logs",
  environment: "variables",
  domains: "domains",
  data: "data",
  sql: "console",
  settings: "settings"
};

export function routeSegmentToModalTab(segment?: string): ModalTab {
  if (segment === "variables") return "environment";
  if (segment === "console") return "sql";
  if (segment && modalTabs.includes(segment as ModalTab)) return segment as ModalTab;
  return "overview";
}

export type ServiceFormPayload = {
  name: string;
  repoFullName: string;
  repoUrl?: string;
  branch: string;
  rootDir?: string;
  internalPort: number;
  installCommand?: string;
  buildCommand?: string;
  startCommand?: string;
  staticOutput?: string;
  databasePublicEnabled?: boolean;
  databasePublicHostname?: string;
  env?: Array<{
    key: string;
    value: string;
  }>;
};
