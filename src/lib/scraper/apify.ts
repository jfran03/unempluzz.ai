import { ApifyClient } from "apify-client";

const client = new ApifyClient({
  token: process.env.APIFY_API_TOKEN,
});

export type CrawlResult = {
  url: string;
  text: string;
};

export type CrawlOutput = {
  pages: CrawlResult[];
  costUsd: number;
};

/**
 * Crawl a website using Apify's web scraper actor.
 * Returns the text content of crawled pages and the run cost.
 */
export async function crawlWebsite(
  startUrl: string
): Promise<CrawlOutput> {
  const run = await client.actor("apify/website-content-crawler").call({
    startUrls: [{ url: startUrl }],
    maxCrawlPages: 50,
    crawlerType: "playwright:chrome",
  });

  const { items } = await client.dataset(run.defaultDatasetId).listItems();

  const pages = items
    .filter((item) => item.text && typeof item.text === "string")
    .map((item) => ({
      url: item.url as string,
      text: item.text as string,
    }));

  // Get run cost from Apify
  const runDetails = await client.run(run.id).get();
  const costUsd = runDetails?.usageTotalUsd ?? 0;

  return { pages, costUsd };
}
