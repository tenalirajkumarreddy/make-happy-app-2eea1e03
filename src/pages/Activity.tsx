import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { Badge } from "@/components/ui/badge";

const activities = [
  { time: "14:32", user: "Agent Rajesh", action: "Recorded sale", entity: "Tea Stall - MG Road", type: "Sale" },
  { time: "14:15", user: "Marketer Amit", action: "Created order", entity: "Bakery - Jayanagar", type: "Order" },
  { time: "13:50", user: "Admin", action: "Updated pricing", entity: "500ML Water Bottle", type: "Product" },
  { time: "12:30", user: "Agent Priya", action: "Marked as visited", entity: "Corner Shop - BTM", type: "Route" },
  { time: "11:00", user: "Manager Vikram", action: "Approved KYC", entity: "Sunita Devi", type: "Customer" },
];

const columns = [
  { header: "Time", accessor: "time" as const, className: "font-mono text-xs" },
  { header: "User", accessor: "user" as const, className: "font-medium" },
  { header: "Action", accessor: "action" as const },
  { header: "Entity", accessor: "entity" as const, className: "text-muted-foreground" },
  { header: "Type", accessor: (row: typeof activities[0]) => <Badge variant="outline">{row.type}</Badge> },
];

const Activity = () => (
  <div className="space-y-6 animate-fade-in">
    <PageHeader title="Activity Log" subtitle="Track all system actions and changes" />
    <DataTable columns={columns} data={activities} searchKey="user" searchPlaceholder="Search by user..." />
  </div>
);

export default Activity;
