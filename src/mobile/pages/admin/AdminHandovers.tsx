import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermission } from "@/hooks/usePermission";
import { Loader2, CheckCircle2, XCircle, Send, ArrowRightLeft, Wallet, Clock, User, IndianRupee, AlertCircle, TrendingUp, RefreshCw, Edit2, Download, Receipt, Banknote, Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { fmtINR, cn } from "@/lib/utils";
import { sendNotification, sendNotificationToMany, getAdminUserIds } from "@/lib/notifications";
import { usePullToRefresh } from "@/mobile/hooks/usePullToRefresh";
import { PullRefreshIndicator } from "@/mobile/components/PullRefreshIndicator";
import { CardSkeletonList } from "@/mobile/components/CardSkeleton";
import { ImageUpload } from "@/components/shared/ImageUpload";
import { EditHandoverDialog } from "@/pages/handovers/EditHandoverDialog";
import { AdjustHoldingDialog } from "@/pages/handovers/AdjustHoldingDialog";
import { AdminPageHeader } from "@/mobile/components/AdminPageHeader";

interface Handover {
  id: string;
  user_id: string;
  handed_to: string | null;
  handover_date: string;
  cash_amount: number;
  upi_amount: number;
  status: string;
  handover_type: string;
  notes: string | null;
  receipt_url: string | null;
  created_at: string;
  confirmed_at: string | null;
  rejected_at: string | null;
}

interface ExpenseClaim {
  id: string;
  display_id: string;
  user_id: string;
  category_id: string;
  amount: number;
  expense_date: string;
  description: string;
  status: string;
  receipt_url: string | null;
  created_at: string;
}

interface StaffBalance {
  user_id: string;
  full_name: string;
  cash_amount: number;
  upi_amount: number;
  total_balance: number;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  handed_over: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  awaiting_confirmation: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  confirmed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  cancelled: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "awaiting_confirmation", label: "Awaiting" },
  { value: "confirmed", label: "Confirmed" },
  { value: "rejected", label: "Rejected" },
];

export function AdminHandovers({ onNavigate: _onNavigate }: { onNavigate: (path: string) => void }) {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const isAdmin = role === "super_admin" || role === "manager";

  const { allowed: isFinalizer } = usePermission("finalizer");
  const { allowed: canSeeBalances } = usePermission("see_handover_balance");
  const { allowed: canSubmitExpenses } = usePermission("submit_expenses");
  const { allowed: canModifyHandovers } = usePermission("modify_handovers");
  const { allowed: _canCancelAnyHandover } = usePermission("cancel_any_handover");
  const { allowed: canAdjustHoldingBalance } = usePermission("adjust_holding_balance");
  const { allowed: canApproveExpenses } = usePermission("approve_expenses");
  const { allowed: canTransferBetweenStaff } = usePermission("transfer_between_staff" as any);

  const [statusTab, setStatusTab] = useState("all");
  const [staffFilter, setStaffFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [selectedHandoverId, setSelectedHandoverId] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ id: string; action: "confirm" | "reject" } | null>(null);

  const [adminTransferOpen, setAdminTransferOpen] = useState(false);
  const [transferFrom, setTransferFrom] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferReason, setTransferReason] = useState("");

  const [expenseTab, setExpenseTab] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<ExpenseClaim | null>(null);
  const [expenseReviewNotes, setExpenseReviewNotes] = useState("");

  const today = new Date().toISOString().split("T")[0];
  const [editHandoverOpen, setEditHandoverOpen] = useState(false);
  const [selectedHandoverForEdit, setSelectedHandoverForEdit] = useState<any>(null);
  const [adjustHoldingOpen, setAdjustHoldingOpen] = useState(false);
  const [dailyResetLoading, setDailyResetLoading] = useState(false);
  const [showResetAllConfirm, setShowResetAllConfirm] = useState(false);
  const [incomeFilterDate, setIncomeFilterDate] = useState(today);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("");
  const [expenseDate, setExpenseDate] = useState(today);
  const [expenseReceiptUrl, setExpenseReceiptUrl] = useState<string | null>(null);
  const [expenseSubmitting, setExpenseSubmitting] = useState(false);

  const { data: handovers, isLoading } = useQuery({
    queryKey: ["admin-handovers", statusTab, staffFilter, dateFrom, dateTo],
    queryFn: async () => {
      let query: any = supabase
        .from("handovers")
        .select("*, profiles!handovers_user_id_fkey(full_name, avatar_url), handed_to_profile:profiles!handovers_handed_to_fkey(full_name, avatar_url)" as any)
        .order("created_at", { ascending: false })
        .limit(200);

      if (statusTab !== "all") query = query.eq("status", statusTab as any);
      if (staffFilter !== "all") query = query.or(`user_id.eq.${staffFilter},handed_to.eq.${staffFilter}` as any);
      if (dateFrom) query = query.gte("created_at", `${dateFrom}T00:00:00`);
      if (dateTo) query = query.lte("created_at", `${dateTo}T23:59:59`);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as (Handover & { profiles: { full_name: string; avatar_url: string | null } | null; handed_to_profile: { full_name: string; avatar_url: string | null } | null })[];
    },
    enabled: !!user,
});

  const { data: staffProfiles = [] } = useQuery({
    queryKey: ["admin-handovers-staff"],
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["super_admin", "manager", "agent", "marketer", "operator"] as any);
      const userIds = (roles ?? []).map((r: any) => r.user_id);
      if (userIds.length === 0) return [];
      const { data: profiles } = await (supabase as any)
        .from("profiles")
        .select("user_id, full_name, avatar_url")
        .in("user_id", userIds)
        .eq("is_active", true);
      const roleLabel: Record<string, string> = { super_admin: "Admin", manager: "Manager", agent: "Agent", marketer: "Marketer", operator: "Operator" };
      const roleMap = new Map((roles ?? []).map((r: any) => [r.user_id, r.role]));
      return (profiles ?? []).map((p: any) => ({
        ...p,
        role: roleMap.get(p.user_id) || "",
        roleLabel: roleLabel[roleMap.get(p.user_id) || ""] || "Staff",
      })).sort((a: any, b: any) => a.full_name.localeCompare(b.full_name));
    },
});

  const { data: expenseClaims = [], isLoading: loadingExpenses } = useQuery({
    queryKey: ["admin-handovers-expenses"],
    queryFn: async () => {
      let query: any = supabase
        .from("expense_claims")
        .select("*, profiles!expense_claims_user_id_fkey(full_name, avatar_url)" as any)
        .order("created_at", { ascending: false })
        .limit(100);

      if (statusTab === "pending") query = query.eq("status", "pending" as any);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as (ExpenseClaim & { profiles: { full_name: string; avatar_url: string | null } | null })[];
    },
    enabled: !!user && canApproveExpenses,
});

  const { data: staffBalances = [] } = useQuery({
    queryKey: ["admin-handovers-balances"],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("staff_cash_accounts")
        .select("user_id, cash_amount, upi_amount, profiles(full_name, avatar_url)" as any)
        .order("cash_amount", { ascending: false })) as any;
      if (error) throw error;
      return (data || []).map((item: any) => ({
        user_id: item.user_id,
        full_name: item.profiles?.full_name || "Unknown",
        avatar_url: item.profiles?.avatar_url || null,
        cash_amount: Number(item.cash_amount || 0),
        upi_amount: Number(item.upi_amount || 0),
        total_balance: Number(item.cash_amount || 0) + Number(item.upi_amount || 0),
      })) as (StaffBalance & { avatar_url: string | null })[];
    },
    enabled: !!user && canSeeBalances,
});

  const { data: profileMap } = useQuery({
    queryKey: ["admin-handovers-profile-map"],
    queryFn: async () => {
      const { data } = await (supabase.from("profiles").select("user_id, full_name, avatar_url") as any);
      const map: Record<string, { name: string; avatar: string | null }> = {};
      (data ?? []).forEach((p: any) => { map[p.user_id] = { name: p.full_name, avatar: p.avatar_url }; });
      return map;
    },
});

  const { data: expenseCategories = [] } = useQuery({
    queryKey: ["expense-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_categories")
        .select("id, name, color, icon")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data || []) as Array<{ id: string; name: string; color: string; icon: string | null }>;
    },
});

  const { data: finalizerIncome, isLoading: finalizerIncomeLoading } = useQuery({
    queryKey: ["admin-handovers-income", incomeFilterDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("income_entries")
        .select("*")
        .eq("entry_type", "collection")
        .gte("created_at", incomeFilterDate + "T00:00:00")
        .lte("created_at", incomeFilterDate + "T23:59:59")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && (isFinalizer || isAdmin),
});

  const { data: finalizerAccount } = useQuery({
    queryKey: ["admin-handovers-finalizer-account", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("staff_cash_accounts")
        .select("cash_amount, upi_amount, last_reset_at")
        .eq("user_id", user.id)
        .eq("account_type", "prime_manager")
        .maybeSingle();
      if (error) throw error;
      return data as { cash_amount: number; upi_amount: number; last_reset_at: string } | null;
    },
    enabled: !!user && isFinalizer,
});

  const { data: finalizerHoldings } = useQuery({
    queryKey: ["admin-handovers-finalizer-holdings"],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("staff_cash_accounts")
        .select("user_id, cash_amount, upi_amount, account_type, last_reset_at, profiles(full_name)" as any)
        .eq("account_type", "prime_manager" as any)) as any;
      if (error) throw error;
      return (data || []).map((item: any) => ({
        user_id: item.user_id,
        full_name: item.profiles?.full_name || "Unknown",
        cash_amount: Number(item.cash_amount || 0),
        upi_amount: Number(item.upi_amount || 0),
        total_balance: Number(item.cash_amount || 0) + Number(item.upi_amount || 0),
        last_reset_at: item.last_reset_at,
      })) as Array<{ user_id: string; full_name: string; cash_amount: number; upi_amount: number; total_balance: number; last_reset_at: string }>;
    },
    enabled: !!user && isAdmin,
});

  const getName = (userId: string | null) => profileMap?.[userId || ""]?.name || "Unknown";

  const { handlers: pullHandlers, isPulling, isRefreshing, pullDistance, threshold } = usePullToRefresh({
    onRefresh: async () => { await qc.invalidateQueries({ queryKey: ["admin-handovers"] }); },
  });

  const getStatusBadge = (status: string) => {
    const color = STATUS_COLORS[status] || STATUS_COLORS.pending;
    return <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", color)}>{status.replace(/_/g, " ")}</span>;
  };

  const handleConfirmHandover = async (id: string) => {
    setActionLoading(id);
    try {
      const handover = handovers?.find((h) => h.id === id);
      const { error } = await (supabase.rpc("confirm_handover", { p_handover_id: id, p_confirmed_by: user?.id } as any));
      if (error) throw error;
      toast.success("Handover confirmed");
      if (handover?.user_id) {
        sendNotification({
          userId: handover.user_id,
          title: "Handover Confirmed",
          message: `Your ₹${Number(handover.cash_amount).toLocaleString()} handover was accepted`,
          type: "handover",
          entityType: "handover",
          entityId: id,
        });
      }
      qc.invalidateQueries({ queryKey: ["admin-handovers"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to confirm handover");
    } finally {
      setActionLoading(null);
      setConfirmAction(null);
    }
  };

  const handleRejectHandover = async (id: string) => {
    setActionLoading(id);
    try {
      const handover = handovers?.find((h) => h.id === id);
      const { error } = await supabase.rpc("reject_handover", {
        p_handover_id: id,
        p_rejected_by: user!.id,
      });
      if (error) throw error;
      toast.success("Handover rejected");
      if (handover?.user_id) {
        sendNotification({
          userId: handover.user_id,
          title: "Handover Rejected",
          message: `Your ₹${Number(handover.cash_amount).toLocaleString()} handover was rejected`,
          type: "handover",
          entityType: "handover",
          entityId: id,
        });
      }
      qc.invalidateQueries({ queryKey: ["admin-handovers"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to reject handover");
    } finally {
      setActionLoading(null);
      setConfirmAction(null);
    }
  };

  const handleAdminTransfer = async () => {
    if (!transferFrom || !transferTo || !transferAmount) {
      toast.error("Please fill all fields");
      return;
    }
    if (Number(transferAmount) <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setActionLoading("transfer");
    try {
      const { error } = await (supabase.rpc("admin_transfer_between_staff", {
        p_from_user_id: transferFrom,
        p_to_user_id: transferTo,
        p_amount: parseFloat(transferAmount) || 0,
        p_reason: transferReason.trim() || null,
        p_admin_id: user?.id,
      } as any));
      if (error) throw error;
      toast.success("Transfer completed");
      sendNotification({
        userId: transferFrom,
        title: "Admin Transfer",
        message: `₹${Number(transferAmount).toLocaleString()} transferred from your holding`,
        type: "handover",
        entityType: "handover",
      });
      sendNotification({
        userId: transferTo,
        title: "Admin Transfer",
        message: `₹${Number(transferAmount).toLocaleString()} transferred to your holding`,
        type: "handover",
        entityType: "handover",
      });
      setAdminTransferOpen(false);
      setTransferFrom("");
      setTransferTo("");
      setTransferAmount("");
      setTransferReason("");
      qc.invalidateQueries({ queryKey: ["admin-handovers"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to create transfer");
    } finally {
      setActionLoading(null);
    }
  };

  const handleApproveExpense = async (id: string) => {
    setActionLoading(`expense-${id}`);
    try {
      const { error } = await supabase
        .from("expense_claims")
        .update({ status: "approved", reviewed_by: user?.id, reviewed_at: new Date().toISOString(), review_notes: expenseReviewNotes || null } as any)
        .eq("id", id as any);
      if (error) throw error;
      toast.success("Expense approved");
      setSelectedExpense(null);
      setExpenseReviewNotes("");
      qc.invalidateQueries({ queryKey: ["admin-handovers-expenses"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to approve expense");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectExpense = async (id: string) => {
    if (!expenseReviewNotes) { toast.error("Please provide rejection reason"); return; }
    setActionLoading(`expense-${id}`);
    try {
      const { error } = await supabase
        .from("expense_claims")
        .update({ status: "rejected", reviewed_by: user?.id, reviewed_at: new Date().toISOString(), rejection_reason: expenseReviewNotes } as any)
        .eq("id", id as any);
      if (error) throw error;
      toast.success("Expense rejected");
      setSelectedExpense(null);
      setExpenseReviewNotes("");
      qc.invalidateQueries({ queryKey: ["admin-handovers-expenses"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to reject expense");
    } finally {
      setActionLoading(null);
    }
  };

  const handleEditHandover = async (handoverId: string, amount: string, status: string) => {
    if (!user?.id) { toast.error("Not authenticated"); return; }
    if (!canModifyHandovers) {
      toast.error("You don't have permission to modify handovers");
      return;
    }
    setActionLoading(handoverId);
    try {
      const handover = handovers?.find((h: any) => h.id === handoverId);
      const { error } = await supabase.rpc("edit_handover", {
        p_handover_id: handoverId,
        p_admin_id: user.id,
        p_cash_amount: Number(amount),
        p_upi_amount: Number(handover?.upi_amount || 0),
        p_status: status || handover?.status,
        p_notes: handover?.notes
          ? `${handover.notes}\n[Admin Edit: ${new Date().toLocaleString()}]`
          : `[Admin Edit: ${new Date().toLocaleString()}]`,
      }) as any;
      if (error) throw error;
      toast.success("Handover updated");
      setEditHandoverOpen(false);
      setSelectedHandoverForEdit(null);
      qc.invalidateQueries({ queryKey: ["admin-handovers"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to update handover");
    } finally {
      setActionLoading(null);
    }
  };

  const handleAdjustHoldingBalance = async (data: { userId: string; cashAmount: string; upiAmount: string; reason: string }) => {
    if (!user?.id) { toast.error("Not authenticated"); return; }
    const cashAdj = Number(data.cashAmount) || 0;
    const upiAdj = Number(data.upiAmount) || 0;
    if (cashAdj === 0 && upiAdj === 0) {
      toast.error("Enter at least one amount");
      return;
    }
    setActionLoading("adjust-holding");
    try {
      const { error } = await (supabase as any).rpc("adjust_staff_holding_balance", {
        p_target_user_id: data.userId,
        p_admin_id: user.id,
        p_cash_adjustment: cashAdj,
        p_upi_adjustment: upiAdj,
        p_reason: data.reason.trim() || null,
      });
      if (error) throw error;
      toast.success("Holding balance adjusted");
      sendNotification({
        userId: data.userId,
        title: "Holding Balance Adjusted",
        message: `Your holding adjusted: Cash ₹${cashAdj >= 0 ? "+" : ""}${cashAdj}, UPI ₹${upiAdj >= 0 ? "+" : ""}${upiAdj}`,
        type: "system",
        entityType: "staff_account",
      });
      setAdjustHoldingOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-handovers-balances"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to adjust holding");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDailyReset = async (targetUserId?: string) => {
    if (!user?.id) { toast.error("Not authenticated"); return; }
    setDailyResetLoading(true);
    try {
      const uid = targetUserId || user.id;
      const { error } = await supabase.rpc("finalizer_daily_reset", { p_finalizer_id: uid }) as any;
      if (error) throw error;
      toast.success("Daily reset recorded");
      qc.invalidateQueries({ queryKey: ["admin-handovers-income"] });
      qc.invalidateQueries({ queryKey: ["admin-handovers-finalizer-account"] });
      qc.invalidateQueries({ queryKey: ["admin-handovers-finalizer-holdings"] });
    } catch (err: any) {
      toast.error(err.message || "Reset failed");
    } finally {
      setDailyResetLoading(false);
    }
  };

  const handleCreateExpenseClaim = async () => {
    if (!user?.id) { toast.error("Not authenticated"); return; }
    if (!expenseCategory || !expenseAmount || Number(expenseAmount) <= 0 || !expenseDescription.trim()) {
      toast.error("Category, amount, and description are required");
      return;
    }
    if (new Date(expenseDate) > new Date()) {
      toast.error("Expense date cannot be in the future");
      return;
    }
    setExpenseSubmitting(true);
    try {
      const { data: displayId } = await supabase.rpc("generate_display_id", {
        prefix: "EXC",
        seq_name: "expenses_display_id_seq",
      }) as any;
      const { data: myRole } = await supabase.from("user_roles").select("warehouse_id").eq("user_id", user.id).maybeSingle();
      const { error } = await supabase.from("expense_claims").insert({
        display_id: displayId || `EXC-${Date.now()}`,
        user_id: user.id,
        category_id: expenseCategory,
        amount: Number(expenseAmount),
        expense_date: expenseDate,
        description: expenseDescription.trim(),
        receipt_url: expenseReceiptUrl,
        status: "pending",
        warehouse_id: (myRole as any)?.warehouse_id || null,
      } as any).select().single();
      if (error) throw error;
      toast.success("Expense claim submitted");
      const adminIds = await getAdminUserIds();
      sendNotificationToMany(adminIds, {
        title: "New Expense Claim",
        message: `₹${Number(expenseAmount).toLocaleString()} expense claim requires review`,
        type: "expense_request" as any,
        entityType: "expense_claim",
      });
      setExpenseOpen(false);
      setExpenseAmount("");
      setExpenseDescription("");
      setExpenseCategory("");
      setExpenseDate(today);
      setExpenseReceiptUrl(null);
      qc.invalidateQueries({ queryKey: ["admin-handovers-expenses"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to submit expense");
    } finally {
      setExpenseSubmitting(false);
    }
  };

  const exportHandoversCSV = () => {
    if (!handovers || handovers.length === 0) { toast.info("No handovers to export"); return; }
    const rows = handovers.map((h: any) => {
      const fromP = staffProfiles.find((p: any) => p.user_id === h.user_id);
      const toP = staffProfiles.find((p: any) => p.user_id === h.handed_to);
      return {
        "Handover ID": h.id,
        "From": fromP?.full_name || "Unknown",
        "To": toP?.full_name || "—",
        "Type": h.handover_type || "transfer",
        "Cash": Number(h.cash_amount).toLocaleString(),
        "UPI": Number(h.upi_amount).toLocaleString(),
        "Total": (Number(h.cash_amount) + Number(h.upi_amount)).toLocaleString(),
        "Status": h.status,
        "Notes": h.notes || "",
        "Date": new Date(h.created_at).toLocaleString("en-IN"),
      };
    });
    const header = Object.keys(rows[0]).join(",");
    const csv = [header, ...rows.map((r) => Object.values(r).map((v: any) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `handovers-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Handovers exported");
  };

  const exportExpensesCSV = () => {
    if (expenseClaims.length === 0) { toast.info("No expenses to export"); return; }
    const rows = expenseClaims.map((e) => ({
      "Claim ID": e.id,
      "Amount": Number(e.amount).toLocaleString(),
      "Status": e.status,
      "Description": e.description,
      "Date": new Date(e.created_at).toLocaleString("en-IN"),
    }));
    const header = Object.keys(rows[0]).join(",");
    const csv = [header, ...rows.map((r) => Object.values(r).map((v: any) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `expenses-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Expenses exported");
  };

  const pendingCount = handovers?.filter((h) => h.status === "pending" || h.status === "awaiting_confirmation").length || 0;
  const pendingExpenseCount = expenseClaims.filter((e) => e.status === "pending").length;

  const selectedHandover = selectedHandoverId ? handovers?.find((h) => h.id === selectedHandoverId) : null;

  return (
    <div className="flex flex-col h-full bg-background">
      <AdminPageHeader title="Handovers" subtitle="Staff handovers, expenses & income" />

      {isAdmin && (
        <div className="px-4 -mt-3 mb-3">
          <div className="flex gap-2">
            {canApproveExpenses && (
              <Button size="sm" variant="outline" onClick={() => setExpenseTab(!expenseTab)} className="relative gap-1">
                <AlertCircle className="h-4 w-4" />
                Claims
                {pendingExpenseCount > 0 && (
                  <span className="ml-1 h-5 w-5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">{pendingExpenseCount}</span>
                )}
              </Button>
            )}
            {canTransferBetweenStaff && (
              <Button size="sm" onClick={() => setAdminTransferOpen(true)}>
                <ArrowRightLeft className="h-4 w-4 mr-1" /> Transfer
              </Button>
            )}
            {canAdjustHoldingBalance && (
              <Button size="sm" variant="outline" onClick={() => setAdjustHoldingOpen(true)}>
                <Wallet className="h-4 w-4 mr-1" /> Adjust
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="px-4 mb-3">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-3 text-center">
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{pendingCount}</p>
            <p className="text-xs text-muted-foreground">Pending</p>
          </div>
          <div className="rounded-2xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-3 text-center">
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{handovers?.filter((h) => h.status === "confirmed").length || 0}</p>
            <p className="text-xs text-muted-foreground">Confirmed</p>
          </div>
          <div className="rounded-2xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-3 text-center">
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{handovers?.length || 0}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </div>
        </div>
      </div>

      <div className="px-4 space-y-2 mb-3">
        <div className="flex gap-2">
          <Select value={staffFilter} onValueChange={setStaffFilter}>
            <SelectTrigger className="flex-1 h-9 text-xs rounded-xl bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm">
              <User className="h-3 w-3 mr-1" />
              <SelectValue placeholder="All Staff" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Staff</SelectItem>
              {staffProfiles.map((s: any) => (
                <SelectItem key={s.user_id} value={s.user_id}>{s.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[130px] h-9 text-xs rounded-xl bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm" />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[130px] h-9 text-xs rounded-xl bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm" />
        </div>
        <Tabs value={statusTab} onValueChange={setStatusTab}>
          <TabsList className="w-full">
            {STATUS_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="flex-1 text-xs">{tab.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" {...pullHandlers}>
        <PullRefreshIndicator isPulling={isPulling} isRefreshing={isRefreshing} pullDistance={pullDistance} threshold={threshold} />
        <Tabs defaultValue="handovers" value={expenseTab ? "expenses" : statusTab === "income" ? "income" : "handovers"} onValueChange={(v) => {
          if (v === "handovers") { setExpenseTab(false); setStatusTab("all"); }
          else if (v === "expenses") setExpenseTab(true);
          else if (v === "income") { setExpenseTab(false); setStatusTab("income"); }
        }}>
          <TabsList className="w-full">
            <TabsTrigger value="handovers" className="flex-1 text-xs"><Banknote className="h-3.5 w-3.5 mr-1" />Handovers</TabsTrigger>
            {(canSubmitExpenses || canApproveExpenses) && (
              <TabsTrigger value="expenses" className="flex-1 text-xs relative">
                <Receipt className="h-3.5 w-3.5 mr-1" />Expenses
                {pendingExpenseCount > 0 && <span className="ml-1 h-4 w-4 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">{pendingExpenseCount}</span>}
              </TabsTrigger>
            )}
            {(isAdmin || isFinalizer) && (
              <TabsTrigger value="income" className="flex-1 text-xs"><TrendingUp className="h-3.5 w-3.5 mr-1" />Income</TabsTrigger>
            )}
          </TabsList>

          {/* ===== HANDOVERS TAB ===== */}
          <TabsContent value="handovers" className="space-y-3 mt-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{handovers?.length || 0} handovers</p>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={exportHandoversCSV}>
                  <Download className="h-3 w-3 mr-1" /> CSV
                </Button>
              </div>
            </div>

            {canSeeBalances && staffBalances.length > 0 && (
              <>
                <div className="space-y-1">
                  {staffBalances.slice(0, 5).map((balance) => (
                    <div key={balance.user_id} className="flex items-center justify-between py-1.5 px-2 rounded bg-muted/50">
                      <span className="text-xs font-medium">{balance.full_name}</span>
                      <span className="text-xs font-semibold">₹{fmtINR(balance.total_balance)}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t" />
              </>
            )}

            {isLoading ? (
              <CardSkeletonList count={5} />
            ) : !handovers || handovers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Clock className="h-12 w-12 mb-3 opacity-40" />
                <p className="text-sm font-medium">No handovers found</p>
                <p className="text-xs">Try changing the filters</p>
              </div>
            ) : (
              handovers.map((handover: any) => {
                const fromProfile = staffProfiles.find((p: any) => p.user_id === handover.user_id);
                const toProfile = staffProfiles.find((p: any) => p.user_id === handover.handed_to);
                const total = Number(handover.cash_amount) + Number(handover.upi_amount);

                return (
                  <div
                    key={handover.id}
                    onClick={() => { setSelectedHandoverId(handover.id); setShowDetail(true); }}
                    className="rounded-2xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden p-4 active:bg-muted transition-colors cursor-pointer space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar className="h-7 w-7 shrink-0">
                            <AvatarFallback className="text-xs">{fromProfile?.full_name?.[0] || "?"}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{fromProfile?.full_name || "Staff"}</p>
                            <p className="text-xs text-muted-foreground">{handover.handover_type === "collection" ? "Collection" : "Transfer"}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(handover.status)}
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <IndianRupee className="h-4 w-4 text-muted-foreground" />
                          <span className="text-lg font-bold">₹{fmtINR(total)}</span>
                        </div>
                        {handover.handed_to && toProfile && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <ArrowRightLeft className="h-3 w-3" />
                            <span>{toProfile.full_name}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Cash: ₹{fmtINR(Number(handover.cash_amount))} | UPI: ₹{fmtINR(Number(handover.upi_amount))}</span>
                        <span>{format(new Date(handover.created_at), "dd MMM")}</span>
                      </div>
                  </div>
                );
              })
            )}
          </TabsContent>

          {/* ===== EXPENSES TAB ===== */}
          <TabsContent value="expenses" className="space-y-3 mt-3">
            {canSubmitExpenses && (
              <Button size="sm" variant="outline" className="w-full gap-1" onClick={() => setExpenseOpen(true)}>
                <Receipt className="h-4 w-4" /> Submit Expense Claim
              </Button>
            )}
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{expenseClaims.length} claims</p>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={exportExpensesCSV}>
                <Download className="h-3 w-3 mr-1" /> CSV
              </Button>
            </div>
            {loadingExpenses ? (
              <CardSkeletonList count={3} />
            ) : expenseClaims.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground"><p>No expense claims</p></div>
            ) : (
              expenseClaims.map((claim: any) => (
                <div key={claim.id} onClick={() => setSelectedExpense(claim)} className="rounded-2xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden p-4 active:bg-muted transition-colors cursor-pointer space-y-2">
                  <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Wallet className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">₹{fmtINR(claim.amount)}</span>
                      </div>
                      {getStatusBadge(claim.status)}
                    </div>
                    <p className="text-xs text-muted-foreground">{claim.description || "No description"}</p>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{(claim as any).profiles?.full_name || "Staff"}</span>
                      <span>{format(new Date(claim.created_at), "dd MMM yyyy")}</span>
                    </div>
                </div>
              ))
            )}
          </TabsContent>

          {/* ===== INCOME TAB ===== */}
          <TabsContent value="income" className="space-y-3 mt-3">
            {/* Finalizer holdings (admin view) */}
            {isAdmin && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-muted-foreground">Finalizer Holdings</h3>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={dailyResetLoading}
                    onClick={() => setShowResetAllConfirm(true)}>
                    <RefreshCw className="h-3 w-3" /> Reset All
                  </Button>
                </div>
                {!finalizerHoldings || finalizerHoldings.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">No finalizer accounts found.</div>
                ) : (
                  <div className="space-y-2">
                    {finalizerHoldings.map((f: any) => (
                      <div key={f.user_id} className="flex items-center gap-2 rounded-2xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm px-3 py-2">
                        <Avatar className="h-7 w-7 shrink-0">
                          <AvatarFallback className="text-xs">{f.full_name?.[0] || "?"}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{f.full_name}</p>
                          <div className="flex gap-2 text-xs text-muted-foreground">
                            <span>Cash: ₹{Number(f.cash_amount || 0).toLocaleString()}</span>
                            <span>UPI: ₹{Number(f.upi_amount || 0).toLocaleString()}</span>
                          </div>
                          {f.last_reset_at && (
                            <p className="text-xs text-muted-foreground">Reset: {format(new Date(f.last_reset_at), "dd MMM, hh:mm a")}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-emerald-600">₹{Number(f.total_balance || 0).toLocaleString()}</p>
                          <Button size="sm" variant="ghost" className="h-6 text-xs mt-0.5 gap-1" disabled={dailyResetLoading}
                            onClick={() => handleDailyReset(f.user_id)}>
                            <RefreshCw className="h-3 w-3" /> Reset
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="border-t" />
              </div>
            )}

            {/* My income log (finalizer view) */}
            {isFinalizer && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">My Income Log</h3>
                  <div className="flex items-center gap-2">
                    <Input type="date" value={incomeFilterDate} onChange={(e) => setIncomeFilterDate(e.target.value)}
                      className="h-7 text-xs w-28" max={today} />
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={dailyResetLoading}
                      onClick={() => handleDailyReset()}>
                      {dailyResetLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                      Reset
                    </Button>
                  </div>
                </div>
                {finalizerAccount && (
                  <Card className="bg-emerald-50 dark:bg-emerald-950 border-emerald-200">
                    <CardContent className="p-3">
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium uppercase">Holding</p>
                      <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
                        ₹{(Number(finalizerAccount.cash_amount) + Number(finalizerAccount.upi_amount)).toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">Income since last reset</p>
                    </CardContent>
                  </Card>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <Card>
                    <CardContent className="p-3">
                      <p className="text-xs text-muted-foreground">Total Income</p>
                      <p className="text-base font-bold text-emerald-600">
                        ₹{(finalizerIncome || []).reduce((s: number, e: any) => s + Number(e.amount || 0), 0).toLocaleString()}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-3">
                      <p className="text-xs text-muted-foreground">Entries</p>
                      <p className="text-base font-bold">{(finalizerIncome || []).length}</p>
                    </CardContent>
                  </Card>
                </div>
                {finalizerIncomeLoading ? (
                  <div className="text-center py-6"><Loader2 className="h-5 w-5 animate-spin mx-auto text-primary" /></div>
                ) : !finalizerIncome || finalizerIncome.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">No income entries for this date.</div>
                ) : (
                  <div className="space-y-2">
                    {finalizerIncome.map((entry: any) => (
                      <div key={entry.id} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium capitalize">{(entry.entry_type || "collection").replace(/_/g, " ")}</p>
                          {entry.description && <p className="text-xs text-muted-foreground truncate">{entry.description}</p>}
                          <p className="text-xs text-muted-foreground">{format(new Date(entry.created_at), "dd MMM, hh:mm a")}</p>
                        </div>
                        <p className="text-sm font-bold text-emerald-600 shrink-0">+₹{Number(entry.amount || 0).toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Handover Detail Dialog */}
      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Handover Details</DialogTitle>
          </DialogHeader>
          {selectedHandover && (() => {
            const fromP = staffProfiles.find((p: any) => p.user_id === selectedHandover.user_id);
            const toP = staffProfiles.find((p: any) => p.user_id === selectedHandover.handed_to);
            const total = Number(selectedHandover.cash_amount) + Number(selectedHandover.upi_amount);
            return (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">From</p>
                    <p className="font-medium">{fromP?.full_name || "Staff"}</p>
                  </div>
                  <ArrowRightLeft className="h-5 w-5 text-muted-foreground" />
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">To</p>
                    <p className="font-medium">{toP?.full_name || "—"}</p>
                  </div>
                </div>
                <div className="border-t pt-3 space-y-2">
                  <div className="flex justify-between"><span className="text-sm text-muted-foreground">Amount</span><span className="font-bold text-lg">₹{fmtINR(total)}</span></div>
                  <div className="flex justify-between"><span className="text-sm text-muted-foreground">Cash</span><span>₹{fmtINR(Number(selectedHandover.cash_amount))}</span></div>
                  <div className="flex justify-between"><span className="text-sm text-muted-foreground">UPI</span><span>₹{fmtINR(Number(selectedHandover.upi_amount))}</span></div>
                  <div className="flex justify-between"><span className="text-sm text-muted-foreground">Type</span><span className="capitalize">{selectedHandover.handover_type}</span></div>
                  <div className="flex justify-between"><span className="text-sm text-muted-foreground">Status</span>{getStatusBadge(selectedHandover.status)}</div>
                  <div className="flex justify-between"><span className="text-sm text-muted-foreground">Date</span><span>{format(new Date(selectedHandover.created_at), "dd MMM yyyy, h:mm a")}</span></div>
                  {selectedHandover.notes && (
                    <div><span className="text-sm text-muted-foreground">Notes</span><p className="text-sm mt-1">{selectedHandover.notes}</p></div>
                  )}
                </div>
                {(selectedHandover.status === "pending" || selectedHandover.status === "awaiting_confirmation") && isAdmin && (
                  <div className="flex gap-2 pt-2">
                    <Button
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => { setShowDetail(false); setConfirmAction({ id: selectedHandover.id, action: "confirm" }); }}
                      disabled={actionLoading === selectedHandover.id}
                    >
                      {actionLoading === selectedHandover.id ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                      Confirm
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1"
                      onClick={() => { setShowDetail(false); setConfirmAction({ id: selectedHandover.id, action: "reject" }); }}
                      disabled={actionLoading === selectedHandover.id}
                    >
                      <XCircle className="h-4 w-4 mr-1" /> Reject
                    </Button>
                  </div>
                )}
                {canModifyHandovers && (
                  <div className="pt-2">
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => { setShowDetail(false); setSelectedHandoverForEdit(selectedHandover); setEditHandoverOpen(true); }}
                    >
                      <Edit2 className="h-4 w-4 mr-1" /> Edit Handover
                    </Button>
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Confirm/Reject Dialog */}
      <AlertDialog open={!!confirmAction} onOpenChange={(o) => !o && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmAction?.action === "confirm" ? "Confirm Handover" : "Reject Handover"}</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription>
            {confirmAction?.action === "confirm"
              ? "Are you sure you want to confirm this handover? This will update the staff balances."
              : "Are you sure you want to reject this handover? The amounts will not be applied."}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {confirmAction?.action === "confirm" ? (
              <AlertDialogAction onClick={() => handleConfirmHandover(confirmAction!.id)} className="bg-emerald-600 hover:bg-emerald-700">Confirm</AlertDialogAction>
            ) : (
              confirmAction && <AlertDialogAction onClick={() => handleRejectHandover(confirmAction.id)} className="bg-red-600 hover:bg-red-700">Reject</AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Admin Transfer Dialog */}
      <Dialog open={adminTransferOpen} onOpenChange={setAdminTransferOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Transfer Between Staff</DialogTitle>
            <DialogDescription>Move cash from one staff member to another</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>From Staff</Label>
              <Select value={transferFrom} onValueChange={setTransferFrom}>
                <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                <SelectContent>
                  {staffProfiles.map((s: any) => (
                    <SelectItem key={s.user_id} value={s.user_id}>{s.full_name} ({s.roleLabel})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>To Staff</Label>
              <Select value={transferTo} onValueChange={setTransferTo}>
                <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                <SelectContent>
                  {staffProfiles.map((s: any) => (
                    <SelectItem key={s.user_id} value={s.user_id}>{s.full_name} ({s.roleLabel})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amount (₹)</Label>
              <Input type="number" value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)} placeholder="0" />
            </div>
            <div>
              <Label>Reason</Label>
              <Textarea value={transferReason} onChange={(e) => setTransferReason(e.target.value)} placeholder="Optional reason" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdminTransferOpen(false)}>Cancel</Button>
            <Button onClick={handleAdminTransfer} disabled={actionLoading === "transfer"}>
              {actionLoading === "transfer" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
              Create Transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Expense Review Dialog */}
      <Dialog open={!!selectedExpense} onOpenChange={(o) => { if (!o) setSelectedExpense(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Review Expense Claim</DialogTitle>
          </DialogHeader>
          {selectedExpense && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Staff</p>
                  <p className="font-medium">{(selectedExpense as any).profiles?.full_name || "Staff"}</p>
                </div>
                {getStatusBadge(selectedExpense.status)}
              </div>
              <div className="border-t pt-3 space-y-2">
                <div className="flex justify-between"><span className="text-sm text-muted-foreground">Amount</span><span className="font-bold">₹{fmtINR(selectedExpense.amount)}</span></div>
                <div className="flex justify-between"><span className="text-sm text-muted-foreground">Description</span><span className="text-sm">{selectedExpense.description}</span></div>
                <div className="flex justify-between"><span className="text-sm text-muted-foreground">Date</span><span>{format(new Date(selectedExpense.expense_date), "dd MMM yyyy")}</span></div>
                <div className="flex justify-between"><span className="text-sm text-muted-foreground">Submitted</span><span>{format(new Date(selectedExpense.created_at), "dd MMM yyyy")}</span></div>
              </div>
              {selectedExpense.status === "pending" && (
                <>
                  <div>
                    <Label>Review Notes</Label>
                    <Textarea value={expenseReviewNotes} onChange={(e) => setExpenseReviewNotes(e.target.value)} placeholder="Approval note or rejection reason..." rows={2} />
                  </div>
                  <div className="flex gap-2">
                    <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => handleApproveExpense(selectedExpense.id)} disabled={actionLoading === `expense-${selectedExpense.id}`}>
                      {actionLoading === `expense-${selectedExpense.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                      Approve
                    </Button>
                    <Button variant="destructive" className="flex-1" onClick={() => handleRejectExpense(selectedExpense.id)} disabled={actionLoading === `expense-${selectedExpense.id}` || !expenseReviewNotes}>
                      <XCircle className="h-4 w-4 mr-1" /> Reject
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Handover Dialog */}
      <EditHandoverDialog
        open={editHandoverOpen}
        onOpenChange={(v) => { setEditHandoverOpen(v); if (!v) setSelectedHandoverForEdit(null); }}
        handover={selectedHandoverForEdit}
        getName={getName}
        submitting={actionLoading === selectedHandoverForEdit?.id}
        onSave={handleEditHandover}
      />

      {/* Adjust Holding Dialog */}
      {canAdjustHoldingBalance && (
        <AdjustHoldingDialog
          open={adjustHoldingOpen}
          onOpenChange={setAdjustHoldingOpen}
          staffProfiles={staffProfiles as any}
          submitting={actionLoading === "adjust-holding"}
          onAdjust={handleAdjustHoldingBalance}
        />
      )}

      {/* Expense Submission Dialog */}
      <Dialog open={expenseOpen} onOpenChange={setExpenseOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Submit Expense Claim</DialogTitle>
            <DialogDescription>Claim reimbursement for out-of-pocket expenses.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Category *</Label>
              <Select value={expenseCategory} onValueChange={setExpenseCategory}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {expenseCategories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: cat.color || `hsl(var(--muted-foreground))` }} />
                        {cat.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Amount (₹) *</Label>
                <Input type="number" value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)} placeholder="0.00" min="1" />
              </div>
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} max={today} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description *</Label>
              <Textarea value={expenseDescription} onChange={(e) => setExpenseDescription(e.target.value)} placeholder="What was this expense for?" rows={2} />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Image className="h-4 w-4" /> Receipt Photo (Optional)
              </Label>
              <ImageUpload folder="expense-receipts" currentUrl={expenseReceiptUrl} onUploaded={(url) => setExpenseReceiptUrl(url)} onRemoved={() => setExpenseReceiptUrl(null)} size="lg" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExpenseOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateExpenseClaim} disabled={expenseSubmitting}>
              {expenseSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              Submit Claim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset All Finalizers Confirmation */}
      <Dialog open={showResetAllConfirm} onOpenChange={setShowResetAllConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset All Finalizers?</DialogTitle>
            <DialogDescription>
              This will create income entries for all finalizers and zero their balances. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetAllConfirm(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => {
              setShowResetAllConfirm(false);
              (finalizerHoldings || []).forEach((f) => handleDailyReset(f.user_id));
            }}>
              Yes, Reset All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
