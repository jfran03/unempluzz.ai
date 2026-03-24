"use client";

import { useState, useEffect, useCallback } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowUpDown, Check, ChevronLeft, ChevronRight, ExternalLink, Star, ThumbsUp, ThumbsDown } from "lucide-react";
import { JobDetailSheet } from "./JobDetailSheet";
import { format } from "date-fns";

export type Job = {
  id: string;
  title: string;
  company: string;
  description: string;
  qualifications: string | null;
  url: string;
  province: string | null;
  city: string | null;
  address: string | null;
  jobType: string | null;
  workplaceType: string | null;
  jobDuration: string | null;
  jobCommitment: string | null;
  applicationDeadline: string | null;
  scrapedAt: string;
  applied: boolean;
  appliedAt: string | null;
  viewedAt: string | null;
  sourceWebsite: string | null;
  matchFeedback: string | null;
};

export function JobTable() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filter, setFilter] = useState("high-match");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [newCount, setNewCount] = useState(0);
  const [highMatchIds, setHighMatchIds] = useState<Set<string>>(new Set());

  const fetchJobs = useCallback(async (f: string) => {
    const res = await fetch(`/api/jobs?filter=${f}`);
    const data = await res.json();
    setJobs(data);
  }, []);

  const refreshHighMatchIds = useCallback(async () => {
    const res = await fetch("/api/jobs?filter=high-match");
    const data: Job[] = await res.json();
    setHighMatchIds(new Set(data.map((j) => j.id)));
  }, []);

  // Get new count and high-match IDs on mount
  useEffect(() => {
    fetch("/api/jobs?filter=new")
      .then((r) => r.json())
      .then((data) => setNewCount(data.length));
    refreshHighMatchIds();
  }, [refreshHighMatchIds]);

  useEffect(() => {
    fetchJobs(filter);
  }, [filter, fetchJobs]);

  // Mark as viewed only when the "new" tab is visited
  useEffect(() => {
    if (filter === "new") {
      fetch("/api/jobs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markViewed: true }),
      }).then(() => {
        setNewCount(0);
      });
    }
  }, [filter]);

  async function toggleApplied(job: Job) {
    await fetch("/api/jobs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: job.id, applied: !job.applied }),
    });
    fetchJobs(filter);
  }

  async function handleMatchFeedback(job: Job, feedback: "up" | "down" | null) {
    await fetch("/api/jobs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: job.id, matchFeedback: feedback }),
    });
    // Update the selected job locally so the UI reflects immediately
    setSelectedJob((prev) => prev && prev.id === job.id ? { ...prev, matchFeedback: feedback } : prev);
    fetchJobs(filter);
    refreshHighMatchIds();
  }

  const columns: ColumnDef<Job>[] = [
    {
      id: "match",
      header: "Match",
      cell: ({ row }) => {
        const job = row.original;
        return (
          <div className="flex items-center gap-1">
            <Button
              variant={job.matchFeedback === "up" ? "default" : "ghost"}
              size="icon"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation();
                handleMatchFeedback(job, job.matchFeedback === "up" ? null : "up");
              }}
              title="Good match — include in High Match"
            >
              <ThumbsUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={job.matchFeedback === "down" ? "destructive" : "ghost"}
              size="icon"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation();
                handleMatchFeedback(job, job.matchFeedback === "down" ? null : "down");
              }}
              title="Not a match — exclude from High Match"
            >
              <ThumbsDown className="h-3.5 w-3.5" />
            </Button>
          </div>
        );
      },
    },
    {
      accessorKey: "title",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="-ml-4"
        >
          Title
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="font-medium max-w-[280px] truncate flex items-center gap-1.5" title={row.getValue("title")}>
          {highMatchIds.has(row.original.id) && (
            <Star className="h-3.5 w-3.5 shrink-0 fill-yellow-400 text-yellow-400" />
          )}
          {row.getValue("title")}
        </div>
      ),
    },
    {
      accessorKey: "company",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="-ml-4"
        >
          Company
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="max-w-[180px] truncate" title={row.getValue("company")}>
          {row.getValue("company")}
        </div>
      ),
    },
    {
      accessorKey: "city",
      header: "Location",
      cell: ({ row }) => {
        const city = row.original.city;
        const province = row.original.province;
        const location = city || province
          ? [city, province].filter(Boolean).join(", ")
          : "-";
        return (
          <div className="max-w-[150px] truncate" title={location}>
            {location}
          </div>
        );
      },
    },
    {
      accessorKey: "workplaceType",
      header: "Workplace",
      cell: ({ row }) => {
        const val = row.getValue("workplaceType") as string | null;
        if (!val) return "-";
        return <Badge variant="outline">{val}</Badge>;
      },
    },
    {
      accessorKey: "jobDuration",
      header: "Duration",
      cell: ({ row }) => {
        const val = row.getValue("jobDuration") as string | null;
        return val || "-";
      },
    },
    {
      accessorKey: "jobCommitment",
      header: "Commitment",
      cell: ({ row }) => {
        const val = row.getValue("jobCommitment") as string | null;
        return val || "-";
      },
    },
    {
      accessorKey: "applicationDeadline",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="-ml-4"
        >
          Deadline
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const val = row.getValue("applicationDeadline") as string | null;
        if (val) return format(new Date(val), "MMM d, yyyy");
        const scraped = row.original.scrapedAt;
        const expiresAt = new Date(new Date(scraped).getTime() + 14 * 24 * 60 * 60 * 1000);
        return (
          <span className="text-muted-foreground" title="No deadline listed — removed 14 days after scrape">
            ~{format(expiresAt, "MMM d")} (no deadline)
          </span>
        );
      },
    },
    {
      accessorKey: "applied",
      header: "Applied",
      cell: ({ row }) => {
        return row.getValue("applied") ? (
          <Check className="h-4 w-4 text-green-600" />
        ) : null;
      },
    },
    {
      id: "link",
      cell: ({ row }) => (
        <a
          href={row.original.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-foreground" />
        </a>
      ),
    },
  ];

  const table = useReactTable({
    data: jobs,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
    initialState: { pagination: { pageSize: 20 } },
  });

  return (
    <div className="space-y-4">
      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList>
          <TabsTrigger value="high-match">
            <Star className="mr-1 h-3.5 w-3.5" />
            High Match
          </TabsTrigger>
          <TabsTrigger value="new">
            New{newCount > 0 ? ` (${newCount})` : ""}
          </TabsTrigger>
          <TabsTrigger value="applied">Applied</TabsTrigger>
          <TabsTrigger value="all">All Postings</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => setSelectedJob(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  {filter === "new"
                    ? "No new postings since you last checked."
                    : filter === "applied"
                      ? "No applied postings yet."
                      : filter === "high-match"
                        ? "No high-match jobs found. Upload a resume to enable matching."
                        : "No jobs found. Run the scraper from the Dashboard."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {jobs.length} job{jobs.length !== 1 ? "s" : ""}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {table.getState().pagination.pageIndex + 1} of{" "}
            {table.getPageCount()}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <JobDetailSheet
        job={selectedJob}
        onClose={() => setSelectedJob(null)}
        onToggleApplied={toggleApplied}
      />
    </div>
  );
}
