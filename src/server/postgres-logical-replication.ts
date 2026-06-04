import type { Service } from "./schema.js";

type BufferedDockerResult = {
  code: number | null;
  stdout: string;
  stderr: string;
};

type PostgresLogicalReplicationOptions = {
  service: Service;
  containerName: string;
  env: Record<string, string>;
  runDocker: (args: string[]) => Promise<void>;
  runBufferedDocker: (args: string[]) => Promise<BufferedDockerResult>;
  log: (line: string) => void;
};

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function postgresConnectionEnv(env: Record<string, string>) {
  return {
    user: env.POSTGRES_USER || "postgres",
    password: env.POSTGRES_PASSWORD || "",
    database: env.POSTGRES_DB || "aeroplane"
  };
}

function psqlDockerArgs(service: Service, containerName: string, env: Record<string, string>, sql: string) {
  const postgres = postgresConnectionEnv(env);
  return [
    "exec",
    "--env",
    `PGPASSWORD=${postgres.password}`,
    containerName,
    "psql",
    "-h",
    "127.0.0.1",
    "-p",
    String(service.internalPort),
    "-U",
    postgres.user,
    "-d",
    postgres.database,
    "-v",
    "ON_ERROR_STOP=1",
    "-X",
    "-q",
    "-t",
    "-A",
    "-c",
    sql
  ];
}

async function waitForPostgresReady({
  service,
  containerName,
  env,
  runBufferedDocker
}: PostgresLogicalReplicationOptions) {
  const postgres = postgresConnectionEnv(env);
  const startedAt = Date.now();
  let lastDetail = "";

  while (Date.now() - startedAt <= 30000) {
    const result = await runBufferedDocker([
      "exec",
      containerName,
      "pg_isready",
      "-h",
      "127.0.0.1",
      "-p",
      String(service.internalPort),
      "-U",
      postgres.user
    ]);
    if (result.code === 0) return;
    lastDetail = (result.stderr || result.stdout || `pg_isready exited with ${result.code}`).trim();
    await delay(500);
  }

  throw new Error(lastDetail || "Postgres did not become ready");
}

async function readPostgresSetting(options: PostgresLogicalReplicationOptions, setting: string) {
  const result = await options.runBufferedDocker(psqlDockerArgs(options.service, options.containerName, options.env, `SHOW ${setting};`));
  if (result.code !== 0) {
    throw new Error((result.stderr || result.stdout || `Could not read ${setting}`).trim());
  }
  return result.stdout.trim();
}

export async function ensurePostgresLogicalReplication(options: PostgresLogicalReplicationOptions) {
  if (!options.service.postgresLogicalReplicationEnabled) return;

  options.log("Preparing Postgres logical replication settings...");
  await waitForPostgresReady(options);

  const currentWalLevel = await readPostgresSetting(options, "wal_level");
  const currentSlots = Number(await readPostgresSetting(options, "max_replication_slots"));
  const currentSenders = Number(await readPostgresSetting(options, "max_wal_senders"));
  if (currentWalLevel === "logical" && currentSlots >= 10 && currentSenders >= 10) {
    options.log("Postgres logical replication is already enabled.");
    return;
  }

  await options.runDocker(psqlDockerArgs(options.service, options.containerName, options.env, "ALTER SYSTEM SET wal_level = 'logical';"));
  await options.runDocker(psqlDockerArgs(options.service, options.containerName, options.env, "ALTER SYSTEM SET max_replication_slots = '10';"));
  await options.runDocker(psqlDockerArgs(options.service, options.containerName, options.env, "ALTER SYSTEM SET max_wal_senders = '10';"));

  options.log("Restarting Postgres to activate logical replication settings...");
  await options.runDocker(["restart", options.containerName]);
  await waitForPostgresReady(options);

  const nextWalLevel = await readPostgresSetting(options, "wal_level");
  if (nextWalLevel !== "logical") {
    throw new Error(`Postgres wal_level is ${nextWalLevel || "unknown"} after restart, expected logical`);
  }

  options.log("Postgres logical replication is enabled.");
}
