/**
 * Standalone script for daily cron job.
 * Usage: npx tsx scripts/daily-scrape.ts
 *
 * Crontab example (6 AM daily):
 *   0 6 * * * cd /path/to/unempluzzed.ai && npx tsx scripts/daily-scrape.ts >> /var/log/unempluzzed-scrape.log 2>&1
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { runScrapePipeline } from "../src/lib/scraper/pipeline";
import path from "path";

const dbPath = path.join(process.cwd(), "data", "unempluzzed.db");
const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log(`[${new Date().toISOString()}] Starting daily scrape...`);

  const log = await prisma.scrapeLog.create({
    data: { status: "running" },
  });

  await runScrapePipeline(log.id);

  await prisma.$disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
