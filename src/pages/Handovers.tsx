import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Banknote, Smartphone, CheckCircle, Clock, AlertCircle, Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const Handovers = () => {
  const { user, role } = useAuth();
  const qc = useQueryClient();

  const isManagerOrAdmin = role === "super_admin" || role === "manager";

  const { data: handovers, isLoading } = useQuery({
    queryKey: ["handovers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("handovers")
        .select("*")
        .order("handover_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const pendingAmount = handovers?.filter((h) => h.status === "pending").reduce((s, h) => s + Number(h.cash_amount) + Number(h.upi_amount), 0) || 0;
  const awaitingAmount = handovers?.filter((h) => h.status === "awaiting_confirmation").reduce((s, h) => s + Number(h.cash_amount) + Number(h.upi_amount), 0) || 0;
  const confirmedToday = handovers?.filter((h) => h.status === "confirmed" && h.handover_date === new Date().toISOString().split("T")[0]).reduce((s, h) => s + Number(h.cash_amount) + Number(h.upi_amount), 0) || 0;

  const handleConfirm = async (handoverId: string) => {
    const { error } = await supabase.from("handovers").update({
      status: "confirmed",
      confirmed_by: user!.id,
      confirmed_at: new Date().toISOString(),
    }).eq("id", handoverId);
    if (error) toast.error(error.message);
    else { toast.success("Handover confirmed"); qc.invalidateQueries({ queryKey: ["handovers"] }); }
  };

  const handleMarkHandover = async (handoverId: string) => {
    const { error } = await supabase.from("handovers").update({
      status: "awaiting_confirmation",
      handed_to: user!.id, // In real app, would select manager
    }).eq("id", handoverId);
    if (error) toast.error(error.message);
    else { toast.success("Marked as handed over"); qc.invalidateQueries({ queryKey: ["handovers"] }); }
  };

  const getBorderColor = (status: string) => {
    switch (status) {
      case "pending": return "border-l-destructive";
      case "awaiting_confirmation": return "border-l-warning";
      case "confirmed": return "border-l-success";
      default: return "border-l-muted";
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Handovers" subtitle="Track cash and UPI collection handovers" />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
              <AlertCircle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Not Handed Over</p>
              <p className="text-xl font-bold">₹{pendingAmount.toLocaleString()}</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
              <Clock className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Awaiting Confirmation</p>
              <p className="text-xl font-bold">₹{awaitingAmount.toLocaleString()}</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
              <CheckCircle className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Confirmed Today</p>
              <p className="text-xl font-bold">₹{confirmedToday.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {(!handovers || handovers.length === 0) ? (
          <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
            No handover records yet. Handovers are created automatically when sales or transactions are recorded.
          </div>
        ) : (
          handovers.map((item) => (
            <div key={item.id} className={`rounded-xl border bg-card p-5 border-l-4 ${getBorderColor(item.status)}`}>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium">📅 {item.handover_date}</span>
                    <StatusBadge
                      status={item.status === "confirmed" ? "active" : item.status === "awaiting_confirmation" ? "pending" : "inactive"}
                      label={item.status === "confirmed" ? "Confirmed" : item.status === "awaiting_confirmation" ? "Awaiting confirmation" : "Not handed over"}
                    />
                  </div>
                  <p className="font-semibold">Handover #{item.id.slice(0, 8)}</p>
                  <div className="flex items-center gap-4 mt-2 text-sm">
                    <span className="flex items-center gap-1.5">
                      <Banknote className="h-4 w-4 text-success" />Cash: ₹{Number(item.cash_amount).toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Smartphone className="h-4 w-4 text-info" />UPI: ₹{Number(item.upi_amount).toLocaleString()}
                    </span>
                  </div>
                </div>
                {item.status === "pending" && !isManagerOrAdmin && (
                  <Button size="sm" onClick={() => handleMarkHandover(item.id)}>Mark as Handed Over</Button>
                )}
                {item.status === "awaiting_confirmation" && isManagerOrAdmin && (
                  <Button size="sm" onClick={() => handleConfirm(item.id)}>Confirm Receipt</Button>
                )}
                {item.status === "pending" && isManagerOrAdmin && (
                  <Button size="sm" onClick={() => handleConfirm(item.id)}>Mark as Collected</Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Handovers;
