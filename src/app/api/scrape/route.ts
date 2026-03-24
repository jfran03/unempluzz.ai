import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { runScrapePipeline } from "@/lib/scraper/pipeline";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function GET() {
  const lastLog = await prisma.scrapeLog.findFirst({
    orderBy: { startedAt: "desc" },
  });
  return NextResponse.json(lastLog);
}

export async function POST() {
  // Rate limit: max 3 scrapes per hour
  if (!rateLimit("scrape", 3, 3_600_000).ok) {
    return rateLimitResponse();
  }

  // Check if a scrape is already running
  const running = await prisma.scrapeLog.findFirst({
    where: { status: "running" },
  });
  if (running) {
    return NextResponse.json(
      { error: "A scrape is already in progress" },
      { status: 409 }
    );
  }

  // Create log entry
  const log = await prisma.scrapeLog.create({
    data: { status: "running" },
  });

  // Run pipeline in background (don't await)
  runScrapePipeline(log.id).catch((err) => {
    console.error("Scrape pipeline error:", err);
  });

  return NextResponse.json(log, { status: 202 });
}
