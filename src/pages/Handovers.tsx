import { PageHeader } from "@/components/shared/PageHeader";
import { ImageUpload } from "@/components/shared/ImageUpload";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { CurrencyDisplay } from "@/components/shared/CurrencyDisplay";
import { NoticeBox } from "@/components/shared/NoticeBox";
import { UserHoverCard } from "@/components/shared/UserHoverCard";
import {
  Banknote, CheckCircle, AlertCircle, Loader2, Send,
  ArrowDownLeft, XCircle, Wallet, Eye,
  Receipt, Edit2, Image, Download, CalendarIcon, X,
  TrendingUp, RefreshCw, HandCoins
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermission } from "@/hooks/usePermission";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { sendNotification, sendNotificationToMany, getAdminUserIds } from "@/lib/notifications";
import { useState, useMemo, useEffect, useRef } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, startOfDay } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";

type ExpenseCategory = {
  id: string;
  name: string;
  color: string;
  icon: string | null;
};

const Handovers = () => {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [createType, setCreateType] = useState<"handover" | "expense">("handover");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [toUserId, setToUserId] = useState("");
  const [handoverType, setHandoverType] = useState<"collection" | "transfer">("transfer");
  const [submitting, setSubmitting] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
  const [expenseCancelConfirmOpen, setExpenseCancelConfirmOpen] = useState(false);
  const [expenseCancelConfirmId, setExpenseCancelConfirmId] = useState<string | null>(null);
  const [resetAllConfirmOpen, setResetAllConfirmOpen] = useState(false);
  const [highlightExpenseId, setHighlightExpenseId] = useState<string | null>(null);
  const highlightedRef = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => { document.title = "Handovers"; }, []);

  // Filter states
  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const [filterFrom, setFilterFrom] = useState(thirtyDaysAgo);
  const [filterTo, setFilterTo] = useState(today);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterUser, setFilterUser] = useState("all");
  const [filterExpenseStatus, setFilterExpenseStatus] = useState("all");

  // Expense claim states
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("");
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split("T")[0]);
  const [expenseReceiptUrl, setExpenseReceiptUrl] = useState<string | null>(null);
  const [expenseSubmitting, setExpenseSubmitting] = useState(false);

  // Expense review states
  const [reviewExpense, setReviewExpense] = useState<any>(null);
  const [reviewCategory, setReviewCategory] = useState("");
  const [reviewAmount, setReviewAmount] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");

  // Granular role-based permissions
  const isSuperAdmin = role === "super_admin";
  const isManager = role === "manager";
  const isAdminOrManager = isSuperAdmin || isManager;
  const isStaff = ["agent", "marketer", "operator"].includes(role || "");

  const { allowed: isFinalizer } = usePermission("finalizer");
  const { allowed: canSeeBalances } = usePermission("see_handover_balance");
  const { allowed: canSubmitExpenses } = usePermission("submit_expenses");
  const { allowed: canModifyHandovers } = usePermission("modify_handovers");
  const { allowed: _canCancelAnyHandover } = usePermission("cancel_any_handover");
  const { allowed: canAdjustHoldingBalance } = usePermission("adjust_holding_balance");
  const { allowed: canApproveExpenses } = usePermission("approve_expenses");
  const { allowed: canTransferBetweenStaff } = usePermission("transfer_between_staff" as any);
  const navigate = useNavigate();

  // Admin-specific states
  const [adminTransferOpen, setAdminTransferOpen] = useState(false);
  const [adminTransferFrom, setAdminTransferFrom] = useState("");
  const [adminTransferTo, setAdminTransferTo] = useState("");
  const [adminTransferAmount, setAdminTransferAmount] = useState("");
  const [adminTransferReason, setAdminTransferReason] = useState("");
  const [selectedHandoverForEdit, setSelectedHandoverForEdit] = useState<any>(null);
  const [dailyResetLoading, setDailyResetLoading] = useState(false);
  const [incomeFilterDate, setIncomeFilterDate] = useState(today);
  const [editHandoverOpen, setEditHandoverOpen] = useState(false);
  const [editHandoverAmount, setEditHandoverAmount] = useState("");
  const [editHandoverStatus, setEditHandoverStatus] = useState("");
  
  // Admin holding adjustment states
  const [adjustHoldingOpen, setAdjustHoldingOpen] = useState(false);
  const [adjustHoldingUser, setAdjustHoldingUser] = useState("");
  const [adjustCashAmount, setAdjustCashAmount] = useState("");
  const [adjustUpiAmount, setAdjustUpiAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");

  const { data: staffProfiles } = useQuery({
    queryKey: ["staff-profiles", user?.id],
    queryFn: async () => {
      // Exclude super_admin from staff list (admins don't have holding accounts)
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["manager", "agent", "marketer", "operator"]); // Removed super_admin

      if (rolesError) {
        throw rolesError;
      }

      const staffRoleMap = new Map((roles || []).map((row) => [row.user_id, row.role]));
      const staffIds = Array.from(staffRoleMap.keys()).filter((id) => id !== user?.id);

      let profiles: Array<{ user_id: string; full_name: string; email: string | null; phone: string | null }> = [];

      if (staffIds.length > 0) {
        const { data: filteredProfiles, error: filteredError } = await supabase
          .from("profiles")
          .select("user_id, full_name, email, phone")
          .in("user_id", staffIds)
          .eq("is_active", true);
        if (filteredError) {
          throw filteredError;
        }
        profiles = (filteredProfiles || []) as typeof profiles;
      }

      const roleLabel: Record<string, string> = {
        super_admin: "Admin",
        manager: "Manager",
        agent: "Agent",
        marketer: "Marketer",
        operator: "Operator",
      };

      const result = (profiles || [])
        .map((profile) => ({
          ...profile,
          role: staffRoleMap.get(profile.user_id) || "agent",
          roleLabel: roleLabel[staffRoleMap.get(profile.user_id) || ""] || "Staff",
        }))
        .sort((a, b) => a.full_name.localeCompare(b.full_name));
      
      return result;
    },
    enabled: !!user,
  });

  // Query for all staff roles (for filtering handovers)
  const { data: staffRoles } = useQuery({
    queryKey: ["all-staff-roles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["super_admin", "manager", "agent", "marketer", "operator"]);
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch handovers based on role
  const { data: handovers, isLoading } = useQuery({
    queryKey: ["handovers", user?.id, role],
    queryFn: async () => {
      let query = supabase
        .from("handovers")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);

      // Staff only see their own handovers (as sender or recipient)
      if (isStaff) {
        query = query.or(`user_id.eq.${user!.id},handed_to.eq.${user!.id}`);
      }
      // Super Admin and Manager see all handovers (no filter needed)

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const { data: userDailyBalance } = useQuery({
    queryKey: ["user-daily-balance", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("get_user_daily_balance", { p_user_id: user!.id });
      if (error) throw error;
      return data?.[0] as {
        today_sales: number;
        today_payments: number;
        today_received: number;
        today_sent_confirmed: number;
        today_sent_pending: number;
        prev_pending: number;
        total_holding: number;
      } | undefined;
    },
    enabled: !!user && isStaff,
  });


  // NEW: Get materialized holding_balance from profiles (single source of truth)
  const { data: userProfile } = useQuery({
    queryKey: ["user-holding-balance", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, holding_balance, holding_balance_updated_at")
        .eq("user_id", user!.id)
        .single();
      if (error) throw error;
      return data as {
        user_id: string;
        full_name: string;
        holding_balance: number;
        holding_balance_updated_at: string;
      };
    },
    enabled: !!user && isStaff,
  });

  // Fetch finalizer income entries (today)
  const { data: finalizerIncome, isLoading: finalizerIncomeLoading } = useQuery({
    queryKey: ["income-entries", user?.id, incomeFilterDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("income_entries")
        .select("*")
        .eq("recorded_by", user!.id)
        .eq("entry_type", "collection")
        .gte("created_at", incomeFilterDate + "T00:00:00")
        .lte("created_at", incomeFilterDate + "T23:59:59")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && isFinalizer,
  });

  // Fetch finalizer staff_cash_accounts balance
  const { data: finalizerAccount } = useQuery({
    queryKey: ["finalizer-account", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_cash_accounts")
        .select("cash_amount, upi_amount, last_reset_at")
        .eq("user_id", user!.id)
        .eq("account_type", "prime_manager")
        .maybeSingle();
      if (error) throw error;
      return data as { cash_amount: number; upi_amount: number; last_reset_at: string } | null;
    },
    enabled: !!user && isFinalizer,
  });

  // Fetch all finalizer holdings (for admin overview)
  const { data: finalizerHoldings } = useQuery({
    queryKey: ["finalizer-holdings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_cash_accounts")
        .select("user_id, cash_amount, upi_amount, account_type, last_reset_at, profiles(full_name)")
        .eq("account_type", "prime_manager");
      if (error) throw error;
      return (data || []) as any;
    },
    enabled: isAdminOrManager,
  });

  // Also fetch detailed breakdown for display (optional)
  const { data: _agentCashHolding } = useQuery({
    queryKey: ["agent-cash-holding", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("get_agent_cash_holding", { p_user_id: user!.id });
      if (error) throw error;
      return data?.[0] as any;
    },
    enabled: !!user && isStaff,
  });

  const { data: profileMap } = useQuery({
    queryKey: ["profile-map"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name, avatar_url");
      const map: Record<string, { name: string; avatar: string | null }> = {};
      (data || []).forEach((p) => { map[p.user_id] = { name: p.full_name, avatar: p.avatar_url }; });
      return map;
    },
  });

  // ISSUE-08 FIX: Server-side balance aggregation via RPC
  const { data: allStaffBalances } = useQuery({
    queryKey: ["all-staff-balances"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_all_staff_balances") as any;
      if (error) throw error;
      return data || [];
    },
    enabled: canSeeBalances,
  });

  const myHandovers = useMemo(() =>
    (handovers || []).filter((h) => h.user_id === user?.id || h.handed_to === user?.id),
    [handovers, user?.id]
  );



  const todayStart = startOfDay(new Date()).toISOString();
  const todayReceivedConfirmed = myHandovers
    .filter((h) => h.handed_to === user?.id && h.status === "confirmed" && h.created_at >= todayStart)
    .reduce((s, h) => s + Number(h.cash_amount) + Number(h.upi_amount), 0);

  // Get materialized balance from profile
  const materializedHolding = Number(userProfile?.holding_balance || 0);

  // Use the new userDailyBalance RPC for the breakdown
  const dailyData = userDailyBalance || {
    today_sales: 0,
    today_payments: 0,
    today_received: 0,
    today_sent_confirmed: 0,
    today_sent_pending: 0,
    prev_pending: 0,
    total_holding: materializedHolding
  };



  const notHandedOver = materializedHolding;
  
  // Pending handovers
  const awaitingAmount = dailyData.today_sent_pending;
  
  const incoming = myHandovers.filter((h) => h.handed_to === user?.id && h.status === "awaiting_confirmation");

  // Fetch partial_collections setting
  const { data: partialSetting } = useQuery({
    queryKey: ["partial-collections-setting"],
    queryFn: async () => {
      const { data } = await supabase.from("company_settings").select("value").eq("key", "partial_collections").maybeSingle();
      return data?.value === "true";
    },
  });

  // Fetch expense categories (filtered by access rules)
   const { data: expenseCategories = [] } = useQuery<ExpenseCategory[]>({
     queryKey: ["expense-categories", user?.id],
     queryFn: async () => {
       const { data, error } = await supabase
         .from("expense_categories")
         .select("id, name, color, icon, is_system")
         .eq("is_active", true)
         .order("is_system", { ascending: false })
         .order("name");
       if (error) throw error;

       // Get user's role for access check
       const { data: roleData } = await supabase
         .from("user_roles")
         .select("role")
        .eq("user_id", user!.id)
        .single();

       const userRole = roleData?.role || "agent";

       // Get DENY rules for this user/role (rules in table = DENY/blocked)
       const { data: denyRules } = await supabase
         .from("expense_category_access")
         .select("category_id")
          .or(`user_id.eq.${user!.id},role.eq.${userRole}`);

       const deniedIds = new Set(
         denyRules?.map((r: any) => r.category_id) || []
       );

       // Filter out DENIED categories, show all others
       return (data || []).filter((cat) => !deniedIds.has(cat.id)) as ExpenseCategory[];
     },
   });

  // Fetch expense claims (own for staff, all for admin)
  const { data: expenseClaims = [], isLoading: expenseClaimsLoading } = useQuery<any[]>({
    queryKey: ["expense-claims", user?.id, isAdminOrManager],
    queryFn: async () => {
      let query = supabase
        .from("expense_claims")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      // Only non-admin staff see their own expense claims
      if (isStaff && !isAdminOrManager) {
        query = query.eq("user_id", user!.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  // Compute expense totals for balance
  const myApprovedExpenses = useMemo(() => {
    return (expenseClaims || [])
      .filter((e: any) => e.user_id === user?.id && e.status === "approved")
      .reduce((sum: number, e: any) => sum + Number(e.approved_amount || e.amount), 0);
  }, [expenseClaims, user?.id]);

  const myPendingExpenses = useMemo(() => {
    return (expenseClaims || [])
      .filter((e: any) => e.user_id === user?.id && e.status === "pending")
      .reduce((sum: number, e: any) => sum + Number(e.amount), 0);
  }, [expenseClaims, user?.id]);

  // Filter expenses by ownership
  const myExpenseClaims = useMemo(() => {
    return (expenseClaims || []).filter((e: any) => e.user_id === user?.id);
  }, [expenseClaims, user?.id]);

  // Admin/Manager can review pending claims
  const pendingExpenseClaimsForReview = useMemo(() => {
    return canApproveExpenses
      ? (expenseClaims || []).filter((e: any) => e.status === "pending")
      : [];
  }, [expenseClaims, canApproveExpenses]);

  // Read highlight param from URL and handle focuses
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get("highlight");

  useEffect(() => {
    if (highlightId && expenseClaims.length > 0) {
      const expense = expenseClaims.find((e: any) => e.id === highlightId);
      if (expense && expense.status === "pending") {
        openReviewDialog(expense);
      }
    }
  }, [highlightId, expenseClaims]);

  // Scroll to highlighted handover or expense claim once loaded
  useEffect(() => {
    if (!highlightId) return;
    const timer = setTimeout(() => {
      const el = document.getElementById(`handover-${highlightId}`) || document.getElementById(`expense-${highlightId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [highlightId, handovers, expenseClaims]);

  const handleCreate = async () => {
    if (!toUserId || !amount || Number(amount) <= 0) {
      toast.error("Select a recipient and enter a valid amount");
      return;
    }
    if (!partialSetting && !isFinalizer && Number(amount) < Math.max(0, notHandedOver)) {
      toast.error(`Partial handovers are disabled. Enter the full balance: ₹${Math.max(0, notHandedOver).toLocaleString()}`);
      return;
    }
    if (!isFinalizer && notHandedOver > 0 && Number(amount) > notHandedOver) {
      toast.error("Amount exceeds your available balance");
      return;
    }
    setSubmitting(true);

    // Use new create_handover_with_type function with handover type support
    const { data: handoverResult, error: handoverError } = await supabase
      .rpc("create_handover_with_type", {
        p_user_id: user!.id,
        p_handed_to: toUserId,
        p_cash_amount: Number(amount),
        p_upi_amount: 0,
        p_notes: notes || undefined,
        p_handover_type: handoverType,
      });

    setSubmitting(false);

    if (handoverError) {
      if (handoverError.message.includes("DUPLICATE")) {
        toast.error("You already have a pending handover for today. Complete or cancel it first.");
      } else {
        toast.error(handoverError.message);
      }
      return;
    }

    const createdHandover = handoverResult?.[0];
    if (createdHandover) {
      const totalAmount = Number(createdHandover.cash_amount) + Number(createdHandover.upi_amount);
      const typeLabel = 'Transfer';
      toast.success(
        `${typeLabel} request of ₹${totalAmount.toLocaleString()} sent`
      );

      sendNotification({
        userId: toUserId,
        title: "Handover Request",
        message: `₹${totalAmount.toLocaleString()} ${handoverType} awaiting your acceptance`,
        type: "handover",
        entityType: "handover",
        entityId: createdHandover.id,
      });

      setCreateOpen(false);
      setAmount("");
      setNotes("");
      setToUserId("");
      qc.invalidateQueries({ queryKey: ["handovers"] });
      qc.invalidateQueries({ queryKey: ["agent-cash-holding"] });
      qc.invalidateQueries({ queryKey: ["user-sales-totals"] });
      qc.invalidateQueries({ queryKey: ["user-transaction-totals"] });
      qc.invalidateQueries({ queryKey: ["user-holding-balance"] });
      qc.invalidateQueries({ queryKey: ["agent-dashboard"] });
    }
  };

  const handleAccept = async (id: string) => {
    if (actionLoading) return;
    const handover = myHandovers.find((h) => h.id === id);
    if (handover?.user_id === user?.id) {
      toast.error("You cannot accept your own handover");
      return;
    }
    setActionLoading(id);
    // Use new confirm_handover which records income for collections
    const { error } = await supabase.rpc("confirm_handover", { 
      p_handover_id: id,
      p_confirmed_by: user?.id 
    }) as any;
    setActionLoading(null);
    if (error) toast.error(error.message);
    else {
      const isCollection = handover?.handover_type === 'collection';
      toast.success(isCollection ? "Collection accepted - income recorded" : "Transfer accepted");
      if (handover?.user_id) {
        sendNotification({
          userId: handover.user_id,
          title: isCollection ? "Collection Confirmed" : "Transfer Confirmed",
          message: `Your ₹${Number(handover.cash_amount).toLocaleString()} ${isCollection ? 'collection' : 'transfer'} was accepted`,
          type: "handover",
          entityType: "handover",
          entityId: id,
        });
      }
      qc.invalidateQueries({ queryKey: ["handovers"] });
      qc.invalidateQueries({ queryKey: ["agent-cash-holding"] });
      qc.invalidateQueries({ queryKey: ["user-holding-balance"] });
      qc.invalidateQueries({ queryKey: ["all-staff-balances"] });
      qc.invalidateQueries({ queryKey: ["agent-dashboard"] });
      qc.invalidateQueries({ queryKey: ["income-entries"] });
      qc.invalidateQueries({ queryKey: ["finalizer-account"] });
      qc.invalidateQueries({ queryKey: ["finalizer-holdings"] });
    }
  };

  const handleDecline = async (id: string) => {
    if (actionLoading) return;
    const handover = myHandovers.find((h) => h.id === id);
    setActionLoading(id);
    const { error } = await supabase.rpc("reject_handover", {
      p_handover_id: id,
      p_rejected_by: user!.id,
    });
    setActionLoading(null);
    if (error) toast.error(error.message);
    else {
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
      qc.invalidateQueries({ queryKey: ["handovers"] });
      qc.invalidateQueries({ queryKey: ["agent-cash-holding"] });
    }
  };

  const handleCancel = async (id: string) => {
    if (actionLoading) return;
    const handover = myHandovers.find((h) => h.id === id);
    const isOwner = handover?.user_id === user?.id;
    
    if (!handover) {
      toast.error("Handover not found");
      return;
    }
    if (handover.status !== "awaiting_confirmation") {
      toast.error("Only pending handovers can be cancelled");
      return;
    }
    // Allow owner OR admin/manager with permission to cancel any
    if (!isOwner && !isAdminOrManager) {
      toast.error("You can only cancel your own pending handovers");
      return;
    }
    setActionLoading(id);
    const { error } = await supabase.rpc("cancel_handover", {
      p_handover_id: id,
      p_cancelled_by: user!.id,
    });
    setActionLoading(null);
    setCancelConfirmId(null);
    if (error) toast.error(error.message);
    else {
      toast.success("Handover cancelled");
      if (handover?.handed_to) {
        sendNotification({
          userId: handover.handed_to,
          title: "Handover Cancelled",
          message: `A ₹${Number(handover.cash_amount).toLocaleString()} handover was cancelled by sender`,
          type: "handover",
          entityType: "handover",
          entityId: id,
        });
      }
      qc.invalidateQueries({ queryKey: ["handovers"] });
      qc.invalidateQueries({ queryKey: ["agent-cash-holding"] });
    }
  };

  // ========== Admin Handover Handlers ==========
  const handleAdminTransfer = async () => {
    if (!adminTransferFrom || !adminTransferTo || !adminTransferAmount || Number(adminTransferAmount) <= 0) {
      toast.error("Select both staff members and enter a valid amount");
      return;
    }
    if (adminTransferFrom === adminTransferTo) {
      toast.error("Cannot transfer to the same staff member");
      return;
    }
    if (!canTransferBetweenStaff) {
      toast.error("You don't have permission to transfer between staff");
      return;
    }

    setSubmitting(true);
    try {
      const { data: transferResult, error: transferError } = await supabase
        .rpc("admin_transfer_between_staff", {
          p_from_user_id: adminTransferFrom,
          p_to_user_id: adminTransferTo,
          p_amount: Number(adminTransferAmount),
          p_reason: adminTransferReason.trim() || undefined,
          p_admin_id: user!.id,
        });

      if (transferError) throw transferError;

      toast.success(`Admin transfer of ₹${Number(adminTransferAmount).toLocaleString()} completed successfully`);

      sendNotification({
        userId: adminTransferFrom,
        title: "Admin Handover Sent",
        message: `Admin transferred ₹${Number(adminTransferAmount).toLocaleString()} to ${getName(adminTransferTo)}`,
        type: "handover",
        entityType: "handover",
        entityId: transferResult?.[0]?.id || "",
      });

      sendNotification({
        userId: adminTransferTo,
        title: "Admin Handover Received",
        message: `Admin transferred ₹${Number(adminTransferAmount).toLocaleString()} from ${getName(adminTransferFrom)}`,
        type: "handover",
        entityType: "handover",
        entityId: transferResult?.[0]?.id || "",
      });

      setAdminTransferOpen(false);
      setAdminTransferFrom("");
      setAdminTransferTo("");
      setAdminTransferAmount("");
      setAdminTransferReason("");
      qc.invalidateQueries({ queryKey: ["handovers"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to complete admin transfer");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditHandover = async () => {
    if (!selectedHandoverForEdit || !editHandoverAmount || Number(editHandoverAmount) < 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (!canModifyHandovers) {
      toast.error("You don't have permission to modify handovers");
      return;
    }

    setSubmitting(true);
    try {
      // ISSUE-11 FIX: Preserve UPI amount instead of zeroing it
      const { error } = await supabase.rpc("edit_handover", {
        p_handover_id: selectedHandoverForEdit.id,
        p_admin_id: user!.id,
        p_cash_amount: Number(editHandoverAmount),
        p_upi_amount: Number(selectedHandoverForEdit.upi_amount || 0),
        p_status: editHandoverStatus || selectedHandoverForEdit.status,
        p_notes: selectedHandoverForEdit.notes
          ? `${selectedHandoverForEdit.notes}\n[Admin Edit: ${new Date().toLocaleString()}]`
          : `[Admin Edit: ${new Date().toLocaleString()}]`
      }) as any;

      if (error) throw error;

      toast.success("Handover updated successfully");
      setEditHandoverOpen(false);
      setSelectedHandoverForEdit(null);
      setEditHandoverAmount("");
      setEditHandoverStatus("");
      qc.invalidateQueries({ queryKey: ["handovers"] });
      qc.invalidateQueries({ queryKey: ["all-staff-balances"] });
      qc.invalidateQueries({ queryKey: ["user-holding-balance"] });
      qc.invalidateQueries({ queryKey: ["user-daily-balance"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to update handover");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdjustHoldingBalance = async () => {
    if (!adjustHoldingUser || !adjustCashAmount || !adjustUpiAmount) {
      toast.error("Select a user and enter amounts");
      return;
    }
    if (!canAdjustHoldingBalance) {
      toast.error("You don't have permission to adjust holding balances");
      return;
    }
    
    const cashAdj = Number(adjustCashAmount);
    const upiAdj = Number(adjustUpiAmount);
    if (cashAdj === 0 && upiAdj === 0) {
      toast.error("Enter at least one amount (cash or UPI)");
      return;
    }

    setSubmitting(true);
    try {
      const { data: _result, error } = await supabase.rpc("adjust_staff_holding_balance" as any, {
        p_target_user_id: adjustHoldingUser,
        p_admin_id: user!.id,
        p_cash_adjustment: cashAdj,
        p_upi_adjustment: upiAdj,
        p_reason: adjustReason.trim() || null
      }) as any;

      if (error) throw error;

      toast.success(`Holding balance adjusted successfully`);
      
      // Notify the affected user
      sendNotification({
        userId: adjustHoldingUser,
        title: "Holding Balance Adjusted",
        message: `Your holding has been adjusted: Cash ₹${cashAdj >= 0 ? '+' : ''}${cashAdj}, UPI ₹${upiAdj >= 0 ? '+' : ''}${upiAdj}. Reason: ${adjustReason || 'Admin adjustment'}`,
        type: "system",
        entityType: "staff_account",
      });

      setAdjustHoldingOpen(false);
      setAdjustHoldingUser("");
      setAdjustCashAmount("");
      setAdjustUpiAmount("");
      setAdjustReason("");
      qc.invalidateQueries({ queryKey: ["all-staff-balances"] });
      qc.invalidateQueries({ queryKey: ["user-holding-balance"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to adjust holding balance");
    } finally {
      setSubmitting(false);
    }
  };

  // ========== Expense Claim Handlers ==========
  const handleCreateExpenseClaim = async () => {
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
      const requestedAmount = Number(expenseAmount);

      // Get user's holding balance from profiles table (single source of truth)
      const { data: profileData } = await supabase
        .from("profiles")
        .select("holding_balance")
        .eq("user_id", user!.id)
        .maybeSingle();
      let currentHolding = Number(profileData?.holding_balance) || 0;

      // Fallback to staff_cash_accounts if profiles.holding_balance is 0
      if (currentHolding === 0) {
        const { data: cashData } = await supabase
          .from("staff_cash_accounts")
          .select("cash_amount")
          .eq("user_id", user!.id)
          .maybeSingle();
        if (cashData?.cash_amount) {
          currentHolding = Number(cashData.cash_amount);
        }
      }

      // Get total locked amount from pending requests
      const { data: pendingRequests } = await supabase
        .from("expense_claims")
        .select("amount")
        .eq("user_id", user!.id)
        .eq("status", "pending");
      const totalLocked = (pendingRequests || []).reduce((sum: number, r: any) => sum + Number(r.amount), 0);
      const availableHolding = currentHolding - totalLocked;

      if (availableHolding < requestedAmount) {
        toast.error(`Insufficient balance: Available ₹${availableHolding.toLocaleString()}, Requested ₹${requestedAmount.toLocaleString()}`);
        throw new Error(`Insufficient holding balance.`);
      }

      // Re-check balance right before insert to reduce race condition window
      const { data: recheckProfile } = await supabase
        .from("profiles")
        .select("holding_balance")
        .eq("user_id", user!.id)
        .maybeSingle();
      const recheckHolding = Number(recheckProfile?.holding_balance) || 0;

      const { data: recheckPending } = await supabase
        .from("expense_claims")
        .select("amount")
        .eq("user_id", user!.id)
        .eq("status", "pending");
      const recheckLocked = (recheckPending || []).reduce((sum: number, r: any) => sum + Number(r.amount), 0);
      const recheckAvailable = recheckHolding - recheckLocked;

      if (recheckAvailable < requestedAmount) {
        toast.error(`Insufficient balance — another claim may have been submitted. Available: ₹${recheckAvailable.toLocaleString()}`);
        throw new Error(`Insufficient holding balance (re-check failed).`);
      }

      const { data: displayId } = await supabase.rpc("generate_display_id", {
        prefix: "EXC",
        seq_name: "expenses_display_id_seq"
      }) as any;

      const { data: myRole } = await supabase.from("user_roles").select("warehouse_id").eq("user_id", user!.id).maybeSingle();

       const { data: expenseData, error } = await supabase.from("expense_claims").insert({
         display_id: displayId || `EXC-${Date.now()}`,
         user_id: user!.id,
         category_id: expenseCategory,
         original_category_id: expenseCategory,
         amount: Number(expenseAmount),
         expense_date: expenseDate,
         description: expenseDescription.trim(),
         receipt_url: expenseReceiptUrl,
         status: "pending",
         holding_amount_locked: requestedAmount, // Lock the amount immediately
         warehouse_id: (myRole as any)?.warehouse_id || null,
       }).select().single();

      if (error) throw error;

      toast.success("Expense claim submitted for approval");

      const adminIds = await getAdminUserIds();
      sendNotificationToMany(adminIds, {
        title: "New Expense Claim",
        message: `₹${Number(expenseAmount).toLocaleString()} expense claim requires your review`,
        type: "expense_request" as any,
        entityType: "expense_claim",
        entityId: expenseData?.id,
      });

      setCreateOpen(false);
      setCreateType("handover");
      setExpenseAmount("");
      setExpenseDescription("");
      setExpenseCategory("");
      setExpenseDate(new Date().toISOString().split("T")[0]);
      setExpenseReceiptUrl(null);
      setAmount("");
      setNotes("");
      qc.invalidateQueries({ queryKey: ["expense-claims"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to submit expense claim");
    } finally {
      setExpenseSubmitting(false);
    }
  };

  const handleReviewExpenseClaim = async (action: "approve" | "reject") => {
    if (!reviewExpense) return;
    setActionLoading(reviewExpense.id);

    try {
      const originalAmount = Number(reviewExpense.amount);
      const approvedAmount = action === "approve" ? (Number(reviewAmount) || originalAmount) : null;

      // Use atomic RPC for expense approval - handles both status update AND holding deduction
      const { data: rpcResult, error: rpcError } = await supabase.rpc("approve_expense_claim" as any, {
        p_claim_id: reviewExpense.id,
        p_reviewer_id: user!.id,
        p_status: action === "approve" ? "approved" : "rejected",
        p_approved_amount: approvedAmount,
        p_category_id: reviewCategory && reviewCategory !== reviewExpense.category_id ? reviewCategory : null,
        p_reviewer_notes: reviewNotes.trim() || null,
      } as any);

      if (rpcError) throw rpcError;

      toast.success(`Expense claim ${action === "approve" ? "approved" : "rejected"}`);

      sendNotification({
        userId: reviewExpense.user_id,
        title: `Expense Claim ${action === "approve" ? "Approved" : "Rejected"}`,
        message: action === "approve"
          ? `Your ₹${(rpcResult as any)?.amount?.toLocaleString() || approvedAmount?.toLocaleString()} expense claim was approved`
          : `Your ₹${Number(reviewExpense.amount).toLocaleString()} expense claim was rejected`,
        type: "system",
        entityType: "expense_claim",
        entityId: reviewExpense.id,
      });

      setReviewExpense(null);
      setReviewCategory("");
      setReviewAmount("");
      setReviewNotes("");
      qc.invalidateQueries({ queryKey: ["expense-claims"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to process expense claim");
    } finally {
      setActionLoading(null);
    }
  };

  const openReviewDialog = (expense: any) => {
    setReviewExpense(expense);
    setReviewCategory(expense.category_id || "");
    setReviewAmount(expense.amount?.toString() || "");
    setReviewNotes("");
  };

  // Cancel own expense claim (before approval)
  const handleCancelExpenseClaim = async (claimId: string) => {
    setExpenseCancelConfirmId(claimId);
    setExpenseCancelConfirmOpen(true);
  };

  const confirmCancelExpenseClaim = async () => {
    if (!expenseCancelConfirmId || !user?.id) return;
    const claimId = expenseCancelConfirmId;
    setExpenseCancelConfirmOpen(false);
    setExpenseCancelConfirmId(null);
    setActionLoading(claimId);
    try {
      const { error } = await supabase
        .from("expense_claims")
        .update({ status: "cancelled" })
        .eq("id", claimId)
        .eq("user_id", user.id); // Ownership check: only cancel own claims

      if (error) throw error;

      toast.success("Expense claim cancelled");
      qc.invalidateQueries({ queryKey: ["expense-claims"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel expense claim");
    } finally {
      setActionLoading(null);
    }
  };

  const getCategoryName = (categoryId: string | null) => {
    const cat = expenseCategories.find((c) => c.id === categoryId);
    return cat?.name || "Unknown Category";
  };

  const getCategoryColor = (categoryId: string | null) => {
    const cat = expenseCategories.find((c) => c.id === categoryId);
    return cat?.color || "hsl(var(--muted-foreground))";
  };

  const getProfile = (userId: string | null) => profileMap?.[userId || ""] || { name: "Unknown", avatar: null };
  const getName = (userId: string | null) => getProfile(userId).name;
  const getInitials = (name: string) => name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  // ========== SIMPLIFIED HANDOVER CARD ==========
  const HandoverCard = ({ item, showActions = false, showAdminActions = false }: { item: typeof myHandovers[0]; showActions?: boolean; showAdminActions?: boolean }) => {
    const isSender = item.user_id === user?.id;
    const isRecipient = item.handed_to === user?.id;
    const isPending = item.status === "awaiting_confirmation";
    const total = Number(item.cash_amount) + Number(item.upi_amount);
    const isLoading = actionLoading === item.id;
    
    const canCancel = (isSender || isAdminOrManager) && isPending;
    const canAcceptDecline = isRecipient && isPending;
    const canAdminAct = isAdminOrManager && isPending;

    const statusToBadge: Record<string, { status: "pending" | "success" | "rejected" | "cancelled"; label: string }> = {
      confirmed: { status: "success", label: "Confirmed" },
      rejected: { status: "rejected", label: "Rejected" },
      cancelled: { status: "cancelled", label: "Cancelled" },
      awaiting_confirmation: { status: "pending", label: "Pending" },
    };
    const badge = statusToBadge[item.status] || statusToBadge.awaiting_confirmation;

    const borderAccent = item.status === "confirmed" ? "border-l-success"
      : item.status === "rejected" ? "border-l-destructive"
      : item.status === "cancelled" ? "border-l-gray-400"
      : "border-l-warning";

    const isHighlighted = highlightId === item.id;

    return (
      <div 
        id={`handover-${item.id}`} 
        className={`flex items-center gap-3 rounded-lg border bg-card px-4 py-3 hover:shadow-sm transition-all border-l-4 ${borderAccent} ${isHighlighted ? "animate-highlight" : ""}`}
      >
        <UserHoverCard userId={item.handed_to} profileMap={profileMap} size="md" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <CurrencyDisplay amount={total || 0} className="text-lg font-bold" />
            <StatusBadge status={badge.status} label={badge.label} />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {getName(item.user_id)} <span className="text-muted-foreground/50">→</span> {getName(item.handed_to)}
            <span className="mx-1.5">•</span>
            {format(new Date(item.created_at), "dd MMM, hh:mm a")}
          </p>
        </div>

        {showActions && canAcceptDecline && (
          <div className="flex items-center gap-1.5 shrink-0">
            <Button size="sm" className="h-8 text-xs gap-1" onClick={() => handleAccept(item.id)} disabled={isLoading}>
              {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
              Accept
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive hover:text-destructive" onClick={() => handleDecline(item.id)} disabled={isLoading}>
              Decline
            </Button>
          </div>
        )}

        {showAdminActions && canAdminAct && (
          <div className="flex items-center gap-1.5 shrink-0">
            <Button size="sm" className="h-8 text-xs gap-1" onClick={() => handleAccept(item.id)} disabled={isLoading}>
              {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
              Accept
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive hover:text-destructive" onClick={() => handleDecline(item.id)} disabled={isLoading}>
              Decline
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1"
              onClick={() => {
                setSelectedHandoverForEdit(item);
                setEditHandoverAmount((Number(item.cash_amount) + Number(item.upi_amount)).toString());
                setEditHandoverStatus(item.status);
                setEditHandoverOpen(true);
              }}
              disabled={isLoading}
            >
              <Edit2 className="h-3 w-3" /> Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs text-destructive hover:text-destructive"
              onClick={() => handleCancel(item.id)}
              disabled={isLoading}
            >
              Cancel
            </Button>
          </div>
        )}

        {canCancel && !canAcceptDecline && !canAdminAct && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs text-muted-foreground hover:text-destructive shrink-0"
            onClick={() => setCancelConfirmId(item.id)}
            disabled={isLoading}
          >
            Cancel
          </Button>
        )}
      </div>
    );
  };

  // Expense Claim Card Component
  const ExpenseClaimCard = ({ item, showReviewAction = false }: { item: any; showReviewAction?: boolean }) => {
    const isOwner = item.user_id === user?.id;
    const isLoading = actionLoading === item.id;
    const statusLabel = item.status === "approved" ? "Approved"
      : item.status === "rejected" ? "Rejected"
      : item.status === "cancelled" ? "Cancelled"
      : "Pending";
    const displayAmount = item.status === "approved" && item.approved_amount
      ? Number(item.approved_amount)
      : Number(item.amount);
    const wasAmountChanged = item.status === "approved" && item.approved_amount && Number(item.approved_amount) !== Number(item.amount);
    const wasCategoryChanged = item.status === "approved" && item.category_id !== item.original_category_id;

    const isHighlighted = highlightId === item.id;
    const badgeStatus = item.status === "approved" ? "success"
      : item.status === "rejected" ? "rejected"
      : item.status === "cancelled" ? "cancelled"
      : "pending";

    const borderAccent = item.status === "approved" ? "border-l-success"
      : item.status === "rejected" ? "border-l-destructive"
      : item.status === "cancelled" ? "border-l-gray-400"
      : "border-l-warning";

    return (
      <div
        id={`expense-${item.id}`}
        className={`group flex items-center gap-4 rounded-lg border bg-card px-4 py-3 hover:shadow-sm transition-all border-l-4 ${borderAccent} ${
          isHighlighted ? "animate-highlight" : ""
        }`}
      >
        <div className="flex items-center justify-center h-10 w-10 rounded-lg shrink-0" style={{ backgroundColor: `${getCategoryColor(item.category_id)}20` }}>
          <Receipt className="h-5 w-5" style={{ color: getCategoryColor(item.category_id) }} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <CurrencyDisplay amount={displayAmount || 0} className="text-base font-bold" />
            {wasAmountChanged && (
              <span className="text-xs text-muted-foreground line-through">
                <CurrencyDisplay amount={Number(item.amount || 0)} />
              </span>
            )}
            <StatusBadge status={badgeStatus as any} label={statusLabel} />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate" title={item.description}>
            {item.description}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span
              className="text-2xs font-medium px-1.5 py-px rounded"
              style={{ backgroundColor: `${getCategoryColor(item.category_id)}20`, color: getCategoryColor(item.category_id) }}
            >
              {getCategoryName(item.category_id)}
              {wasCategoryChanged && " (changed)"}
            </span>
            <span className="text-3xs text-muted-foreground">
              {format(new Date(item.expense_date), "dd MMM yyyy")}
            </span>
            {!isOwner && (
              <span className="text-2xs font-medium bg-primary/8 text-primary px-1.5 py-px rounded">
                by <UserHoverCard userId={item.user_id} profileMap={profileMap}>{getName(item.user_id)}</UserHoverCard>
              </span>
            )}
          </div>
          {item.reviewer_notes && item.status !== "pending" && (
            <p className="text-3xs text-muted-foreground/70 italic mt-1 truncate">Note: "{item.reviewer_notes}"</p>
          )}
        </div>

        {showReviewAction && item.status === "pending" && (
          <Button
            size="sm"
            className="h-7 text-xs gap-1 px-2.5 shrink-0"
            onClick={() => openReviewDialog(item)}
            disabled={isLoading}
          >
            <Edit2 className="h-3 w-3" /> Review
          </Button>
        )}

        {isOwner && item.status === "pending" && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-muted-foreground hover:text-destructive shrink-0"
            onClick={() => handleCancelExpenseClaim(item.id)}
            disabled={isLoading}
          >
            <XCircle className="h-3 w-3 mr-1" /> Cancel
          </Button>
        )}
      </div>
    );
  };

  const groupByDate = (items: typeof myHandovers) => {
    const groups: Record<string, typeof myHandovers> = {};
    items.forEach((item) => {
      const date = item.created_at.split("T")[0];
      if (!groups[date]) groups[date] = [];
      groups[date].push(item);
    });
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  };

  const formatDateGroup = (dateStr: string) => {
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    if (dateStr === today) return "Today";
    if (dateStr === yesterday) return "Yesterday";
    return format(new Date(dateStr + "T00:00:00"), "dd MMM yyyy");
  };

  // Filtered data computation
  const filteredHandovers = useMemo(() => {
    let data = isAdminOrManager ? (handovers || []) : myHandovers;

    // Filter out admin from display (admin actions visible in audit log)
    data = data.filter((h: any) => {
      const senderRole = staffRoles?.find(r => r.user_id === h.user_id)?.role;
      const receiverRole = staffRoles?.find(r => r.user_id === h.handed_to)?.role;
      // Only show if neither sender nor receiver is super_admin
      return senderRole !== 'super_admin' && receiverRole !== 'super_admin';
    });

    // Date range filter
    if (filterFrom) {
      data = data.filter((h: any) => h.created_at >= filterFrom + "T00:00:00");
    }
    if (filterTo) {
      data = data.filter((h: any) => h.created_at <= filterTo + "T23:59:59");
    }

    // Status filter
    if (filterStatus !== "all") {
      data = data.filter((h: any) => h.status === filterStatus);
    }

    // User filter (admin only)
    if (filterUser !== "all") {
      data = data.filter((h: any) => h.user_id === filterUser || h.handed_to === filterUser);
    }

    return data;
  }, [handovers, myHandovers, isAdminOrManager, filterFrom, filterTo, filterStatus, filterUser, staffRoles]);

  const filteredExpenseClaims = useMemo(() => {
    let data = isAdminOrManager ? expenseClaims : myExpenseClaims;

    // Status filter
    if (filterExpenseStatus !== "all") {
      data = data.filter((e: any) => e.status === filterExpenseStatus);
    }

    // User filter for admin
    if (isAdminOrManager && filterUser !== "all") {
      data = data.filter((e: any) => e.user_id === filterUser);
    }

    return data;
  }, [expenseClaims, myExpenseClaims, isAdminOrManager, filterExpenseStatus, filterUser]);

  // Export functions
  const exportHandoversCSV = () => {
    const rows = filteredHandovers.map((h: any) => ({
      "Handover ID": h.display_id || h.id,
      "From": getName(h.user_id),
      "To": getName(h.handed_to),
      "Type": h.handover_type || 'transfer',
      "Cash": Number(h.cash_amount).toLocaleString(),
      "UPI": Number(h.upi_amount).toLocaleString(),
      "Total": (Number(h.cash_amount) + Number(h.upi_amount)).toLocaleString(),
      "Status": h.status,
      "Notes": h.notes || "",
      "Date": new Date(h.created_at).toLocaleString("en-IN"),
    }));

    if (rows.length === 0) {
      toast.info("No handovers to export");
      return;
    }

    const header = Object.keys(rows[0]).join(",");
    const csv = [header, ...rows.map((r: any) => Object.values(r).map((v: any) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
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
    const rows = filteredExpenseClaims.map((e: any) => ({
      "Claim ID": e.display_id || e.id,
      "Submitted By": getName(e.user_id),
      "Category": getCategoryName(e.category_id),
      "Amount": Number(e.amount).toLocaleString(),
      "Approved Amount": e.approved_amount ? Number(e.approved_amount).toLocaleString() : "",
      "Status": e.status,
      "Description": e.description,
      "Expense Date": format(new Date(e.expense_date), "dd MMM yyyy"),
      "Submitted Date": new Date(e.created_at).toLocaleString("en-IN"),
    }));

    if (rows.length === 0) {
      toast.info("No expenses to export");
      return;
    }

    const header = Object.keys(rows[0]).join(",");
    const csv = [header, ...rows.map((r: any) => Object.values(r).map((v: any) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `expenses-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Expenses exported");
  };

  const activeHandoverFilterCount = [
    filterFrom !== thirtyDaysAgo,
    filterTo !== today,
    filterStatus !== "all",
    filterUser !== "all",
  ].filter(Boolean).length;

  const clearHandoverFilters = () => {
    setFilterFrom(thirtyDaysAgo);
    setFilterTo(today);
    setFilterStatus("all");
    setFilterUser("all");
  };

  const handleDailyReset = async (targetUserId?: string) => {
    setDailyResetLoading(true);
    try {
      const uid = targetUserId || user!.id;
      const { error } = await supabase.rpc("finalizer_daily_reset", { p_finalizer_id: uid }) as any;
      if (error) throw error;
      toast.success("Daily balance reset recorded. Income entry created.");
      qc.invalidateQueries({ queryKey: ["finalizer-account"] });
      qc.invalidateQueries({ queryKey: ["finalizer-holdings"] });
      qc.invalidateQueries({ queryKey: ["income-entries"] });
    } catch (e: any) {
      toast.error(e.message || "Reset failed");
    } finally {
      setDailyResetLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-4 w-72 bg-muted rounded animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          {[1,2,3,4].map(i => <div key={i} className="h-24 bg-muted rounded-lg animate-pulse" />)}
        </div>
        <div className="h-16 bg-muted rounded-lg animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1,2].map(i => <div key={i} className="h-28 bg-muted rounded-lg animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader
        title="Handovers"
        subtitle="Track money flow between team members"
        primaryAction={
          isAdminOrManager
            ? { label: "Admin Transfer", icon: Send, onClick: () => setAdminTransferOpen(true) }
            : !isFinalizer
            ? { label: "Create", icon: Send, onClick: () => { setCreateType("handover"); setCreateOpen(true); } }
            : undefined
        }
        actions={
          isAdminOrManager && canAdjustHoldingBalance
            ? [{ label: "Adjust Holding", icon: Wallet, onClick: () => setAdjustHoldingOpen(true), priority: 1 }]
            : []
        }
      />

      {/* ========== BALANCE CARDS ========== */}
      {!isAdminOrManager && (
        <div className="space-y-4 mb-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-l-4 border-l-info">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Today's Sales</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <CurrencyDisplay amount={dailyData.today_sales || 0} className="text-xl font-bold text-info" />
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-info">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Today's Payments</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <CurrencyDisplay amount={dailyData.today_payments || 0} className="text-xl font-bold text-info" />
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-success">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Transferred Today</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <CurrencyDisplay amount={dailyData.today_sent_confirmed || 0} className="text-xl font-bold text-success" />
                {(dailyData.today_sent_pending || 0) > 0 && (
                    <p className="text-2xs text-warning font-medium mt-0.5">
                    +<CurrencyDisplay amount={dailyData.today_sent_pending || 0} /> pending
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-destructive">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Previous Pending</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <CurrencyDisplay amount={dailyData.prev_pending || 0} className="text-xl font-bold text-destructive" />
              </CardContent>
            </Card>
          </div>

          <div className="relative overflow-hidden rounded-lg border bg-gradient-to-r from-card to-muted/50 p-4 flex items-center justify-between">
            <div className="relative z-10">
              <p className="text-sm font-medium text-muted-foreground">Net Balance</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {notHandedOver > 0 ? 'You owe warehouse — handover required' : notHandedOver < 0 ? 'Warehouse owes you' : 'No pending balance'}
              </p>
            </div>
            <p className={`relative z-10 text-2xl font-bold ${notHandedOver > 0 ? 'text-destructive' : notHandedOver < 0 ? 'text-success' : 'text-muted-foreground'}`}>
              {notHandedOver !== 0 && (notHandedOver > 0 ? '- ' : '+ ')}
              <CurrencyDisplay amount={Math.abs(notHandedOver || 0)} className="text-2xl" />
            </p>
            <div className={`absolute right-0 top-0 bottom-0 w-32 opacity-10 ${notHandedOver > 0 ? 'bg-gradient-to-l from-destructive' : 'bg-gradient-to-l from-success'}`} />
          </div>

          {/* Pending Actions & Finalizer Account side-by-side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-l-4 border-l-warning">
              <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium">Pending Actions</CardTitle>
                <span className="flex items-center justify-center h-8 w-8 rounded-lg bg-warning/20 dark:bg-warning/10">
                  <AlertCircle className="h-4 w-4 text-warning" />
                </span>
              </CardHeader>
              <CardContent className="p-4 pt-2 flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-warning">{incoming.length}</p>
                  <p className="text-xs text-muted-foreground mt-1">Handovers awaiting confirmation</p>
                </div>
                {awaitingAmount > 0 && (
                  <div className="text-right">
                    <CurrencyDisplay amount={awaitingAmount} className="text-sm font-bold text-warning" />
                    <p className="text-2xs text-muted-foreground">Sent by you</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {isFinalizer ? (
              <Card className="border-l-4 border-l-success">
                <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm font-medium">Holding Balance</CardTitle>
                  <span className="flex items-center justify-center h-8 w-8 rounded-lg bg-success/20 dark:bg-success/10">
                    <Wallet className="h-4 w-4 text-success" />
                  </span>
                </CardHeader>
                <CardContent className="p-4 pt-2">
                  <CurrencyDisplay amount={Number(finalizerAccount?.cash_amount || 0) + Number(finalizerAccount?.upi_amount || 0)} className="text-2xl font-bold text-success" />
                  <p className="text-xs text-muted-foreground mt-1">Income since last daily reset</p>
                  {finalizerAccount?.last_reset_at && (
                    <p className="text-2xs text-muted-foreground mt-0.5">
                      Reset: {format(new Date(finalizerAccount.last_reset_at), "dd MMM, hh:mm a")}
                    </p>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card className="border-l-4 border-l-success">
                <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm font-medium">Pending Expenses</CardTitle>
                  <span className="flex items-center justify-center h-8 w-8 rounded-lg bg-success/20 dark:bg-success/10">
                    <Receipt className="h-4 w-4 text-success" />
                  </span>
                </CardHeader>
                <CardContent className="p-4 pt-2">
                  <CurrencyDisplay amount={myPendingExpenses || 0} className="text-2xl font-bold text-success" />
                  <p className="text-xs text-muted-foreground mt-1">Claims awaiting approval</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* ========== SIMPLIFIED TABS ========== */}
      <Tabs defaultValue="handovers" className="w-full">
        <TabsList className="w-full h-10 bg-muted/30">
          <TabsTrigger value="handovers" className="flex-1 gap-1.5 text-xs relative data-[state=active]:bg-background">
            <Banknote className="h-3.5 w-3.5" />
            <span className="flex items-center gap-1">
              Handovers
              {incoming.length > 0 && (
                <Badge variant="secondary" className="ml-0.5 h-4 min-w-4 px-1 text-2xs">
                  {incoming.length}
                </Badge>
              )}
            </span>
          </TabsTrigger>

          {(canSubmitExpenses || isAdminOrManager || isStaff) && (
            <TabsTrigger value="expenses" className="flex-1 gap-1.5 text-xs relative data-[state=active]:bg-background">
              <Receipt className="h-3.5 w-3.5" />
              <span className="flex items-center gap-1">
                Expenses
                {(isAdminOrManager ? expenseClaims : myExpenseClaims).filter((e: any) => e.status === "pending").length > 0 && (
                  <Badge variant="secondary" className="ml-0.5 h-4 min-w-4 px-1 text-2xs">
                    {(isAdminOrManager ? expenseClaims : myExpenseClaims).filter((e: any) => e.status === "pending").length}
                  </Badge>
                )}
              </span>
            </TabsTrigger>
          )}

          {canSeeBalances && (
            <TabsTrigger value="balances" className="flex-1 gap-1.5 text-xs relative data-[state=active]:bg-background">
              <Eye className="h-3.5 w-3.5" />
              Balances
              {pendingExpenseClaimsForReview.length > 0 && (
                <Badge variant="secondary" className="ml-0.5 h-4 min-w-4 px-1 text-2xs">
                  {pendingExpenseClaimsForReview.length}
                </Badge>
              )}
            </TabsTrigger>
          )}

          {(isFinalizer || isSuperAdmin || isManager) && (
            <TabsTrigger value="income" className="flex-1 gap-1.5 text-xs relative data-[state=active]:bg-background">
              <TrendingUp className="h-3.5 w-3.5" />
              Income
              {todayReceivedConfirmed > 0 && (
                <Badge variant="secondary" className="ml-0.5 h-4 min-w-4 px-1 text-2xs">
                  {todayReceivedConfirmed}
                </Badge>
              )}
            </TabsTrigger>
          )}
        </TabsList>

        {/* ========== HANDOVERS TAB ========== */}
        <TabsContent value="handovers" className="space-y-4 mt-3">
          {/* Simplified Filter Bar */}
          <div className="flex flex-wrap items-center gap-2 bg-muted/30 rounded-lg p-2">
            <div className="flex flex-wrap items-center gap-2 w-full">
              <div className="flex flex-wrap gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 bg-background">
                      <CalendarIcon className="h-3.5 w-3.5" />
                      {filterFrom ? format(new Date(filterFrom + "T00:00:00"), "dd MMM") : "From"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={filterFrom ? new Date(filterFrom + "T00:00:00") : undefined} onSelect={(d) => setFilterFrom(d ? format(d, "yyyy-MM-dd") : "")} initialFocus />
                  </PopoverContent>
                </Popover>
                
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 bg-background">
                      <CalendarIcon className="h-3.5 w-3.5" />
                      {filterTo ? format(new Date(filterTo + "T00:00:00"), "dd MMM") : "To"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={filterTo ? new Date(filterTo + "T00:00:00") : undefined} onSelect={(d) => setFilterTo(d ? format(d, "yyyy-MM-dd") : "")} initialFocus />
                  </PopoverContent>
                </Popover>
                
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="h-8 text-xs w-32 bg-background">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="awaiting_confirmation">Pending</SelectItem>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
                
                {isAdminOrManager && (
                  <Select value={filterUser} onValueChange={setFilterUser}>
                    <SelectTrigger className="h-8 text-xs w-36 bg-background">
                      <SelectValue placeholder="User" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All staff</SelectItem>
                      {staffProfiles?.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                
                <div className="flex-1" />
                
                {activeHandoverFilterCount > 0 && (
                  <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={clearHandoverFilters}>
                    <X className="h-3 w-3" />
                    Clear
                    <Badge variant="secondary" className="h-4 min-w-4 px-1 text-2xs ml-0.5">
                      {activeHandoverFilterCount}
                    </Badge>
                  </Button>
                )}
                
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1 bg-background" onClick={exportHandoversCSV}>
                  <Download className="h-3 w-3" /> Export
                </Button>
              </div>
            </div>
          </div>

          {/* Incoming Actions (integrated into tab) */}
          {incoming.length > 0 && (
            <div className="space-y-2">
              <NoticeBox
                title="Action Required"
                message={`${incoming.length} handover${incoming.length > 1 ? 's' : ''} awaiting your confirmation`}
                variant="warning"
                icon={ArrowDownLeft}
              />
              <div className="space-y-2">
                {incoming.map((item) => (
                  <HandoverCard key={item.id} item={item} showActions={!isAdminOrManager} showAdminActions={isAdminOrManager} />
                ))}
              </div>
            </div>
          )}

          {/* Handover List */}
          {filteredHandovers.length === 0 ? (
            <EmptyState
              icon={HandCoins}
              title="No handovers found"
              description={activeHandoverFilterCount > 0 ? "No handovers match your filters. Try adjusting them." : "No handovers yet. Create one to get started."}
            />
          ) : (
            <div className="space-y-4">
              {groupByDate(filteredHandovers).map(([date, items]) => (
                <div key={date} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {formatDateGroup(date)}
                    </span>
                    <Badge variant="outline" className="h-4 px-1.5 text-2xs font-mono">
                      {items.length}
                    </Badge>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                  {items.map((item) => (
                    <HandoverCard
                      key={item.id}
                      item={item}
                      showAdminActions={isAdminOrManager && canModifyHandovers}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ========== EXPENSES TAB ========== */}
        {(canSubmitExpenses || isAdminOrManager) && (
          <TabsContent value="expenses" className="space-y-4 mt-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border bg-card p-3 border-l-4 border-l-warning">
                <p className="text-xs text-muted-foreground">Pending Claims</p>
                <CurrencyDisplay amount={myPendingExpenses || 0} className="text-xl font-bold text-warning" />
              </div>
              <div className="rounded-lg border bg-card p-3 border-l-4 border-l-success">
                <p className="text-xs text-muted-foreground">Approved (Owed)</p>
                <CurrencyDisplay amount={myApprovedExpenses || 0} className="text-xl font-bold text-success" />
              </div>
            </div>

            {(canSubmitExpenses || isAdminOrManager || isStaff) && (
              <Button onClick={() => setExpenseOpen(true)} className="w-full gap-2" variant="outline">
                <Receipt className="h-4 w-4" /> Submit Expense Claim
              </Button>
            )}

            {/* Expense Filters */}
            <div className="flex flex-wrap items-center gap-2 bg-muted/30 rounded-lg p-2">
              <Select value={filterExpenseStatus} onValueChange={setFilterExpenseStatus}>
                <SelectTrigger className="h-8 text-xs w-32 bg-background">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>

              {isAdminOrManager && (
                <Select value={filterUser} onValueChange={setFilterUser}>
                  <SelectTrigger className="h-8 text-xs w-36 bg-background">
                    <SelectValue placeholder="User" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All staff</SelectItem>
                    {staffProfiles?.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}

              <div className="flex-1" />

              <Button variant="outline" size="sm" className="h-8 text-xs gap-1 bg-background" onClick={exportExpensesCSV}>
                <Download className="h-3 w-3" /> Export
              </Button>
            </div>

            {/* Expense Claims List */}
            {expenseClaimsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : filteredExpenseClaims.length === 0 ? (
              <EmptyState
                icon={Receipt}
                title="No expense claims"
                description={canSubmitExpenses ? "No expense claims match your filters." : "No expense claims to show."}
              />
            ) : (
              <div className="space-y-2">
                {filteredExpenseClaims.map((item: any) => (
                  <ExpenseClaimCard key={item.id} item={item} showReviewAction={isAdminOrManager} />
                ))}
              </div>
            )}
          </TabsContent>
        )}

        {/* ========== BALANCES TAB ========== */}
        {canSeeBalances && (
          <TabsContent value="balances" className="space-y-4 mt-3">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg border bg-card p-3 border-l-4 border-l-destructive">
                <p className="text-xs text-muted-foreground">Total Holding</p>
                <CurrencyDisplay amount={(allStaffBalances || []).reduce((s: number, b: any) => s + Number(b.holding_balance || 0), 0)} className="text-lg font-bold text-destructive" />
              </div>
              <div className="rounded-lg border bg-card p-3 border-l-4 border-l-primary">
                <p className="text-xs text-muted-foreground">Agents</p>
                <p className="text-lg font-bold">{(allStaffBalances || []).filter((b: any) => b.role === 'agent').length}</p>
              </div>
              <div className="rounded-lg border bg-card p-3 border-l-4 border-l-chart-2">
                <p className="text-xs text-muted-foreground">Marketers</p>
                <p className="text-lg font-bold">{(allStaffBalances || []).filter((b: any) => b.role === 'marketer').length}</p>
              </div>
              <div className="rounded-lg border bg-card p-3 border-l-4 border-l-chart-3">
                <p className="text-xs text-muted-foreground">Operators</p>
                <p className="text-lg font-bold">{(allStaffBalances || []).filter((b: any) => b.role === 'operator').length}</p>
              </div>
            </div>

            {/* Staff List */}
            {!allStaffBalances || allStaffBalances.length === 0 ? (
              <EmptyState icon={Wallet} title="No staff balances" description="No staff balances to show." />
            ) : (
              <div className="space-y-2">
                {(allStaffBalances as any[])
                  .sort((a, b) => Number(b.holding_balance || 0) - Number(a.holding_balance || 0))
                  .map((bal) => (
                    <Link key={bal.user_id} to={`/staff/${bal.user_id}`} className="block">
                      <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 hover:shadow-sm hover:border-primary/30 transition-all cursor-pointer">
                        <UserHoverCard userId={bal.user_id} profileMap={profileMap} size="lg" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold truncate">{bal.full_name}</p>
                            <span className="text-2xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground capitalize">{bal.role}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5 text-3xs text-muted-foreground">
                            <span>Today Sales: <CurrencyDisplay amount={Number(bal.today_sales || 0) + Number(bal.today_payments || 0)} /></span>
                            <span>Prev Pending: <CurrencyDisplay amount={Number(bal.prev_pending || 0)} /></span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <CurrencyDisplay amount={Math.max(0, Number(bal.holding_balance) || 0)} className={`text-base font-bold ${(Number(bal.holding_balance) || 0) > 0 ? "text-destructive" : "text-success"}`} />
                          <p className="text-2xs text-muted-foreground">Holding</p>
                        </div>
                      </div>
                    </Link>
                  ))}
              </div>
            )}
          </TabsContent>
        )}

        {/* ========== INCOME TAB ========== */}
        {(isFinalizer || isSuperAdmin || isManager) && (
          <TabsContent value="income" className="space-y-4 mt-3">
            {/* Admin/Manager: Finalizer holdings overview */}
            {(isAdminOrManager) && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Finalizer Holdings</h3>
                  <Button size="sm" variant="outline" className="h-8 text-xs gap-1" disabled={dailyResetLoading}
                    onClick={() => setResetAllConfirmOpen(true)}>
                    <RefreshCw className="h-3 w-3" /> Reset All
                  </Button>
                </div>
                {!finalizerHoldings || finalizerHoldings.length === 0 ? (
                  <EmptyState icon={Wallet} title="No finalizer accounts" description="No finalizer accounts found." />
                ) : (
                  <div className="space-y-2">
                    {finalizerHoldings.map((f: any) => (
                      <div key={f.user_id} className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
                        <UserHoverCard userId={f.user_id} profileMap={profileMap} size="md" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{f.full_name}</p>
                          <div className="flex gap-3 text-3xs text-muted-foreground mt-0.5">
                            <span>Cash: ₹{Number(f.cash_amount || 0).toLocaleString()}</span>
                            <span>UPI: ₹{Number(f.upi_amount || 0).toLocaleString()}</span>
                          </div>
                          {f.last_reset_at && (
                            <p className="text-2xs text-muted-foreground">Reset: {format(new Date(f.last_reset_at), "dd MMM, hh:mm a")}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-base font-bold text-success">₹{Number(f.total_balance || 0).toLocaleString()}</p>
                          <Button size="sm" variant="ghost" className="h-7 text-2xs text-muted-foreground mt-1 gap-1" disabled={dailyResetLoading}
                            onClick={() => handleDailyReset(f.user_id)}>
                            <RefreshCw className="h-3 w-3" /> Reset
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="h-px bg-border" />
              </div>
            )}

            {/* Finalizer: My income today */}
            {isFinalizer && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">My Income Log</h3>
                  <div className="flex items-center gap-2">
                    <Input type="date" value={incomeFilterDate} onChange={(e) => setIncomeFilterDate(e.target.value)}
                      className="h-8 text-xs w-36" max={today} />
                    <Button size="sm" variant="outline" className="h-8 text-xs gap-1" disabled={dailyResetLoading}
                      onClick={() => handleDailyReset()}>
                      {dailyResetLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                      Daily Reset
                    </Button>
                  </div>
                </div>

                {/* Summary */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border bg-card p-3 border-l-4 border-l-success">
                    <p className="text-xs text-muted-foreground">Total Income ({incomeFilterDate === today ? "Today" : format(new Date(incomeFilterDate + "T00:00:00"), "dd MMM")})</p>
                    <CurrencyDisplay amount={(finalizerIncome || []).reduce((s: number, e: any) => s + Number(e.amount || 0), 0)} className="text-xl font-bold text-success mt-1" />
                  </div>
                  <div className="rounded-lg border bg-card p-3">
                    <p className="text-xs text-muted-foreground">Entries</p>
                    <p className="text-xl font-bold mt-1">{(finalizerIncome || []).length}</p>
                  </div>
                </div>

                {/* Income entries list */}
                {finalizerIncomeLoading ? (
                  <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                ) : !finalizerIncome || finalizerIncome.length === 0 ? (
                  <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">No income entries for this date.</div>
                ) : (
                  <div className="space-y-2">
                    {finalizerIncome.map((entry: any) => (
                      <div key={entry.id} className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium capitalize">{(entry.entry_type || 'collection').replace(/_/g, ' ')}</p>
                          {entry.description && <p className="text-xs text-muted-foreground truncate">{entry.description}</p>}
                          <p className="text-2xs text-muted-foreground">{format(new Date(entry.created_at), "dd MMM, hh:mm a")}</p>
                        </div>
                        <p className="text-base font-bold text-success shrink-0">+₹{Number(entry.amount || 0).toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* ========== CREATE HANDOVER/EXPENSE DIALOG ========== */}
      <Dialog open={createOpen} onOpenChange={(open) => { if (!open) setCreateType("handover"); setCreateOpen(open); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{createType === "expense" ? "Request Expense" : "Create Handover"}</DialogTitle>
            <DialogDescription>{createType === "expense" ? "Claim reimbursement for out-of-pocket expenses." : "Send money to another team member for confirmation."}</DialogDescription>
          </DialogHeader>

          {/* Toggle between Handover and Expense */}
          {canSubmitExpenses && (
            <div className="flex rounded-lg bg-muted p-1 gap-1">
              <Button variant={createType === "handover" ? "default" : "ghost"} size="sm" className="flex-1" onClick={() => setCreateType("handover")}>
                <Banknote className="h-4 w-4 mr-1" /> Payment
              </Button>
              <Button variant={createType === "expense" ? "default" : "ghost"} size="sm" className="flex-1" onClick={() => setCreateType("expense")}>
                <Receipt className="h-4 w-4 mr-1" /> Expense
              </Button>
            </div>
          )}

          <div className="space-y-4">
            {createType === "expense" ? (
              <>
                {/* Expense Form */}
                <div className="space-y-2">
                  <Label>Category *</Label>
                  <Select value={expenseCategory} onValueChange={setExpenseCategory}>
                    <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      {expenseCategories.map((cat: any) => (
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
                    <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} max={new Date().toISOString().split("T")[0]} />
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
              </>
            ) : (
              <>
                {/* Handover Form */}
                <div className="rounded-lg bg-muted/50 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Your Balance</span>
                    <span className={`text-lg font-bold ${notHandedOver > 0 ? "text-destructive" : notHandedOver < 0 ? "text-success" : "text-info"}`}>
                      Rs{Math.abs(notHandedOver || 0).toLocaleString()}
                    </span>
                  </div>
                  {notHandedOver > 0 ? (
                    <p className="text-xs text-destructive font-medium">You owe warehouse Rs{Math.abs(notHandedOver).toLocaleString()} - handover required</p>
                  ) : notHandedOver < 0 ? (
                    <p className="text-xs text-success font-medium">Warehouse owes you Rs{Math.abs(notHandedOver).toLocaleString()}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">No pending balance</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Send To</Label>
                  <Select value={toUserId} onValueChange={setToUserId}>
                    <SelectTrigger><SelectValue placeholder="Select recipient" /></SelectTrigger>
                    <SelectContent>
                      {staffProfiles?.length === 0 ? (
                        <SelectItem value="__empty__" disabled>No staff available</SelectItem>
                      ) : (
                        (staffProfiles || []).map((p) => (
                          <SelectItem key={p.user_id} value={p.user_id}>{p.full_name} ({p.roleLabel})</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Handover Type</Label>
                  <Select value={handoverType} onValueChange={(v) => setHandoverType(v as "collection" | "transfer")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="transfer">Transfer</SelectItem>
                      <SelectItem value="collection">Collection</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Amount (Rs)</Label>
                  <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Enter amount" min="1" />
                  {partialSetting === false && !isFinalizer && (
                    <p className="text-xs text-warning flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 shrink-0" />
                      Full balance of Rs{Math.max(0, notHandedOver || 0).toLocaleString()} required
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Notes (optional)</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add any notes..." rows={2} />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateOpen(false); setCreateType("handover"); }}>Cancel</Button>
            {createType === "expense" ? (
              <Button onClick={handleCreateExpenseClaim} disabled={expenseSubmitting}>
                {expenseSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Receipt className="h-4 w-4 mr-2" />}
                Submit Request
              </Button>
            ) : (
              <Button onClick={handleCreate} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                Request Transfer
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Cancel Confirmation Dialog */}
      <Dialog open={!!cancelConfirmId} onOpenChange={() => setCancelConfirmId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancel Handover?</DialogTitle>
            <DialogDescription>
              This will cancel your pending handover. The recipient will be notified.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelConfirmId(null)}>Keep it</Button>
            <Button variant="destructive" onClick={() => cancelConfirmId && handleCancel(cancelConfirmId)} disabled={!!actionLoading}>
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <XCircle className="h-4 w-4 mr-2" />}
              Yes, Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Expense Claim Dialog */}
      <Dialog open={expenseOpen} onOpenChange={setExpenseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Expense Claim</DialogTitle>
            <DialogDescription>
              Claim reimbursement for out-of-pocket expenses. Your claim will be reviewed by management.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Category *</Label>
              <Select value={expenseCategory} onValueChange={setExpenseCategory}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {expenseCategories.map((cat: any) => (
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
                <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} max={new Date().toISOString().split("T")[0]} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description *</Label>
              <Textarea value={expenseDescription} onChange={(e) => setExpenseDescription(e.target.value)} placeholder="What was this expense for?" rows={3} />
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
              {expenseSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Receipt className="h-4 w-4 mr-2" />}
              Submit Claim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Review Expense Claim Dialog */}
      <Dialog open={!!reviewExpense} onOpenChange={() => setReviewExpense(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review Expense Claim</DialogTitle>
            <DialogDescription>
              Approve or reject this expense claim. You can adjust the category or amount if needed.
            </DialogDescription>
          </DialogHeader>
          {reviewExpense && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Submitted by</span>
                  <span className="text-sm font-medium">{getName(reviewExpense.user_id)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Original Amount</span>
                  <span className="text-sm font-bold">₹{Number(reviewExpense.amount || 0).toLocaleString()}</span>
                </div>
                <div className="pt-1 border-t">
                  <span className="text-xs text-muted-foreground">Description</span>
                  <p className="text-sm mt-0.5">{reviewExpense.description}</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={reviewCategory} onValueChange={setReviewCategory}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {expenseCategories.map((cat: any) => (
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
              <div className="space-y-2">
                <Label>Approved Amount (₹)</Label>
                <Input type="number" value={reviewAmount} onChange={(e) => setReviewAmount(e.target.value)} placeholder="0.00" min="0" />
              </div>
              <div className="space-y-2">
                <Label>Notes (optional)</Label>
                <Textarea value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} placeholder="Add notes..." rows={2} />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setReviewExpense(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => handleReviewExpenseClaim("reject")} disabled={!!actionLoading}>
              {actionLoading === reviewExpense?.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <XCircle className="h-4 w-4 mr-2" />}
              Reject
            </Button>
            <Button onClick={() => handleReviewExpenseClaim("approve")} disabled={!!actionLoading || !reviewAmount || Number(reviewAmount) <= 0}>
              {actionLoading === reviewExpense?.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Admin Transfer Dialog (kept as is) */}
      <Dialog open={adminTransferOpen} onOpenChange={setAdminTransferOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Admin Transfer Between Staff</DialogTitle>
            <DialogDescription>
              Transfer money from one staff member to another. This action is logged for audit purposes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Transfer From *</Label>
              <Select value={adminTransferFrom || "__none__"} onValueChange={(v) => setAdminTransferFrom(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Select sender" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" disabled>Select sender</SelectItem>
                  {staffProfiles?.map((p) => {
                    const bal = allStaffBalances?.[p.user_id];
                    const balance = bal ? (bal.total + bal.sentPending) : 0;
                    return (
                      <SelectItem key={p.user_id} value={p.user_id}>
                        <div className="flex items-center justify-between w-full gap-3">
                          <span className="font-medium">{p.full_name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{p.roleLabel}</span>
                            <span className={`text-xs font-semibold ${(balance || 0) > 0 ? 'text-destructive' : 'text-success'}`}>
                              ₹{(balance || 0).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {adminTransferFrom && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Available Balance:</span>
                  <span className={`font-bold ${(allStaffBalances?.[adminTransferFrom]?.total || 0) > 0 ? 'text-destructive' : 'text-success'}`}>
                    ₹{((allStaffBalances?.[adminTransferFrom]?.total || 0) + (allStaffBalances?.[adminTransferFrom]?.sentPending || 0)).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Transfer To *</Label>
              <Select value={adminTransferTo || "__none__"} onValueChange={(v) => setAdminTransferTo(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Select recipient" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" disabled>Select recipient</SelectItem>
                  {staffProfiles?.map((p) => (
                    <SelectItem key={p.user_id} value={p.user_id} disabled={p.user_id === adminTransferFrom}>
                      {p.full_name} ({p.roleLabel})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Amount (₹) *</Label>
              <Input type="number" value={adminTransferAmount} onChange={(e) => setAdminTransferAmount(e.target.value)} placeholder="Enter amount" min="1" />
            </div>
            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <Textarea value={adminTransferReason} onChange={(e) => setAdminTransferReason(e.target.value)} placeholder="Reason for audit log" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdminTransferOpen(false)}>Cancel</Button>
            <Button onClick={handleAdminTransfer} disabled={submitting || !adminTransferFrom || !adminTransferTo || !adminTransferAmount || adminTransferFrom === adminTransferTo}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              Transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Handover Dialog */}
      <Dialog open={editHandoverOpen} onOpenChange={setEditHandoverOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Handover</DialogTitle>
            <DialogDescription>
              Modify the handover amount or status. This action is logged for audit purposes.
            </DialogDescription>
          </DialogHeader>
          {selectedHandoverForEdit && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">From</span>
                  <span className="text-sm">{getName(selectedHandoverForEdit.user_id)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">To</span>
                  <span className="text-sm">{getName(selectedHandoverForEdit.handed_to)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Current Amount</span>
                  <span className="text-sm font-bold">
                    ₹{(Number(selectedHandoverForEdit.cash_amount || 0) + Number(selectedHandoverForEdit.upi_amount || 0)).toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>New Amount (₹)</Label>
                <Input type="number" value={editHandoverAmount} onChange={(e) => setEditHandoverAmount(e.target.value)} min="0" />
              </div>
              <div className="space-y-2">
                <Label>New Status</Label>
                <Select value={editHandoverStatus} onValueChange={setEditHandoverStatus}>
                  <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Keep current</SelectItem>
                    <SelectItem value="awaiting_confirmation">Pending</SelectItem>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditHandoverOpen(false); setSelectedHandoverForEdit(null); }}>Cancel</Button>
            <Button onClick={handleEditHandover} disabled={submitting || !editHandoverAmount}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Edit2 className="h-4 w-4 mr-2" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjust Holding Balance Dialog */}
      {canAdjustHoldingBalance && (
        <Dialog open={adjustHoldingOpen} onOpenChange={setAdjustHoldingOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Adjust Holding Balance</DialogTitle>
              <DialogDescription>
                Adjust the cash or UPI holding balance of any staff member. Use negative values to reduce balance.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Select Staff Member</Label>
                <Select value={adjustHoldingUser} onValueChange={setAdjustHoldingUser}>
                  <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                  <SelectContent>
                    {(staffProfiles || []).map((staff) => (
                      <SelectItem key={staff.user_id} value={staff.user_id}>
                        {staff.full_name} ({staff.roleLabel})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Cash Adjustment (₹)</Label>
                  <Input 
                    type="number" 
                    value={adjustCashAmount} 
                    onChange={(e) => setAdjustCashAmount(e.target.value)} 
                    placeholder="e.g. 500 or -200"
                  />
                  <span className="text-xs text-muted-foreground">Positive = add, Negative = reduce</span>
                </div>
                <div className="space-y-2">
                  <Label>UPI Adjustment (₹)</Label>
                  <Input 
                    type="number" 
                    value={adjustUpiAmount} 
                    onChange={(e) => setAdjustUpiAmount(e.target.value)} 
                    placeholder="e.g. 500 or -200"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Reason (optional)</Label>
                <Input 
                  value={adjustReason} 
                  onChange={(e) => setAdjustReason(e.target.value)} 
                  placeholder="Reason for adjustment"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setAdjustHoldingOpen(false); setAdjustHoldingUser(""); setAdjustCashAmount(""); setAdjustUpiAmount(""); setAdjustReason(""); }}>Cancel</Button>
              <Button onClick={handleAdjustHoldingBalance} disabled={submitting || !adjustHoldingUser || (!adjustCashAmount && !adjustUpiAmount)}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Wallet className="h-4 w-4 mr-2" />}
                Adjust Balance
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Expense Cancel Confirm Dialog */}
      <AlertDialog open={expenseCancelConfirmOpen} onOpenChange={setExpenseCancelConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Expense Claim?</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel your expense claim. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setExpenseCancelConfirmOpen(false); setExpenseCancelConfirmId(null); }}>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCancelExpenseClaim}>Yes, Cancel</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset All Finalizers Confirm Dialog */}
      <AlertDialog open={resetAllConfirmOpen} onOpenChange={setResetAllConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset All Finalizers?</AlertDialogTitle>
            <AlertDialogDescription>
              This will trigger a daily reset for ALL finalizers. It creates income entries and zeros their balances. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              (finalizerHoldings || []).forEach((f: any) => handleDailyReset(f.user_id));
              setResetAllConfirmOpen(false);
            }}>Yes, Reset All</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Handovers;
