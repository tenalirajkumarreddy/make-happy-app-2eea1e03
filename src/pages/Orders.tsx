import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";

const orders = [
  { id: "ORD-012345", store: "Tea Stall - MG Road", type: "Simple", orderType: "Manual", status: "pending" as const, createdBy: "Marketer Amit", date: "2026-03-08 09:00" },
  { id: "ORD-012346", store: "Bakery - Jayanagar", type: "Detailed", orderType: "Auto", status: "delivered" as const, createdBy: "System", date: "2026-03-08 03:00" },
  { id: "ORD-012347", store: "Restaurant - Koramangala", type: "Detailed", orderType: "Manual", status: "pending" as const, createdBy: "Customer", date: "2026-03-07 22:15" },
  { id: "ORD-012348", store: "Corner Shop - BTM", type: "Simple", orderType: "Manual", status: "cancelled" as const, createdBy: "Marketer Priya", date: "2026-03-07 15:30" },
  { id: "ORD-012349", store: "Wholesale Mart", type: "Detailed", orderType: "Auto", status: "delivered" as const, createdBy: "System", date: "2026-03-07 03:00" },
];

const columns = [
  { header: "Order ID", accessor: "id" as const, className: "font-mono text-xs" },
  { header: "Store", accessor: "store" as const, className: "font-medium" },
  { header: "Type", accessor: (row: typeof orders[0]) => <Badge variant="secondary">{row.type}</Badge> },
  { header: "Source", accessor: (row: typeof orders[0]) => <Badge variant="outline">{row.orderType}</Badge> },
  { header: "Created By", accessor: "createdBy" as const, className: "text-muted-foreground text-sm" },
  { header: "Status", accessor: (row: typeof orders[0]) => <StatusBadge status={row.status} /> },
  { header: "Date", accessor: "date" as const, className: "text-muted-foreground text-xs" },
];

const Orders = () => {
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Orders" subtitle="Manage customer orders and fulfillment" actionLabel="Create Order" />
      <DataTable columns={columns} data={orders} searchKey="store" searchPlaceholder="Search by store..." />
    </div>
  );
};

export default Orders;
