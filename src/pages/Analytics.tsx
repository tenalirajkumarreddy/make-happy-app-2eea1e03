import { PageHeader } from "@/components/shared/PageHeader";

const Analytics = () => (
  <div className="space-y-6 animate-fade-in">
    <PageHeader title="Analytics" subtitle="Business intelligence and performance metrics" />
    <div className="flex items-center justify-center rounded-xl border bg-card p-16 text-center">
      <div>
        <p className="text-lg font-semibold">Analytics Dashboard</p>
        <p className="text-sm text-muted-foreground mt-1">Charts, graphs, and deep insights will be available here.</p>
      </div>
    </div>
  </div>
);

export default Analytics;
