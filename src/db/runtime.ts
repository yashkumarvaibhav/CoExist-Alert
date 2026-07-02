import { createDatabaseClient, type DatabaseClient } from "./client";
import { createRepositories } from "./repositories";

let runtimeClient: DatabaseClient | null = null;
let runtimePath: string | undefined;

export function getRuntimeDatabaseClient(): DatabaseClient {
  const requestedPath = process.env.COEXIST_DB_PATH;
  if (runtimeClient !== null && runtimePath === requestedPath) {
    return runtimeClient;
  }

  runtimeClient?.close();
  runtimeClient = createDatabaseClient();
  runtimePath = requestedPath;
  return runtimeClient;
}

export function getRuntimeRepositories(): ReturnType<typeof createRepositories> {
  return createRepositories(getRuntimeDatabaseClient().db);
}

export function resetRuntimeDatabase(): void {
  runtimeClient?.close();
  runtimeClient = null;
  runtimePath = undefined;
}
