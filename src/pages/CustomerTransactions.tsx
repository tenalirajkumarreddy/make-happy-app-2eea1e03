import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, DollarSign } from "lucide-react";
import { StatCard } from "@/components/shared/StatCard";

interface LedgerEntry {
  id: string;
  date: string;
  description: string;
  type: "delivery" | "payment";
  display_id: string;
  store_name: string;
  sale_amount: number;
  paid_amount: number;
  old_outstanding: number;
  new_outstanding: number;
}

const CustomerTransactions = () => {
  const { user } = useAuth();

  const { data: customer } = useQuery({
    queryKey: ["my-customer", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("customers").select("*").eq("user_id", user!.id).single();
      return data;
    },
    enabled: !!user,
  });

  const { data: stores } = useQuery({
    queryKey: ["my-stores-outstanding", customer?.id],
    queryFn: async () => {
      const { data } = await supabase.from("stores").select("id, name, outstanding").eq("customer_id", customer!.id);
      return data || [];
    },
    enabled: !!customer,
  });

  const { data: sales } = useQuery({
    queryKey: ["my-ledger-sales", customer?.id],
    queryFn: async () => {
      const { data } = await supabase.from("sales").select("*, stores(name)").eq("customer_id", customer!.id).order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!customer,
  });

  const { data: transactions } = useQuery({
    queryKey: ["my-ledger-txns", customer?.id],
    queryFn: async () => {
      const { data } = await supabase.from("transactions").select("*, stores(name)").eq("customer_id", customer!.id).order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!customer,
  });

  const totalOutstanding = stores?.reduce((s, st) => s + Number(st.outstanding), 0) || 0;

  // Build combined ledger
  const ledger: LedgerEntry[] = [
    ...(sales || []).map((s: any) => ({
      id: s.id,
      date: s.created_at,
      description: `Delivery — ${s.stores?.name || ""}`,
      type: "delivery" as const,
      display_id: s.display_id,
      store_name: s.stores?.name || "",
      sale_amount: Number(s.total_amount),
      paid_amount: Number(s.cash_amount) + Number(s.upi_amount),
      old_outstanding: Number(s.old_outstanding),
      new_outstanding: Number(s.new_outstanding),
    })),
    ...(transactions || []).map((t: any) => ({
      id: t.id,
      date: t.created_at,
      description: `Payment — ${t.stores?.name || ""}`,
      type: "payment" as const,
      display_id: t.display_id,
      store_name: t.stores?.name || "",
      sale_amount: 0,
      paid_amount: Number(t.total_amount),
      old_outstanding: Number(t.old_outstanding),
      new_outstanding: Number(t.new_outstanding),
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const columns = [
    { header: "Date", accessor: (row: LedgerEntry) => new Date(row.date).toLocaleDateString("en-IN"), className: "text-xs" },
    { header: "ID", accessor: "display_id" as const, className: "font-mono text-xs" },
    {
      header: "Type",
      accessor: (row: LedgerEntry) => (
        <Badge variant={row.type === "delivery" ? "default" : "secondary"}>
          {row.type === "delivery" ? "Delivery" : "Payment"}
        </Badge>
      ),
    },
    { header: "Store", accessor: "store_name" as const },
    { header: "Sale Amount", accessor: (row: LedgerEntry) => row.sale_amount > 0 ? `₹${row.sale_amount.toLocaleString()}` : "—", className: "font-medium" },
    { header: "Paid", accessor: (row: LedgerEntry) => `₹${row.paid_amount.toLocaleString()}`, className: "text-success font-medium" },
    { header: "Old Balance", accessor: (row: LedgerEntry) => `₹${row.old_outstanding.toLocaleString()}`, className: "text-muted-foreground text-xs" },
    { header: "New Balance", accessor: (row: LedgerEntry) => `₹${row.new_outstanding.toLocaleString()}`, className: "font-semibold" },
  ];

  const isLoading = !customer;

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="My Transactions" subtitle="Complete financial history across all stores" />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Total Outstanding" value={`₹${totalOutstanding.toLocaleString()}`} icon={DollarSign} iconColor="bg-warning" />
        <StatCard title="Total Deliveries" value={String(sales?.length || 0)} icon={DollarSign} />
        <StatCard title="Total Payments" value={String(transactions?.length || 0)} icon={DollarSign} iconColor="bg-success" />
      </div>

      <DataTable columns={columns} data={ledger} searchKey="display_id" searchPlaceholder="Search by ID..." />
    </div>
  );
};

export default CustomerTransactions;
