import { prisma } from "@/lib/db";
import { notifyNewJobs, notifyClaudeUsage, notifyApifyUsage } from "@/lib/discord";
import { detectCategories, scoreJob, loadWeightAdjustments, HIGH_MATCH_THRESHOLD } from "@/lib/matching";
import { crawlWebsite, type CrawlResult } from "./apify";
import { parseJobsFromText, type ParsedJob } from "./parser";

/** Max concurrent Haiku parse calls */
const PARSE_CONCURRENCY = 5;

// Haiku 4.5 pricing per million tokens
const HAIKU_INPUT_COST_PER_M = 0.80;
const HAIKU_OUTPUT_COST_PER_M = 4.00;

/**
 * Process items in parallel with a concurrency limit.
 */
async function parallelMap<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

/**
 * Run the full scrape pipeline:
 * 1. Get enabled websites from DB
 * 2. Crawl all websites in parallel via Apify
 * 3. Parse pages with Claude Haiku (concurrent, limited)
 * 4. Upsert jobs into DB
 * 5. Clean up expired jobs
 */
export async function runScrapePipeline(logId: string) {
  let totalFound = 0;
  let totalNew = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalApifyCost = 0;

  try {
    // Get config from DB
    const websites = await prisma.website.findMany({
      where: { enabled: true },
    });
    const keywords = await prisma.keyword.findMany();
    const resume = await prisma.resume.findFirst({
      orderBy: { uploadedAt: "desc" },
    });

    const keywordValues = keywords.map((k) => k.value);
    const resumeText = resume?.extractedText || "";

    // 1. Crawl all websites in parallel
    console.log(`Crawling ${websites.length} websites in parallel...`);
    const crawlResults = await Promise.allSettled(
      websites.map(async (website) => {
        console.log(`Crawling: ${website.url}`);
        const output = await crawlWebsite(website.url);
        console.log(`  Got ${output.pages.length} pages from ${website.url} ($${output.costUsd.toFixed(4)})`);
        return { website, ...output };
      })
    );

    // Collect all pages with their source website
    const allPages: { page: CrawlResult; sourceUrl: string }[] = [];
    for (const result of crawlResults) {
      if (result.status === "fulfilled") {
        totalApifyCost += result.value.costUsd;
        for (const page of result.value.pages) {
          allPages.push({ page, sourceUrl: result.value.website.url });
        }
      } else {
        console.error("Crawl failed:", result.reason);
      }
    }

    console.log(`Parsing ${allPages.length} pages (concurrency: ${PARSE_CONCURRENCY})...`);

    // 2. Parse all pages with limited concurrency
    const parseResults = await parallelMap(
      allPages,
      PARSE_CONCURRENCY,
      async ({ page, sourceUrl }) => {
        try {
          const result = await parseJobsFromText(
            page.text,
            page.url,
            resumeText,
            keywordValues
          );
          totalInputTokens += result.inputTokens;
          totalOutputTokens += result.outputTokens;
          return result.jobs.map((job) => ({ job, sourceUrl }));
        } catch (err) {
          console.error(`Error parsing ${page.url}:`, err);
          return [];
        }
      }
    );

    // 3. Upsert all jobs into DB
    const allJobs: { job: ParsedJob; sourceUrl: string }[] = parseResults.flat();

    for (const { job, sourceUrl } of allJobs) {
      totalFound++;

      const existing = await prisma.job.findUnique({
        where: { url: job.url },
      });

      const jobData = {
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
        sourceWebsite: sourceUrl,
      };

      if (!existing) {
        totalNew++;
        await prisma.job.create({ data: jobData });
      } else {
        await prisma.job.update({ where: { url: job.url }, data: jobData });
      }
    }

    // Clean up expired jobs
    await prisma.job.deleteMany({
      where: {
        applicationDeadline: { lt: new Date() },
      },
    });

    // Calculate Claude cost
    const claudeCost =
      (totalInputTokens / 1_000_000) * HAIKU_INPUT_COST_PER_M +
      (totalOutputTokens / 1_000_000) * HAIKU_OUTPUT_COST_PER_M;

    // Update log
    await prisma.scrapeLog.update({
      where: { id: logId },
      data: {
        status: "completed",
        completedAt: new Date(),
        jobsFound: totalFound,
        jobsNew: totalNew,
        claudeInputTokens: totalInputTokens,
        claudeOutputTokens: totalOutputTokens,
        claudeCostUsd: Math.round(claudeCost * 10000) / 10000,
        apifyCostUsd: Math.round(totalApifyCost * 10000) / 10000,
      },
    });

    // Discord notifications — count how many new jobs are high matches
    let highMatchCount = 0;
    if (totalNew > 0 && resumeText) {
      const resumeCategories = detectCategories(resumeText);
      const weightAdj = await loadWeightAdjustments();
      const newJobs = await prisma.job.findMany({ where: { viewedAt: null } });
      for (const job of newJobs) {
        const text = [job.title, job.description, job.qualifications || ""].join(" ");
        if (scoreJob(text, resumeCategories, weightAdj) >= HIGH_MATCH_THRESHOLD) {
          highMatchCount++;
        }
      }
    }
    await notifyNewJobs(totalNew, highMatchCount);

    // Check Claude credit usage
    const balanceSetting = await prisma.setting.findUnique({
      where: { key: "claudeBalanceUsd" },
    });
    if (balanceSetting) {
      const initialBalance = parseFloat(balanceSetting.value);
      const allLogs = await prisma.scrapeLog.findMany({
        where: { status: "completed" },
        select: { claudeCostUsd: true },
      });
      const totalClaudeUsed = allLogs.reduce((sum, l) => sum + l.claudeCostUsd, 0);
      await notifyClaudeUsage(totalClaudeUsed, initialBalance);
    }

    // Check Apify credit usage
    const apifyToken = process.env.APIFY_API_TOKEN;
    if (apifyToken) {
      try {
        const headers = { Authorization: `Bearer ${apifyToken}` };
        const [userRes, usageRes] = await Promise.all([
          fetch("https://api.apify.com/v2/users/me", { headers }),
          fetch("https://api.apify.com/v2/users/me/usage/monthly", { headers }),
        ]);
        const user = await userRes.json();
        const usage = await usageRes.json();
        const limitUsd = user.data?.plan?.maxMonthlyUsageUsd ?? user.data?.plan?.monthlyUsageCreditsUsd ?? 5;
        let apifyUsed = 0;
        if (usage.data?.monthlyServiceUsage) {
          for (const service of Object.values(usage.data.monthlyServiceUsage) as { amountAfterVolumeDiscountUsd: number }[]) {
            apifyUsed += service.amountAfterVolumeDiscountUsd;
          }
        }
        await notifyApifyUsage(apifyUsed, limitUsd);
      } catch {
        // Apify usage check failed, skip notification
      }
    }
  } catch (err) {
    console.error("Pipeline error:", err);
    await prisma.scrapeLog.update({
      where: { id: logId },
      data: {
        status: "failed",
        completedAt: new Date(),
        error: (err instanceof Error ? err.message : "Unknown error").slice(0, 200),
      },
    });
  }
}
