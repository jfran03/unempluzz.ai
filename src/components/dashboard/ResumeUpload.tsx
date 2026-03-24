"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Upload } from "lucide-react";
import { toast } from "sonner";

type ResumeInfo = {
  id: string;
  filename: string;
  uploadedAt: string;
} | null;

export function ResumeUpload() {
  const [resume, setResume] = useState<ResumeInfo>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchResume = useCallback(async () => {
    const res = await fetch("/api/resume");
    const data = await res.json();
    setResume(data);
  }, []);

  useEffect(() => {
    fetchResume();
  }, [fetchResume]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/resume", {
      method: "POST",
      body: formData,
    });

    if (res.ok) {
      await fetchResume();
      toast.success("Resume uploaded and text extracted");
    } else {
      const text = await res.text();
      let message = "Failed to upload resume";
      try {
        const err = JSON.parse(text);
        if (err.error) message = err.error;
      } catch {}
      toast.error(message);
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Resume
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {resume ? (
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">{resume.filename}</p>
              <p className="text-xs text-muted-foreground">
                Uploaded {new Date(resume.uploadedAt).toLocaleDateString()}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              Replace
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-md border border-dashed p-8 text-center">
            <Upload className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground mb-3">
              Upload your resume (PDF) so the AI can match jobs to your profile
            </p>
            <Button
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? "Uploading..." : "Choose PDF"}
            </Button>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={handleUpload}
        />
      </CardContent>
    </Card>
  );
}
