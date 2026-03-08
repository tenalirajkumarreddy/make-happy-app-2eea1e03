import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";

const sales = [
  { id: "SALE-000001", store: "Tea Stall - MG Road", type: "Retail", total: "₹1,200", cash: "₹500", upi: "₹200", outstanding: "₹500", agent: "Agent001", date: "2026-03-08 11:55" },
  { id: "SALE-000002", store: "Bakery - Jayanagar", type: "Retail", total: "₹3,450", cash: "₹3,450", upi: "₹0", outstanding: "₹0", agent: "Agent002", date: "2026-03-08 10:30" },
  { id: "SALE-000003", store: "Restaurant - Koramangala", type: "Restaurant", total: "₹8,900", cash: "₹5,000", upi: "₹3,900", outstanding: "₹0", agent: "Agent001", date: "2026-03-08 09:15" },
  { id: "SALE-000004", store: "Wholesale Mart", type: "Wholesale", total: "₹25,600", cash: "₹10,000", upi: "₹5,000", outstanding: "₹10,600", agent: "Agent003", date: "2026-03-07 16:45" },
];

const columns = [
  { header: "Sale ID", accessor: "id" as const, className: "font-mono text-xs" },
  { header: "Store", accessor: "store" as const, className: "font-medium" },
  { header: "Total", accessor: "total" as const, className: "font-semibold" },
  { header: "Cash", accessor: "cash" as const, className: "text-success text-sm" },
  { header: "UPI", accessor: "upi" as const, className: "text-info text-sm" },
  { header: "Outstanding", accessor: "outstanding" as const, className: "text-sm" },
  { header: "Agent", accessor: "agent" as const, className: "text-muted-foreground text-sm" },
  { header: "Date", accessor: "date" as const, className: "text-muted-foreground text-xs" },
];

const Sales = () => {
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Sales" subtitle="View and record sales transactions" actionLabel="Record Sale" />
      <DataTable columns={columns} data={sales} searchKey="store" searchPlaceholder="Search by store..." />
    </div>
  );
};

export default Sales;
