import { eq, inArray } from "drizzle-orm";
import { db } from "./db.js";
import { services, envVars } from "./schema.js";

type Service = typeof services.$inferSelect;

interface ResolveContext {
  currentService: Service;
  servicesBySlug: Map<string, Service>;
  envsByServiceId: Map<string, Map<string, string>>;
  resolving: Set<string>;
}

function getServiceProperty(service: Service, prop: string): string | null {
  const p = prop.toLowerCase();
  if (p === "hostport") return String(service.hostPort);
  if (p === "activeport") return String(service.activePort ?? service.hostPort);
  if (p === "internalport") return String(service.internalPort);
  if (p === "name") return service.name;
  if (p === "slug") return service.slug;
  if (p === "status") return service.status;
  return null;
}

function resolveExpression(expr: string, context: ResolveContext): string {
  const dotIndex = expr.indexOf(".");
  if (dotIndex !== -1) {
    const serviceSlug = expr.substring(0, dotIndex);
    const key = expr.substring(dotIndex + 1);

    let targetService: Service | undefined;
    if (serviceSlug === "self" || serviceSlug === "this") {
      targetService = context.currentService;
    } else {
      targetService = context.servicesBySlug.get(serviceSlug);
    }

    if (!targetService) {
      return "";
    }

    const propValue = getServiceProperty(targetService, key);
    if (propValue !== null) {
      return propValue;
    }

    return resolveEnvValue(targetService.id, key, context);
  } else {
    const propValue = getServiceProperty(context.currentService, expr);
    if (propValue !== null) {
      return propValue;
    }

    return resolveEnvValue(context.currentService.id, expr, context);
  }
}

function interpolateString(val: string, currentServiceId: string, context: ResolveContext): string {
  const regex = /\${([a-zA-Z0-9_.-]+)}/g;
  return val.replace(regex, (_match, expr) => {
    const oldCurrent = context.currentService;
    const targetService = db.select().from(services).where(eq(services.id, currentServiceId)).get();
    if (targetService) {
      context.currentService = targetService;
    }
    const resolved = resolveExpression(expr, context);
    context.currentService = oldCurrent;
    return resolved;
  });
}

function resolveEnvValue(serviceId: string, key: string, context: ResolveContext): string {
  const pathKey = `${serviceId}:${key}`;
  if (context.resolving.has(pathKey)) {
    return ""; 
  }

  const rawVal = context.envsByServiceId.get(serviceId)?.get(key);
  if (rawVal === undefined) {
    return "";
  }

  context.resolving.add(pathKey);
  const result = interpolateString(rawVal, serviceId, context);
  context.resolving.delete(pathKey);
  return result;
}

export function resolveServiceEnv(serviceId: string): Record<string, string> {
  const service = db.select().from(services).where(eq(services.id, serviceId)).get();
  if (!service) {
    return {};
  }

  const groupServices = db
    .select()
    .from(services)
    .where(eq(services.projectId, service.projectId))
    .all();

  const servicesBySlug = new Map<string, Service>();
  const serviceIds: string[] = [];
  for (const s of groupServices) {
    servicesBySlug.set(s.slug, s);
    serviceIds.push(s.id);
  }

  const allEnvs = serviceIds.length > 0
    ? db.select().from(envVars).where(inArray(envVars.serviceId, serviceIds)).all()
    : [];

  const envsByServiceId = new Map<string, Map<string, string>>();
  for (const sId of serviceIds) {
    envsByServiceId.set(sId, new Map<string, string>());
  }

  for (const row of allEnvs) {
    envsByServiceId.get(row.serviceId)?.set(row.key, row.value);
  }

  const context: ResolveContext = {
    currentService: service,
    servicesBySlug,
    envsByServiceId,
    resolving: new Set<string>()
  };

  const resolvedEnv: Record<string, string> = {};
  const localEnvs = envsByServiceId.get(serviceId);
  if (localEnvs) {
    for (const key of localEnvs.keys()) {
      resolvedEnv[key] = resolveEnvValue(serviceId, key, context);
    }
  }

  return resolvedEnv;
}
