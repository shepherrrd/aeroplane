import {
  columnsFromRows,
  runDockerExec,
  type DatabaseContext,
  type DatabaseRowFilter,
  type DatabaseTable,
  type RowData
} from "./database-viewer-shared.js";

type MongoCollectionInfo = {
  database: string;
  collection: string;
  count: number;
};

type MongoRowsResult = {
  columns: Array<{ name: string; type: string }>;
  rows: RowData[];
  totalRows: number;
};

type MongoInsertResult = {
  insertedId: string;
};

function mongoTableId(database: string, collection: string) {
  return `mongo:${Buffer.from(JSON.stringify([database, collection])).toString("base64url")}`;
}

function mongoTableFromId(id: string) {
  if (!id.startsWith("mongo:")) throw new Error("Invalid MongoDB collection");
  const parsed = JSON.parse(Buffer.from(id.slice("mongo:".length), "base64url").toString()) as unknown;
  if (!Array.isArray(parsed) || typeof parsed[0] !== "string" || typeof parsed[1] !== "string") {
    throw new Error("Invalid MongoDB collection");
  }
  return { database: parsed[0], collection: parsed[1] };
}

function mongoTargetForInsert(table: string, values: RowData) {
  if (table.startsWith("mongo:")) return mongoTableFromId(table);
  return {
    database: String(values.database ?? "").trim(),
    collection: String(values.collection ?? "").trim()
  };
}

function parseJsonOutput<T>(output: string): T {
  const line = output.trim().split(/\r?\n/).filter(Boolean).at(-1);
  return JSON.parse(line || "null") as T;
}

async function runMongoJson<T>(ctx: DatabaseContext, script: string) {
  const user = ctx.envMap.get("MONGO_INITDB_ROOT_USERNAME") || "";
  const password = ctx.envMap.get("MONGO_INITDB_ROOT_PASSWORD") || "";
  const authArgs = user || password
    ? ["--username", user, "--password", password, "--authenticationDatabase", "admin"]
    : [];
  const result = await runDockerExec(ctx.containerName, [
    "mongosh",
    "--quiet",
    "--host",
    "127.0.0.1",
    "--port",
    String(ctx.service.internalPort),
    ...authArgs,
    "--eval",
    script
  ]);
  return parseJsonOutput<T>(result.stdout);
}

function mongoRowsScript(database: string, collection: string, limit: number, offset: number, filters: DatabaseRowFilter[]) {
  return `
    const targetDb = db.getSiblingDB(${JSON.stringify(database)});
    const collection = targetDb.getCollection(${JSON.stringify(collection)});
    const filters = ${JSON.stringify(filters)};

    function escapeRegex(value) {
      const special = new Set([".", "*", "+", "?", "^", "$", "{", "}", "(", ")", "|", "[", "]", "\\\\"]);
      let escaped = "";
      for (const char of String(value)) escaped += special.has(char) ? "\\\\" + char : char;
      return escaped;
    }

    function parsedValue(value) {
      if (value === "true") return true;
      if (value === "false") return false;
      if (value === "null") return null;
      const numeric = Number(value);
      return Number.isFinite(numeric) && String(value).trim() !== "" ? numeric : value;
    }

    function textExpression(field) {
      return { $toLower: { $toString: { $ifNull: ["$" + field, ""] } } };
    }

    function filterQuery(filter) {
      const value = String(filter.value || "").toLowerCase();
      if (filter.operator === "equals") return { $expr: { $eq: [textExpression(filter.column), value] } };
      if (filter.operator === "not_equals") return { $expr: { $ne: [textExpression(filter.column), value] } };
      if (filter.operator === "contains") return { $expr: { $regexMatch: { input: textExpression(filter.column), regex: escapeRegex(value) } } };
      if (filter.operator === "not_contains") return { $expr: { $not: [{ $regexMatch: { input: textExpression(filter.column), regex: escapeRegex(value) } }] } };
      if (filter.operator === "starts_with") return { $expr: { $regexMatch: { input: textExpression(filter.column), regex: "^" + escapeRegex(value) } } };
      if (filter.operator === "ends_with") return { $expr: { $regexMatch: { input: textExpression(filter.column), regex: escapeRegex(value) + "$" } } };
      if (filter.operator === "is_empty") return { $or: [{ [filter.column]: { $exists: false } }, { [filter.column]: null }, { [filter.column]: "" }] };
      if (filter.operator === "is_not_empty") return { [filter.column]: { $exists: true, $nin: [null, ""] } };
      if (filter.operator === "greater_than") return { [filter.column]: { $gt: parsedValue(filter.value) } };
      if (filter.operator === "less_than") return { [filter.column]: { $lt: parsedValue(filter.value) } };
      return {};
    }

    function normalizeValue(value) {
      if (value === undefined || value === null) return null;
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
      if (value instanceof Date) return value.toISOString();
      if (value && value._bsontype === "ObjectId") return value.toString();
      return EJSON.stringify(value, { relaxed: true });
    }

    function columnType(value) {
      if (value === null || value === undefined) return "unknown";
      if (typeof value === "boolean") return "boolean";
      if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
      if (value instanceof Date) return "date";
      if (value && value._bsontype === "ObjectId") return "objectId";
      if (Array.isArray(value)) return "array";
      if (typeof value === "object") return "object";
      return "text";
    }

    function normalizeDocument(document) {
      const row = {};
      for (const [key, value] of Object.entries(document)) row[key] = normalizeValue(value);
      return row;
    }

    const activeFilters = filters.filter((filter) => filter.column && (["is_empty", "is_not_empty"].includes(filter.operator) || String(filter.value || "").trim()));
    const query = activeFilters.length ? { $and: activeFilters.map(filterQuery) } : {};
    const totalRows = collection.countDocuments(query);
    const documents = collection.find(query).skip(${offset}).limit(${limit}).toArray();
    const sample = documents.length ? documents : (collection.findOne(query) ? [collection.findOne(query)] : []);
    const columnNames = new Set(["_id"]);
    for (const document of sample) {
      for (const key of Object.keys(document)) columnNames.add(key);
    }
    const columns = Array.from(columnNames).map((name) => {
      const sampleDocument = sample.find((document) => document[name] !== undefined && document[name] !== null);
      return { name, type: columnType(sampleDocument ? sampleDocument[name] : null) };
    });
    print(JSON.stringify({ columns, rows: documents.map(normalizeDocument), totalRows }));
  `;
}

export async function getMongoTables(ctx: DatabaseContext) {
  const collections = await runMongoJson<MongoCollectionInfo[]>(ctx, `
    const systemDatabases = new Set(["admin", "config", "local"]);
    const results = [];
    for (const item of db.adminCommand({ listDatabases: 1 }).databases) {
      if (systemDatabases.has(item.name)) continue;
      const database = db.getSiblingDB(item.name);
      for (const info of database.getCollectionInfos({ type: "collection" })) {
        results.push({
          database: item.name,
          collection: info.name,
          count: database.getCollection(info.name).estimatedDocumentCount()
        });
      }
    }
    results.sort((left, right) => (left.database + "." + left.collection).localeCompare(right.database + "." + right.collection));
    print(JSON.stringify(results));
  `);

  const tables: DatabaseTable[] = collections.map((item) => ({
    id: mongoTableId(item.database, item.collection),
    schema: item.database,
    name: item.collection,
    rowCount: item.count
  }));

  return {
    engine: ctx.dbType,
    supported: true,
    editable: false,
    tables
  };
}

export async function getMongoRows(ctx: DatabaseContext, table: string, limit: number, offset: number, filters: DatabaseRowFilter[] = []) {
  const { database, collection } = mongoTableFromId(table);
  const result = await runMongoJson<MongoRowsResult>(ctx, mongoRowsScript(database, collection, limit, offset, filters));
  const columns = result.columns.length > 0
    ? result.columns.map((column) => ({ name: column.name, type: column.type, nullable: true, primaryKey: column.name === "_id" }))
    : columnsFromRows(result.rows, ["_id"]).map((column) => ({ ...column, primaryKey: column.name === "_id" }));

  return {
    engine: ctx.dbType,
    editable: false,
    table,
    columns,
    rows: result.rows,
    limit,
    offset,
    totalRows: result.totalRows
  };
}

export async function insertMongoRow(ctx: DatabaseContext, table: string, values: RowData) {
  const { database, collection } = mongoTargetForInsert(table, values);
  if (!database) throw new Error("MongoDB database is required");
  if (!collection) throw new Error("MongoDB collection is required");

  const documentSource = String(values.document ?? values.json ?? "{}").trim() || "{}";
  const result = await runMongoJson<MongoInsertResult>(ctx, `
    const targetDb = db.getSiblingDB(${JSON.stringify(database)});
    const collection = targetDb.getCollection(${JSON.stringify(collection)});
    let document;
    try {
      document = EJSON.parse(${JSON.stringify(documentSource)});
    } catch (error) {
      throw new Error("Document must be valid JSON");
    }
    const result = collection.insertOne(document);
    print(JSON.stringify({ insertedId: String(result.insertedId) }));
  `);

  return { ok: true, table: mongoTableId(database, collection), id: result.insertedId };
}
