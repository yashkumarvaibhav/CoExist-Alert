import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { schema } from "./schema";

export type AppDatabase = BetterSQLite3Database<typeof schema>;

export interface DatabaseClient {
  sqlite: Database.Database;
  db: AppDatabase;
  close: () => void;
}

export interface CreateDatabaseOptions {
  path?: string;
  migrate?: boolean;
  migrationsFolder?: string;
}

const DEFAULT_DB_PATH = path.join(process.cwd(), "var", "coexist-alert.sqlite");
const DEFAULT_MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

function ensureParentDirectory(databasePath: string): void {
  if (databasePath === ":memory:") return;
  mkdirSync(path.dirname(databasePath), { recursive: true });
}

export function createDatabaseClient(options: CreateDatabaseOptions = {}): DatabaseClient {
  const databasePath = options.path ?? process.env.COEXIST_DB_PATH ?? DEFAULT_DB_PATH;
  ensureParentDirectory(databasePath);

  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  if (databasePath !== ":memory:") {
    sqlite.pragma("journal_mode = WAL");
  }

  const db = drizzle(sqlite, { schema });
  if (options.migrate ?? true) {
    migrate(db, {
      migrationsFolder: options.migrationsFolder ?? DEFAULT_MIGRATIONS_FOLDER,
    });
  }

  return {
    sqlite,
    db,
    close: () => sqlite.close(),
  };
}

export function createInMemoryDatabase(): DatabaseClient {
  return createDatabaseClient({ path: ":memory:" });
}
