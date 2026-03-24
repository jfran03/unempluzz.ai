import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const keywords = await prisma.keyword.findMany({
    orderBy: { value: "asc" },
  });
  return NextResponse.json(keywords);
}

export async function POST(req: Request) {
  const { value } = await req.json();
  if (!value || typeof value !== "string" || !value.trim()) {
    return NextResponse.json({ error: "Keyword is required" }, { status: 400 });
  }

  const keyword = await prisma.keyword.create({
    data: { value: value.trim() },
  });
  return NextResponse.json(keyword, { status: 201 });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  await prisma.keyword.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
