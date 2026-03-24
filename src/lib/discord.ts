const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

async function send(content: string) {
  if (!WEBHOOK_URL) return;
  try {
    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  } catch (err) {
    console.error("Discord webhook failed:", err);
  }
}

export async function notifyNewJobs(count: number, highMatchCount: number) {
  if (count === 0) return;
  let msg = `🔍 ${count} new job posting${count !== 1 ? "s" : ""} found`;
  if (highMatchCount > 0) {
    msg += `, ${highMatchCount} of which ${highMatchCount !== 1 ? "are" : "is a"} high match${highMatchCount !== 1 ? "es" : ""}!`;
  } else {
    msg += "!";
  }
  await send("```\n" + msg + "\n```");
}

export async function notifyClaudeUsage(usedUsd: number, initialBalanceUsd: number) {
  if (initialBalanceUsd <= 0) return;
  const pct = (usedUsd / initialBalanceUsd) * 100;
  if (pct >= 80) {
    const remaining = Math.max(initialBalanceUsd - usedUsd, 0);
    await send(
      "```\n" +
      `⚠️ Claude API credit at ${Math.round(pct)}%\n` +
      `Used: $${usedUsd.toFixed(2)} / $${initialBalanceUsd.toFixed(2)}\n` +
      `Remaining: $${remaining.toFixed(2)}\n` +
      "```"
    );
  }
}

export async function notifyApifyUsage(usedUsd: number, limitUsd: number) {
  if (limitUsd <= 0) return;
  const pct = (usedUsd / limitUsd) * 100;
  if (pct >= 80) {
    await send(
      "```\n" +
      `⚠️ Apify API credit at ${Math.round(pct)}%\n` +
      `Used: $${usedUsd.toFixed(2)} / $${limitUsd.toFixed(2)}\n` +
      `Remaining: $${(limitUsd - usedUsd).toFixed(2)}\n` +
      "```"
    );
  }
}
