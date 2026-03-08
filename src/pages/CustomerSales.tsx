import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const CustomerSales = () => {
  const { user } = useAuth();

  const { data: customer } = useQuery({
    queryKey: ["my-customer", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("customers").select("*").eq("user_id", user!.id).single();
      return data;
    },
    enabled: !!user,
  });

  const { data: sales, isLoading } = useQuery({
    queryKey: ["my-sales", customer?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales")
        .select("*, stores(name), sale_items(*, products(name, unit))")
        .eq("customer_id", customer!.id)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!customer,
  });

  const columns = [
    { header: "Sale ID", accessor: "display_id" as const, className: "font-mono text-xs" },
    { header: "Store", accessor: (row: any) => row.stores?.name || "—" },
    { header: "Items", accessor: (row: any) => <Badge variant="secondary">{row.sale_items?.length || 0} items</Badge> },
    { header: "Total", accessor: (row: any) => `₹${Number(row.total_amount).toLocaleString()}`, className: "font-semibold" },
    { header: "Paid", accessor: (row: any) => `₹${(Number(row.cash_amount) + Number(row.upi_amount)).toLocaleString()}` },
    { header: "Outstanding", accessor: (row: any) => `₹${Number(row.outstanding_amount).toLocaleString()}`, className: "text-warning font-medium" },
    { header: "Date", accessor: (row: any) => new Date(row.created_at).toLocaleDateString("en-IN"), className: "text-muted-foreground text-xs" },
  ];

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="My Sales" subtitle="View all recorded deliveries and sales" />
      <DataTable columns={columns} data={sales || []} searchKey="display_id" searchPlaceholder="Search by sale ID..." />
    </div>
  );
};

export default CustomerSales;
