import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Banknote, Loader2, Send, CheckCircle, Clock, ChevronDown, ChevronUp,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { sendNotification } from "@/lib/notifications";
import { cn } from "@/lib/utils";
import { startOfDay } from "date-fns";

export function AgentHistory() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [handoverNotes, setHandoverNotes] = useState("");
  const [toUserId, setToUserId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  const today = new Date().toISOString().split("T")[0];
  const todayStart = startOfDay(new Date()).toISOString();

  // Today's sales by this agent
  const { data: mySales, isLoading: loadingSales } = useQuery({
    queryKey: ["mobile-history-sales", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales")
        .select("id, total_amount, cash_amount, upi_amount, created_at, sale_items(quantity, unit_price, products(name))")
        .eq("recorded_by", user!.id)
        .order("created_at", { ascending: false })
        .limit(200);
      return (data as any[]) || [];
    },
    enabled: !!user,
    refetchInterval: 60_000,
  });

  // My handovers
  const { data: myHandovers } = useQuery({
    queryKey: ["mobile-history-handovers", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("handovers")
        .select("id, cash_amount, upi_amount, status, created_at, notes")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      return (data as any[]) || [];
    },
    enabled: !!user,
    refetchInterval: 60_000,
  });

  // Staff list for handover recipient
  const { data: staffUsers } = useQuery({
    queryKey: ["mobile-staff-users"],
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .neq("role", "customer");
      const ids = (roles || []).map((r: any) => r.user_id).filter((id: string) => id !== user!.id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", ids)
        .eq("is_active", true);
      return profiles || [];
    },
    enabled: !!user,
  });

  // Totals
  const todaySales = (mySales || []).filter((s: any) => s.created_at >= todayStart);
  const todayCash = todaySales.reduce((s: number, r: any) => s + Number(r.cash_amount), 0);
  const todayUpi = todaySales.reduce((s: number, r: any) => s + Number(r.upi_amount), 0);
  const todayTotal = todayCash + todayUpi;

  const confirmedHandovers = (myHandovers || []).filter((h: any) => h.status === "confirmed");
  const pendingHandover = (myHandovers || []).filter((h: any) => h.status === "awaiting_confirmation");
  const totalHandedOver = confirmedHandovers.reduce(
    (s: number, h: any) => s + Number(h.cash_amount) + Number(h.upi_amount), 0
  );
  const pendingTotal = pendingHandover.reduce(
    (s: number, h: any) => s + Number(h.cash_amount) + Number(h.upi_amount), 0
  );

  const allSalesTotal = (mySales || []).reduce((s: number, r: any) => s + Number(r.cash_amount) + Number(r.upi_amount), 0);
  const notHandedOver = Math.max(0, allSalesTotal - totalHandedOver - pendingTotal);

  // Group sales by date for daily logs
  const salesByDate = (mySales || []).reduce((acc: Record<string, any[]>, s: any) => {
    const date = s.created_at.split("T")[0];
    if (!acc[date]) acc[date] = [];
    acc[date].push(s);
    return acc;
  }, {});

  const handleHandover = async () => {
    if (!toUserId || !amount || Number(amount) <= 0) {
      toast.error("Select a recipient and enter a valid amount");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("handovers").insert({
      user_id: user!.id,
      handed_to: toUserId,
      cash_amount: Number(amount),
      upi_amount: 0,
      status: "awaiting_confirmation",
      notes: handoverNotes || null,
    });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }

    toast.success("Handover sent for confirmation");
    sendNotification({
      userId: toUserId,
      title: "Handover Received",
      message: `₹${Number(amount).toLocaleString()} handover awaiting your confirmation`,
      type: "handover",
      entityType: "handover",
    });
    setHandoverOpen(false);
    setAmount("");
    setHandoverNotes("");
    setToUserId("");
    qc.invalidateQueries({ queryKey: ["mobile-history-handovers"] });
  };

  return (
    <div className="space-y-4 pb-4">
      {/* Handover summary card */}
      <div className="px-4">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Handover Summary
        </h2>
        <Card className="border-primary/20">
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Today's Sales</p>
                <p className="text-2xl font-bold mt-0.5">₹{todayTotal.toLocaleString()}</p>
                <p className="text-[11px] text-muted-foreground mt-1">Cash ₹{todayCash.toLocaleString()} · UPI ₹{todayUpi.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Pending Handover</p>
                <p className="text-2xl font-bold text-amber-600 mt-0.5">₹{notHandedOver.toLocaleString()}</p>
                {pendingTotal > 0 && (
                  <p className="text-[11px] text-amber-500 mt-1">{pendingHandover.length} awaiting confirmation</p>
                )}
              </div>
            </div>
            {confirmedHandovers.length > 0 && (
              <div className="border-t pt-2">
                <p className="text-xs text-muted-foreground">
                  Total Handed Over: <span className="font-semibold text-foreground">₹{totalHandedOver.toLocaleString()}</span>
                </p>
              </div>
            )}
            <Button
              className="w-full rounded-xl h-11"
              onClick={() => setHandoverOpen(true)}
              disabled={notHandedOver <= 0}
            >
              <Send className="h-4 w-4 mr-2" />
              Mark as Handed Over
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Recent handovers */}
      {(myHandovers?.length ?? 0) > 0 && (
        <div className="px-4">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Recent Handovers
          </h2>
          <div className="space-y-2">
            {myHandovers!.slice(0, 5).map((h: any) => (
              <div
                key={h.id}
                className="flex items-center gap-3 p-3 rounded-xl border"
              >
                {h.status === "confirmed" ? (
                  <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                ) : (
                  <Clock className="h-4 w-4 text-amber-500 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-base font-semibold">₹{(Number(h.cash_amount) + Number(h.upi_amount)).toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(h.created_at).toLocaleDateString()}
                  </p>
                </div>
                <Badge
                  variant={h.status === "confirmed" ? "default" : "secondary"}
                  className="text-[10px] shrink-0"
                >
                  {h.status === "confirmed" ? "Confirmed" : "Pending"}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Daily logs */}
      <div className="px-4">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Daily Logs
        </h2>
        {loadingSales ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : Object.keys(salesByDate).length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-4 text-center">
              <p className="text-sm text-muted-foreground">No sales recorded yet</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {Object.entries(salesByDate).map(([date, daySales]) => {
              const dayTotal = (daySales as any[]).reduce((s, r) => s + Number(r.total_amount), 0);
              const dayCash = (daySales as any[]).reduce((s, r) => s + Number(r.cash_amount), 0);
              const dayUpi = (daySales as any[]).reduce((s, r) => s + Number(r.upi_amount), 0);
              const isToday = date === today;
              const isExpanded = expandedDate === date;

              // Product breakdown
              const productTotals: Record<string, number> = {};
              (daySales as any[]).forEach((sale: any) => {
                (sale.sale_items || []).forEach((item: any) => {
                  const n = item.products?.name ?? "Unknown";
                  productTotals[n] = (productTotals[n] ?? 0) + item.quantity;
                });
              });

              return (
                <Card key={date}>
                  <button
                    className="w-full text-left"
                    onClick={() => setExpandedDate(isExpanded ? null : date)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold">
                              {isToday ? "Today" : new Date(date + "T12:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                            </p>
                            {isToday && <Badge variant="default" className="text-[10px] h-4">Today</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {(daySales as any[]).length} sale{(daySales as any[]).length > 1 ? "s" : ""} · Cash ₹{dayCash.toLocaleString()} · UPI ₹{dayUpi.toLocaleString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-base font-bold">₹{dayTotal.toLocaleString()}</span>
                          {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        </div>
                      </div>

                      {isExpanded && Object.keys(productTotals).length > 0 && (
                        <div className="mt-3 pt-3 border-t space-y-1">
                          <p className="text-xs font-medium text-muted-foreground mb-1.5">Products sold</p>
                          {Object.entries(productTotals).map(([name, qty]) => (
                            <div key={name} className="flex justify-between text-xs">
                              <span className="text-foreground">{name}</span>
                              <span className="font-medium text-muted-foreground">{qty} units</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </button>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Handover Sheet */}
      <Sheet open={handoverOpen} onOpenChange={setHandoverOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-10">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              <Banknote className="h-4 w-4" />
              Hand Over Cash
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Hand over to</Label>
              <Select value={toUserId} onValueChange={setToUserId}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Select recipient..." />
                </SelectTrigger>
                <SelectContent>
                  {(staffUsers as any[] || []).map((s: any) => (
                    <SelectItem key={s.user_id} value={s.user_id}>{s.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">
                Amount · Balance: ₹{notHandedOver.toLocaleString()}
              </Label>
              <Input
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount"
                className="h-11 rounded-xl text-base"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Notes (optional)</Label>
              <Textarea
                value={handoverNotes}
                onChange={(e) => setHandoverNotes(e.target.value)}
                placeholder="e.g. Cash bag #2, ref number..."
                className="rounded-xl resize-none"
                rows={2}
              />
            </div>
            <Button
              className="w-full h-12 rounded-xl text-base"
              onClick={handleHandover}
              disabled={submitting}
            >
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "Submit Handover"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
