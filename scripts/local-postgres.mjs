// Runs a local embedded PostgreSQL server for development when Docker is not available.
// Usage: pnpm db:local  (keeps running; Ctrl+C to stop)
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataDir = path.join(root, ".pgdata");
const firstRun = !existsSync(dataDir);

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "openpress",
  password: "openpress",
  port: 5432,
  persistent: true,
});

if (firstRun) {
  console.log("Initialising embedded PostgreSQL cluster...");
  await pg.initialise();
}
await pg.start();
if (firstRun) {
  await pg.createDatabase("openpress");
}
console.log("PostgreSQL running on port 5432 (db=openpress user=openpress). Press Ctrl+C to stop.");

const stop = async () => {
  console.log("Stopping PostgreSQL...");
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
