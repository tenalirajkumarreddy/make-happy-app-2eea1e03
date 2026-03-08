import { StatCard } from "@/components/shared/StatCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Users, ClipboardList, Banknote, Smartphone } from "lucide-react";
import { DashboardSkeleton } from "@/components/shared/DashboardSkeleton";

const MarketerDashboard = () => {
  const { user, profile } = useAuth();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["marketer-dashboard", user?.id],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];

      const [ordersRes, txnRes, customersRes] = await Promise.all([
        supabase.from("orders").select("id, status").eq("created_by", user!.id),
        supabase.from("transactions").select("cash_amount, upi_amount").eq("recorded_by", user!.id).gte("created_at", today + "T00:00:00"),
        supabase.from("customers").select("id").eq("is_active", true),
      ]);

      const orders = ordersRes.data || [];
      const todayTxns = txnRes.data || [];

      return {
        totalOrders: orders.length,
        pendingOrders: orders.filter((o) => o.status === "pending").length,
        todayCash: todayTxns.reduce((s, r) => s + Number(r.cash_amount), 0),
        todayUpi: todayTxns.reduce((s, r) => s + Number(r.upi_amount), 0),
        customerCount: customersRes.data?.length || 0,
      };
    },
    enabled: !!user,
  });

  if (isLoading) return <DashboardSkeleton />;
  const s = stats!;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Dashboard" subtitle={`Welcome, ${profile?.full_name || "Marketer"}!`} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <StatCard title="Active Customers" value={String(s.customerCount)} icon={Users} iconColor="bg-primary" />
        <StatCard title="My Orders" value={String(s.totalOrders)} change={`${s.pendingOrders} pending`} changeType={s.pendingOrders > 0 ? "negative" : "positive"} icon={ClipboardList} iconColor="bg-info" />
        <StatCard title="Cash Collected" value={`₹${s.todayCash.toLocaleString()}`} icon={Banknote} iconColor="bg-warning" />
        <StatCard title="UPI Collected" value={`₹${s.todayUpi.toLocaleString()}`} icon={Smartphone} iconColor="bg-success" />
      </div>
    </div>
  );
};

export default MarketerDashboard;
