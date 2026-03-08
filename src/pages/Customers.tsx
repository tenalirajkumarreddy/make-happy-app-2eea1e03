import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";

const customers = [
  { id: "CUST-000001", name: "Rajesh Kumar", phone: "+91 98765 43210", email: "rajesh@email.com", stores: 3, outstanding: "₹12,500", kyc: "verified" as const, status: "active" as const },
  { id: "CUST-000002", name: "Priya Sharma", phone: "+91 87654 32109", email: "priya@email.com", stores: 2, outstanding: "₹8,200", kyc: "pending" as const, status: "active" as const },
  { id: "CUST-000003", name: "Amit Patel", phone: "+91 76543 21098", email: "amit@email.com", stores: 5, outstanding: "₹45,000", kyc: "verified" as const, status: "active" as const },
  { id: "CUST-000004", name: "Sunita Devi", phone: "+91 65432 10987", email: "sunita@email.com", stores: 1, outstanding: "₹0", kyc: "rejected" as const, status: "inactive" as const },
  { id: "CUST-000005", name: "Vikram Singh", phone: "+91 54321 09876", email: "vikram@email.com", stores: 4, outstanding: "₹23,800", kyc: "verified" as const, status: "active" as const },
];

const columns = [
  { header: "ID", accessor: "id" as const, className: "font-mono text-xs" },
  { header: "Name", accessor: "name" as const, className: "font-medium" },
  { header: "Phone", accessor: "phone" as const, className: "text-muted-foreground text-sm" },
  { header: "Stores", accessor: "stores" as const, className: "text-center" },
  { header: "Outstanding", accessor: "outstanding" as const, className: "font-semibold" },
  { header: "KYC", accessor: (row: typeof customers[0]) => <StatusBadge status={row.kyc} /> },
  { header: "Status", accessor: (row: typeof customers[0]) => <StatusBadge status={row.status} /> },
];

const Customers = () => {
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Customers"
        subtitle="Manage customer accounts and KYC verification"
        actionLabel="Add Customer"
      />
      <DataTable columns={columns} data={customers} searchKey="name" searchPlaceholder="Search customers..." />
    </div>
  );
};

export default Customers;
