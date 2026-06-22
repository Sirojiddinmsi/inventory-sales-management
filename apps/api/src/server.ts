import { app } from "./app.js";
import { env } from "./config/env.js";
import { pool } from "./config/database.js";
import { purgeExpiredArchives } from "./shared/archive-cleanup.js";
import { productImageStorage } from "./modules/products/product-image.storage.js";

const server = app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`);
});

async function runArchiveCleanup() {
  try {
    const result = await purgeExpiredArchives();
    const purgedImages = await productImageStorage.purgeOrphans();
    if (result.sales > 0 || result.debts > 0) {
      console.log(`Archive cleanup removed ${result.sales} sales and ${result.debts} debts.`);
    }
    if (purgedImages > 0) {
      console.log(`Image cleanup removed ${purgedImages} unreferenced files.`);
    }
  } catch (error) {
    console.error("Archive cleanup failed:", error);
  }
}

void runArchiveCleanup();
const archiveCleanupTimer = setInterval(() => void runArchiveCleanup(), 24 * 60 * 60 * 1000);
archiveCleanupTimer.unref();

async function shutdown(signal: string) {
  console.log(`${signal} received. Shutting down gracefully.`);
  clearInterval(archiveCleanupTimer);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });

  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
