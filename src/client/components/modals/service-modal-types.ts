export type ModalTab = "deployments" | "logs" | "environment" | "domains" | "settings";

export const modalTabs: ModalTab[] = ["deployments", "logs", "environment", "domains", "settings"];

export type ServiceFormPayload = {
  name: string;
  repoFullName: string;
  branch: string;
  rootDir?: string;
  internalPort: number;
  installCommand?: string;
  buildCommand?: string;
  startCommand?: string;
  staticOutput?: string;
  env?: Array<{
    key: string;
    value: string;
  }>;
};
