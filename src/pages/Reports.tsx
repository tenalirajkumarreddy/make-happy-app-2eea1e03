import { PageHeader } from "@/components/shared/PageHeader";
import { BarChart3, FileText, TrendingUp, Users } from "lucide-react";

const reportTypes = [
  { title: "Daily Report", description: "Sales, transactions, and user performance for a specific day", icon: FileText, color: "bg-primary" },
  { title: "Sales Report", description: "Detailed sales analytics by store, route, and agent", icon: BarChart3, color: "bg-success" },
  { title: "Outstanding Report", description: "Customer risk categories and outstanding trends", icon: TrendingUp, color: "bg-warning" },
  { title: "Agent Performance", description: "Agent-wise sales, collections, and route coverage", icon: Users, color: "bg-info" },
];

const Reports = () => {
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Reports" subtitle="Generate and view business reports" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {reportTypes.map((report) => (
          <button
            key={report.title}
            className="flex items-start gap-4 rounded-xl border bg-card p-5 text-left hover:shadow-md transition-shadow"
          >
            <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${report.color}`}>
              <report.icon className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h3 className="font-semibold">{report.title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{report.description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default Reports;
