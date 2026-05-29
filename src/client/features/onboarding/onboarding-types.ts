export type OnboardingForm = {
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
  ownerPasswordConfirm: string;
  secretKey: string;
  dataDir: string;
  deployDryRun: boolean;
  caddyConfigPath: string;
  caddyReloadCmd: string;
  port: string;
  publicUrl: string;
  hostPortStart: string;
  hostPortEnd: string;
  buildkitHost: string;
  runtimeNetworkName: string;
  githubAccessToken: string;
  githubAppId: string;
  githubAppClientId: string;
  githubAppSlug: string;
  githubAppPrivateKey: string;
  githubWebhookSecret: string;
  rootDomain: string;
  r2AccountId: string;
  r2Bucket: string;
  r2AccessKeyId: string;
  r2SecretAccessKey: string;
  r2CreateBucket: boolean;
};

export const defaultOnboardingForm: OnboardingForm = {
  ownerName: "",
  ownerEmail: "",
  ownerPassword: "",
  ownerPasswordConfirm: "",
  secretKey: "",
  dataDir: "./data",
  deployDryRun: false,
  caddyConfigPath: "./data/Caddyfile",
  caddyReloadCmd: "caddy reload --config ./data/Caddyfile",
  port: "4310",
  publicUrl: "http://localhost:5173",
  hostPortStart: "4100",
  hostPortEnd: "4999",
  buildkitHost: "tcp://127.0.0.1:1234",
  runtimeNetworkName: "aeroplane-runtime",
  githubAccessToken: "",
  githubAppId: "",
  githubAppClientId: "",
  githubAppSlug: "",
  githubAppPrivateKey: "",
  githubWebhookSecret: "",
  rootDomain: "",
  r2AccountId: "",
  r2Bucket: "",
  r2AccessKeyId: "",
  r2SecretAccessKey: "",
  r2CreateBucket: true
};
