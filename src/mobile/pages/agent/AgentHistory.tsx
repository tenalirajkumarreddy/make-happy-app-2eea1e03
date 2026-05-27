import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, startOfDay } from "date-fns";
import {
  ArrowLeft,
  CheckCircle2,
  HandCoins,
  Loader2,
  Receipt,
  ReceiptIndianRupee,
  Send,
  TrendingUp,
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
import { sendNotification, getAdminUserIds } from "@/lib/notifications";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { BillImages } from "@/mobile/components/BillImageUpload";
import { SaleReturnDialog } from "@/components/sales/SaleReturnDialog";

type TimelineItem = {
  id: string;
  type: "sale" | "transaction";
  amount: number;
  cash: number;
  upi: number;
  created_at: string;
  display_id: string | null;
  store_name: string | null;
  _sale_id?: string;
  _store_id?: string;
  _customer_id?: string;
  _outstanding_amount?: number;
};

type ExpenseClaim = {
  id: string;
  display_id: string;
  user_id: string;
  category_id: string;
  amount: number;
  expense_date: string;
  description: string;
  status: string;
  receipt_url: string | null;
  bill_urls: string[];
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  rejection_reason: string | null;
  approved_amount: number | null;
  reviewed: boolean;
};

export function AgentHistory() {
  const { user, profile, role } = useAuth();
  const isAdmin = role === "super_admin" || role === "manager";
  const qc = useQueryClient();
  const [view, setView] = useState<"activity" | "handovers" | "claims">("activity");
  const [selectedActivityDate, setSelectedActivityDate] = useState<string | null>(null);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [handoverNotes, setHandoverNotes] = useState("");
  const [toUserId, setToUserId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Expense submission state
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [expenseCategoryId, setExpenseCategoryId] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState("");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseBillUrls, setExpenseBillUrls] = useState<string[]>([]);

  // Sale return state
  const [returningSale, setReturningSale] = useState<{ id: string; display_id: string; total_amount: number; outstanding_amount: number; store_id: string; customer_id: string; created_at: string } | null>(null);

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
        .select("id, display_id, total_amount, cash_amount, upi_amount, outstanding_amount, created_at, store_id, customer_id, stores(name)")
        .eq("recorded_by", user!.id)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data as any[]) || [];
    },
    enabled: !!user,
    refetchInterval: 60_000,
  });

  const { data: transactionsForBalance } = useQuery({
    queryKey: ["mobile-history-balance-transactions", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("cash_amount, upi_amount, created_at")
        .eq("recorded_by", user!.id);
      if (error) throw error;
      return (data as any[]) || [];
    },
    enabled: !!user,
    refetchInterval: 60_000,
  });

  const { data: holdingBalanceData } = useQuery({
    queryKey: ["mobile-history-holding-balance", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("holding_balance, holding_balance_updated_at")
        .eq("user_id", user!.id)
        .single();
      return {
        balance: Number(data?.holding_balance || 0),
        updatedAt: data?.holding_balance_updated_at || null,
      };
    },
    enabled: !!user,
    refetchInterval: 60_000,
  });

  // Expense categories for submission
  const { data: expenseCategories = [] } = useQuery({
    queryKey: ["expense-categories-mobile"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_categories")
        .select("id, name, color, icon")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch expense claims directed at this user (for managers approving staff expenses)
  const { data: expenseClaims = [] } = useQuery<ExpenseClaim[]>({
    queryKey: ["mobile-expense-claims", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_claims")
        .select("id, display_id, user_id, category_id, amount, expense_date, description, status, receipt_url, bill_urls, created_at, reviewed_at, reviewed_by, rejection_reason, approved_amount")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []).map((c: any) => ({
        ...c,
        reviewed: ["approved", "rejected"].includes(c.status),
      }));
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
        .in("role", ["manager", "agent", "marketer", "operator"]);

      if (rolesError) throw rolesError;

      const staffRoleMap = new Map((roles || []).map((row: any) => [row.user_id, row.role]));
      const staffIds = Array.from(staffRoleMap.keys()).filter((id: string) => id !== user!.id);

      let profiles: Array<{ user_id: string; full_name: string | null; email: string | null; phone: string | null }> = [];

      if (staffIds.length > 0) {
        const { data: filteredProfiles, error: filteredError } = await supabase
          .from("profiles")
          .select("user_id, full_name, email, phone")
          .in("user_id", staffIds)
          .eq("is_active", true);
        if (filteredError) throw filteredError;
        profiles = (filteredProfiles || []) as typeof profiles;
      }

      const roleLabel: Record<string, string> = {
        super_admin: "Admin",
        manager: "Manager",
        agent: "Agent",
        marketer: "Marketer",
        operator: "Operator",
      };

      return (profiles || [])
        .map((profile: any) => ({
          ...profile,
          role: staffRoleMap.get(profile.user_id) || "agent",
          roleLabel: roleLabel[staffRoleMap.get(profile.user_id) || ""] || "Staff",
        }))
        .sort((a: any, b: any) => a.full_name.localeCompare(b.full_name));
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
      _sale_id: sale.id,
      _store_id: sale.store_id,
      _customer_id: sale.customer_id,
      _outstanding_amount: Number(sale.outstanding_amount || 0),
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
  const todayTotalSales = todaySales.reduce(
    (sum: number, sale: any) => sum + Number(sale.cash_amount || 0) + Number(sale.upi_amount || 0),
    0
  );
  const todayCashSales = todaySales.reduce((sum: number, sale: any) => sum + Number(sale.cash_amount || 0), 0);
  const todayUpiSales = todaySales.reduce((sum: number, sale: any) => sum + Number(sale.upi_amount || 0), 0);

  const todayPayments = (transactionsForBalance || []).filter((tx: any) => tx.created_at >= todayStart);
  const todayTotalPayments = todayPayments.reduce(
    (sum: number, tx: any) => sum + Number(tx.cash_amount || 0) + Number(tx.upi_amount || 0),
    0
  );
  const todayCashPayments = todayPayments.reduce((sum: number, tx: any) => sum + Number(tx.cash_amount || 0), 0);
  const todayUpiPayments = todayPayments.reduce((sum: number, tx: any) => sum + Number(tx.upi_amount || 0), 0);

  const todaySalesAndPayments = todayTotalSales + todayTotalPayments;
  const todayCash = todayCashSales + todayCashPayments;
  const todayUpi = todayUpiSales + todayUpiPayments;

  // Transferred today: handovers sent today with status confirmed
  const transferredToday = (handovers || [])
    .filter((handover: any) => handover.user_id === user?.id && handover.created_at >= todayStart && handover.status === "confirmed")
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
  const netBalance = Number(holdingBalanceData?.balance ?? 0);

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
    const { data: handoverRole } = await supabase.from("user_roles").select("warehouse_id").eq("user_id", user!.id).maybeSingle();
    const { error } = await supabase.from("handovers").insert({
      user_id: user!.id,
      handed_to: toUserId,
      cash_amount: Number(amount),
      upi_amount: 0,
      status: "awaiting_confirmation",
      notes: handoverNotes || null,
      warehouse_id: (handoverRole as any)?.warehouse_id || null,
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

  const handleExpenseSubmit = async () => {
    if (!expenseCategoryId || !expenseAmount || Number(expenseAmount) <= 0) {
      toast.error("Select a category and enter a valid amount");
      return;
    }

    setSubmitting(true);
    try {
      // Get manager user IDs for notification
      const managerIds = await getAdminUserIds();

      // Create expense claim via supabase insert (matches web workflow)
      const { data: displayId } = await supabase.rpc("generate_display_id", {
        prefix: "EXC",
        seq_name: "expenses_display_id_seq",
      }) as any;

      const { data: myRole } = await supabase.from("user_roles").select("warehouse_id").eq("user_id", user!.id).maybeSingle();

      const claimData: Record<string, unknown> = {
        display_id: displayId || `EXC-${Date.now()}`,
        user_id: user!.id,
        category_id: expenseCategoryId,
        original_category_id: expenseCategoryId,
        amount: Number(expenseAmount),
        expense_date: expenseDate ? new Date(expenseDate).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
        description: expenseDescription.trim() || null,
        status: "pending",
        warehouse_id: (myRole as any)?.warehouse_id || null,
      };

      if (expenseBillUrls.length > 0) {
        claimData.bill_urls = expenseBillUrls;
      }

      const { error } = await (supabase as any).from("expense_claims").insert(claimData);
      if (error) throw error;

      toast.success("Expense claim submitted");
      setExpenseOpen(false);
      setExpenseAmount("");
      setExpenseCategoryId("");
      setExpenseDate("");
      setExpenseDescription("");
      setExpenseBillUrls([]);
      qc.invalidateQueries({ queryKey: ["mobile-expense-claims", user?.id] });
    } catch (error: any) {
      toast.error(error.message || "Failed to submit expense");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelHandover = async (handoverId: string) => {
    if (!confirm("Cancel this handover request?")) return;
    setSubmitting(true);
    const { error } = await supabase
      .from("handovers")
      .update({ status: "cancelled" })
      .eq("id", handoverId);
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Handover cancelled");
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

  const handleApproveExpense = async (claimId: string) => {
    const claim = expenseClaims.find((c: any) => c.id === claimId);
    if (!claim) return;

    try {
      const { error } = await supabase
        .from("expense_claims")
        .update({
          status: "approved",
          reviewed_by: user!.id,
          reviewed_at: new Date().toISOString(),
          approved_amount: claim.amount,
        })
        .eq("id", claimId);

      if (error) throw error;

      toast.success("Expense claim approved");
      qc.invalidateQueries({ queryKey: ["mobile-expense-claims"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to approve expense");
    }
  };

  const handleRejectExpense = async (claimId: string) => {
    try {
      const { error } = await supabase
        .from("expense_claims")
        .update({
          status: "rejected",
          reviewed_by: user!.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", claimId);

      if (error) throw error;

      toast.success("Expense claim rejected");
      qc.invalidateQueries({ queryKey: ["mobile-expense-claims"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to reject expense");
    }
  };

  const handleCancelExpenseClaim = async (claimId: string) => {
    if (!confirm("Cancel this expense claim?")) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("expense_claims")
        .update({ status: "cancelled" })
        .eq("id", claimId);

      if (error) throw error;

      toast.success("Expense claim cancelled");
      qc.invalidateQueries({ queryKey: ["mobile-expense-claims"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel expense claim");
    } finally {
      setSubmitting(false);
    }
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
                  <div className="flex flex-col items-end gap-1">
                    <p className="text-base font-bold text-slate-800 dark:text-white">₹{item.amount.toLocaleString("en-IN")}</p>
                    {item.type === "sale" && item._sale_id && (
                      (isAdmin || startOfDay(new Date(item.created_at)).getTime() === startOfDay(new Date()).getTime()) ? (
                        <button
                          onClick={() => setReturningSale({
                            id: item._sale_id!,
                            display_id: item.display_id || "",
                            total_amount: item.amount,
                            outstanding_amount: item._outstanding_amount || 0,
                            store_id: item._store_id || "",
                            customer_id: item._customer_id || "",
                            created_at: item.created_at,
                          })}
                          className="text-[10px] text-red-500 hover:text-red-600 font-semibold px-2 py-0.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        >
                          Return
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-300 dark:text-slate-600 italic">Past sales cannot be returned</span>
                      )
                    )}
                  </div>
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
        {/* Stats Grid - matching web AgentDashboard */}
        <div className="rounded-2xl bg-white dark:bg-slate-800 shadow-xl border border-slate-100 dark:border-slate-700 p-4">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3">Balance Overview</p>
          <div className="grid grid-cols-2 gap-3">
            <MiniStat icon={TrendingUp} label="Today's Sales" value={`₹${todaySalesAndPayments.toLocaleString("en-IN")}`} subValue={`Cash ₹${todayCash.toLocaleString("en-IN")} · UPI ₹${todayUpi.toLocaleString("en-IN")}`} color="from-blue-500 to-blue-600" />
            <MiniStat icon={Receipt} label="Today's Payments" value={`₹${todayTotalPayments.toLocaleString("en-IN")}`} subValue={`${todayPayments.length} txns`} color="from-emerald-500 to-green-600" />
            <MiniStat icon={Send} label="Transferred Today" value={`₹${transferredToday.toLocaleString("en-IN")}`} subValue={sentPending > 0 ? `₹${sentPending.toLocaleString("en-IN")} pending` : "All transferred"} color="from-orange-500 to-amber-600" />
            <MiniStat icon={Wallet} label="Net Balance" value={`₹${netBalance.toLocaleString("en-IN")}`} subValue={netBalance > 0 ? "Your holding" : "No balance"} color="from-violet-500 to-purple-600" />
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2 mt-4">
            <button
              onClick={() => setHandoverOpen(true)}
              disabled={netBalance <= 0}
              className={cn(
                "h-11 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]",
                netBalance > 0
                  ? "bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-sm"
                  : "bg-slate-100 dark:bg-slate-700 text-slate-400 cursor-not-allowed"
              )}
            >
              <ReceiptIndianRupee className="h-3.5 w-3.5" />
              Submit Payment
            </button>
            <button
              onClick={() => {
                setExpenseAmount("");
                setExpenseCategoryId("");
                setExpenseDate("");
                setExpenseDescription("");
                setExpenseOpen(true);
              }}
              className="h-11 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-sm active:scale-[0.98]"
            >
              <ReceiptIndianRupee className="h-3.5 w-3.5" />
              Submit Expense
            </button>
          </div>
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
          <button
            type="button"
            onClick={() => setView("claims")}
            className={cn(
              "flex-1 rounded-xl px-3 py-3 text-sm font-bold transition-all",
              view === "claims"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50"
            )}
          >
            Claims
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

                      {handover.user_id === user?.id && handover.status === "awaiting_confirmation" && (
                        <div className="flex justify-end mt-3">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 rounded-xl text-[11px] text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                            onClick={() => handleCancelHandover(handover.id)}
                            disabled={submitting}
                          >
                            <XCircle className="h-3 w-3 mr-1" />
                            Cancel
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

        {view === "claims" && (
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2.5">
              My Expense Claims
            </p>

            {expenseClaims.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-8 text-center bg-slate-50/50 dark:bg-slate-800/30">
                <div className="h-12 w-12 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-3">
                  <ReceiptIndianRupee className="h-6 w-6 text-slate-400" />
                </div>
                <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">No expense claims yet</p>
                <p className="text-xs text-slate-400 mt-1">Your submitted expense claims will appear here with their status.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {expenseClaims.map((claim: any) => {
                  const category = (expenseCategories as any[]).find((c: any) => c.id === claim.category_id);
                  return (
                    <div
                      key={claim.id}
                      className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-base font-bold text-slate-800 dark:text-white">₹{Number(claim.amount).toLocaleString("en-IN")}</p>
                            {category && (
                              <div className="flex items-center gap-1.5">
                                <div
                                  className="h-2 w-2 rounded-full"
                                  style={{ backgroundColor: category.color || "#6366f1" }}
                                />
                                <span className="text-[11px] text-slate-500 dark:text-slate-400">{category.name}</span>
                              </div>
                            )}
                          </div>
                          {claim.description && (
                            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{claim.description}</p>
                          )}
                          <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400 flex-wrap">
                            <span>{claim.display_id || claim.id.slice(0, 8)}</span>
                            <span>·</span>
                            <span>{format(new Date(claim.created_at), "dd MMM yyyy")}</span>
                            {claim.expense_date && (
                              <>
                                <span>·</span>
                                <span>Expense: {format(new Date(claim.expense_date), "dd MMM yyyy")}</span>
                              </>
                            )}
                          </div>
                          {claim.bill_urls && claim.bill_urls.length > 0 && (
                            <p className="text-[11px] text-blue-500 mt-1">📎 {claim.bill_urls.length} attachment(s)</p>
                          )}
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-semibold capitalize shrink-0",
                            claim.status === "approved"
                              ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700"
                              : claim.status === "rejected"
                              ? "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-700"
                              : claim.status === "cancelled"
                              ? "bg-slate-100 dark:bg-slate-700 text-slate-500 border-slate-200 dark:border-slate-600"
                              : "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-700"
                          )}
                        >
                          {claim.status}
                        </Badge>
                      </div>
                      {claim.rejection_reason && (
                        <p className="text-xs text-red-500 dark:text-red-400 mt-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
                          Reason: {claim.rejection_reason}
                        </p>
                      )}
                      {claim.status === "approved" && claim.approved_amount && claim.approved_amount !== claim.amount && (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2">
                          Approved amount: ₹{Number(claim.approved_amount).toLocaleString("en-IN")}
                        </p>
                      )}
                      {claim.status === "pending" && (
                        <div className="flex items-center gap-2 mt-3">
                          <button
                            onClick={() => handleCancelExpenseClaim(claim.id)}
                            className="h-8 rounded-lg px-3 text-[11px] font-semibold bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-700 flex items-center gap-1"
                          >
                            <XCircle className="h-3 w-3" />
                            Cancel
                          </button>
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
              <SheetTitle className="text-lg font-bold">Submit Payment</SheetTitle>
              <p className="text-xs text-slate-400">Transfer from your balance · Net: ₹{netBalance.toLocaleString("en-IN")}</p>
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

      {/* Expense Submission Sheet */}
      <Sheet open={expenseOpen} onOpenChange={setExpenseOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl pb-10 px-0">
          <div className="px-6">
            <SheetHeader className="mb-5 text-left">
              <SheetTitle className="text-lg font-bold">Submit Expense</SheetTitle>
              <p className="text-xs text-slate-400">Claim from your holding balance</p>
            </SheetHeader>

            <div className="space-y-4">
              {/* Category */}
              <div>
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">
                  Category
                </Label>
                <Select value={expenseCategoryId} onValueChange={setExpenseCategoryId}>
                  <SelectTrigger className="rounded-xl h-12 border-slate-200 dark:border-slate-600">
                    <SelectValue placeholder="Select category..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(expenseCategories as any[]).map((cat: any) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        <div className="flex items-center gap-2">
                          <div
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: cat.color || "#6366f1" }}
                          />
                          {cat.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Amount */}
              <div>
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">
                  Amount
                </Label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-base font-semibold">₹</span>
                  <Input
                    type="number"
                    min="0"
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(e.target.value)}
                    placeholder="0"
                    className="pl-8 h-13 rounded-xl text-lg font-bold border-slate-200 dark:border-slate-600"
                  />
                </div>
              </div>

              {/* Date */}
              <div>
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">
                  Date
                </Label>
                <Input
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="rounded-xl h-12 border-slate-200 dark:border-slate-600"
                />
              </div>

              {/* Description */}
              <div>
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">
                  Description
                </Label>
                <Textarea
                  value={expenseDescription}
                  onChange={(e) => setExpenseDescription(e.target.value)}
                  placeholder="What was this expense for?"
                  className="rounded-xl resize-none border-slate-200 dark:border-slate-600"
                  rows={2}
                />
              </div>

              {/* Bill Images */}
              <div>
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">
                  Attachments
                </Label>
                <BillImages
                  urls={expenseBillUrls}
                  onAdd={(url) => setExpenseBillUrls((prev) => [...prev, url])}
                  onRemove={(url) => setExpenseBillUrls((prev) => prev.filter((u) => u !== url))}
                />
              </div>

              {/* Submit */}
              <button
                className={cn(
                  "w-full h-13 rounded-xl text-base font-bold flex items-center justify-center gap-2 transition-all",
                  submitting
                    ? "bg-amber-400 text-white cursor-not-allowed"
                    : "bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white shadow-sm active:scale-[0.98]"
                )}
                onClick={handleExpenseSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <><ReceiptIndianRupee className="h-4 w-4" />Submit Expense</>
                )}
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <SaleReturnDialog
        open={!!returningSale}
        onOpenChange={(open) => { if (!open) setReturningSale(null); }}
        sale={returningSale}
        onSuccess={() => { setReturningSale(null); qc.invalidateQueries({ queryKey: ["mobile-history-sales-timeline"] }); }}
      />
    </div>
  );
}

function MiniStat({ icon: Icon, label, value, subValue, color }: { icon: React.ElementType; label: string; value: string; subValue?: string; color: string }) {
  return (
    <div className="rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/30 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium leading-tight">{label}</p>
        <div className={cn("h-6 w-6 rounded-md bg-gradient-to-br flex items-center justify-center shrink-0", color)}>
          <Icon className="h-3 w-3 text-white" />
        </div>
      </div>
      <p className="text-lg font-bold text-slate-900 dark:text-white mt-1">{value}</p>
      {subValue && <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 leading-tight">{subValue}</p>}
    </div>
  );
}
