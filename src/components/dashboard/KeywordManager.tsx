"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, Plus, Tags } from "lucide-react";
import { toast } from "sonner";

type Keyword = { id: string; value: string };

export function KeywordManager() {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchKeywords = useCallback(async () => {
    const res = await fetch("/api/keywords");
    setKeywords(await res.json());
  }, []);

  useEffect(() => {
    fetchKeywords();
  }, [fetchKeywords]);

  async function addKeyword(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    setLoading(true);
    const res = await fetch("/api/keywords", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: value.trim() }),
    });
    if (res.ok) {
      setValue("");
      await fetchKeywords();
      toast.success("Keyword added");
    } else {
      const err = await res.json();
      toast.error(err.error || "Failed to add keyword");
    }
    setLoading(false);
  }

  async function removeKeyword(id: string) {
    await fetch(`/api/keywords?id=${id}`, { method: "DELETE" });
    await fetchKeywords();
    toast.success("Keyword removed");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tags className="h-5 w-5" />
          Keywords
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={addKeyword} className="flex gap-2">
          <Input
            placeholder="e.g. software engineer, react, python..."
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <Button type="submit" size="sm" disabled={loading}>
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </form>
        <div className="flex flex-wrap gap-2">
          {keywords.map((k) => (
            <Badge key={k.id} variant="secondary" className="gap-1 pr-1">
              {k.value}
              <button
                onClick={() => removeKeyword(k.id)}
                className="ml-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {keywords.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No keywords yet. Add keywords the AI will use to evaluate job
              relevance.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
