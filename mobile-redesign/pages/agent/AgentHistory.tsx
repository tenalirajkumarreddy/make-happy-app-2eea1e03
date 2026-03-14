import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Banknote, Loader2, Send, CheckCircle, Clock, ChevronDown, ChevronUp,
  TrendingUp, Package, ArrowUpRight,
} from "lucide-react";
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

  const { data: staffUsers } = useQuery({
    queryKey: ["mobile-staff-users"],
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id").neq("role", "customer");
      const ids = (roles || []).map((r: any) => r.user_id).filter((id: string) => id !== user!.id);
      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", ids).eq("is_active", true);
      return profiles || [];
    },
    enabled: !!user,
  });

  const todaySales = (mySales || []).filter((s: any) => s.created_at >= todayStart);
  const todayCash = todaySales.reduce((s: number, r: any) => s + Number(r.cash_amount), 0);
  const todayUpi = todaySales.reduce((s: number, r: any) => s + Number(r.upi_amount), 0);
  const todayTotal = todayCash + todayUpi;

  const confirmedHandovers = (myHandovers || []).filter((h: any) => h.status === "confirmed");
  const pendingHandover = (myHandovers || []).filter((h: any) => h.status === "awaiting_confirmation");
  const totalHandedOver = confirmedHandovers.reduce((s: number, h: any) => s + Number(h.cash_amount) + Number(h.upi_amount), 0);
  const pendingTotal = pendingHandover.reduce((s: number, h: any) => s + Number(h.cash_amount) + Number(h.upi_amount), 0);
  const allSalesTotal = (mySales || []).reduce((s: number, r: any) => s + Number(r.cash_amount) + Number(r.upi_amount), 0);
  const notHandedOver = Math.max(0, allSalesTotal - totalHandedOver - pendingTotal);

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
    <div className="pb-6">
      {/* Hero section */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 dark:from-slate-900 dark:via-blue-950 dark:to-indigo-950 px-4 pt-4 pb-10">
        <p className="text-blue-200 text-xs font-medium uppercase tracking-widest">Overview</p>
        <h2 className="text-white text-xl font-bold mt-0.5">History & Handovers</h2>
      </div>

      <div className="px-4 -mt-6 space-y-4">
        {/* Today summary card */}
        <div className="rounded-2xl bg-white dark:bg-slate-800 shadow-xl border border-slate-100 dark:border-slate-700 p-4">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3">Today's Sales</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-3xl font-bold text-slate-900 dark:text-white">₹{todayTotal.toLocaleString("en-IN")}</p>
              <div className="flex gap-3 mt-2">
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  ₹{todayCash.toLocaleString("en-IN")} cash
                </span>
              </div>
              <div className="flex gap-3 mt-1">
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  <span className="h-2 w-2 rounded-full bg-violet-400" />
                  ₹{todayUpi.toLocaleString("en-IN")} UPI
                </span>
              </div>
            </div>
            <div className="border-l border-slate-100 dark:border-slate-700 pl-4">
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold mb-1">Pending Handover</p>
              <p className="text-2xl font-bold text-amber-500">₹{notHandedOver.toLocaleString("en-IN")}</p>
              {pendingTotal > 0 && (
                <p className="text-[11px] text-amber-400 mt-1">{pendingHandover.length} awaiting</p>
              )}
              {confirmedHandovers.length > 0 && (
                <p className="text-[11px] text-slate-400 mt-1">
                  ₹{totalHandedOver.toLocaleString("en-IN")} handed over
                </p>
              )}
            </div>
          </div>

          <button
            onClick={() => setHandoverOpen(true)}
            disabled={notHandedOver <= 0}
            className={cn(
              "w-full mt-4 h-12 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all",
              notHandedOver > 0
                ? "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-sm active:scale-[0.98]"
                : "bg-slate-100 dark:bg-slate-700 text-slate-400 cursor-not-allowed"
            )}
          >
            <Send className="h-4 w-4" />
            Mark as Handed Over
          </button>
        </div>

        {/* Recent handovers */}
        {(myHandovers?.length ?? 0) > 0 && (
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2.5">
              Recent Handovers
            </p>
            <div className="space-y-2">
              {myHandovers!.slice(0, 5).map((h: any) => {
                const amt = Number(h.cash_amount) + Number(h.upi_amount);
                const isConfirmed = h.status === "confirmed";
                return (
                  <div
                    key={h.id}
                    className="flex items-center gap-3 p-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm"
                  >
                    <div className={cn(
                      "h-9 w-9 rounded-xl flex items-center justify-center shrink-0",
                      isConfirmed
                        ? "bg-emerald-50 dark:bg-emerald-900/30"
                        : "bg-amber-50 dark:bg-amber-900/30"
                    )}>
                      {isConfirmed
                        ? <CheckCircle className="h-4.5 w-4.5 text-emerald-500" />
                        : <Clock className="h-4.5 w-4.5 text-amber-500" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-bold text-slate-800 dark:text-white">
                        ₹{amt.toLocaleString("en-IN")}
                      </p>
                      <p className="text-xs text-slate-400">
                        {new Date(h.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                    </div>
                    <Badge
                      className={cn(
                        "text-[10px] font-bold px-2 shrink-0",
                        isConfirmed
                          ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700"
                          : "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-700"
                      )}
                      variant="outline"
                    >
                      {isConfirmed ? "✓ Confirmed" : "⏳ Pending"}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Daily logs */}
        <div>
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2.5">
            Daily Sales Log
          </p>

          {loadingSales ? (
            <div className="flex justify-center items-center py-10 gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
              <span className="text-sm text-slate-400">Loading history...</span>
            </div>
          ) : Object.keys(salesByDate).length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-8 text-center bg-slate-50/50 dark:bg-slate-800/30">
              <div className="h-12 w-12 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-3">
                <TrendingUp className="h-6 w-6 text-slate-400" />
              </div>
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">No sales recorded yet</p>
              <p className="text-xs text-slate-400 mt-1">Your daily logs will appear here</p>
            </div>
          ) : (
            <div className="space-y-2">
              {Object.entries(salesByDate).map(([date, daySales]) => {
                const dayTotal = (daySales as any[]).reduce((s, r) => s + Number(r.total_amount), 0);
                const dayCash = (daySales as any[]).reduce((s, r) => s + Number(r.cash_amount), 0);
                const dayUpi = (daySales as any[]).reduce((s, r) => s + Number(r.upi_amount), 0);
                const isToday = date === today;
                const isExpanded = expandedDate === date;

                const productTotals: Record<string, number> = {};
                (daySales as any[]).forEach((sale: any) => {
                  (sale.sale_items || []).forEach((item: any) => {
                    const n = item.products?.name ?? "Unknown";
                    productTotals[n] = (productTotals[n] ?? 0) + item.quantity;
                  });
                });

                return (
                  <div
                    key={date}
                    className={cn(
                      "rounded-2xl bg-white dark:bg-slate-800 border shadow-sm overflow-hidden transition-all",
                      isToday
                        ? "border-blue-100 dark:border-blue-800/40"
                        : "border-slate-100 dark:border-slate-700"
                    )}
                  >
                    <button
                      className="w-full text-left"
                      onClick={() => setExpandedDate(isExpanded ? null : date)}
                    >
                      <div className="flex items-center gap-3 p-4">
                        <div className={cn(
                          "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
                          isToday
                            ? "bg-blue-50 dark:bg-blue-900/30"
                            : "bg-slate-50 dark:bg-slate-700"
                        )}>
                          <TrendingUp className={cn(
                            "h-4.5 w-4.5",
                            isToday ? "text-blue-500" : "text-slate-400"
                          )} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-bold text-slate-800 dark:text-white">
                              {isToday ? "Today" : new Date(date + "T12:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                            </p>
                            {isToday && (
                              <Badge className="text-[9px] h-4 px-1.5 bg-blue-600 text-white font-bold">Today</Badge>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {(daySales as any[]).length} sale{(daySales as any[]).length > 1 ? "s" : ""}
                            {" · "}₹{dayCash.toLocaleString("en-IN")} cash
                            {" · "}₹{dayUpi.toLocaleString("en-IN")} UPI
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <p className="text-base font-bold text-slate-900 dark:text-white">
                            ₹{dayTotal.toLocaleString("en-IN")}
                          </p>
                          <div className="h-7 w-7 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                            {isExpanded
                              ? <ChevronUp className="h-3.5 w-3.5 text-slate-500" />
                              : <ChevronDown className="h-3.5 w-3.5 text-slate-500" />}
                          </div>
                        </div>
                      </div>
                    </button>

                    {/* Expanded product breakdown */}
                    {isExpanded && Object.keys(productTotals).length > 0 && (
                      <div className="px-4 pb-4 border-t border-slate-100 dark:border-slate-700 pt-3">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                          <Package className="h-3 w-3" /> Products Sold
                        </p>
                        <div className="space-y-1.5">
                          {Object.entries(productTotals).map(([name, qty]) => (
                            <div key={name} className="flex justify-between items-center">
                              <span className="text-sm text-slate-700 dark:text-slate-300">{name}</span>
                              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">
                                {qty} units
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Handover Sheet */}
      <Sheet open={handoverOpen} onOpenChange={setHandoverOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl pb-10 px-0">
          <div className="px-6">
            <SheetHeader className="mb-5 text-left">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                  <ArrowUpRight className="h-5 w-5 text-white" />
                </div>
                <div>
                  <SheetTitle className="text-lg font-bold">Hand Over Cash</SheetTitle>
                  <p className="text-xs text-slate-400">Available: ₹{notHandedOver.toLocaleString("en-IN")}</p>
                </div>
              </div>
            </SheetHeader>

            <div className="space-y-4">
              <div>
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">Hand over to</Label>
                <Select value={toUserId} onValueChange={setToUserId}>
                  <SelectTrigger className="rounded-xl h-12 border-slate-200 dark:border-slate-600">
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
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">Amount</Label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-base font-semibold">₹</span>
                  <Input
                    type="number"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0"
                    className="pl-8 h-13 rounded-xl text-lg font-bold border-slate-200 dark:border-slate-600"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">Notes (optional)</Label>
                <Textarea
                  value={handoverNotes}
                  onChange={(e) => setHandoverNotes(e.target.value)}
                  placeholder="e.g. Cash bag #2, reference number..."
                  className="rounded-xl resize-none border-slate-200 dark:border-slate-600"
                  rows={2}
                />
              </div>

              <button
                className={cn(
                  "w-full h-13 rounded-xl text-base font-bold flex items-center justify-center gap-2 transition-all",
                  submitting
                    ? "bg-blue-400 text-white cursor-not-allowed"
                    : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-sm active:scale-[0.98]"
                )}
                onClick={handleHandover}
                disabled={submitting}
              >
                {submitting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Submit Handover
                  </>
                )}
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
