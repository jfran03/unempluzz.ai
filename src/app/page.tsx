import { ResumeUpload } from "@/components/dashboard/ResumeUpload";
import { KeywordManager } from "@/components/dashboard/KeywordManager";
import { WebsiteManager } from "@/components/dashboard/WebsiteManager";
import { ScrapeButton } from "@/components/dashboard/ScrapeButton";

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">
          Configure your job search preferences
        </p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <ResumeUpload />
        <ScrapeButton />
      </div>
      <KeywordManager />
      <WebsiteManager />
    </div>
  );
}
