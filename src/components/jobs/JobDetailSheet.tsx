"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ExternalLink, Check, MapPin, Calendar, Building2 } from "lucide-react";
import { format } from "date-fns";
import type { Job } from "./JobTable";

type Props = {
  job: Job | null;
  onClose: () => void;
  onToggleApplied: (job: Job) => void;
};

export function JobDetailSheet({ job, onClose, onToggleApplied }: Props) {
  if (!job) return null;

  const location = [job.city, job.province].filter(Boolean).join(", ");

  return (
    <Dialog open={!!job} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">{job.title}</DialogTitle>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Building2 className="h-4 w-4" />
            {job.company}
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Meta badges */}
          <div className="flex flex-wrap gap-2">
            {job.workplaceType && (
              <Badge variant="outline">{job.workplaceType}</Badge>
            )}
            {job.jobDuration && (
              <Badge variant="outline">{job.jobDuration}</Badge>
            )}
            {job.jobCommitment && (
              <Badge variant="outline">{job.jobCommitment}</Badge>
            )}
            {job.jobType && (
              <Badge variant="secondary">{job.jobType}</Badge>
            )}
          </div>

          {/* Location */}
          {location && (
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              {location}
              {job.address && ` - ${job.address}`}
            </div>
          )}

          {/* Deadline */}
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            {job.applicationDeadline ? (
              <>Deadline: {format(new Date(job.applicationDeadline), "MMMM d, yyyy")}</>
            ) : (
              <span className="text-muted-foreground">
                No deadline listed — expires{" "}
                {format(new Date(new Date(job.scrapedAt).getTime() + 14 * 24 * 60 * 60 * 1000), "MMMM d, yyyy")}{" "}
                (14 days after scrape)
              </span>
            )}
          </div>

          <Separator />

          {/* Description */}
          <div>
            <h3 className="font-semibold mb-2">Description</h3>
            <p className="text-sm whitespace-pre-wrap">{job.description}</p>
          </div>

          {/* Qualifications */}
          {job.qualifications && (
            <div>
              <h3 className="font-semibold mb-2">Qualifications</h3>
              <p className="text-sm whitespace-pre-wrap">
                {job.qualifications}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              variant={job.applied ? "secondary" : "default"}
              onClick={() => onToggleApplied(job)}
              className="flex-1"
            >
              {job.applied ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Applied
                </>
              ) : (
                "Mark as Applied"
              )}
            </Button>
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline">
                <ExternalLink className="h-4 w-4 mr-2" />
                View Posting
              </Button>
            </a>
          </div>

          {/* Source info */}
          <p className="text-xs text-muted-foreground">
            Scraped {format(new Date(job.scrapedAt), "MMM d, yyyy 'at' h:mm a")}
            {job.sourceWebsite && ` from ${job.sourceWebsite}`}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
