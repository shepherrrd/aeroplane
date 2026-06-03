import { desc, eq } from "drizzle-orm";
import { db } from "./db.js";
import { deployments, type Service } from "./schema.js";

export type DatabaseRuntimeState = "ready" | "deploying" | "idle" | "failed" | "unavailable";

export type DatabaseRuntimeNotice = {
  runtimeState: Exclude<DatabaseRuntimeState, "ready">;
  message: string;
  serviceStatus: string;
  deploymentStatus: string | null;
};

export class DatabaseRuntimeUnavailableError extends Error {
  readonly notice: DatabaseRuntimeNotice;

  constructor(notice: DatabaseRuntimeNotice) {
    super(notice.message);
    this.name = "DatabaseRuntimeUnavailableError";
    this.notice = notice;
  }
}

function latestDeploymentStatus(serviceId: string) {
  return db
    .select({ status: deployments.status })
    .from(deployments)
    .where(eq(deployments.serviceId, serviceId))
    .orderBy(desc(deployments.createdAt))
    .limit(1)
    .get()?.status ?? null;
}

function notice(service: Service, runtimeState: DatabaseRuntimeNotice["runtimeState"], message: string, deploymentStatus: string | null): DatabaseRuntimeNotice {
  return {
    runtimeState,
    message,
    serviceStatus: service.status,
    deploymentStatus
  };
}

export function databaseRuntimeNoticeForService(service: Service): DatabaseRuntimeNotice | null {
  const deploymentStatus = latestDeploymentStatus(service.id);
  const deploymentIsPending = deploymentStatus === "queued" || deploymentStatus === "building";

  if (service.status === "building" || (service.status !== "active" && deploymentIsPending)) {
    const message = deploymentStatus === "queued"
      ? "Database deployment is queued. Data will be available once provisioning starts and the container is running."
      : "Database is deploying. Data will be available once the container is running.";
    return notice(service, "deploying", message, deploymentStatus);
  }

  if (service.status === "idle") {
    return notice(service, "idle", "Database is idle. Deploy this service before browsing its data.", deploymentStatus);
  }

  if (service.status === "failed") {
    return notice(service, "failed", "Database deployment failed. Check the deployment logs, then retry the deployment.", deploymentStatus);
  }

  return null;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isContainerUnavailableError(message: string) {
  return /no such container|container .* is not running|container .* is paused/i.test(message);
}

function isDatabaseStartingError(message: string) {
  return /connection refused|the database system is starting up|database system is not yet accepting connections|can't connect to .*server|lost connection to .*server/i.test(message);
}

export function databaseRuntimeNoticeForError(service: Service, error: unknown): DatabaseRuntimeNotice | null {
  const message = errorMessage(error);
  if (isContainerUnavailableError(message)) {
    return databaseRuntimeNoticeForService(service) ?? notice(
      service,
      "unavailable",
      "Database runtime is unavailable. Deploy or refresh the service, then try again.",
      latestDeploymentStatus(service.id)
    );
  }

  if (isDatabaseStartingError(message)) {
    return notice(
      service,
      "deploying",
      "Database is still starting. Data will be available once the engine accepts connections.",
      latestDeploymentStatus(service.id)
    );
  }

  return null;
}

export function databaseRuntimeErrorForService(service: Service, error: unknown) {
  const runtimeNotice = databaseRuntimeNoticeForError(service, error);
  return runtimeNotice ? new DatabaseRuntimeUnavailableError(runtimeNotice) : error;
}
