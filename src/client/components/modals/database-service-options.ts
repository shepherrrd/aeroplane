export type DatabaseType = "postgres" | "mysql" | "redis" | "mongodb" | "clickhouse";

export type DatabaseOption = {
  key: DatabaseType;
  name: string;
  logoUrl: string;
  logoClassName?: string;
  defaultPort: number;
};

export type EnvEntry = {
  key: string;
  value: string;
};

export const DATABASE_OPTIONS: DatabaseOption[] = [
  {
    key: "postgres",
    name: "PostgreSQL",
    logoUrl: "https://svgl.app/library/postgresql.svg",
    defaultPort: 5432
  },
  {
    key: "mysql",
    name: "MySQL",
    logoUrl: "https://svgl.app/library/mysql-icon-dark.svg",
    defaultPort: 3306
  },
  {
    key: "redis",
    name: "Redis",
    logoUrl: "https://svgl.app/library/redis.svg",
    defaultPort: 6379
  },
  {
    key: "mongodb",
    name: "MongoDB",
    logoUrl: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/mongodb/mongodb-original.svg",
    logoClassName: "h-6 w-6 object-contain",
    defaultPort: 27017
  },
  {
    key: "clickhouse",
    name: "ClickHouse",
    logoUrl: "https://cdn.simpleicons.org/clickhouse",
    defaultPort: 8123
  }
];

export function getDatabaseOption(dbType: DatabaseType) {
  return DATABASE_OPTIONS.find((option) => option.key === dbType) ?? DATABASE_OPTIONS[0];
}
