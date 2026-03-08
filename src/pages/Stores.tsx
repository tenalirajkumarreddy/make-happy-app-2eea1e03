import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";

const stores = [
  { id: "STR-000001", name: "Tea Stall - MG Road", customer: "Rajesh Kumar", type: "Retail", route: "MG Road Route", outstanding: "₹5,200", status: "active" as const },
  { id: "STR-000002", name: "Bakery - Jayanagar", customer: "Rajesh Kumar", type: "Retail", route: "South Bangalore", outstanding: "₹3,100", status: "active" as const },
  { id: "STR-000003", name: "Restaurant - Koramangala", customer: "Amit Patel", type: "Restaurant", route: "East Route", outstanding: "₹18,500", status: "active" as const },
  { id: "STR-000004", name: "Wholesale Mart", customer: "Amit Patel", type: "Wholesale", route: "Industrial Area", outstanding: "₹12,000", status: "active" as const },
  { id: "STR-000005", name: "Corner Shop - BTM", customer: "Priya Sharma", type: "Retail", route: "BTM Route", outstanding: "₹8,200", status: "inactive" as const },
];

const columns = [
  { header: "ID", accessor: "id" as const, className: "font-mono text-xs" },
  { header: "Store Name", accessor: "name" as const, className: "font-medium" },
  { header: "Customer", accessor: "customer" as const, className: "text-muted-foreground text-sm" },
  { header: "Type", accessor: (row: typeof stores[0]) => <Badge variant="secondary">{row.type}</Badge> },
  { header: "Route", accessor: "route" as const, className: "text-sm" },
  { header: "Outstanding", accessor: "outstanding" as const, className: "font-semibold" },
  { header: "Status", accessor: (row: typeof stores[0]) => <StatusBadge status={row.status} /> },
];

const Stores = () => {
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Stores" subtitle="Manage store locations and assignments" actionLabel="Add Store" />
      <DataTable columns={columns} data={stores} searchKey="name" searchPlaceholder="Search stores..." />
    </div>
  );
};

export default Stores;
