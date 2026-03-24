import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";
import { PDFParse } from "pdf-parse";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

// Point pdf.js worker to the actual file — Next.js bundler doesn't copy it automatically
const workerPath = pathToFileURL(
  path.join(process.cwd(), "node_modules/pdf-parse/dist/worker/pdf.worker.mjs")
).href;
PDFParse.setWorker(workerPath);

const RESUME_DIR = path.join(process.cwd(), "data", "resumes");
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export async function GET() {
  const resume = await prisma.resume.findFirst({
    orderBy: { uploadedAt: "desc" },
  });
  if (!resume) {
    return NextResponse.json(null);
  }
  return NextResponse.json({
    id: resume.id,
    filename: resume.filename,
    uploadedAt: resume.uploadedAt,
  });
}

export async function POST(req: Request) {
  if (!rateLimit("resume-upload", 5, 60_000).ok) {
    return rateLimitResponse();
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json(
      { error: "A file is required" },
      { status: 400 }
    );
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "File too large. Maximum size is 5MB." },
      { status: 400 }
    );
  }

  // Validate by extension (MIME types can be spoofed but this is defense-in-depth)
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json(
      { error: "Only PDF files are allowed" },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Extract text from PDF
  const parser = new PDFParse({ data: buffer });
  const pdfData = await parser.getText();
  const extractedText = pdfData.text;

  // Save file to disk with generated filename (never use user-supplied name for path)
  await mkdir(RESUME_DIR, { recursive: true });
  const filename = `resume_${Date.now()}.pdf`;
  const filePath = path.join(RESUME_DIR, filename);
  await writeFile(filePath, buffer);

  // Sanitize the display name stored in DB
  const sanitizedName = file.name.replace(/[^\w\s.\-()]/g, "_").slice(0, 255);

  // Save to DB (only keep the latest)
  await prisma.resume.deleteMany();
  const resume = await prisma.resume.create({
    data: {
      filename: sanitizedName,
      filePath,
      extractedText,
    },
  });

  return NextResponse.json(
    { id: resume.id, filename: resume.filename, uploadedAt: resume.uploadedAt },
    { status: 201 }
  );
}
