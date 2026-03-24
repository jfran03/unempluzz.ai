import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const websites = await prisma.website.findMany({
    orderBy: { name: "asc" },
  });
  return NextResponse.json(websites);
}

export async function POST(req: Request) {
  const { url, name } = await req.json();
  if (!url || typeof url !== "string" || !url.trim()) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  // Validate URL format, protocol, and block private/reserved hosts
  try {
    const parsed = new URL(url.trim());
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return NextResponse.json(
        { error: "Only HTTP/HTTPS URLs are allowed" },
        { status: 400 }
      );
    }

    const hostname = parsed.hostname.toLowerCase();

    // Block localhost variants
    if (
      hostname === "localhost" ||
      hostname === "[::1]" ||
      hostname.endsWith(".localhost")
    ) {
      return NextResponse.json(
        { error: "Private/internal URLs are not allowed" },
        { status: 400 }
      );
    }

    // Block private/reserved IP ranges
    const ipMatch = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipMatch) {
      const [, a, b] = ipMatch.map(Number);
      if (
        a === 127 ||                   // 127.0.0.0/8 loopback
        a === 10 ||                    // 10.0.0.0/8 private
        (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12 private
        (a === 192 && b === 168) ||    // 192.168.0.0/16 private
        (a === 169 && b === 254) ||    // 169.254.0.0/16 link-local + cloud metadata
        a === 0 ||                     // 0.0.0.0/8
        (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 CGNAT
        (a === 198 && (b === 18 || b === 19)) // 198.18.0.0/15 benchmarking
      ) {
        return NextResponse.json(
          { error: "Private/internal URLs are not allowed" },
          { status: 400 }
        );
      }
    }
  } catch {
    return NextResponse.json(
      { error: "Invalid URL format" },
      { status: 400 }
    );
  }

  const website = await prisma.website.create({
    data: { url: url.trim(), name: name?.trim() || null },
  });
  return NextResponse.json(website, { status: 201 });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  await prisma.website.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  const { id, enabled } = await req.json();
  if (!id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  const website = await prisma.website.update({
    where: { id },
    data: { enabled },
  });
  return NextResponse.json(website);
}
