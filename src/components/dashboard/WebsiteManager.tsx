"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Globe, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Website = { id: string; url: string; name: string | null; enabled: boolean };

export function WebsiteManager() {
  const [websites, setWebsites] = useState<Website[]>([]);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchWebsites = useCallback(async () => {
    const res = await fetch("/api/websites");
    setWebsites(await res.json());
  }, []);

  useEffect(() => {
    fetchWebsites();
  }, [fetchWebsites]);

  async function addWebsite(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    const res = await fetch("/api/websites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url.trim(), name: name.trim() || null }),
    });
    if (res.ok) {
      setUrl("");
      setName("");
      await fetchWebsites();
      toast.success("Website added");
    } else {
      const err = await res.json();
      toast.error(err.error || "Failed to add website");
    }
    setLoading(false);
  }

  async function removeWebsite(id: string) {
    await fetch(`/api/websites?id=${id}`, { method: "DELETE" });
    await fetchWebsites();
    toast.success("Website removed");
  }

  async function toggleEnabled(id: string, enabled: boolean) {
    await fetch("/api/websites", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, enabled: !enabled }),
    });
    await fetchWebsites();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5" />
          Target Websites
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={addWebsite} className="flex gap-2">
          <Input
            placeholder="Website URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1"
          />
          <Input
            placeholder="Name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-40"
          />
          <Button type="submit" size="sm" disabled={loading}>
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </form>
        <div className="space-y-2">
          {websites.map((w) => (
            <div
              key={w.id}
              className="flex items-center justify-between rounded-md border p-3"
            >
              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggleEnabled(w.id, w.enabled)}
                  className={`h-3 w-3 rounded-full ${
                    w.enabled ? "bg-green-500" : "bg-muted-foreground"
                  }`}
                  title={w.enabled ? "Enabled (click to disable)" : "Disabled (click to enable)"}
                />
                <div>
                  <p className="text-sm font-medium">
                    {w.name || w.url}
                  </p>
                  {w.name && (
                    <p className="text-xs text-muted-foreground">{w.url}</p>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeWebsite(w.id)}
              >
                <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
              </Button>
            </div>
          ))}
          {websites.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No websites yet. Add job board URLs for the scraper to check.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
