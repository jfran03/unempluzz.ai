import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const [apifyData, claudeData] = await Promise.all([
    fetchApifyUsage(),
    fetchClaudeUsage(),
  ]);

  return NextResponse.json({ apify: apifyData, claude: claudeData });
}

export async function PATCH(req: NextRequest) {
  const { claudeBalance } = await req.json();

  if (typeof claudeBalance !== "number" || claudeBalance < 0) {
    return NextResponse.json({ error: "Invalid balance" }, { status: 400 });
  }

  await prisma.setting.upsert({
    where: { key: "claudeBalanceUsd" },
    update: { value: String(claudeBalance) },
    create: { key: "claudeBalanceUsd", value: String(claudeBalance) },
  });

  return NextResponse.json({ ok: true });
}

async function fetchClaudeUsage() {
  const balanceSetting = await prisma.setting.findUnique({
    where: { key: "claudeBalanceUsd" },
  });

  const initialBalance = balanceSetting ? parseFloat(balanceSetting.value) : 0;

  // Sum all Claude costs from scrape logs
  const logs = await prisma.scrapeLog.findMany({
    where: { status: "completed" },
    select: { claudeCostUsd: true },
  });

  const totalUsed = logs.reduce((sum, log) => sum + log.claudeCostUsd, 0);
  const remaining = Math.max(initialBalance - totalUsed, 0);

  return {
    initialBalanceUsd: initialBalance,
    usedUsd: Math.round(totalUsed * 10000) / 10000,
    remainingUsd: Math.round(remaining * 10000) / 10000,
  };
}

async function fetchApifyUsage() {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) return null;

  try {
    const headers = { Authorization: `Bearer ${token}` };
    const [userRes, usageRes] = await Promise.all([
      fetch("https://api.apify.com/v2/users/me", { headers }),
      fetch("https://api.apify.com/v2/users/me/usage/monthly", { headers }),
    ]);

    const user = await userRes.json();
    const usage = await usageRes.json();

    const limitUsd = user.data?.plan?.maxMonthlyUsageUsd ?? user.data?.plan?.monthlyUsageCreditsUsd ?? 5;

    let usedUsd = 0;
    if (usage.data?.monthlyServiceUsage) {
      for (const service of Object.values(usage.data.monthlyServiceUsage) as { amountAfterVolumeDiscountUsd: number }[]) {
        usedUsd += service.amountAfterVolumeDiscountUsd;
      }
    }

    return {
      usedUsd: Math.round(usedUsd * 10000) / 10000,
      limitUsd,
    };
  } catch {
    return null;
  }
}
