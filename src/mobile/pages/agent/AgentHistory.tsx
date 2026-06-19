import { useMemo, useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, startOfDay } from "date-fns";
import {
  ArrowLeft,
  CheckCircle2,
  HandCoins,
  Loader2,
  Pencil,
  Receipt,
  ReceiptIndianRupee,
  Send,
  TrendingUp,
  Wallet,
  XCircle,
  RotateCcw,
  Package,
  AlertCircle,
  Minus,
  Plus,
} from "lucide-react";
import { MiniStat } from "@/mobile/pages/agent/MiniStat";
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
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { usePermission } from "@/hooks/usePermission";
import { supabase } from "@/integrations/supabase/client";
import { afterSaleEdited, afterSaleReturned, afterPaymentReturned } from "@/lib/mutationHelpers";
import { ReturnPaymentDialog } from "@/mobile/components/ReturnPaymentDialog";
import { enqueueWithContext } from "@/lib/conflictResolver";
import { generateBusinessKey } from "@/lib/offlineQueue";
import { sendNotification, getAdminUserIds, sendNotificationToMany } from "@/lib/notifications";
import { logActivity } from "@/lib/activityLogger";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { BillImages } from "@/mobile/components/BillImageUpload";
import { SaleReceipt } from "@/components/shared/SaleReceipt";
import { usePullToRefresh } from "@/mobile/hooks/usePullToRefresh";
import { PullRefreshIndicator } from "@/mobile/components/PullRefreshIndicator";

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
  _txn_id?: string;
  _store_id?: string;
  _customer_id?: string;
  _outstanding_amount?: number;
  _is_fully_returned?: boolean;
  _updated_at?: string;
  _notes?: string;
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
  const { allowed: canReturnSales } = usePermission("create_sale_returns");
  const { allowed: canSubmitExpenses } = usePermission("submit_expenses");
  const qc = useQueryClient();
  const [view, setView] = useState<"activity" | "handovers" | "claims">("activity");
  const [selectedActivityDate, setSelectedActivityDate] = useState<string | null>(null);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [handoverNotes, setHandoverNotes] = useState("");
  const [toUserId, setToUserId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cancelHandoverConfirm, setCancelHandoverConfirm] = useState<{ show: boolean; requestId: string }>({ show: false, requestId: "" });
  const [cancelClaimConfirm, setCancelClaimConfirm] = useState<{ show: boolean; claimId: string }>({ show: false, claimId: "" });

  // Expense submission state
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [expenseCategoryId, setExpenseCategoryId] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState("");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseBillUrls, setExpenseBillUrls] = useState<string[]>([]);

  // Sale return state
  const [returningSale, setReturningSale] = useState<{ id: string; display_id: string; total_amount: number; outstanding_amount: number; store_id: string; customer_id: string; created_at: string; is_fully_returned?: boolean } | null>(null);

  // Edit sale state
  const [editingSale, setEditingSale] = useState<{ id: string; display_id: string; total_amount: number; cash_amount: number; upi_amount: number; outstanding_amount: number; store_id: string; customer_id: string; created_at: string } | null>(null);
  const [editCash, setEditCash] = useState("");
  const [editUpi, setEditUpi] = useState("");
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [editingItemsState, setEditingItemsState] = useState<any[]>([]);

  // Transaction return/edit state
  const [returningTransaction, setReturningTransaction] = useState<any>(null);
  const [editingTransaction, setEditingTransaction] = useState<{ id: string; display_id: string; cash_amount: number; upi_amount: number; store_id: string; customer_id: string; created_at: string; notes: string } | null>(null);
  const [editTxnCash, setEditTxnCash] = useState("");
  const [editTxnUpi, setEditTxnUpi] = useState("");
  const [editTxnNotes, setEditTxnNotes] = useState("");
  const [submittingEditTxn, setSubmittingEditTxn] = useState(false);

  // Return sale state
  const [returnReason, setReturnReason] = useState("");
  const [returnOtherReason, setReturnOtherReason] = useState("");
  const [returnNotes, setReturnNotes] = useState("");
  const [returnIsDamaged, setReturnIsDamaged] = useState(false);
  const [submittingReturn, setSubmittingReturn] = useState(false);
  const [receiptSaleId, setReceiptSaleId] = useState<string | null>(null);

  const todayStart = startOfDay(new Date()).toISOString();
  // Admins can always edit/return; agents are limited to same-day
  const isPastDate = (created_at: string, updated_at?: string) => {
    if (isAdmin) return false; // Admins bypass date lock
    if (!created_at) return false;
    
    const today = new Date();
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth();
    const todayDay = today.getDate();

    const isToday = (dateStr: string) => {
      const d = new Date(dateStr);
      return d.getFullYear() === todayYear && d.getMonth() === todayMonth && d.getDate() === todayDay;
    };

    if (isToday(created_at)) return false;
    if (updated_at && isToday(updated_at)) return false;
    
    const saleDate = new Date(created_at);
    const saleYear = saleDate.getFullYear();
    const saleMonth = saleDate.getMonth();
    const saleDay = saleDate.getDate();
    
    if (saleYear < todayYear) return true;
    if (saleYear > todayYear) return false;
    if (saleMonth < todayMonth) return true;
    if (saleMonth > todayMonth) return false;
    return saleDay < todayDay;
  };

  const { data: handovers, isLoading: loadingHandovers } = useQuery({
    queryKey: ["handovers", user?.id, "mobile-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("handovers")
        .select("id, user_id, handed_to, cash_amount, upi_amount, status, created_at, notes")
        .or(`user_id.eq.${user!.id},handed_to.eq.${user!.id}`)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data as any[]) || [];
    },
    enabled: !!user,
    refetchInterval: 60_000,
    staleTime: 60_000,
  });

  const { data: salesForBalance } = useQuery({
    queryKey: ["mobile-history-balance-sales", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("cash_amount, upi_amount, created_at")
        .eq("recorded_by", user!.id)
        .gte("created_at", todayStart);
      if (error) throw error;
      return (data as any[]) || [];
    },
    enabled: !!user,
    refetchInterval: 60_000,
    staleTime: 60_000,
  });

  const { data: salesTimeline, isLoading: loadingSalesTimeline } = useQuery({
    queryKey: ["mobile-history-sales-timeline", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, display_id, total_amount, cash_amount, upi_amount, outstanding_amount, is_fully_returned, created_at, updated_at, store_id, customer_id, stores(name)")
        .eq("recorded_by", user!.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data as any[]) || [];
    },
    enabled: !!user,
    refetchInterval: 60_000,
    staleTime: 60_000,
  });

  const { data: transactionsForBalance } = useQuery({
    queryKey: ["mobile-history-balance-transactions", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("cash_amount, upi_amount, created_at")
        .eq("recorded_by", user!.id)
        .gte("created_at", todayStart);
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
    staleTime: 60_000,
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
    staleTime: 5 * 60 * 1000,
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
    staleTime: 60_000,
  });

  const { data: transactionsTimeline, isLoading: loadingTransactionsTimeline } = useQuery({
    queryKey: ["mobile-history-transactions-timeline", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, display_id, total_amount, cash_amount, upi_amount, created_at, updated_at, store_id, customer_id, notes, is_fully_returned, stores(id, name)")
        .eq("recorded_by", user!.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data as any[]) || [];
    },
    enabled: !!user,
    refetchInterval: 60_000,
    staleTime: 60_000,
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
    staleTime: 5 * 60 * 1000,
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
    staleTime: 5 * 60 * 1000,
  });

  const { data: editingSaleItems } = useQuery({
    queryKey: ["sale-items-for-edit", editingSale?.id],
    queryFn: async () => {
      if (!editingSale?.id) return [];
      const { data, error } = await supabase
        .from("sale_items")
        .select("id, product_id, quantity, unit_price, total_price, products(name, sku, unit)")
        .eq("sale_id", editingSale.id);
      if (error) throw error;
      return (data as any[]) || [];
    },
    enabled: !!editingSale?.id,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (editingSaleItems) {
      setEditingItemsState(
        editingSaleItems.map((item) => ({
          id: item.id,
          product_id: item.product_id,
          name: item.products?.name || "Product",
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.total_price || item.quantity * item.unit_price,
        }))
      );
    } else {
      setEditingItemsState([]);
    }
  }, [editingSaleItems]);

  const { data: returningSaleItems } = useQuery({
    queryKey: ["sale-items-for-return-mobile", returningSale?.id],
    queryFn: async () => {
      if (!returningSale?.id) return [];
      const { data, error } = await supabase
        .from("sale_items")
        .select("id, product_id, quantity, unit_price, total_price, products(name, sku, unit)")
        .eq("sale_id", returningSale.id);
      if (error) throw error;
      return (data as any[]) || [];
    },
    enabled: !!returningSale?.id,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!returningSale) {
      setReturnReason("");
      setReturnOtherReason("");
      setReturnNotes("");
      setReturnIsDamaged(false);
    }
  }, [returningSale]);

  const updateEditingItemQty = (productId: string, delta: number) => {
    setEditingItemsState(
      editingItemsState.map((item) => {
        if (item.product_id !== productId) return item;
        const newQty = Math.max(0, item.quantity + delta);
        return { ...item, quantity: newQty, total_price: newQty * item.unit_price };
      })
    );
  };

  const setEditingItemQtyDirect = (productId: string, value: string) => {
    const parsed = parseInt(value, 10);
    if (value === "") {
      setEditingItemsState(editingItemsState.filter((item) => item.product_id !== productId));
      return;
    }
    if (!Number.isFinite(parsed) || parsed < 0) return;
    setEditingItemsState(
      editingItemsState.map((item) => {
        if (item.product_id !== productId) return item;
        return { ...item, quantity: parsed, total_price: parsed * item.unit_price };
      })
    );
  };

  const updateEditingItemPrice = (productId: string, value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    setEditingItemsState(
      editingItemsState.map((item) => {
        if (item.product_id !== productId) return item;
        return { ...item, unit_price: parsed, total_price: item.quantity * parsed };
      })
    );
  };

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
      _is_fully_returned: sale.is_fully_returned || false,
      _updated_at: sale.updated_at,
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
      _txn_id: transaction.id,
      _store_id: transaction.store_id,
      _customer_id: transaction.customer_id,
      _updated_at: transaction.updated_at,
      _notes: transaction.notes,
      _is_fully_returned: transaction.is_fully_returned || false,
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
        const activeSales = items.filter((item) => item.type === "sale" && !item._is_fully_returned);
        const returnedSales = items.filter((item) => item.type === "sale" && item._is_fully_returned);
        const activeTransactions = items.filter((item) => item.type === "transaction" && !item._is_fully_returned);
        const returnedTransactions = items.filter((item) => item.type === "transaction" && item._is_fully_returned);
        const salesCount = activeSales.length;
        const transactionsCount = activeTransactions.length;
        // Exclude fully returned items from totals — they've been reversed
        const total = items
          .filter((item) => !item._is_fully_returned)
          .reduce((sum, item) => sum + item.amount, 0);
        return {
          date,
          items,
          total,
          salesCount,
          transactionsCount,
          returnedCount: returnedSales.length + returnedTransactions.length,
        };
      }),
    [timelineByDate, timelineDates]
  );

  const getPersonName = (personId: string | null | undefined) => {
    if (!personId) return "Unassigned";
    if (personId === user?.id) return "You";
    return profileNameMap.get(personId) || "Staff";
  };

  const todaySales = salesForBalance || [];
  const todayTotalSales = todaySales.reduce(
    (sum: number, sale: any) => sum + Number(sale.cash_amount || 0) + Number(sale.upi_amount || 0),
    0
  );
  const todayCashSales = todaySales.reduce((sum: number, sale: any) => sum + Number(sale.cash_amount || 0), 0);
  const todayUpiSales = todaySales.reduce((sum: number, sale: any) => sum + Number(sale.upi_amount || 0), 0);

  const todayPayments = transactionsForBalance || [];
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
    const { error: rpcError } = await supabase.rpc("create_handover_with_type", {
      p_user_id: user!.id,
      p_handed_to: toUserId,
      p_cash_amount: Number(amount),
      p_upi_amount: 0,
      p_notes: handoverNotes || null,
      p_handover_type: "transfer",
    });
    setSubmitting(false);

    if (rpcError) {
      toast.error(rpcError.message);
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
    if (!canSubmitExpenses) {
      toast.error("You don't have permission to submit expenses");
      return;
    }
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

  const handleCancelHandover = (handover: any) => {
    setCancelHandoverConfirm({ show: true, requestId: handover.id });
  };

  const executeCancelHandover = async (handoverId: string) => {
    if (!handoverId) return;
    setCancelHandoverConfirm({ show: false, requestId: "" });
    const handover = (handovers || []).find((h: any) => h.id === handoverId);
    if (!handover) return;
    setSubmitting(true);
    const { error } = await supabase.rpc("cancel_handover", {
      p_handover_id: handoverId,
      p_cancelled_by: user!.id,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const total = Number(handover.cash_amount || 0) + Number(handover.upi_amount || 0);
    toast.success("Handover cancelled");
    if (handover.handed_to) {
      sendNotification({
        userId: handover.handed_to,
        title: "Handover Cancelled",
        message: `A ₹${total.toLocaleString()} handover was cancelled by sender`,
        type: "handover",
        entityType: "handover",
        entityId: handover.id,
      });
    }
    qc.invalidateQueries({ queryKey: ["handovers"] });
  };

  const handleConfirm = async (handover: any) => {
    const { error } = await supabase.rpc("confirm_handover", {
      p_handover_id: handover.id,
      p_confirmed_by: user!.id,
    });

    if (error) {
      toast.error(error.message);
      return;
    }

    const total = Number(handover.cash_amount || 0) + Number(handover.upi_amount || 0);
    const isCollection = handover.handover_type === 'collection';
    toast.success(isCollection ? "Collection confirmed - income recorded" : "Handover confirmed");
    if (handover.user_id) {
      sendNotification({
        userId: handover.user_id,
        title: isCollection ? "Collection Confirmed" : "Transfer Confirmed",
        message: `Your ₹${total.toLocaleString()} ${isCollection ? 'collection' : 'transfer'} was accepted`,
        type: "handover",
        entityType: "handover",
        entityId: handover.id,
      });
    }
    qc.invalidateQueries({ queryKey: ["handovers"] });
    qc.invalidateQueries({ queryKey: ["agent-cash-holding"] });
  };

  const handleReject = async (handover: any) => {
    const { error } = await supabase.rpc("reject_handover", {
      p_handover_id: handover.id,
      p_rejected_by: user!.id,
    });

    if (error) {
      toast.error(error.message);
      return;
    }

    const total = Number(handover.cash_amount || 0) + Number(handover.upi_amount || 0);
    toast.success("Handover rejected");
    if (handover.user_id) {
      sendNotification({
        userId: handover.user_id,
        title: "Handover Rejected",
        message: `Your ₹${total.toLocaleString()} handover was rejected`,
        type: "handover",
        entityType: "handover",
        entityId: handover.id,
      });
    }
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

  const handleCancelExpenseClaim = (claimId: string) => {
    setCancelClaimConfirm({ show: true, claimId });
  };

  const executeCancelExpenseClaim = async (claimId: string) => {
    if (!claimId) return;
    setCancelClaimConfirm({ show: false, claimId: "" });
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

  const handleEditSale = async () => {
    if (!editingSale) return;
    if (!editCash && !editUpi) {
      toast.error("Enter at least one payment amount");
      return;
    }
    if (editingItemsState.length === 0) {
      toast.error("At least one product item is required");
      return;
    }
    setSubmittingEdit(true);
    try {
      const editedTotalAmount = editingItemsState.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
      const editedOutstanding = editedTotalAmount - (Number(editCash) || 0) - (Number(editUpi) || 0);
      if (editedOutstanding < 0) { toast.error("Payment exceeds sale total. Reduce payment amount."); setSubmittingEdit(false); return; }

      const { data: saleData } = await supabase
        .from("sales")
        .select("display_id, recorded_by, logged_by")
        .eq("id", editingSale.id)
        .single();

      if (!saleData) throw new Error("Sale not found");

      const { data: result, error } = await (supabase as any).rpc("edit_sale", {
        p_original_sale_id: editingSale.id,
        p_store_id: editingSale.store_id,
        p_customer_id: editingSale.customer_id,
        p_display_id: saleData.display_id,
        p_total_amount: editedTotalAmount,
        p_cash_amount: Number(editCash) || 0,
        p_upi_amount: Number(editUpi) || 0,
        p_outstanding_amount: editedOutstanding,
        p_sale_items: editingItemsState.map((si: any) => ({
          product_id: si.product_id,
          quantity: si.quantity,
          unit_price: si.unit_price,
          total_price: si.quantity * si.unit_price,
        })),
        p_recorded_by: saleData.recorded_by,
        p_logged_by: saleData.logged_by,
        p_created_at: editingSale.created_at,
      });

      if (error) throw error;

      toast.success("Sale updated");
      setEditingSale(null);
      setEditCash("");
      setEditUpi("");
      setEditingItemsState([]);
      afterSaleEdited(qc, { isMobile: true, storeId: editingSale.store_id });
    } catch (err: any) {
      toast.error(err.message || "Failed to edit sale");
    } finally {
      setSubmittingEdit(false);
    }
  };

  const handleEditTransaction = async () => {
    if (!editingTransaction) return;
    const cash = Number(editTxnCash) || 0;
    const upi = Number(editTxnUpi) || 0;
    if (cash < 0 || upi < 0) { toast.error("Amounts cannot be negative"); return; }
    if (cash + upi <= 0) { toast.error("Total payment must be positive"); return; }

    setSubmittingEditTxn(true);
    if (!navigator.onLine) {
      const bizKey = generateBusinessKey("transaction_edit", {
        storeId: editingTransaction.store_id,
        customerId: editingTransaction.customer_id,
        timestamp: new Date().toISOString(),
      });
      await enqueueWithContext({
        id: crypto.randomUUID(),
        type: "transaction_edit",
        payload: {
          txnId: editingTransaction.id,
          cashAmount: cash,
          upiAmount: upi,
          notes: editTxnNotes || null,
          recordedBy: user!.id,
        },
        createdAt: new Date().toISOString(),
        businessKey: bizKey,
      });
      setEditingTransaction(null);
      setEditTxnCash("");
      setEditTxnUpi("");
      setEditTxnNotes("");
      setSubmittingEditTxn(false);
      toast.warning("Offline — edit queued and will sync automatically");
      return;
    }

    try {
      const { error } = await (supabase as any).rpc("update_transaction", {
        p_transaction_id: editingTransaction.id,
        p_cash_amount: cash,
        p_upi_amount: upi,
        p_notes: editTxnNotes || null,
      });
      if (error) throw error;
      toast.success("Transaction updated");
      setEditingTransaction(null);
      setEditTxnCash("");
      setEditTxnUpi("");
      setEditTxnNotes("");
      afterPaymentReturned(qc, { isMobile: true });
      setSubmittingEditTxn(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to edit transaction");
      setSubmittingEditTxn(false);
    }
  };

  const handleReturnSale = async () => {
    if (!returningSale) return;
    const finalReason = returnReason === "Other" ? returnOtherReason : returnReason;
    if (!finalReason?.trim()) {
      toast.error("Please provide a reason for the return");
      return;
    }
    if (!returningSaleItems || returningSaleItems.length === 0) {
      toast.error("No items found for this sale");
      return;
    }

    setSubmittingReturn(true);
    try {
      const payload = returningSaleItems.map((item: any) => ({
        sale_item_id: item.id,
        product_id: item.product_id,
        return_qty: item.quantity,
        damaged_qty: returnIsDamaged ? item.quantity : 0,
        unit_price: item.unit_price,
      }));

      const { data: result, error } = await (supabase as any).rpc("record_sale_return", {
        p_sale_id: returningSale.id,
        p_returned_by: user!.id,
        p_reason: finalReason,
        p_items: payload,
      });

      if (error) throw error;

      const row = (result as any)?.[0];
      const returnId = row?.return_id;
      const displayId = row?.display_id;
      toast.success(`Sale fully returned. New outstanding: ₹${(row?.new_outstanding ?? 0).toLocaleString()}`);

      if (returnId && displayId) {
        logActivity(user!.id, "Full sale return processed", "sale_return", displayId, returnId, { saleId: returningSale.id, reason: finalReason });
        
        getAdminUserIds().then(async (ids) => {
          const recipientIds = [...ids];
          if (returningSale.customer_id) {
            try {
              const { data: custData } = await supabase
                .from("customers")
                .select("user_id")
                .eq("id", returningSale.customer_id)
                .maybeSingle();
              if (custData?.user_id) recipientIds.push(custData.user_id);
            } catch (err) {
              console.error("Failed to fetch customer for notifications", err);
            }
          }
          const uniqueRecipients = Array.from(new Set(recipientIds.filter((id) => id !== user?.id)));
          if (uniqueRecipients.length > 0) {
            sendNotificationToMany(uniqueRecipients, {
              title: "Sale Returned",
              message: `Full return for sale #${displayId}${returnIsDamaged ? " (Damaged Items)" : ""}`,
              type: "payment",
              entityType: "sale_return",
              entityId: returnId,
            });
          }
        });
      }

      const returnStoreId = returningSale?.store_id;
      setReturningSale(null);
      afterSaleReturned(qc, { isMobile: true, saleId: returningSale?.id, storeId: returnStoreId });
    } catch (err: any) {
      toast.error(err.message || "Failed to process return");
    } finally {
      setSubmittingReturn(false);
    }
  };

  const timelineLoading = loadingSalesTimeline || loadingTransactionsTimeline;

  const onRefresh = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["mobile-history-sales-timeline"] }),
      qc.invalidateQueries({ queryKey: ["mobile-history-transactions-timeline"] }),
      qc.invalidateQueries({ queryKey: ["mobile-history-balance-sales"] }),
      qc.invalidateQueries({ queryKey: ["mobile-history-balance-transactions"] }),
      qc.invalidateQueries({ queryKey: ["mobile-history-holding-balance"] }),
      qc.invalidateQueries({ queryKey: ["handovers"] }),
      qc.invalidateQueries({ queryKey: ["mobile-expense-claims"] }),
    ]);
  }, [qc]);

  const { handlers: pullHandlers, isPulling, isRefreshing, pullDistance, threshold } = usePullToRefresh({
    onRefresh,
  });

  if (selectedActivityDate) {
    const selectedItems = timelineByDate[selectedActivityDate] || [];
    // Exclude returned sales from totals — they've been reversed
    const selectedTotal = selectedItems
      .filter((item) => !item._is_fully_returned)
      .reduce((sum, item) => sum + item.amount, 0);
    const returnedCount = selectedItems.filter((item) => item._is_fully_returned).length;

    return (
      <div {...pullHandlers} className="pb-6">
        <PullRefreshIndicator isRefreshing={isRefreshing} isPulling={isPulling} pullDistance={pullDistance} threshold={threshold} />
        <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 dark:from-slate-900 dark:via-blue-950 dark:to-indigo-950 px-4 pt-4 pb-6">
          <button
            type="button"
            className="h-10 px-3 rounded-xl bg-white/15 text-white text-sm font-semibold flex items-center gap-2"
            onClick={() => setSelectedActivityDate(null)}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <p className="text-blue-200 text-xs font-medium uppercase tracking-widest mt-3">Activity</p>
          <h2 className="text-white text-xl font-bold mt-0.5">{formatGroupDate(selectedActivityDate)} Records</h2>
          <p className="text-blue-100 text-xs mt-1">
            {selectedItems.length} entries · ₹{selectedTotal.toLocaleString("en-IN")}
            {returnedCount > 0 && ` · ${returnedCount} returned`}
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
            selectedItems.map((item) => {
              const isReturned = item._is_fully_returned;
              return (
                <div
                  key={item.id}
                  className={cn(
                    "rounded-2xl p-3 shadow-sm transition-all",
                    isReturned
                      ? "bg-slate-50 dark:bg-slate-900/40 border border-dashed border-red-200 dark:border-red-900/50 opacity-75"
                      : "bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isReturned ? (
                          <Badge className="text-xs font-bold bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-md px-1.5 py-0">
                            ↩ RETURNED
                          </Badge>
                        ) : (
                          <Badge variant="outline" className={cn("text-xs font-semibold", item.type === "sale" ? "border-blue-200 text-blue-600 dark:border-blue-700 dark:text-blue-400" : "border-emerald-200 text-emerald-600 dark:border-emerald-700 dark:text-emerald-400")}>
                            {item.type === "sale" ? "Sale" : "Transaction"}
                          </Badge>
                        )}
                        {item.display_id && (
                          <span className={cn("text-xs", isReturned ? "text-slate-300 dark:text-slate-600 line-through" : "text-slate-400")}>
                            {item.display_id}
                          </span>
                        )}
                      </div>
                      <p className={cn("text-sm font-semibold mt-1", isReturned ? "text-slate-400 dark:text-slate-500" : "text-slate-800 dark:text-white")}>
                        {item.store_name || "Store"}
                      </p>
                      <div className={cn("flex items-center gap-3 mt-1 text-xs", isReturned ? "text-slate-300 dark:text-slate-600" : "text-slate-400")}>
                        <span>{format(new Date(item.created_at), "hh:mm a")}</span>
                        {!isReturned && (
                          <>
                            <span>Cash ₹{item.cash.toLocaleString("en-IN")}</span>
                            <span>UPI ₹{item.upi.toLocaleString("en-IN")}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <p className={cn(
                        "text-base font-bold",
                        isReturned
                          ? "text-slate-300 dark:text-slate-600 line-through"
                          : "text-slate-800 dark:text-white"
                      )}>
                        ₹{item.amount.toLocaleString("en-IN")}
                      </p>
                      {/* Receipt button — always visible for sales */}
                      {item.type === "sale" && item._sale_id && (
                        <button
                          onClick={() => setReceiptSaleId(item._sale_id!)}
                          className="text-xs font-semibold px-3 py-2 rounded-lg transition-colors text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                        >
                          Receipt
                        </button>
                      )}
                      {/* No actions on returned sales — cancelled state is final */}
                      {/* Edit + Return buttons for transactions */}
                      {!isReturned && item.type === "transaction" && item._txn_id && (
                        <div className="flex items-center gap-1">
                          <button
                            disabled={isPastDate(item.created_at, item._updated_at)}
                            onClick={() => {
                              setEditTxnCash(String(item.cash));
                              setEditTxnUpi(String(item.upi));
                              setEditTxnNotes(item._notes || "");
                              setEditingTransaction({
                                id: item._txn_id!,
                                display_id: item.display_id || "",
                                cash_amount: item.cash,
                                upi_amount: item.upi,
                                store_id: item._store_id || "",
                                customer_id: item._customer_id || "",
                                created_at: item.created_at,
                                notes: item._notes || "",
                              });
                            }}
                            className={cn(
                              "text-xs font-semibold px-3 py-2 rounded-lg transition-colors",
                              isPastDate(item.created_at, item._updated_at)
                                ? "text-slate-300 dark:text-slate-600 cursor-not-allowed"
                                : "text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                            )}
                          >
                            Edit
                          </button>
                          <button
                            disabled={isPastDate(item.created_at, item._updated_at)}
                            onClick={() => setReturningTransaction({
                              id: item._txn_id!,
                              display_id: item.display_id || "",
                              total_amount: item.amount,
                              cash_amount: item.cash,
                              upi_amount: item.upi,
                              store_id: item._store_id || "",
                              customer_id: item._customer_id || "",
                              stores: { name: item.store_name || "", display_id: item.display_id || "" },
                            })}
                            className={cn(
                              "text-xs font-semibold px-3 py-2 rounded-lg transition-colors",
                              isPastDate(item.created_at, item._updated_at)
                                ? "text-slate-300 dark:text-slate-600 cursor-not-allowed"
                                : "text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                            )}
                          >
                            Return
                          </button>
                        </div>
                      )}
                      {!isReturned && item.type === "sale" && item._sale_id && (
                        <div className="flex items-center gap-1">
                          <button
                            disabled={isPastDate(item.created_at, item._updated_at)}
                            onClick={() => {
                              setEditCash(String(item.cash));
                              setEditUpi(String(item.upi));
                              setEditingSale({
                                id: item._sale_id!,
                                display_id: item.display_id || "",
                                total_amount: item.amount,
                                cash_amount: item.cash,
                                upi_amount: item.upi,
                                outstanding_amount: item._outstanding_amount || 0,
                                store_id: item._store_id || "",
                                customer_id: item._customer_id || "",
                                created_at: item.created_at,
                              });
                            }}
                            className={cn(
                              "text-xs font-semibold px-3 py-2 rounded-lg transition-colors",
                              isPastDate(item.created_at, item._updated_at)
                                ? "text-slate-300 dark:text-slate-600 cursor-not-allowed"
                                : "text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                            )}
                          >
                            Edit
                          </button>
                          {canReturnSales && (
                            <button
                              disabled={isPastDate(item.created_at, item._updated_at)}
                              onClick={() => setReturningSale({
                                id: item._sale_id!,
                                display_id: item.display_id || "",
                                total_amount: item.amount,
                                outstanding_amount: item._outstanding_amount || 0,
                                store_id: item._store_id || "",
                                customer_id: item._customer_id || "",
                                created_at: item.created_at,
                              })}
                              className={cn(
                                "text-xs font-semibold px-3 py-2 rounded-lg transition-colors",
                                isPastDate(item.created_at, item._updated_at)
                                  ? "text-slate-300 dark:text-slate-600 cursor-not-allowed"
                                  : "text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                              )}
                            >
                              Return
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  return (
    <div {...pullHandlers} className="pb-6">
      <PullRefreshIndicator isRefreshing={isRefreshing} isPulling={isPulling} pullDistance={pullDistance} threshold={threshold} />
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
            <div className="rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/30 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium leading-tight">Net Balance</p>
                <div className={cn("h-6 w-6 rounded-md bg-gradient-to-br flex items-center justify-center shrink-0", netBalance > 0 ? "from-red-500 to-rose-600" : netBalance < 0 ? "from-green-500 to-emerald-600" : "from-violet-500 to-purple-600")}>
                  <Wallet className="h-3 w-3 text-white" />
                </div>
              </div>
              <p className={cn("text-lg font-bold mt-1", netBalance > 0 ? "text-red-600 dark:text-red-400" : netBalance < 0 ? "text-green-600 dark:text-green-400" : "text-slate-900 dark:text-white")}>
                ₹{Math.abs(netBalance).toLocaleString("en-IN")}
              </p>
              <p className="text-xs mt-0.5 leading-tight font-medium">
                {netBalance > 0 ? (
                  <span className="text-red-500">You owe warehouse</span>
                ) : netBalance < 0 ? (
                  <span className="text-green-500">Warehouse owes you</span>
                ) : (
                  <span className="text-slate-400">Settled</span>
                )}
              </p>
            </div>
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
                if (!canSubmitExpenses) {
                  toast.error("You don't have permission to submit expenses");
                  return;
                }
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
                      <p className="text-xs text-slate-400 mt-1">
                        {card.items.length} records · {card.salesCount} sales · {card.transactionsCount} txns
                        {card.returnedCount > 0 && (
                          <span className="text-red-400"> · {card.returnedCount} returned</span>
                        )}
                      </p>
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
                  const isOwnSent = handover.user_id === user?.id;
                  const isOwnReceived = handover.handed_to === user?.id;
                  const amountColor = isOwnSent ? "text-red-600 dark:text-red-400" : isOwnReceived ? "text-green-600 dark:text-green-400" : "text-slate-800 dark:text-white";
                  const amountSign = isOwnSent ? "−" : isOwnReceived ? "+" : "";

                  return (
                    <div
                      key={handover.id}
                      className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={`text-base font-bold ${amountColor}`}>{amountSign}₹{total.toLocaleString("en-IN")}</p>
                            <Badge variant="outline" className={cn("text-xs font-semibold", getStatusTone(handover.status))}>
                              {handover.status.replaceAll("_", " ")}
                            </Badge>
                          </div>
                          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                            {getPersonName(handover.user_id)} to {getPersonName(handover.handed_to)}
                          </p>
                          <div className="flex items-center gap-2 mt-1 text-xs text-slate-400 flex-wrap">
                            <span>{format(new Date(handover.created_at), "dd MMM yyyy, hh:mm a")}</span>
                            {isOwnSent && <span>Sent</span>}
                            {isOwnReceived && <span>Received</span>}
                          </div>
                          {handover.notes && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">{handover.notes}</p>
                          )}
                        </div>
                      </div>

                      {waitingForYou && (
                        <div className="grid grid-cols-2 gap-2 mt-3">
                          <Button size="sm" className="h-10 rounded-xl" onClick={() => handleConfirm(handover)}>
                            <CheckCircle2 className="h-4 w-4 mr-1.5" />
                            Confirm
                          </Button>
                          <Button size="sm" variant="outline" className="h-10 rounded-xl" onClick={() => handleReject(handover)}>
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
                            className="h-10 rounded-xl text-xs text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                            onClick={() => handleCancelHandover(handover)}
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
                                  style={{ backgroundColor: category.color || `hsl(var(--primary))` }}
                                />
                                <span className="text-xs text-slate-500 dark:text-slate-400">{category.name}</span>
                              </div>
                            )}
                          </div>
                          {claim.description && (
                            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{claim.description}</p>
                          )}
                          <div className="flex items-center gap-2 mt-1 text-xs text-slate-400 flex-wrap">
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
                            <p className="text-xs text-blue-500 mt-1">📎 {claim.bill_urls.length} attachment(s)</p>
                          )}
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs font-semibold capitalize shrink-0",
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
                            className="h-10 rounded-lg px-3 text-xs font-semibold bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-700 flex items-center gap-1"
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

      {/* Edit Sale Sheet */}
      <Sheet open={!!editingSale} onOpenChange={(open) => { if (!open) { setEditingSale(null); setEditCash(""); setEditUpi(""); setEditingItemsState([]); } }}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-6 px-4 max-h-[85vh] overflow-y-auto">
          <div className="space-y-4">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <Pencil className="h-5 w-5 text-blue-500" />
                Edit Sale — {editingSale?.display_id}
              </SheetTitle>
            </SheetHeader>

            {/* Product items editing list */}
            <div className="space-y-2.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest block">Products & Quantities</Label>
              {editingItemsState.length === 0 ? (
                <div className="flex justify-center items-center py-4 gap-2">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                  <span className="text-xs text-slate-400">Loading items...</span>
                </div>
              ) : (
                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {editingItemsState.map((item) => (
                    <div key={item.product_id} className="rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50/40 dark:bg-slate-900/10 p-3 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground dark:text-white truncate">{item.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          ₹{item.unit_price.toLocaleString("en-IN")} × {item.quantity} = ₹{(item.quantity * item.unit_price).toLocaleString("en-IN")}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">₹</span>
                          <Input
                            type="number"
                            min="0"
                            value={item.unit_price}
                            onChange={(e) => updateEditingItemPrice(item.product_id, e.target.value)}
                            className="h-9 w-16 text-xs text-center font-semibold rounded-xl border border-slate-200 dark:border-slate-700"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => updateEditingItemQty(item.product_id, -1)}
                          className="h-10 w-10 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          <Minus className="h-4 w-4 text-slate-500" />
                        </button>
                        <Input
                          type="number"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          min="0"
                          value={item.quantity}
                          onChange={(e) => setEditingItemQtyDirect(item.product_id, e.target.value)}
                          className="h-9 w-12 text-sm text-center font-bold rounded-xl border border-slate-200 dark:border-slate-700"
                        />
                        <button
                          type="button"
                          onClick={() => updateEditingItemQty(item.product_id, 1)}
                          className="h-10 w-10 bg-blue-600 rounded-xl flex items-center justify-center hover:bg-blue-700 transition-colors text-white"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Calculations total */}
            {editingItemsState.length > 0 && (
              <div className="rounded-xl bg-slate-50 dark:bg-slate-900/50 p-3 space-y-1.5 border border-slate-100 dark:border-slate-700">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Original Total:</span>
                  <span className="font-semibold line-through text-muted-foreground">₹{(editingSale?.total_amount || 0).toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between text-sm font-bold">
                  <span className="text-foreground">New Total:</span>
                  <span className="text-blue-600 dark:text-blue-400">
                    ₹{editingItemsState.reduce((sum, item) => sum + item.total_price, 0).toLocaleString("en-IN")}
                  </span>
                </div>
              </div>
            )}

            {/* Payments input cash/upi */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold text-muted-foreground">Cash Amount</Label>
                <Input
                  type="number"
                  min="0"
                  value={editCash}
                  onChange={(e) => setEditCash(e.target.value)}
                  placeholder={String(editingSale?.cash_amount || 0)}
                  className="h-12 rounded-xl text-base font-bold mt-1"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold text-muted-foreground">UPI Amount</Label>
                <Input
                  type="number"
                  min="0"
                  value={editUpi}
                  onChange={(e) => setEditUpi(e.target.value)}
                  placeholder={String(editingSale?.upi_amount || 0)}
                  className="h-12 rounded-xl text-base font-bold mt-1"
                />
              </div>
            </div>

            {/* New outstanding calculation */}
            {editingSale && editingItemsState.length > 0 && (
              <div className="rounded-xl border border-dashed p-3 text-xs bg-slate-50/20 flex justify-between items-center">
                <span className="text-muted-foreground">Calculated Outstanding:</span>
                <span className={cn(
                  "font-bold text-sm",
                  Math.max(editingItemsState.reduce((sum, item) => sum + item.total_price, 0) - (Number(editCash) || 0) - (Number(editUpi) || 0), 0) > 0
                    ? "text-red-500"
                    : "text-emerald-500"
                )}>
                  ₹{Math.max(editingItemsState.reduce((sum, item) => sum + item.total_price, 0) - (Number(editCash) || 0) - (Number(editUpi) || 0), 0).toLocaleString("en-IN")}
                </span>
              </div>
            )}

            <button
              className={cn(
                "w-full h-12 rounded-xl text-base font-bold flex items-center justify-center gap-2 transition-all shadow-md text-white",
                submittingEdit
                  ? "bg-blue-400 cursor-not-allowed"
                  : "bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 active:scale-[0.98]"
              )}
              onClick={handleEditSale}
              disabled={submittingEdit || editingItemsState.length === 0}
            >
              {submittingEdit ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <><Pencil className="h-4 w-4" />Save and Update Sale</>
              )}
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Edit Transaction Sheet */}
      <Sheet open={!!editingTransaction} onOpenChange={(open) => { if (!open) { setEditingTransaction(null); setEditTxnCash(""); setEditTxnUpi(""); setEditTxnNotes(""); } }}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-6 px-4 max-h-[85vh] overflow-y-auto">
          <div className="space-y-4">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <Pencil className="h-5 w-5 text-blue-500" />
                Edit Transaction — {editingTransaction?.display_id}
              </SheetTitle>
            </SheetHeader>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold text-muted-foreground">Cash Amount</Label>
                <Input
                  type="number"
                  min="0"
                  value={editTxnCash}
                  onChange={(e) => setEditTxnCash(e.target.value)}
                  placeholder={String(editingTransaction?.cash_amount || 0)}
                  className="h-12 rounded-xl text-base font-bold mt-1"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold text-muted-foreground">UPI Amount</Label>
                <Input
                  type="number"
                  min="0"
                  value={editTxnUpi}
                  onChange={(e) => setEditTxnUpi(e.target.value)}
                  placeholder={String(editingTransaction?.upi_amount || 0)}
                  className="h-12 rounded-xl text-base font-bold mt-1"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Notes (optional)</Label>
              <Textarea
                value={editTxnNotes}
                onChange={(e) => setEditTxnNotes(e.target.value)}
                placeholder="Additional notes..."
                rows={2}
                className="rounded-xl resize-none mt-1"
              />
            </div>

            <button
              className={cn(
                "w-full h-12 rounded-xl text-base font-bold flex items-center justify-center gap-2 transition-all shadow-md text-white",
                submittingEditTxn
                  ? "bg-blue-400 cursor-not-allowed"
                  : "bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 active:scale-[0.98]"
              )}
              onClick={handleEditTransaction}
              disabled={submittingEditTxn}
            >
              {submittingEditTxn ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Pencil className="h-4 w-4" />
              )}
              Save and Update Transaction
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Sale Receipt Modal */}
      <SaleReceipt
        saleId={receiptSaleId || ""}
        open={!!receiptSaleId}
        onClose={() => setReceiptSaleId(null)}
      />

      {/* Return Sale Sheet */}
      <Sheet open={!!returningSale} onOpenChange={(open) => { if (!open) setReturningSale(null); }}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-6 px-4 max-h-[85vh] overflow-y-auto">
          <div className="space-y-4">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 text-red-500">
                <RotateCcw className="h-5 w-5" />
                Full Sale Return — {returningSale?.display_id}
              </SheetTitle>
            </SheetHeader>

            <Alert className="bg-amber-50/50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-700/40 p-3 rounded-xl flex gap-2.5 items-start">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-700 dark:text-amber-400">
                All items in this sale will be fully returned. Stock will be adjusted, and outstanding balance reverted.
              </div>
            </Alert>

            {/* List of items being returned */}
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest block">Items to Return</Label>
              {!returningSaleItems ? (
                <div className="flex justify-center items-center py-4 gap-2">
                  <Loader2 className="h-5 w-5 animate-spin text-red-500" />
                  <span className="text-xs text-slate-400">Loading items...</span>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700 max-h-[180px] overflow-y-auto">
                  {returningSaleItems.map((item: any) => (
                    <div key={item.id} className="flex justify-between items-center p-3 text-xs bg-card">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-800 dark:text-white truncate">{item.products?.name}</p>
                        <p className="text-slate-400 mt-0.5">₹{item.unit_price.toLocaleString()} × {item.quantity}</p>
                      </div>
                      <span className="font-bold text-slate-800 dark:text-white shrink-0 ml-3">
                        ₹{(item.quantity * item.unit_price).toLocaleString("en-IN")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Return summary */}
            {returningSale && returningSaleItems && (
              <div className="rounded-xl bg-slate-50 dark:bg-slate-900/50 p-3 space-y-1.5 border border-slate-100 dark:border-slate-700 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current outstanding:</span>
                  <span>₹{(returningSale.outstanding_amount ?? 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-red-500 font-medium">
                  <span>Return adjustment:</span>
                  <span>-₹{returningSaleItems.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-bold border-t pt-1.5 text-sm">
                  <span>New outstanding:</span>
                  <span className="text-emerald-600">
                    ₹{Math.max(0, (returningSale.outstanding_amount ?? 0) - returningSaleItems.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0)).toLocaleString()}
                  </span>
                </div>
              </div>
            )}

            {/* Return Reason Selector */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Return Reason *</Label>
              <Select value={returnReason} onValueChange={(val) => { setReturnReason(val); if (val === "Damage") setReturnIsDamaged(true); }}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue placeholder="Select reason" />
                </SelectTrigger>
                <SelectContent>
                  {["Damage", "Defect", "Expired", "Other"].map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Specific return details */}
            {returnReason === "Other" && (
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Specify Reason *</Label>
                <Input
                  value={returnOtherReason}
                  onChange={(e) => setReturnOtherReason(e.target.value)}
                  placeholder="Enter reason"
                  className="h-11 rounded-xl"
                />
              </div>
            )}

            {/* Damage toggle */}
            <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-700 p-3 shadow-sm bg-slate-50/10">
              <div className="space-y-0.5 max-w-[80%]">
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Mark returned items as damaged?</Label>
                <p className="text-xs text-muted-foreground">
                  If toggled, stock will go strictly to wastage and will NOT be added back to agent or warehouse stock.
                </p>
              </div>
              <Switch checked={returnIsDamaged} onCheckedChange={setReturnIsDamaged} />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Notes (Optional)</Label>
              <Textarea
                value={returnNotes}
                onChange={(e) => setReturnNotes(e.target.value)}
                placeholder="Additional notes..."
                rows={2}
                className="rounded-xl resize-none"
              />
            </div>

            <button
              className={cn(
                "w-full h-12 rounded-xl text-base font-bold flex items-center justify-center gap-2 transition-all shadow-md text-white",
                submittingReturn || !returnReason
                  ? "bg-slate-300 cursor-not-allowed text-slate-500"
                  : "bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 active:scale-[0.98]"
              )}
              onClick={handleReturnSale}
              disabled={submittingReturn || !returnReason}
            >
              {submittingReturn ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <><RotateCcw className="h-4 w-4" />Confirm Full Return</>
              )}
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Return Payment Dialog */}
      <ReturnPaymentDialog
        open={!!returningTransaction}
        onOpenChange={(v) => { if (!v) setReturningTransaction(null); }}
        transaction={returningTransaction}
      />

      <AlertDialog open={cancelHandoverConfirm.show} onOpenChange={(open) => setCancelHandoverConfirm({ show: open, requestId: "" })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel handover request?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCancelHandoverConfirm({ show: false, requestId: "" })}>No</AlertDialogCancel>
            <AlertDialogAction onClick={() => executeCancelHandover(cancelHandoverConfirm.requestId)}>Yes, cancel</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={cancelClaimConfirm.show} onOpenChange={(open) => setCancelClaimConfirm({ show: open, claimId: "" })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this expense claim?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCancelClaimConfirm({ show: false, claimId: "" })}>No</AlertDialogCancel>
            <AlertDialogAction onClick={() => executeCancelExpenseClaim(cancelClaimConfirm.claimId)}>Yes, cancel</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

