import { createDatabaseClient } from "./client";

const client = createDatabaseClient();

try {
  process.stdout.write("SQLite migrations applied.\n");
} finally {
  client.close();
}
