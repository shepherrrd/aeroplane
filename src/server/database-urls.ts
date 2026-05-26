import { randomBytes } from "node:crypto";
import type { Service } from "./schema.js";

type DatabaseServiceShape = Pick<Service, "repoUrl" | "repoFullName">;

type DatabaseUrlOptions = {
  dbType: string;
  envMap: Map<string, string>;
  host: string;
  port: number;
};

export function isDatabaseService(service: DatabaseServiceShape) {
  return service.repoUrl === "database" || (service.repoFullName?.startsWith("database:") ?? false);
}

export function databaseTypeForService(service: DatabaseServiceShape) {
  return service.repoFullName?.split(":")[1] || "postgres";
}

export function normalizeDatabaseType(value: string) {
  const lower = value.toLowerCase();
  if (lower.includes("mysql") || lower.includes("mariadb")) return "mysql";
  if (lower.includes("redis")) return "redis";
  if (lower.includes("mongo")) return "mongodb";
  if (lower.includes("clickhouse")) return "clickhouse";
  return "postgres";
}

export function defaultDatabasePort(dbType: string) {
  if (dbType === "mysql") return 3306;
  if (dbType === "redis") return 6379;
  if (dbType === "mongodb") return 27017;
  if (dbType === "clickhouse") return 8123;
  return 5432;
}

function generatedPassword() {
  return randomBytes(15).toString("base64url");
}

export function generatedDatabaseEnvVars(dbType: string): Record<string, string> {
  if (dbType === "mysql") {
    return {
      MYSQL_DATABASE: "aeroplane",
      MYSQL_USER: "mysql",
      MYSQL_PASSWORD: generatedPassword(),
      MYSQL_ROOT_PASSWORD: generatedPassword()
    };
  }

  if (dbType === "redis") {
    return {
      REDIS_PASSWORD: generatedPassword()
    };
  }

  if (dbType === "mongodb") {
    return {
      MONGO_INITDB_ROOT_USERNAME: "mongo",
      MONGO_INITDB_ROOT_PASSWORD: generatedPassword()
    };
  }

  if (dbType === "clickhouse") {
    return {
      CLICKHOUSE_DB: "aeroplane",
      CLICKHOUSE_USER: "clickhouse",
      CLICKHOUSE_PASSWORD: generatedPassword(),
      CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT: "1"
    };
  }

  return {
    POSTGRES_DB: "aeroplane",
    POSTGRES_USER: "postgres",
    POSTGRES_PASSWORD: generatedPassword()
  };
}

export function publicDatabaseUrlKey(dbType: string) {
  if (dbType === "mysql") return "MYSQL_PUBLIC_URL";
  if (dbType === "redis") return "REDIS_PUBLIC_URL";
  if (dbType === "mongodb") return "MONGODB_PUBLIC_URL";
  if (dbType === "clickhouse") return "CLICKHOUSE_PUBLIC_URL";
  return "POSTGRES_PUBLIC_URL";
}

export const publicDatabaseUrlKeys = [
  "DATABASE_PUBLIC_URL",
  "POSTGRES_PUBLIC_URL",
  "MYSQL_PUBLIC_URL",
  "REDIS_PUBLIC_URL",
  "MONGODB_PUBLIC_URL",
  "CLICKHOUSE_PUBLIC_URL"
];

export function buildDatabaseConnectionUrl({ dbType, envMap, host, port }: DatabaseUrlOptions) {
  if (dbType === "mysql") {
    const user = envMap.get("MYSQL_USER") || "mysql";
    const password = envMap.get("MYSQL_PASSWORD") || "";
    const dbName = envMap.get("MYSQL_DATABASE") || "aeroplane";
    return {
      key: "DATABASE_URL",
      value: `mysql://${user}:${password}@${host}:${port}/${dbName}`
    };
  }

  if (dbType === "redis") {
    const password = envMap.get("REDIS_PASSWORD") || "";
    return {
      key: "REDIS_URL",
      value: password ? `redis://:${password}@${host}:${port}` : `redis://${host}:${port}`
    };
  }

  if (dbType === "mongodb") {
    const user = envMap.get("MONGO_INITDB_ROOT_USERNAME") || "mongo";
    const password = envMap.get("MONGO_INITDB_ROOT_PASSWORD") || "";
    return {
      key: "MONGODB_URI",
      value: `mongodb://${user}:${password}@${host}:${port}/?authSource=admin`
    };
  }

  if (dbType === "clickhouse") {
    const user = envMap.get("CLICKHOUSE_USER") || "clickhouse";
    const password = envMap.get("CLICKHOUSE_PASSWORD") || "";
    const dbName = envMap.get("CLICKHOUSE_DB") || "aeroplane";
    return {
      key: "CLICKHOUSE_URL",
      value: `clickhouse://${user}:${password}@${host}:${port}/${dbName}`
    };
  }

  const user = envMap.get("POSTGRES_USER") || "postgres";
  const password = envMap.get("POSTGRES_PASSWORD") || "";
  const dbName = envMap.get("POSTGRES_DB") || "aeroplane";
  return {
    key: "DATABASE_URL",
    value: `postgresql://${user}:${password}@${host}:${port}/${dbName}`
  };
}
