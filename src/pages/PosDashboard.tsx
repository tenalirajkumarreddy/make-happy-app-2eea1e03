import { StatCard } from "@/components/shared/StatCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ShoppingCart, Banknote, Smartphone, HandCoins } from "lucide-react";
import { DashboardSkeleton } from "@/components/shared/DashboardSkeleton";

const PosDashboard = () => {
  const { user, profile } = useAuth();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["pos-dashboard", user?.id],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];

      const [salesRes, handoversRes] = await Promise.all([
        supabase.from("sales").select("total_amount, cash_amount, upi_amount").eq("recorded_by", user!.id).gte("created_at", today + "T00:00:00"),
        supabase.from("handovers").select("cash_amount, upi_amount, status").eq("user_id", user!.id),
      ]);

      const todaySales = salesRes.data || [];
      const handovers = handoversRes.data || [];
      const pendingHandover = handovers.filter((h) => h.status === "pending" || h.status === "awaiting_confirmation")
        .reduce((s, h) => s + Number(h.cash_amount) + Number(h.upi_amount), 0);

      return {
        totalSales: todaySales.reduce((s, r) => s + Number(r.total_amount), 0),
        totalCash: todaySales.reduce((s, r) => s + Number(r.cash_amount), 0),
        totalUpi: todaySales.reduce((s, r) => s + Number(r.upi_amount), 0),
        pendingHandover,
      };
    },
    enabled: !!user,
  });

  if (isLoading) return <DashboardSkeleton />;
  const s = stats!;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="POS Dashboard" subtitle={`Welcome, ${profile?.full_name || "POS"}! Here's your daily summary.`} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <StatCard title="Sales Today" value={`₹${s.totalSales.toLocaleString()}`} icon={ShoppingCart} iconColor="primary" />
        <StatCard title="Cash Collected" value={`₹${s.totalCash.toLocaleString()}`} icon={Banknote} iconColor="success" />
        <StatCard title="UPI Collected" value={`₹${s.totalUpi.toLocaleString()}`} icon={Smartphone} iconColor="info" />
        <StatCard title="Pending Handover" value={`₹${s.pendingHandover.toLocaleString()}`} icon={HandCoins} iconColor="warning" />
      </div>
    </div>
  );
};

export default PosDashboard;
