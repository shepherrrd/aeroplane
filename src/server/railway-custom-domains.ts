import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, nowIso } from "./db.js";
import { domains } from "./schema.js";
import { fetchRailwayGraphQL } from "./railway-graphql.js";

type RailwayCustomDomain = {
  id: string;
  domain: string;
  targetPort?: number | string | null;
};

type RailwayServiceDomain = {
  id: string;
  domain: string;
  targetPort?: number | string | null;
};

export type RailwayServiceDomainInfo = {
  serviceDomains: RailwayServiceDomain[];
  customDomains: RailwayCustomDomain[];
};

function normalizeHostname(value: unknown) {
  if (typeof value !== "string") return null;
  const hostname = value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return hostname || null;
}

function existingDomain(hostname: string) {
  return db.select({ id: domains.id }).from(domains).where(eq(domains.hostname, hostname)).get();
}

async function graphqlTypeFields(token: string, typeName: string) {
  const query = `
    query TypeFields($typeName: String!) {
      __type(name: $typeName) {
        fields {
          name
        }
      }
    }
  `;
  const data = await fetchRailwayGraphQL(token, query, { typeName });
  const fields = data?.__type?.fields ?? [];
  const names = fields
    .map((field: { name?: string | null }) => field.name)
    .filter((name: string | null | undefined): name is string => Boolean(name));
  return new Set<string>(names);
}

function optionalFieldSelection(fields: Set<string>, fieldName: string) {
  return fields.has(fieldName) ? `          ${fieldName}` : "";
}

export async function getRailwayServiceDomainInfo(token: string, projectId: string, environmentId: string, serviceId: string) {
  const customDomainFields = await graphqlTypeFields(token, "CustomDomain").catch(() => new Set<string>());
  const customDomainTargetPortSelection = optionalFieldSelection(customDomainFields, "targetPort");
  const query = `
    query Domains($projectId: String!, $environmentId: String!, $serviceId: String!) {
      domains(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId) {
        serviceDomains {
          id
          domain
          targetPort
        }
        customDomains {
          id
          domain
${customDomainTargetPortSelection}
        }
      }
    }
  `;

  const data = await fetchRailwayGraphQL(token, query, { projectId, environmentId, serviceId });
  return {
    serviceDomains: (data?.domains?.serviceDomains ?? []) as RailwayServiceDomain[],
    customDomains: (data?.domains?.customDomains ?? []) as RailwayCustomDomain[]
  } satisfies RailwayServiceDomainInfo;
}

export function railwayServiceTargetPort(domainInfo: RailwayServiceDomainInfo | null | undefined) {
  for (const domain of [...(domainInfo?.serviceDomains ?? []), ...(domainInfo?.customDomains ?? [])]) {
    const port = Number(domain.targetPort);
    if (Number.isInteger(port) && port > 0 && port <= 65535) {
      return port;
    }
  }
  return null;
}

export async function importRailwayCustomDomains(input: {
  token: string;
  projectId: string;
  environmentId?: string | null;
  railwayServiceId: string;
  targetServiceId: string;
  domainInfo?: RailwayServiceDomainInfo | null;
}) {
  if (!input.environmentId) return [];

  const timestamp = nowIso();
  const domainInfo = input.domainInfo ?? await getRailwayServiceDomainInfo(input.token, input.projectId, input.environmentId, input.railwayServiceId);
  const imported: Array<{ id: string; hostname: string }> = [];

  for (const customDomain of domainInfo.customDomains) {
    const hostname = normalizeHostname(customDomain.domain);
    if (!hostname || existingDomain(hostname)) continue;

    const domain = {
      id: nanoid(10),
      serviceId: input.targetServiceId,
      hostname,
      status: "pending",
      createdAt: timestamp,
      updatedAt: timestamp
    };
    db.insert(domains).values(domain).run();
    imported.push({ id: domain.id, hostname });
  }

  return imported;
}
