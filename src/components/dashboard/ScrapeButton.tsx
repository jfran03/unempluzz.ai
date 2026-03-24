"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bot, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";

type ScrapeLog = {
  id: string;
  startedAt: string;
  completedAt: string | null;
  status: string;
  jobsFound: number;
  jobsNew: number;
  error: string | null;
  claudeInputTokens: number;
  claudeOutputTokens: number;
  claudeCostUsd: number;
  apifyCostUsd: number;
};

type UsageData = {
  apify: {
    usedUsd: number;
    limitUsd: number;
  } | null;
  claude: {
    initialBalanceUsd: number;
    usedUsd: number;
    remainingUsd: number;
  };
};

function UsageBar({ label, used, limit, unit = "$" }: { label: string; used: number; limit: number; unit?: string }) {
  const percent = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {unit}{used.toFixed(2)} / {unit}{limit.toFixed(2)}
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            percent > 80 ? "bg-destructive" : percent > 50 ? "bg-yellow-500" : "bg-green-500"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {percent.toFixed(1)}% used
      </p>
    </div>
  );
}

export function ScrapeButton() {
  const [scraping, setScraping] = useState(false);
  const [lastLog, setLastLog] = useState<ScrapeLog | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [editingBalance, setEditingBalance] = useState(false);
  const [balanceInput, setBalanceInput] = useState("");

  const fetchStatus = useCallback(async () => {
    const res = await fetch("/api/scrape");
    if (res.ok) {
      const data = await res.json();
      setLastLog(data);
      if (data?.status === "running") {
        setScraping(true);
      }
    }
  }, []);

  const fetchUsage = useCallback(async () => {
    const res = await fetch("/api/usage");
    if (res.ok) {
      setUsage(await res.json());
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchUsage();
  }, [fetchStatus, fetchUsage]);

  // Poll while scraping
  useEffect(() => {
    if (!scraping) return;
    const interval = setInterval(async () => {
      const res = await fetch("/api/scrape");
      if (res.ok) {
        const data = await res.json();
        setLastLog(data);
        if (data?.status !== "running") {
          setScraping(false);
          fetchUsage();
          if (data?.status === "completed") {
            toast.success(
              `Scrape complete: ${data.jobsNew} new jobs found out of ${data.jobsFound} total`
            );
          } else if (data?.status === "failed") {
            toast.error(`Scrape failed: ${data.error}`);
          }
        }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [scraping, fetchUsage]);

  async function triggerScrape() {
    setScraping(true);
    const res = await fetch("/api/scrape", { method: "POST" });
    if (!res.ok) {
      setScraping(false);
      const err = await res.json();
      toast.error(err.error || "Failed to start scrape");
    }
  }

  async function updateBalance() {
    const val = parseFloat(balanceInput);
    if (isNaN(val) || val < 0) {
      toast.error("Enter a valid balance");
      return;
    }
    const res = await fetch("/api/usage", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claudeBalance: val }),
    });
    if (res.ok) {
      setEditingBalance(false);
      fetchUsage();
      toast.success("Claude balance updated");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          Scraper
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          onClick={triggerScrape}
          disabled={scraping}
          className="w-full"
        >
          {scraping ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Scraping...
            </>
          ) : (
            "Run Scrape Now"
          )}
        </Button>

        {/* Usage section */}
        {usage && (
          <div className="rounded-md border p-3 space-y-4">
            {/* Claude credits */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Claude Credits</span>
                {editingBalance ? (
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={balanceInput}
                      onChange={(e) => setBalanceInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && updateBalance()}
                      className="w-20 rounded border bg-background px-1.5 py-0.5 text-sm"
                      autoFocus
                    />
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={updateBalance}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setEditingBalance(false)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    ${usage.claude.remainingUsd.toFixed(2)} remaining
                    <button
                      onClick={() => {
                        setBalanceInput(String(usage.claude.initialBalanceUsd));
                        setEditingBalance(true);
                      }}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  </span>
                )}
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    usage.claude.initialBalanceUsd > 0 && (usage.claude.usedUsd / usage.claude.initialBalanceUsd) * 100 > 80
                      ? "bg-destructive"
                      : (usage.claude.usedUsd / usage.claude.initialBalanceUsd) * 100 > 50
                        ? "bg-yellow-500"
                        : "bg-green-500"
                  }`}
                  style={{
                    width: `${usage.claude.initialBalanceUsd > 0 ? Math.min((usage.claude.usedUsd / usage.claude.initialBalanceUsd) * 100, 100) : 0}%`,
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                ${usage.claude.usedUsd.toFixed(4)} used of ${usage.claude.initialBalanceUsd.toFixed(2)} balance
              </p>
            </div>

            {/* Apify credits */}
            {usage.apify && (
              <UsageBar
                label="Apify Credits"
                used={usage.apify.usedUsd}
                limit={usage.apify.limitUsd}
              />
            )}
          </div>
        )}

        {lastLog && lastLog.status !== "running" && (
          <div className="text-sm text-muted-foreground space-y-1">
            <p>
              Last run:{" "}
              {new Date(lastLog.startedAt).toLocaleString()}
            </p>
            <p>
              Status:{" "}
              <span
                className={
                  lastLog.status === "completed"
                    ? "text-green-600"
                    : "text-destructive"
                }
              >
                {lastLog.status}
              </span>
            </p>
            {lastLog.status === "completed" && (
              <>
                <p>
                  Found {lastLog.jobsFound} jobs ({lastLog.jobsNew} new)
                </p>
                <div className="mt-2 rounded-md border p-2 space-y-1 text-xs">
                  <p className="font-medium text-foreground">Last Run Cost</p>
                  <p>
                    Claude: {lastLog.claudeInputTokens.toLocaleString()} in / {lastLog.claudeOutputTokens.toLocaleString()} out tokens
                    {" "}(${lastLog.claudeCostUsd.toFixed(4)})
                  </p>
                  <p>
                    Apify: ${lastLog.apifyCostUsd.toFixed(4)}
                  </p>
                  <p className="font-medium text-foreground">
                    Total: ${(lastLog.claudeCostUsd + lastLog.apifyCostUsd).toFixed(4)}
                  </p>
                </div>
              </>
            )}
            {lastLog.error && (
              <p className="text-destructive">{lastLog.error}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
