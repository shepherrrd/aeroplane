import {
  columnsFromRows,
  filterRowsInMemory,
  paginateRows,
  runDockerExec,
  type DatabaseColumn,
  type DatabaseContext,
  type DatabaseRowFilter,
  type DatabaseTable,
  type RowData
} from "./database-viewer-shared.js";

type RedisKeyTarget = {
  key: string;
  database: number;
};

export function redisDatabase(value: unknown) {
  const database = Number(value ?? 0);
  if (!Number.isInteger(database) || database < 0 || database > 255) throw new Error("Redis database must be a number between 0 and 255");
  return database;
}

function redisKeyId(key: string, database = 0) {
  return `redis:${database}:${Buffer.from(key).toString("base64url")}`;
}

function redisKeyTargetFromId(id: string): RedisKeyTarget {
  if (!id.startsWith("redis:")) throw new Error("Invalid Redis key");
  const payload = id.slice("redis:".length);
  const separator = payload.indexOf(":");
  if (separator > 0) {
    const database = payload.slice(0, separator);
    if (/^\d+$/.test(database)) {
      return {
        database: redisDatabase(database),
        key: Buffer.from(payload.slice(separator + 1), "base64url").toString()
      };
    }
  }
  return { database: 0, key: Buffer.from(payload, "base64url").toString() };
}

function parseLines(output: string) {
  if (!output) return [];
  return output.split(/\r?\n/).filter((line) => line.length > 0);
}

function redisTargetForInsert(table: string, values: RowData): RedisKeyTarget {
  const explicitKey = String(values.key ?? "").trim();
  if (table.startsWith("redis:")) {
    const target = redisKeyTargetFromId(table);
    return { key: explicitKey || target.key, database: target.database };
  }
  return {
    key: explicitKey,
    database: redisDatabase(values.logicalDatabase ?? values.redisDatabase ?? values.database ?? 0)
  };
}

function redisTargetForDelete(table: string, primaryKey: RowData): RedisKeyTarget {
  const explicitKey = String(primaryKey.key ?? "").trim();
  if (table.startsWith("redis:")) {
    const target = redisKeyTargetFromId(table);
    return { key: explicitKey || target.key, database: target.database };
  }
  return {
    key: explicitKey,
    database: redisDatabase(primaryKey.logicalDatabase ?? primaryKey.redisDatabase ?? primaryKey.database ?? 0)
  };
}

function redisTargetForUpdate(table: string, primaryKey: RowData): RedisKeyTarget {
  const explicitKey = String(primaryKey.key ?? "").trim();
  if (table.startsWith("redis:")) {
    const target = redisKeyTargetFromId(table);
    return { key: explicitKey || target.key, database: target.database };
  }
  return {
    key: explicitKey,
    database: redisDatabase(primaryKey.logicalDatabase ?? primaryKey.redisDatabase ?? primaryKey.database ?? 0)
  };
}

function redisValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function hasRedisField(row: RowData, field: string) {
  return Object.prototype.hasOwnProperty.call(row, field);
}

async function applyRedisTtl(ctx: DatabaseContext, key: string, values: RowData, database: number) {
  const ttl = Number(values.ttl ?? values.expiresIn ?? 0);
  if (Number.isFinite(ttl) && ttl > 0) {
    await runRedis(ctx, ["EXPIRE", key, String(Math.floor(ttl))], database);
  }
}

export async function runRedis(ctx: DatabaseContext, args: string[], database = 0) {
  const password = ctx.envMap.get("REDIS_PASSWORD") || "";
  const authIsNotConfigured = (text: string) => text.toLowerCase().includes("without any password configured");
  const command = (withPassword: boolean) => [
    "redis-cli",
    "--no-auth-warning",
    "-h",
    "127.0.0.1",
    "-p",
    String(ctx.service.internalPort),
    "-n",
    String(redisDatabase(database)),
    ...(withPassword && password ? ["-a", password] : []),
    "--raw",
    ...args
  ];

  try {
    const result = await runDockerExec(ctx.containerName, command(true));
    if (password && authIsNotConfigured(`${result.stderr}\n${result.stdout}`)) {
      const retry = await runDockerExec(ctx.containerName, command(false));
      return retry.stdout.trimEnd();
    }
    return result.stdout.trimEnd();
  } catch (error) {
    if (password && error instanceof Error && (authIsNotConfigured(error.message) || error.message.toLowerCase().includes("auth"))) {
      const result = await runDockerExec(ctx.containerName, command(false));
      return result.stdout.trimEnd();
    }
    throw error;
  }
}

async function redisKeyType(ctx: DatabaseContext, key: string, database: number) {
  return (await runRedis(ctx, ["TYPE", key], database)).trim() || "none";
}

async function redisKeyCount(ctx: DatabaseContext, key: string, type: string, database: number) {
  try {
    if (type === "string") return 1;
    if (type === "list") return Number(await runRedis(ctx, ["LLEN", key], database));
    if (type === "set") return Number(await runRedis(ctx, ["SCARD", key], database));
    if (type === "zset") return Number(await runRedis(ctx, ["ZCARD", key], database));
    if (type === "hash") return Number(await runRedis(ctx, ["HLEN", key], database));
    if (type === "stream") return Number(await runRedis(ctx, ["XLEN", key], database));
  } catch {
    return null;
  }
  return null;
}

function baseColumns(rows: RowData[], preferredNames: string[]) {
  return columnsFromRows(rows, preferredNames).map((column) => ({
    ...column,
    primaryKey: column.name === "key" || column.name === "field" || column.name === "index" || column.name === "member"
  }));
}

function tableResponse(ctx: DatabaseContext, rows: RowData[], columns: DatabaseColumn[], table: string, limit: number, offset: number, filters: DatabaseRowFilter[]) {
  const filteredRows = filterRowsInMemory(rows, columns, filters);
  return {
    engine: ctx.dbType,
    editable: false,
    table,
    columns,
    rows: paginateRows(filteredRows, limit, offset),
    limit,
    offset,
    totalRows: filteredRows.length
  };
}

export async function getRedisTables(ctx: DatabaseContext, database = 0) {
  const logicalDatabase = redisDatabase(database);
  const keys: string[] = [];
  let cursor = "0";
  do {
    const scanOutput = await runRedis(ctx, ["SCAN", cursor, "COUNT", "500"], logicalDatabase);
    const lines = parseLines(scanOutput);
    cursor = lines[0] ?? "0";
    keys.push(...lines.slice(1));
  } while (cursor !== "0" && keys.length < 2000);
  keys.sort((left, right) => left.localeCompare(right));

  const tables: DatabaseTable[] = [];

  for (const key of keys) {
    const type = await redisKeyType(ctx, key, logicalDatabase);
    tables.push({
      id: redisKeyId(key, logicalDatabase),
      schema: type,
      name: key,
      rowCount: await redisKeyCount(ctx, key, type, logicalDatabase)
    });
  }

  return {
    engine: ctx.dbType,
    supported: true,
    editable: false,
    schemas: Array.from(new Set(tables.map((table) => table.schema).filter(Boolean))).map((name) => ({ name })),
    tables
  };
}

export async function getRedisRows(ctx: DatabaseContext, table: string, limit: number, offset: number, filters: DatabaseRowFilter[] = []) {
  const { key, database } = redisKeyTargetFromId(table);
  const type = await redisKeyType(ctx, key, database);
  const ttl = Number(await runRedis(ctx, ["TTL", key], database));

  if (type === "string") {
    const value = await runRedis(ctx, ["GET", key], database);
    const bytes = Number(await runRedis(ctx, ["STRLEN", key], database));
    const rows: RowData[] = [{ key, type, ttl, bytes, value }];
    const columns = baseColumns(rows, ["key", "type", "ttl", "bytes", "value"]);
    return tableResponse(ctx, rows, columns, table, limit, offset, filters);
  }

  if (type === "hash") {
    const values = parseLines(await runRedis(ctx, ["HGETALL", key], database));
    const rows: RowData[] = [];
    for (let index = 0; index < values.length; index += 2) {
      rows.push({ key, type, ttl, field: values[index] ?? "", value: values[index + 1] ?? "" });
    }
    const columns = baseColumns(rows, ["key", "type", "ttl", "field", "value"]);
    return tableResponse(ctx, rows, columns, table, limit, offset, filters);
  }

  if (type === "list") {
    const values = parseLines(await runRedis(ctx, ["LRANGE", key, "0", "-1"], database));
    const rows = values.map((value, index) => ({ key, type, ttl, index, value }));
    const columns = baseColumns(rows, ["key", "type", "ttl", "index", "value"]);
    return tableResponse(ctx, rows, columns, table, limit, offset, filters);
  }

  if (type === "set") {
    const rows = parseLines(await runRedis(ctx, ["SMEMBERS", key], database))
      .sort((left, right) => left.localeCompare(right))
      .map((value) => ({ key, type, ttl, value }));
    const columns = baseColumns(rows, ["key", "type", "ttl", "value"]);
    return tableResponse(ctx, rows, columns, table, limit, offset, filters);
  }

  if (type === "zset") {
    const values = parseLines(await runRedis(ctx, ["ZRANGE", key, "0", "-1", "WITHSCORES"], database));
    const rows: RowData[] = [];
    for (let index = 0; index < values.length; index += 2) {
      rows.push({ key, type, ttl, member: values[index] ?? "", score: Number(values[index + 1] ?? 0) });
    }
    const columns = baseColumns(rows, ["key", "type", "ttl", "member", "score"]);
    return tableResponse(ctx, rows, columns, table, limit, offset, filters);
  }

  const rows: RowData[] = [{ key, type, ttl, value: type === "none" ? "Key no longer exists" : "Preview is not available for this Redis type yet" }];
  const columns = baseColumns(rows, ["key", "type", "ttl", "value"]);
  return tableResponse(ctx, rows, columns, table, limit, offset, filters);
}

export async function insertRedisRow(ctx: DatabaseContext, table: string, values: RowData) {
  const { key, database } = redisTargetForInsert(table, values);
  if (!key) throw new Error("Redis key is required");

  const existingType = table.startsWith("redis:") ? await redisKeyType(ctx, key, database) : "";
  const type = existingType && existingType !== "none"
    ? existingType
    : redisValue(values.type || "string").toLowerCase();

  if (type === "string") {
    await runRedis(ctx, ["SET", key, redisValue(values.value)], database);
  } else if (type === "hash") {
    const field = redisValue(values.field).trim();
    if (!field) throw new Error("Hash field is required");
    await runRedis(ctx, ["HSET", key, field, redisValue(values.value)], database);
  } else if (type === "list") {
    await runRedis(ctx, ["RPUSH", key, redisValue(values.value)], database);
  } else if (type === "set") {
    await runRedis(ctx, ["SADD", key, redisValue(values.value)], database);
  } else if (type === "zset") {
    const member = redisValue(values.member || values.value).trim();
    const score = Number(values.score ?? 0);
    if (!member) throw new Error("Sorted set member is required");
    if (!Number.isFinite(score)) throw new Error("Sorted set score must be numeric");
    await runRedis(ctx, ["ZADD", key, String(score), member], database);
  } else {
    throw new Error("Choose string, hash, list, set, or zset");
  }

  await applyRedisTtl(ctx, key, values, database);
  return { ok: true, table: redisKeyId(key, database) };
}

export async function updateRedisRow(ctx: DatabaseContext, table: string, primaryKey: RowData, values: RowData) {
  const { key, database } = redisTargetForUpdate(table, primaryKey);
  if (!key) throw new Error("Redis key is required");

  if (hasRedisField(values, "ttl") || hasRedisField(values, "persist")) {
    const ttl = Number(values.ttl ?? -1);
    if (values.persist === true || ttl < 0) {
      await runRedis(ctx, ["PERSIST", key], database);
      return { ok: true };
    }
    if (!Number.isFinite(ttl)) throw new Error("TTL must be numeric");
    await runRedis(ctx, ["EXPIRE", key, String(Math.floor(ttl))], database);
    return { ok: true };
  }

  const type = redisValue(primaryKey.type || (await redisKeyType(ctx, key, database))).toLowerCase();

  if (type === "string") {
    const ttl = Number(await runRedis(ctx, ["TTL", key], database));
    await runRedis(ctx, ["SET", key, redisValue(values.value)], database);
    if (Number.isFinite(ttl) && ttl > 0) {
      await runRedis(ctx, ["EXPIRE", key, String(Math.floor(ttl))], database);
    }
    return { ok: true };
  }

  if (type === "hash") {
    const oldField = redisValue(primaryKey.field);
    const nextField = redisValue(values.field || oldField).trim();
    if (!oldField || !nextField) throw new Error("Hash field is required");
    if (nextField !== oldField) await runRedis(ctx, ["HDEL", key, oldField], database);
    await runRedis(ctx, ["HSET", key, nextField, redisValue(values.value)], database);
    return { ok: true };
  }

  if (type === "list") {
    const index = Number(primaryKey.index);
    if (!Number.isInteger(index) || index < 0) throw new Error("List index is required");
    await runRedis(ctx, ["LSET", key, String(index), redisValue(values.value)], database);
    return { ok: true };
  }

  if (type === "set") {
    const oldValue = redisValue(primaryKey.value);
    const nextValue = redisValue(values.value);
    if (oldValue !== nextValue) {
      await runRedis(ctx, ["SREM", key, oldValue], database);
      await runRedis(ctx, ["SADD", key, nextValue], database);
    }
    return { ok: true };
  }

  if (type === "zset") {
    const oldMember = redisValue(primaryKey.member);
    const nextMember = redisValue(values.member || oldMember).trim();
    const score = Number(values.score ?? primaryKey.score ?? 0);
    if (!oldMember || !nextMember) throw new Error("Sorted set member is required");
    if (!Number.isFinite(score)) throw new Error("Sorted set score must be numeric");
    if (nextMember !== oldMember) await runRedis(ctx, ["ZREM", key, oldMember], database);
    await runRedis(ctx, ["ZADD", key, String(score), nextMember], database);
    return { ok: true };
  }

  throw new Error("Editing is not available for this Redis type");
}

export async function deleteRedisRow(ctx: DatabaseContext, table: string, primaryKey: RowData) {
  const { key, database } = redisTargetForDelete(table, primaryKey);
  if (!key) throw new Error("Redis key is required");

  const type = redisValue(primaryKey.type || (await redisKeyType(ctx, key, database))).toLowerCase();
  const wholeKeyDelete = !hasRedisField(primaryKey, "field") && !hasRedisField(primaryKey, "index") && !hasRedisField(primaryKey, "member") && !hasRedisField(primaryKey, "value");

  if (wholeKeyDelete || type === "string") {
    await runRedis(ctx, ["DEL", key], database);
    return { ok: true };
  }

  if (type === "hash") {
    const field = redisValue(primaryKey.field);
    if (!field) throw new Error("Hash field is required");
    await runRedis(ctx, ["HDEL", key, field], database);
    return { ok: true };
  }

  if (type === "list") {
    const index = Number(primaryKey.index);
    if (!Number.isInteger(index) || index < 0) throw new Error("List index is required");
    const marker = `__aeroplane_deleted_${Date.now()}_${Math.random().toString(36).slice(2)}__`;
    await runRedis(ctx, ["LSET", key, String(index), marker], database);
    await runRedis(ctx, ["LREM", key, "1", marker], database);
    return { ok: true };
  }

  if (type === "set") {
    await runRedis(ctx, ["SREM", key, redisValue(primaryKey.value)], database);
    return { ok: true };
  }

  if (type === "zset") {
    const member = redisValue(primaryKey.member);
    if (!member) throw new Error("Sorted set member is required");
    await runRedis(ctx, ["ZREM", key, member], database);
    return { ok: true };
  }

  await runRedis(ctx, ["DEL", key], database);
  return { ok: true };
}
