import { and, eq, inArray } from "drizzle-orm";
import { databaseTypeForService, isDatabaseService } from "./database-urls.js";
import { startRailwayPostgresDataImportJob } from "./database-data-imports.js";
import { db } from "./db.js";
import { enqueueDeployment, getServiceById } from "./deploy.js";
import { deployments } from "./schema.js";

type RailwayImportAutomationInput = {
  railwayToken: string;
  autoDeploy: boolean;
  importDatabaseData: boolean;
  databaseServiceIds: string[];
  appServiceIds: string[];
};

const deploymentInFlightStatuses = ["queued", "building"];

function delay(ms: number) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function inFlightDeploymentCount(deploymentIds: string[]) {
  if (deploymentIds.length === 0) return 0;
  return db
    .select({ id: deployments.id })
    .from(deployments)
    .where(and(inArray(deployments.id, deploymentIds), inArray(deployments.status, deploymentInFlightStatuses)))
    .all()
    .length;
}

async function waitForDeploymentsToSettle(deploymentIds: string[]) {
  while (inFlightDeploymentCount(deploymentIds) > 0) {
    await delay(2000);
  }
}

function serviceReadyForRailwayDataImport(serviceId: string) {
  const service = getServiceById(serviceId);
  if (!service || !isDatabaseService(service)) return false;
  return service.status === "active" && databaseTypeForService(service) === "postgres";
}

function queueDeployments(serviceIds: string[]) {
  return serviceIds.map((serviceId) => enqueueDeployment(serviceId, { trigger: "manual" }));
}

async function runRailwayImportAutomation(input: RailwayImportAutomationInput) {
  let databaseDeploymentIds: string[] = [];

  if (input.autoDeploy && input.databaseServiceIds.length > 0) {
    databaseDeploymentIds = queueDeployments(input.databaseServiceIds).map((deployment) => deployment.id);
    await waitForDeploymentsToSettle(databaseDeploymentIds);
  }

  if (input.importDatabaseData) {
    for (const serviceId of input.databaseServiceIds) {
      if (!serviceReadyForRailwayDataImport(serviceId)) continue;
      startRailwayPostgresDataImportJob(serviceId, input.railwayToken);
    }
  }

  if (input.autoDeploy && input.appServiceIds.length > 0) {
    queueDeployments(input.appServiceIds);
  }
}

export function startRailwayImportAutomation(input: RailwayImportAutomationInput) {
  if (!input.autoDeploy && !input.importDatabaseData) {
    return;
  }

  void runRailwayImportAutomation(input).catch((error) => {
    console.error("Railway import automation failed:", error);
  });
}
