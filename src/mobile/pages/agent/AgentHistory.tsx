import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, startOfDay } from "date-fns";
import {
  ArrowLeft,
  CheckCircle2,
  HandCoins,
  Loader2,
  Receipt,
  Send,
  Wallet,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { sendNotification } from "@/lib/notifications";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type TimelineItem = {
  id: string;
  type: "sale" | "transaction";
  amount: number;
  cash: number;
  upi: number;
  created_at: string;
  display_id: string | null;
  store_name: string | null;
};

export function AgentHistory() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [view, setView] = useState<"activity" | "handovers">("activity");
  const [selectedActivityDate, setSelectedActivityDate] = useState<string | null>(null);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [handoverNotes, setHandoverNotes] = useState("");
  const [toUserId, setToUserId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const todayStart = startOfDay(new Date()).toISOString();

  const { data: handovers, isLoading: loadingHandovers } = useQuery({
    queryKey: ["handovers", user?.id, "mobile-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("handovers")
        .select("id, user_id, handed_to, cash_amount, upi_amount, status, created_at, notes")
        .or(`user_id.eq.${user!.id},handed_to.eq.${user!.id}`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any[]) || [];
    },
    enabled: !!user,
    refetchInterval: 60_000,
  });

  const { data: salesForBalance } = useQuery({
    queryKey: ["mobile-history-balance-sales", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("cash_amount, upi_amount, created_at")
        .eq("recorded_by", user!.id);
      if (error) throw error;
      return (data as any[]) || [];
    },
    enabled: !!user,
    refetchInterval: 60_000,
  });

  const { data: salesTimeline, isLoading: loadingSalesTimeline } = useQuery({
    queryKey: ["mobile-history-sales-timeline", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, display_id, total_amount, cash_amount, upi_amount, created_at, stores(name)")
        .eq("recorded_by", user!.id)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data as any[]) || [];
    },
    enabled: !!user,
    refetchInterval: 60_000,
  });

  const { data: transactionsTimeline, isLoading: loadingTransactionsTimeline } = useQuery({
    queryKey: ["mobile-history-transactions-timeline", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, display_id, total_amount, cash_amount, upi_amount, created_at, stores(name)")
        .eq("recorded_by", user!.id)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data as any[]) || [];
    },
    enabled: !!user,
    refetchInterval: 60_000,
  });

  const { data: staffUsers } = useQuery({
    queryKey: ["mobile-staff-users"],
    queryFn: async () => {
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["super_admin", "manager", "agent", "marketer", "operator"]);

      const roleByUserId = new Map((roles || []).map((row: any) => [row.user_id, row.role]));
      const ids = Array.from(roleByUserId.keys()).filter((id: string) => id !== user!.id);

      let profiles: Array<{ user_id: string; full_name: string | null; email: string | null; phone: string | null }> = [];

      if (!rolesError && ids.length > 0) {
        const { data: filteredProfiles, error: filteredError } = await supabase
          .from("profiles")
          .select("user_id, full_name, email, phone")
          .in("user_id", ids)
          .eq("is_active", true);
        if (!filteredError) {
          profiles = (filteredProfiles || []) as typeof profiles;
        }
      }

      if (profiles.length === 0) {
        const { data: fallbackProfiles, error: fallbackError } = await supabase
          .from("profiles")
          .select("user_id, full_name, email, phone")
          .eq("is_active", true)
          .neq("user_id", user!.id);
        if (fallbackError) throw fallbackError;
        profiles = (fallbackProfiles || []) as typeof profiles;
      }

      const roleLabel: Record<string, string> = {
        super_admin: "Admin",
        manager: "Manager",
        agent: "Agent",
        marketer: "Marketer",
        pos: "POS",
      };

      return (profiles || []).map((profile: any) => {
        const role = roleByUserId.get(profile.user_id) || "agent";
        return {
          ...profile,
          role,
          roleLabel: roleLabel[role] || "Staff",
        };
      });
    },
    enabled: !!user,
  });

  const { data: profiles } = useQuery({
    queryKey: ["profiles", "mobile-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .eq("is_active", true);
      if (error) throw error;
      return (data || []) as Array<{ user_id: string; full_name: string | null }>;
    },
    enabled: !!user,
  });

  const profileNameMap = useMemo(() => {
    const map = new Map<string, string>();
    (profiles || []).forEach((profile) => {
      map.set(profile.user_id, profile.full_name || "Staff");
    });
    return map;
  }, [profiles]);

  const timeline = useMemo<TimelineItem[]>(() => {
    const sales = (salesTimeline || []).map((sale: any) => ({
      id: `sale-${sale.id}`,
      type: "sale" as const,
      amount: Number(sale.total_amount || 0),
      cash: Number(sale.cash_amount || 0),
      upi: Number(sale.upi_amount || 0),
      created_at: sale.created_at,
      display_id: sale.display_id || null,
      store_name: sale.stores?.name || null,
    }));

    const transactions = (transactionsTimeline || []).map((transaction: any) => ({
      id: `transaction-${transaction.id}`,
      type: "transaction" as const,
      amount: Number(transaction.total_amount || 0),
      cash: Number(transaction.cash_amount || 0),
      upi: Number(transaction.upi_amount || 0),
      created_at: transaction.created_at,
      display_id: transaction.display_id || null,
      store_name: transaction.stores?.name || null,
    }));

    return [...sales, ...transactions].sort(
      (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
    );
  }, [salesTimeline, transactionsTimeline]);

  const timelineByDate = useMemo(() => {
    return timeline.reduce((groups: Record<string, TimelineItem[]>, item) => {
      const date = item.created_at.split("T")[0];
      if (!groups[date]) groups[date] = [];
      groups[date].push(item);
      return groups;
    }, {});
  }, [timeline]);

  const timelineDates = useMemo(
    () => Object.keys(timelineByDate).sort((left, right) => right.localeCompare(left)),
    [timelineByDate]
  );

  const dayCards = useMemo(
    () =>
      timelineDates.map((date) => {
        const items = timelineByDate[date] || [];
        const salesCount = items.filter((item) => item.type === "sale").length;
        const transactionsCount = items.filter((item) => item.type === "transaction").length;
        const total = items.reduce((sum, item) => sum + item.amount, 0);
        return {
          date,
          items,
          total,
          salesCount,
          transactionsCount,
        };
      }),
    [timelineByDate, timelineDates]
  );

  const getPersonName = (personId: string | null | undefined) => {
    if (!personId) return "Unassigned";
    if (personId === user?.id) return "You";
    return profileNameMap.get(personId) || "Staff";
  };

  const totalSales = (salesForBalance || []).reduce(
    (sum: number, sale: any) => sum + Number(sale.cash_amount || 0) + Number(sale.upi_amount || 0),
    0
  );
  const todaySales = (salesForBalance || []).filter((sale: any) => sale.created_at >= todayStart);
  const todayTotal = todaySales.reduce(
    (sum: number, sale: any) => sum + Number(sale.cash_amount || 0) + Number(sale.upi_amount || 0),
    0
  );

  const sentConfirmed = (handovers || [])
    .filter((handover: any) => handover.user_id === user?.id && handover.status === "confirmed")
    .reduce((sum: number, handover: any) => sum + Number(handover.cash_amount) + Number(handover.upi_amount), 0);
  const sentPending = (handovers || [])
    .filter((handover: any) => handover.user_id === user?.id && handover.status === "awaiting_confirmation")
    .reduce((sum: number, handover: any) => sum + Number(handover.cash_amount) + Number(handover.upi_amount), 0);
  const receivedConfirmed = (handovers || [])
    .filter((handover: any) => handover.handed_to === user?.id && handover.status === "confirmed")
    .reduce((sum: number, handover: any) => sum + Number(handover.cash_amount) + Number(handover.upi_amount), 0);
  const pendingIncoming = (handovers || []).filter(
    (handover: any) => handover.handed_to === user?.id && handover.status === "awaiting_confirmation"
  );
  const notHandedOver = Math.max(0, totalSales + receivedConfirmed - sentConfirmed - sentPending);

  const getStatusTone = (status: string) => {
    if (status === "confirmed") return "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700";
    if (status === "rejected") return "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-700";
    return "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-700";
  };

  const formatGroupDate = (date: string) => {
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    if (date === today) return "Today";
    if (date === yesterday) return "Yesterday";
    return format(new Date(`${date}T12:00:00`), "dd MMM yyyy");
  };

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

    if (error) {
      toast.error(error.message);
      return;
    }

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
    qc.invalidateQueries({ queryKey: ["handovers"] });
  };

  const handleConfirm = async (handoverId: string) => {
    const { error } = await supabase
      .from("handovers")
      .update({
        status: "confirmed",
        confirmed_by: user!.id,
        confirmed_at: new Date().toISOString(),
      })
      .eq("id", handoverId);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Handover confirmed");
    qc.invalidateQueries({ queryKey: ["handovers"] });
  };

  const handleReject = async (handoverId: string) => {
    const { error } = await supabase
      .from("handovers")
      .update({
        status: "rejected",
        rejected_at: new Date().toISOString(),
      })
      .eq("id", handoverId);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Handover rejected");
    qc.invalidateQueries({ queryKey: ["handovers"] });
  };

  const timelineLoading = loadingSalesTimeline || loadingTransactionsTimeline;

  if (selectedActivityDate) {
    const selectedItems = timelineByDate[selectedActivityDate] || [];
    const selectedTotal = selectedItems.reduce((sum, item) => sum + item.amount, 0);

    return (
      <div className="pb-6">
        <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 dark:from-slate-900 dark:via-blue-950 dark:to-indigo-950 px-4 pt-4 pb-6">
          <button
            type="button"
            className="h-9 px-3 rounded-xl bg-white/15 text-white text-sm font-semibold flex items-center gap-2"
            onClick={() => setSelectedActivityDate(null)}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <p className="text-blue-200 text-xs font-medium uppercase tracking-widest mt-3">Activity</p>
          <h2 className="text-white text-xl font-bold mt-0.5">{formatGroupDate(selectedActivityDate)} Records</h2>
          <p className="text-blue-100 text-xs mt-1">
            {selectedItems.length} entries · ₹{selectedTotal.toLocaleString("en-IN")}
          </p>
        </div>

        <div className="px-4 mt-3 space-y-3">
          {timelineLoading ? (
            <div className="flex justify-center items-center py-12 gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
              <span className="text-sm text-slate-400">Loading records...</span>
            </div>
          ) : selectedItems.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-8 text-center bg-slate-50/50 dark:bg-slate-800/30">
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">No records available</p>
              <p className="text-xs text-slate-400 mt-1">No sales or transactions were recorded on this day.</p>
            </div>
          ) : (
            selectedItems.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={cn("text-[10px] font-semibold", item.type === "sale" ? "border-blue-200 text-blue-600 dark:border-blue-700 dark:text-blue-400" : "border-emerald-200 text-emerald-600 dark:border-emerald-700 dark:text-emerald-400")}>
                        {item.type === "sale" ? "Sale" : "Transaction"}
                      </Badge>
                      {item.display_id && <span className="text-[11px] text-slate-400">{item.display_id}</span>}
                    </div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-white mt-1">
                      {item.store_name || "Store"}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-400">
                      <span>{format(new Date(item.created_at), "hh:mm a")}</span>
                      <span>Cash ₹{item.cash.toLocaleString("en-IN")}</span>
                      <span>UPI ₹{item.upi.toLocaleString("en-IN")}</span>
                    </div>
                  </div>
                  <p className="text-base font-bold text-slate-800 dark:text-white">₹{item.amount.toLocaleString("en-IN")}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="pb-6">
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 dark:from-slate-900 dark:via-blue-950 dark:to-indigo-950 px-4 pt-4 pb-10">
        <p className="text-blue-200 text-xs font-medium uppercase tracking-widest">Overview</p>
        <h2 className="text-white text-xl font-bold mt-0.5">History & Handovers</h2>
      </div>

      <div className="px-4 -mt-6 space-y-4">
        <div className="rounded-2xl bg-white dark:bg-slate-800 shadow-xl border border-slate-100 dark:border-slate-700 p-4">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3">Today's Summary</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-3xl font-bold text-slate-900 dark:text-white">₹{todayTotal.toLocaleString("en-IN")}</p>
              <div className="flex gap-3 mt-2">
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  <Receipt className="h-3.5 w-3.5 text-blue-500" />
                  {timeline.filter((item) => item.created_at >= todayStart).length} records today
                </span>
              </div>
              <div className="flex gap-3 mt-1">
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  <HandCoins className="h-3.5 w-3.5 text-amber-500" />
                  {(handovers || []).filter((item: any) => item.created_at >= todayStart).length} handovers
                </span>
              </div>
            </div>
            <div className="border-l border-slate-100 dark:border-slate-700 pl-4">
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold mb-1">Pending Balance</p>
              <p className="text-2xl font-bold text-amber-500">₹{notHandedOver.toLocaleString("en-IN")}</p>
              {sentPending > 0 && (
                <p className="text-[11px] text-amber-400 mt-1">₹{sentPending.toLocaleString("en-IN")} awaiting confirmation</p>
              )}
              {pendingIncoming.length > 0 && (
                <p className="text-[11px] text-slate-400 mt-1">
                  {pendingIncoming.length} incoming request{pendingIncoming.length > 1 ? "s" : ""}
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

        <div className="rounded-2xl bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700 p-1 flex gap-1">
          <button
            type="button"
            onClick={() => setView("activity")}
            className={cn(
              "flex-1 rounded-xl px-3 py-3 text-sm font-bold transition-all",
              view === "activity"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50"
            )}
          >
            Activity
          </button>
          <button
            type="button"
            onClick={() => setView("handovers")}
            className={cn(
              "flex-1 rounded-xl px-3 py-3 text-sm font-bold transition-all",
              view === "handovers"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50"
            )}
          >
            Handovers
          </button>
        </div>

        {view === "activity" && (
          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Daily Activity</p>
            {timelineLoading ? (
              <div className="flex justify-center items-center py-10 gap-2 rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
                <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                <span className="text-sm text-slate-400">Loading day cards...</span>
              </div>
            ) : dayCards.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-8 text-center bg-slate-50/50 dark:bg-slate-800/30">
                <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">No activity yet</p>
                <p className="text-xs text-slate-400 mt-1">Day cards will appear after your first sale or transaction.</p>
              </div>
            ) : (
              dayCards.map((card) => (
                <button
                  key={card.date}
                  type="button"
                  onClick={() => setSelectedActivityDate(card.date)}
                  className="w-full text-left rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-slate-800 dark:text-white">{formatGroupDate(card.date)}</p>
                      <p className="text-[11px] text-slate-400 mt-1">{card.items.length} records · {card.salesCount} sales · {card.transactionsCount} transactions</p>
                    </div>
                    <p className="text-base font-bold text-slate-800 dark:text-white">₹{card.total.toLocaleString("en-IN")}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        {view === "handovers" && (
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2.5">
              All Handovers
            </p>

            {loadingHandovers ? (
              <div className="flex justify-center items-center py-10 gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                <span className="text-sm text-slate-400">Loading handovers...</span>
              </div>
            ) : (handovers?.length ?? 0) === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-8 text-center bg-slate-50/50 dark:bg-slate-800/30">
                <div className="h-12 w-12 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-3">
                  <HandCoins className="h-6 w-6 text-slate-400" />
                </div>
                <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">No handovers yet</p>
                <p className="text-xs text-slate-400 mt-1">Requested, confirmed, and rejected handovers will appear here.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {(handovers || []).map((handover: any) => {
                  const total = Number(handover.cash_amount || 0) + Number(handover.upi_amount || 0);
                  const waitingForYou = handover.handed_to === user?.id && handover.status === "awaiting_confirmation";

                  return (
                    <div
                      key={handover.id}
                      className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-base font-bold text-slate-800 dark:text-white">₹{total.toLocaleString("en-IN")}</p>
                            <Badge variant="outline" className={cn("text-[10px] font-semibold", getStatusTone(handover.status))}>
                              {handover.status.replaceAll("_", " ")}
                            </Badge>
                          </div>
                          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                            {getPersonName(handover.user_id)} to {getPersonName(handover.handed_to)}
                          </p>
                          <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400 flex-wrap">
                            <span>{format(new Date(handover.created_at), "dd MMM yyyy, hh:mm a")}</span>
                            {handover.user_id === user?.id && <span>Sent</span>}
                            {handover.handed_to === user?.id && <span>Received</span>}
                          </div>
                          {handover.notes && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">{handover.notes}</p>
                          )}
                        </div>
                      </div>

                      {waitingForYou && (
                        <div className="grid grid-cols-2 gap-2 mt-3">
                          <Button size="sm" className="h-9 rounded-xl" onClick={() => handleConfirm(handover.id)}>
                            <CheckCircle2 className="h-4 w-4 mr-1.5" />
                            Confirm
                          </Button>
                          <Button size="sm" variant="outline" className="h-9 rounded-xl" onClick={() => handleReject(handover.id)}>
                            <XCircle className="h-4 w-4 mr-1.5" />
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <Sheet open={handoverOpen} onOpenChange={setHandoverOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl pb-10 px-0">
          <div className="px-6">
            <SheetHeader className="mb-5 text-left">
              <SheetTitle className="text-lg font-bold">Hand Over Cash</SheetTitle>
              <p className="text-xs text-slate-400">Available: ₹{notHandedOver.toLocaleString("en-IN")}</p>
            </SheetHeader>

            <div className="space-y-4">
              <div>
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">Hand over to</Label>
                <Select value={toUserId} onValueChange={setToUserId}>
                  <SelectTrigger className="rounded-xl h-12 border-slate-200 dark:border-slate-600">
                    <SelectValue placeholder="Select recipient..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(staffUsers as any[] || []).map((staff: any) => {
                      const detail = staff.phone || staff.email || "No contact";
                      return (
                        <SelectItem key={staff.user_id} value={staff.user_id}>
                          <div className="flex w-full items-center justify-between gap-3">
                            <span className="font-medium">{staff.full_name || "Staff"}</span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">{staff.roleLabel}</span>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{detail}</p>
                        </SelectItem>
                      );
                    })}
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
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="0"
                    className="pl-8 h-13 rounded-xl text-lg font-bold border-slate-200 dark:border-slate-600"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">Notes (optional)</Label>
                <Textarea
                  value={handoverNotes}
                  onChange={(event) => setHandoverNotes(event.target.value)}
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
                {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Send className="h-4 w-4" />Submit Handover</>}
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
