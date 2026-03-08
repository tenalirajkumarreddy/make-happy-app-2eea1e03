import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";

const products = [
  { id: "PRD-001", name: "500ML Water Bottle", sku: "WB-500", category: "Water", price: "₹120", unit: "ML", status: "active" as const },
  { id: "PRD-002", name: "1L Water Bottle", sku: "WB-1000", category: "Water", price: "₹200", unit: "L", status: "active" as const },
  { id: "PRD-003", name: "250ML Water Cup", sku: "WC-250", category: "Water", price: "₹60", unit: "ML", status: "active" as const },
  { id: "PRD-004", name: "20L Water Can", sku: "WC-20L", category: "Can", price: "₹800", unit: "L", status: "inactive" as const },
  { id: "PRD-005", name: "Soda 330ML", sku: "SD-330", category: "Soda", price: "₹45", unit: "ML", status: "active" as const },
  { id: "PRD-006", name: "Flavored Water 500ML", sku: "FW-500", category: "Flavored", price: "₹150", unit: "ML", status: "active" as const },
];

const columns = [
  { header: "ID", accessor: "id" as const, className: "font-mono text-xs" },
  { header: "Product Name", accessor: "name" as const, className: "font-medium" },
  { header: "SKU", accessor: "sku" as const, className: "font-mono text-xs text-muted-foreground" },
  { header: "Category", accessor: (row: typeof products[0]) => <Badge variant="secondary">{row.category}</Badge> },
  { header: "Base Price", accessor: "price" as const, className: "font-semibold" },
  { header: "Unit", accessor: "unit" as const },
  { header: "Status", accessor: (row: typeof products[0]) => <StatusBadge status={row.status} /> },
];

const Products = () => {
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Products"
        subtitle="Manage your product catalog and pricing"
        actionLabel="Add Product"
      />
      <DataTable columns={columns} data={products} searchKey="name" searchPlaceholder="Search products..." />
    </div>
  );
};

export default Products;
