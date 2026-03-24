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
import { ApifyClient } from "apify-client";
import Anthropic from "@anthropic-ai/sdk";
import path from "path";

const dbPath = path.join(process.cwd(), "data", "unempluzzed.db");
const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
const prisma = new PrismaClient({ adapter });

const apifyClient = new ApifyClient({
  token: process.env.APIFY_API_TOKEN,
});

const anthropic = new Anthropic();

async function crawlWebsite(startUrl: string) {
  const run = await apifyClient
    .actor("apify/website-content-crawler")
    .call({
      startUrls: [{ url: startUrl }],
      maxCrawlPages: 50,
      crawlerType: "cheerio",
    });

  const { items } = await apifyClient
    .dataset(run.defaultDatasetId)
    .listItems();

  return items
    .filter((item) => item.text && typeof item.text === "string")
    .map((item) => ({
      url: item.url as string,
      text: item.text as string,
    }));
}

async function parseJobsFromText(
  pageText: string,
  pageUrl: string,
  resumeText: string,
  keywords: string[]
) {
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `You are a job posting parser. Extract all job postings from the following webpage text.

For each job found, extract these fields as a JSON object:
- title, company, description, qualifications (or null), url (use "${pageUrl}" if not found)
- province, city, address (or null)
- jobType, workplaceType ("remote"/"in-person"/"hybrid" or null)
- jobDuration ("permanent"/"co-op"/"internship" or null)
- jobCommitment ("full-time"/"part-time"/"casual" or null)
- applicationDeadline (ISO "YYYY-MM-DD" or null)

Keywords: ${keywords.join(", ")}
Resume: ${resumeText.slice(0, 2000)}
Page text: ${pageText.slice(0, 12000)}

Respond ONLY with a JSON array. If no jobs found, respond with [].`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    return JSON.parse(jsonMatch[0]);
  } catch {
    console.error("Failed to parse:", text.slice(0, 200));
    return [];
  }
}

async function main() {
  console.log(`[${new Date().toISOString()}] Starting daily scrape...`);

  const log = await prisma.scrapeLog.create({
    data: { status: "running" },
  });

  let totalFound = 0;
  let totalNew = 0;

  try {
    const websites = await prisma.website.findMany({
      where: { enabled: true },
    });
    const keywords = await prisma.keyword.findMany();
    const resume = await prisma.resume.findFirst({
      orderBy: { uploadedAt: "desc" },
    });

    const keywordValues = keywords.map((k) => k.value);
    const resumeText = resume?.extractedText || "";

    for (const website of websites) {
      try {
        console.log(`  Crawling: ${website.url}`);
        const pages = await crawlWebsite(website.url);
        console.log(`    Got ${pages.length} pages`);

        for (const page of pages) {
          const jobs = await parseJobsFromText(
            page.text,
            page.url,
            resumeText,
            keywordValues
          );

          for (const job of jobs) {
            totalFound++;
            const existing = await prisma.job.findUnique({
              where: { url: job.url },
            });

            if (!existing) {
              totalNew++;
              await prisma.job.create({
                data: {
                  title: job.title,
                  company: job.company,
                  description: job.description,
                  qualifications: job.qualifications,
                  url: job.url,
                  province: job.province,
                  city: job.city,
                  address: job.address,
                  jobType: job.jobType,
                  workplaceType: job.workplaceType,
                  jobDuration: job.jobDuration,
                  jobCommitment: job.jobCommitment,
                  applicationDeadline: job.applicationDeadline
                    ? new Date(job.applicationDeadline)
                    : null,
                  sourceWebsite: website.url,
                },
              });
            }
          }
        }
      } catch (err) {
        console.error(`  Error scraping ${website.url}:`, err);
      }
    }

    // Clean up expired jobs
    const deleted = await prisma.job.deleteMany({
      where: { applicationDeadline: { lt: new Date() } },
    });
    console.log(`  Cleaned up ${deleted.count} expired jobs`);

    await prisma.scrapeLog.update({
      where: { id: log.id },
      data: {
        status: "completed",
        completedAt: new Date(),
        jobsFound: totalFound,
        jobsNew: totalNew,
      },
    });

    console.log(
      `  Done: ${totalFound} found, ${totalNew} new`
    );
  } catch (err) {
    console.error("Pipeline error:", err);
    await prisma.scrapeLog.update({
      where: { id: log.id },
      data: {
        status: "failed",
        completedAt: new Date(),
        error: err instanceof Error ? err.message : String(err),
      },
    });
  }

  await prisma.$disconnect();
  process.exit(0);
}

main();
