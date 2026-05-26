import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, nowIso } from "./db.js";
import { services, envVars, projectGroups } from "./schema.js";
import { allocateHostPort } from "./deploy.js";
import { writeAndReloadCaddy } from "./caddy.js";
import { buildDatabaseConnectionUrl, defaultDatabasePort, generatedDatabaseEnvVars, normalizeDatabaseType } from "./database-urls.js";

async function fetchRailwayGraphQL(token: string, query: string, variables: any = {}) {
  const res = await fetch("https://backboard.railway.app/graphql/v2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ query, variables })
  });

  if (!res.ok) {
    throw new Error(`Railway GraphQL request failed: ${res.statusText}`);
  }

  const body = await res.json() as any;
  if (body.errors && body.errors.length > 0) {
    throw new Error(body.errors[0].message);
  }

  return body.data;
}

export async function getRailwayProjects(token: string) {
  const query = `
    query GetRailwayProjects {
      projects {
        edges {
          node {
            id
            name
            description
            services {
              edges {
                node {
                  id
                }
              }
            }
          }
        }
      }
    }
  `;

  const data = await fetchRailwayGraphQL(token, query);
  const edges = data?.projects?.edges ?? [];
  
  return edges.map((edge: any) => {
    const node = edge.node;
    const servicesEdges = node.services?.edges ?? [];
    return {
      id: node.id,
      name: node.name,
      description: node.description ?? "",
      serviceCount: servicesEdges.length
    };
  });
}

export async function getRailwayProjectDetails(token: string, railwayProjectId: string) {
  const query = `
    query GetRailwayProjectDetails($id: String!) {
      project(id: $id) {
        id
        name
        description
        services {
          edges {
            node {
              id
              name
            }
          }
        }
        environments {
          edges {
            node {
              id
              name
            }
          }
        }
      }
    }
  `;

  const data = await fetchRailwayGraphQL(token, query, { id: railwayProjectId });
  const project = data?.project;
  if (!project) {
    throw new Error("Railway project not found");
  }

  const services = (project.services?.edges ?? []).map((e: any) => ({
    id: e.node.id,
    name: e.node.name
  }));

  const environments = (project.environments?.edges ?? []).map((e: any) => ({
    id: e.node.id,
    name: e.node.name
  }));

  return {
    id: project.id,
    name: project.name,
    description: project.description ?? "",
    services,
    environments
  };
}

export interface ImportConfig {
  environmentId?: string;
  excludeRailwayVars?: boolean;
  importDatabases?: boolean;
  selectedServiceIds?: string[];
}

export async function importRailwayProject(token: string, railwayProjectId: string, config: ImportConfig) {
  const projectQuery = `
    query GetRailwayProjectDetails($id: String!) {
      project(id: $id) {
        id
        name
        description
        services {
          edges {
            node {
              id
              name
              repoTriggers {
                edges {
                  node {
                    repository
                    branch
                  }
                }
              }
            }
          }
        }
        environments {
          edges {
            node {
              id
              name
              serviceInstances {
                edges {
                  node {
                    serviceId
                    source {
                      repo
                      image
                    }
                    rootDirectory
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const projectData = await fetchRailwayGraphQL(token, projectQuery, { id: railwayProjectId });
  const rProject = projectData?.project;
  if (!rProject) {
    throw new Error("Railway project not found or token has insufficient permissions");
  }

  const servicesEdges = rProject.services?.edges ?? [];
  const environmentEdges = rProject.environments?.edges ?? [];
  
  // Use target environment if provided, otherwise default to first environment
  const targetEnvNode = config.environmentId
    ? environmentEdges.find((e: any) => e.node?.id === config.environmentId)?.node || environmentEdges[0]?.node
    : environmentEdges[0]?.node;
  const targetEnvId = targetEnvNode?.id;

  // Build serviceSourceMap from serviceInstances of the target environment
  const serviceSourceMap = new Map<string, { repo?: string; image?: string; rootDirectory?: string }>();
  if (targetEnvNode) {
    const instancesEdges = targetEnvNode.serviceInstances?.edges ?? [];
    for (const edge of instancesEdges) {
      const node = edge?.node;
      if (node && node.serviceId) {
        serviceSourceMap.set(node.serviceId, {
          repo: node.source?.repo || undefined,
          image: node.source?.image || undefined,
          rootDirectory: node.rootDirectory || undefined
        });
      }
    }
  }

  const timestamp = nowIso();
  const projectGroupId = nanoid(10);
  
  // Create project slug
  const baseSlug = rProject.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "project";
  let projectSlug = baseSlug;
  let counter = 1;
  while (db.select().from(projectGroups).where(eq(projectGroups.slug, projectSlug)).get()) {
    projectSlug = `${baseSlug}-${counter++}`;
  }

  // Create Project Group
  db.insert(projectGroups).values({
    id: projectGroupId,
    name: rProject.name,
    slug: projectSlug,
    description: rProject.description ?? null,
    createdAt: timestamp,
    updatedAt: timestamp
  }).run();

  for (const edge of servicesEdges) {
    const sNode = edge.node;
    const serviceName = sNode.name;
    const serviceId = sNode.id;

    // Filter services based on selection
    if (config.selectedServiceIds && !config.selectedServiceIds.includes(serviceId)) {
      continue;
    }

    let repoUrl = "";
    let repoFullName = "";
    let branch = "main";
    let internalPort = 8080;
    let isDatabase = false;

    let rootDir: string | null = null;

    // 1. Resolve from repoTriggers if available
    const triggersEdges = sNode.repoTriggers?.edges ?? [];
    const firstTrigger = triggersEdges[0]?.node;
    if (firstTrigger) {
      branch = firstTrigger.branch || "main";
      if (firstTrigger.repository) {
        repoFullName = firstTrigger.repository.replace("https://github.com/", "").replace(/\.git$/, "");
        repoUrl = firstTrigger.repository.startsWith("http") ? firstTrigger.repository : `https://github.com/${firstTrigger.repository}`;
      }
    }

    // 2. Resolve from serviceSourceMap (fallback for repo, or container image details)
    const sourceInfo = serviceSourceMap.get(serviceId);
    if (sourceInfo) {
      if (sourceInfo.rootDirectory) {
        rootDir = sourceInfo.rootDirectory;
      }
      if (sourceInfo.repo && !repoUrl) {
        repoFullName = sourceInfo.repo.replace("https://github.com/", "").replace(/\.git$/, "");
        repoUrl = sourceInfo.repo.startsWith("http") ? sourceInfo.repo : `https://github.com/${sourceInfo.repo}`;
      } else if (sourceInfo.image) {
        if (config.importDatabases === false) {
          continue; // Skip database container
        }
        isDatabase = true;
        const dbType = normalizeDatabaseType(sourceInfo.image);
        repoUrl = "database";
        repoFullName = `database:${dbType}`;
        internalPort = defaultDatabasePort(dbType);
      }
    }

    // Auto-detect database types from service name
    const lowercaseName = serviceName.toLowerCase();
    if (!repoUrl) {
      if (
        lowercaseName.includes("postgres") ||
        lowercaseName.includes("mysql") ||
        lowercaseName.includes("redis") ||
        lowercaseName.includes("mongo")
      ) {
        if (config.importDatabases === false) {
          continue; // Skip database container
        }
        isDatabase = true;
        repoUrl = "database";
        if (lowercaseName.includes("postgres")) {
          const dbType = "postgres";
          repoFullName = `database:${dbType}`;
          internalPort = defaultDatabasePort(dbType);
        } else if (lowercaseName.includes("mysql")) {
          const dbType = "mysql";
          repoFullName = `database:${dbType}`;
          internalPort = defaultDatabasePort(dbType);
        } else if (lowercaseName.includes("redis")) {
          const dbType = "redis";
          repoFullName = `database:${dbType}`;
          internalPort = defaultDatabasePort(dbType);
        } else if (lowercaseName.includes("mongo")) {
          const dbType = "mongodb";
          repoFullName = `database:${dbType}`;
          internalPort = defaultDatabasePort(dbType);
        }
      } else {
        // Fallback placeholder repo
        repoUrl = "https://github.com/railpack/railpack";
        repoFullName = "railpack/railpack";
      }
    }

    // Database imports are recreated with fresh Aeroplane-managed credentials.
    // Railway variables often point at Railway-only hosts and should not be copied.
    let fetchedVars: Record<string, string> = isDatabase
      ? generatedDatabaseEnvVars(repoFullName.split(":")[1] || "postgres")
      : {};
    if (!isDatabase && targetEnvId) {
      const varsQuery = `
        query GetVariables($projectId: String!, $environmentId: String!, $serviceId: String!) {
          variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId)
        }
      `;
      try {
        const varsData = await fetchRailwayGraphQL(token, varsQuery, {
          projectId: railwayProjectId,
          environmentId: targetEnvId,
          serviceId
        });
        fetchedVars = varsData?.variables ?? {};
      } catch {
        // Fallback to empty variables if query fails
      }
    }

    // Create unique service slug
    const baseServiceSlug = serviceName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "service";
    let serviceSlug = baseServiceSlug;
    let sCounter = 1;
    while (db.select().from(services).where(eq(services.slug, serviceSlug)).get()) {
      serviceSlug = `${baseServiceSlug}-${sCounter++}`;
    }

    const hostPort = allocateHostPort();
    const targetServiceId = nanoid(10);

    // Insert Service
    db.insert(services).values({
      id: targetServiceId,
      projectId: projectGroupId,
      slug: serviceSlug,
      name: serviceName,
      repoFullName: repoFullName || null,
      repoUrl,
      branch,
      rootDir,
      githubToken: null,
      webhookSecret: nanoid(24),
      installCommand: null,
      buildCommand: null,
      startCommand: null,
      staticOutput: null,
      internalPort,
      hostPort,
      activePort: null,
      databasePublicEnabled: false,
      databasePublicHostname: null,
      status: "idle",
      lastDeployedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp
    }).run();

    const variablesToInsert = { ...fetchedVars };
    if (isDatabase) {
      const dbType = repoFullName.split(":")[1] || "postgres";
      const envMap = new Map(Object.entries(fetchedVars));
      const connectionUrl = buildDatabaseConnectionUrl({
        dbType,
        envMap,
        host: serviceSlug,
        port: internalPort
      });
      variablesToInsert[connectionUrl.key] = connectionUrl.value;
    }

    // Insert app variables or generated database credentials
    for (const [key, value] of Object.entries(variablesToInsert)) {
      if (config.excludeRailwayVars && key.startsWith("RAILWAY_")) {
        continue; // Filter out system vars
      }
      db.insert(envVars).values({
        id: nanoid(10),
        serviceId: targetServiceId,
        key,
        value,
        createdAt: timestamp,
        updatedAt: timestamp
      }).run();
    }
  }

  // Trigger Caddy reload to map services
  await writeAndReloadCaddy();

  return { projectSlug };
}
