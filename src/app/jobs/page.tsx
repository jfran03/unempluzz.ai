import { JobTable } from "@/components/jobs/JobTable";

export default function JobBoardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Job Board</h2>
        <p className="text-muted-foreground">
          Browse scraped job postings
        </p>
      </div>
      <JobTable />
    </div>
  );
}
