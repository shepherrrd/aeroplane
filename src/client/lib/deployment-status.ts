import type { Deployment } from "../api";

export function deploymentIsPending(status: null | string | undefined) {
  return status === "queued" || status === "building";
}

export function serviceIsDeploying(status: null | string | undefined) {
  return deploymentIsPending(status);
}

export function displayDeploymentStatus(status: string) {
  if (status === "running") return "current";
  if (status === "superseded") return "success";
  return status;
}

export function deploymentStatusLabel(status: null | string | undefined) {
  if (status === "queued") return "Queued";
  if (status === "building") return "Building";
  if (status === "running") return "Current";
  if (status === "superseded") return "Superseded";
  if (status === "failed") return "Failed";
  if (status === "aborted") return "Aborted";
  return status ?? "Unknown";
}

export function mergeDeploymentList(deployments: Deployment[], deployment: Deployment) {
  return [
    deployment,
    ...deployments.filter((item) => item.id !== deployment.id)
  ];
}
