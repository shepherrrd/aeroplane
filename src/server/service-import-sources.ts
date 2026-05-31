import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, nowIso } from "./db.js";
import { serviceImportSources, type ServiceImportSource } from "./schema.js";

type RecordServiceImportSourceInput = {
  serviceId: string;
  provider: "railway";
  externalProjectId?: string | null;
  externalEnvironmentId?: string | null;
  externalServiceId: string;
  externalServiceName?: string | null;
  metadata?: Record<string, unknown>;
};

export type PublicServiceImportSource = {
  id: string;
  serviceId: string;
  provider: string;
  externalProjectId: string | null;
  externalEnvironmentId: string | null;
  externalServiceId: string;
  externalServiceName: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

function parseMetadata(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function publicServiceImportSource(row: ServiceImportSource): PublicServiceImportSource {
  return {
    id: row.id,
    serviceId: row.serviceId,
    provider: row.provider,
    externalProjectId: row.externalProjectId,
    externalEnvironmentId: row.externalEnvironmentId,
    externalServiceId: row.externalServiceId,
    externalServiceName: row.externalServiceName,
    metadata: parseMetadata(row.metadata),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export function listServiceImportSources(serviceId: string) {
  return db
    .select()
    .from(serviceImportSources)
    .where(eq(serviceImportSources.serviceId, serviceId))
    .orderBy(desc(serviceImportSources.updatedAt))
    .all()
    .map(publicServiceImportSource);
}

export function getRailwayImportSource(serviceId: string) {
  return db
    .select()
    .from(serviceImportSources)
    .where(and(eq(serviceImportSources.serviceId, serviceId), eq(serviceImportSources.provider, "railway")))
    .orderBy(desc(serviceImportSources.updatedAt))
    .get() ?? null;
}

export function recordServiceImportSource(input: RecordServiceImportSourceInput) {
  const timestamp = nowIso();
  db.insert(serviceImportSources)
    .values({
      id: nanoid(10),
      serviceId: input.serviceId,
      provider: input.provider,
      externalProjectId: input.externalProjectId ?? null,
      externalEnvironmentId: input.externalEnvironmentId ?? null,
      externalServiceId: input.externalServiceId,
      externalServiceName: input.externalServiceName ?? null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      createdAt: timestamp,
      updatedAt: timestamp
    })
    .onConflictDoUpdate({
      target: [
        serviceImportSources.serviceId,
        serviceImportSources.provider,
        serviceImportSources.externalProjectId,
        serviceImportSources.externalEnvironmentId,
        serviceImportSources.externalServiceId
      ],
      set: {
        externalServiceName: input.externalServiceName ?? null,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
        updatedAt: timestamp
      }
    })
    .run();
}
