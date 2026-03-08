import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";

const transactions = [
  { id: "PAY-000001", store: "Tea Stall - MG Road", cash: "₹500", upi: "₹0", total: "₹500", oldBal: "₹5,700", newBal: "₹5,200", by: "Agent001", date: "2026-03-08 14:20" },
  { id: "PAY-000002", store: "Wholesale Mart", cash: "₹5,000", upi: "₹3,000", total: "₹8,000", oldBal: "₹20,000", newBal: "₹12,000", by: "Agent003", date: "2026-03-08 11:00" },
  { id: "PAY-000003", store: "Restaurant - Koramangala", cash: "₹0", upi: "₹10,000", total: "₹10,000", oldBal: "₹18,500", newBal: "₹8,500", by: "Agent001", date: "2026-03-07 16:30" },
];

const columns = [
  { header: "Payment ID", accessor: "id" as const, className: "font-mono text-xs" },
  { header: "Store", accessor: "store" as const, className: "font-medium" },
  { header: "Cash", accessor: "cash" as const, className: "text-success text-sm" },
  { header: "UPI", accessor: "upi" as const, className: "text-info text-sm" },
  { header: "Total", accessor: "total" as const, className: "font-semibold" },
  { header: "Old Balance", accessor: "oldBal" as const, className: "text-muted-foreground text-sm" },
  { header: "New Balance", accessor: "newBal" as const, className: "text-sm" },
  { header: "By", accessor: "by" as const, className: "text-muted-foreground text-sm" },
  { header: "Date", accessor: "date" as const, className: "text-muted-foreground text-xs" },
];

const Transactions = () => {
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Transactions" subtitle="View and record payment transactions" actionLabel="Record Transaction" />
      <DataTable columns={columns} data={transactions} searchKey="store" searchPlaceholder="Search by store..." />
    </div>
  );
};

export default Transactions;
