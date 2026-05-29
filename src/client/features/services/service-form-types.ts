export type ServiceFormPayload = {
  name: string;
  repoFullName?: string | null;
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
