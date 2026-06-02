import { eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { buildDatabaseConnectionUrl, databaseTypeForService, isDatabaseService } from "./database-urls.js";
import { db, nowIso } from "./db.js";
import { envVars, services } from "./schema.js";

export type DatabaseConnectionEnvSuggestion = {
  key: string;
  sourceKey: string;
  value: string;
  label: string;
  serviceId: string;
  serviceName: string;
  serviceSlug: string;
  dbType: string;
};

function upsertEnvVar(serviceId: string, key: string, value: string, timestamp = nowIso()) {
  db.insert(envVars)
    .values({
      id: nanoid(10),
      serviceId,
      key,
      value,
      createdAt: timestamp,
      updatedAt: timestamp
    })
    .onConflictDoUpdate({
      target: [envVars.serviceId, envVars.key],
      set: { value, updatedAt: timestamp }
    })
    .run();
}

function mapEnvRows(serviceIds: string[]) {
  const envsByServiceId = new Map<string, Map<string, string>>();
  for (const serviceId of serviceIds) {
    envsByServiceId.set(serviceId, new Map());
  }

  const rows = serviceIds.length > 0
    ? db.select().from(envVars).where(inArray(envVars.serviceId, serviceIds)).all()
    : [];

  for (const row of rows) {
    envsByServiceId.get(row.serviceId)?.set(row.key, row.value);
  }

  return envsByServiceId;
}

function databaseConnectionSuggestionKey(dbType: string, primaryKey: string) {
  if (dbType === "mongodb") return "MONGO_URI";
  return primaryKey;
}

function databaseConnectionEnvSuggestionsForProjectServices(projectId: string, excludeServiceId?: string) {
  const projectServices = db.select().from(services).where(eq(services.projectId, projectId)).all();
  const databaseServices = projectServices.filter((projectService) => projectService.id !== excludeServiceId && isDatabaseService(projectService));
  if (databaseServices.length === 0) return [];

  const envsByServiceId = mapEnvRows(databaseServices.map((databaseService) => databaseService.id));
  const suggestions: DatabaseConnectionEnvSuggestion[] = [];

  for (const databaseService of databaseServices) {
    const dbType = databaseTypeForService(databaseService);
    const envMap = envsByServiceId.get(databaseService.id) ?? new Map<string, string>();
    const connectionUrl = buildDatabaseConnectionUrl({
      dbType,
      envMap,
      host: databaseService.slug,
      port: databaseService.internalPort
    });

    suggestions.push({
      key: databaseConnectionSuggestionKey(dbType, connectionUrl.key),
      sourceKey: connectionUrl.key,
      value: connectionUrl.value,
      label: `${databaseService.name} ${dbType} connection`,
      serviceId: databaseService.id,
      serviceName: databaseService.name,
      serviceSlug: databaseService.slug,
      dbType
    });
  }

  return suggestions;
}

export function databaseConnectionEnvSuggestionsForProject(projectId: string) {
  return databaseConnectionEnvSuggestionsForProjectServices(projectId);
}

export function databaseConnectionEnvSuggestionsForService(serviceId: string) {
  const service = db.select().from(services).where(eq(services.id, serviceId)).get();
  if (!service) return [];
  return databaseConnectionEnvSuggestionsForProjectServices(service.projectId, service.id);
}

export function syncProjectDatabaseConnectionEnv(projectId: string) {
  const projectServices = db.select().from(services).where(eq(services.projectId, projectId)).all();
  const databaseServices = projectServices.filter((service) => isDatabaseService(service));
  if (databaseServices.length === 0) {
    return { linked: 0 };
  }

  const timestamp = nowIso();
  const serviceIds = projectServices.map((service) => service.id);
  const envsByServiceId = mapEnvRows(serviceIds);
  let synced = 0;

  for (const databaseService of databaseServices) {
    const dbType = databaseTypeForService(databaseService);
    const envMap = envsByServiceId.get(databaseService.id) ?? new Map<string, string>();
    const connectionUrl = buildDatabaseConnectionUrl({
      dbType,
      envMap,
      host: databaseService.slug,
      port: databaseService.internalPort
    });

    if (envMap.get(connectionUrl.key) !== connectionUrl.value) {
      upsertEnvVar(databaseService.id, connectionUrl.key, connectionUrl.value, timestamp);
      envMap.set(connectionUrl.key, connectionUrl.value);
      synced += 1;
    }
  }

  return { linked: 0, synced };
}
