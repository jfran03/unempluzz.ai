import { prisma } from "@/lib/db";
import {
  detectCategories,
  scoreJob,
  loadWeightAdjustments,
  applyFeedbackToWeights,
  HIGH_MATCH_THRESHOLD,
} from "@/lib/matching";
import { NextRequest, NextResponse } from "next/server";

const VALID_FILTERS = ["all", "new", "applied", "high-match"] as const;
const VALID_SORT_FIELDS = [
  "scrapedAt",
  "title",
  "company",
  "city",
  "applicationDeadline",
] as const;

export async function GET(req: NextRequest) {
  // Clean up expired jobs on every page load.
  // Jobs with no deadline are treated as expiring 14 days after they were scraped.
  const now = new Date();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  await prisma.job.deleteMany({
    where: {
      OR: [
        { applicationDeadline: { lt: now } },
        { applicationDeadline: null, scrapedAt: { lt: fourteenDaysAgo } },
      ],
    },
  });

  const { searchParams } = new URL(req.url);
  const rawFilter = searchParams.get("filter") || "all";
  const rawSort = searchParams.get("sort") || "scrapedAt";
  const order = searchParams.get("order") === "asc" ? "asc" as const : "desc" as const;

  // Validate filter
  const filter = (VALID_FILTERS as readonly string[]).includes(rawFilter)
    ? rawFilter
    : "all";

  // Validate sort field
  const sortField = (VALID_SORT_FIELDS as readonly string[]).includes(rawSort)
    ? rawSort
    : "scrapedAt";

  if (filter === "high-match") {
    return handleHighMatch();
  }

  const where: Record<string, unknown> = {};

  if (filter === "new") {
    where.viewedAt = null;
  } else if (filter === "applied") {
    where.applied = true;
  }

  const jobs = await prisma.job.findMany({
    where,
    orderBy: { [sortField]: order },
  });

  return NextResponse.json(jobs);
}

async function handleHighMatch() {
  const resume = await prisma.resume.findFirst({
    orderBy: { uploadedAt: "desc" },
  });

  const allJobs = await prisma.job.findMany();

  // Thumbs-up jobs always included, thumbs-down always excluded
  const thumbsUp = allJobs.filter((j) => j.matchFeedback === "up");
  const thumbsDown = new Set(allJobs.filter((j) => j.matchFeedback === "down").map((j) => j.id));

  // Score remaining jobs (no feedback) with the algorithm, using learned weight adjustments
  const resumeCategories = resume ? detectCategories(resume.extractedText) : new Map<string, number>();
  const weightAdj = await loadWeightAdjustments();
  const scoredJobs = allJobs
    .filter((j) => !j.matchFeedback)
    .map((job) => {
      const text = [job.title, job.description, job.qualifications || ""].join(" ");
      return { job, score: scoreJob(text, resumeCategories, weightAdj) };
    })
    .filter((s) => s.score >= HIGH_MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.job);

  // Combine: thumbs-up first, then algo-scored, exclude thumbs-down
  const result = [...thumbsUp, ...scoredJobs].filter((j) => !thumbsDown.has(j.id));

  return NextResponse.json(result);
}

export async function PATCH(req: Request) {
  const { id, applied, markViewed, matchFeedback } = await req.json();

  if (markViewed) {
    await prisma.job.updateMany({
      where: { viewedAt: null },
      data: { viewedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (typeof applied === "boolean") {
    data.applied = applied;
    data.appliedAt = applied ? new Date() : null;
  }
  // matchFeedback: "up", "down", or null (to clear)
  // When feedback changes, adjust category weights for future scoring
  if (matchFeedback !== undefined) {
    const existingJob = await prisma.job.findUnique({ where: { id } });
    if (existingJob) {
      const jobText = [existingJob.title, existingJob.description, existingJob.qualifications || ""].join(" ");
      await applyFeedbackToWeights(jobText, existingJob.matchFeedback, matchFeedback);
    }
    data.matchFeedback = matchFeedback;
  }

  const job = await prisma.job.update({
    where: { id },
    data,
  });

  return NextResponse.json(job);
}
