import { useQuery } from "@tanstack/react-query";
import { Banknote, HandCoins, History, ShoppingCart, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

type Props = {
  onOpenRecord: () => void;
  onOpenHistory: () => void;
};

export function PosHome({ onOpenRecord, onOpenHistory }: Props) {
  const { user, profile } = useAuth();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["mobile-pos-dashboard", user?.id],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];

      const [salesRes, handoversRes] = await Promise.all([
        supabase
          .from("sales")
          .select("total_amount, cash_amount, upi_amount")
          .eq("recorded_by", user!.id)
          .gte("created_at", `${today}T00:00:00`),
        supabase
          .from("handovers")
          .select("cash_amount, upi_amount, status")
          .eq("user_id", user!.id),
      ]);

      if (salesRes.error) throw salesRes.error;
      if (handoversRes.error) throw handoversRes.error;

      const todaySales = salesRes.data || [];
      const handovers = handoversRes.data || [];
      const pendingHandover = handovers
        .filter((handover) => handover.status === "pending" || handover.status === "awaiting_confirmation")
        .reduce((sum, handover) => sum + Number(handover.cash_amount || 0) + Number(handover.upi_amount || 0), 0);

      return {
        totalSales: todaySales.reduce((sum, row) => sum + Number(row.total_amount || 0), 0),
        totalCash: todaySales.reduce((sum, row) => sum + Number(row.cash_amount || 0), 0),
        totalUpi: todaySales.reduce((sum, row) => sum + Number(row.upi_amount || 0), 0),
        pendingHandover,
      };
    },
    enabled: !!user,
  });

  if (isLoading) {
    return (
      <div className="p-4 space-y-4 animate-pulse">
        <div>
          <Skeleton className="h-4 w-16 mb-1" />
          <Skeleton className="h-7 w-28" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-4 w-4" />
                </div>
                <Skeleton className="h-6 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 pt-1">
          <Skeleton className="h-10 w-full rounded-md" />
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
      </div>
    );
  }

  const values = stats || {
    totalSales: 0,
    totalCash: 0,
    totalUpi: 0,
    pendingHandover: 0,
  };

  const statCards = [
    { label: "Sales Today", value: values.totalSales, icon: ShoppingCart },
    { label: "Cash", value: values.totalCash, icon: Banknote },
    { label: "UPI", value: values.totalUpi, icon: Smartphone },
    { label: "Pending Handover", value: values.pendingHandover, icon: HandCoins },
  ];

  return (
    <div className="p-4 space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">Welcome</p>
        <h2 className="text-xl font-semibold">{profile?.full_name || "POS"}</h2>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {statCards.map((item) => (
          <Card key={item.label}>
            <CardContent className="p-3 space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <item.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-lg font-semibold">₹{item.value.toLocaleString("en-IN")}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 pt-1">
        <Button onClick={onOpenRecord} className="w-full">Record Sale</Button>
        <Button onClick={onOpenHistory} variant="outline" className="w-full">
          <History className="h-4 w-4 mr-2" />
          History
        </Button>
      </div>
    </div>
  );
}
