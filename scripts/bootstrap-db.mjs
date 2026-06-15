import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const migrationsDir = path.join(rootDir, "database", "migrations");
const seedsDir = path.join(rootDir, "database", "seeds");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function ensureSchemaMigrations() {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(100) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function applyMigrations() {
  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const version = path.basename(file, ".sql");
    const applied = await client.query(
      "SELECT 1 FROM schema_migrations WHERE version = $1",
      [version]
    );

    if (applied.rowCount) continue;

    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    console.log(`Applying migration: ${version}`);
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (version) VALUES ($1)",
        [version]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
}

async function applySeeds() {
  const files = (await readdir(seedsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = await readFile(path.join(seedsDir, file), "utf8");
    console.log(`Applying seed: ${file}`);
    await client.query(sql);
  }
}

async function main() {
  await client.connect();
  try {
    await ensureSchemaMigrations();
    await applyMigrations();
    await applySeeds();
    console.log("Database bootstrap complete");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Database bootstrap failed");
  console.error(error);
  process.exit(1);
});
