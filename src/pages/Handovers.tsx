import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ImageUpload } from "@/components/shared/ImageUpload";
import {
  Banknote, CheckCircle, Clock, AlertCircle, Loader2, Send,
  ArrowDownLeft, XCircle, User, ChevronDown, Users, ShoppingCart, Wallet, Eye,
  Receipt, Tag, FileText, Edit2, Image
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermission } from "@/hooks/usePermission";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { sendNotification, sendNotificationToMany, getAdminUserIds } from "@/lib/notifications";
import { useState, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, startOfDay } from "date-fns";

const Handovers = () => {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [toUserId, setToUserId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);

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

  const isAdminOrManager = role === "super_admin" || role === "manager";
  const { allowed: isFinalizer } = usePermission("finalizer");
  const { allowed: canSeeBalances } = usePermission("see_handover_balance");
  const { allowed: canSubmitExpenses, loading: expensePermLoading } = usePermission("submit_expenses");
  
  // DEBUG: Remove after testing
  console.log("[Handovers] role:", role, "| isAdminOrManager:", isAdminOrManager, "| canSubmitExpenses:", canSubmitExpenses);

  const { data: staffProfiles } = useQuery({
    queryKey: ["staff-profiles", user?.id],
    queryFn: async () => {
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["super_admin", "manager", "agent", "marketer", "pos"]);

      const staffRoleMap = new Map((roles || []).map((row) => [row.user_id, row.role]));
      const staffIds = Array.from(staffRoleMap.keys()).filter((id) => id !== user?.id);

      let profiles: Array<{ user_id: string; full_name: string; email: string | null; phone: string | null }> = [];

      if (!rolesError && staffIds.length > 0) {
        const { data: filteredProfiles, error: filteredError } = await supabase
          .from("profiles")
          .select("user_id, full_name, email, phone")
          .in("user_id", staffIds)
          .eq("is_active", true);
        if (!filteredError) {
          profiles = (filteredProfiles || []) as typeof profiles;
        }
      }

      const roleLabel: Record<string, string> = {
        super_admin: "Admin",
        manager: "Manager",
        agent: "Agent",
        marketer: "Marketer",
        pos: "POS",
      };

      return (profiles || [])
        .map((profile) => ({
          ...profile,
          role: staffRoleMap.get(profile.user_id) || "agent",
          roleLabel: roleLabel[staffRoleMap.get(profile.user_id) || ""] || "Staff",
        }))
        .sort((a, b) => a.full_name.localeCompare(b.full_name));
    },
    enabled: !!user,
  });

  const { data: handovers, isLoading } = useQuery({
    queryKey: ["handovers", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("handovers")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const { data: userSalesTotals } = useQuery({
    queryKey: ["user-sales-totals", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("cash_amount, upi_amount, created_at")
        .eq("recorded_by", user!.id);
      if (error) throw error;
      const todayStart = startOfDay(new Date()).toISOString();
      const all = data || [];
      const todaySales = all.filter((s) => s.created_at >= todayStart);
      return {
        totalCash: all.reduce((s, r) => s + Number(r.cash_amount), 0),
        totalUpi: all.reduce((s, r) => s + Number(r.upi_amount), 0),
        todayCash: todaySales.reduce((s, r) => s + Number(r.cash_amount), 0),
        todayUpi: todaySales.reduce((s, r) => s + Number(r.upi_amount), 0),
      };
    },
    enabled: !!user,
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

  // For "See Balances" tab: fetch all staff sales and compute balances
  const { data: allStaffBalances } = useQuery({
    queryKey: ["all-staff-balances"],
    queryFn: async () => {
      // Get all staff user IDs
      const { data: roles } = await supabase.from("user_roles").select("user_id, role").neq("role", "customer").limit(200);
      const staffIds = (roles || []).map((r) => r.user_id);

      // Get all sales
      const { data: allSales } = await supabase.from("sales").select("recorded_by, cash_amount, upi_amount").limit(5000);

      // Get all handovers
      const { data: allHandovers } = await supabase.from("handovers").select("user_id, handed_to, cash_amount, upi_amount, status").limit(2000);

      const balances: Record<string, { sales: number; received: number; sentConfirmed: number; sentPending: number; total: number }> = {};

      for (const uid of staffIds) {
        const sales = (allSales || []).filter((s) => s.recorded_by === uid)
          .reduce((s, r) => s + Number(r.cash_amount) + Number(r.upi_amount), 0);
        const received = (allHandovers || []).filter((h) => h.handed_to === uid && h.status === "confirmed")
          .reduce((s, h) => s + Number(h.cash_amount) + Number(h.upi_amount), 0);
        const sentConfirmed = (allHandovers || []).filter((h) => h.user_id === uid && h.status === "confirmed")
          .reduce((s, h) => s + Number(h.cash_amount) + Number(h.upi_amount), 0);
        const sentPending = (allHandovers || []).filter((h) => h.user_id === uid && h.status === "awaiting_confirmation")
          .reduce((s, h) => s + Number(h.cash_amount) + Number(h.upi_amount), 0);
        const total = sales + received - sentConfirmed - sentPending;
        balances[uid] = { sales, received, sentConfirmed, sentPending, total };
      }
      return balances;
    },
    enabled: canSeeBalances,
  });

  const myHandovers = useMemo(() =>
    (handovers || []).filter((h) => h.user_id === user?.id || h.handed_to === user?.id),
    [handovers, user?.id]
  );

  const sentConfirmed = myHandovers
    .filter((h) => h.user_id === user?.id && h.status === "confirmed")
    .reduce((s, h) => s + Number(h.cash_amount) + Number(h.upi_amount), 0);
  const sentPending = myHandovers
    .filter((h) => h.user_id === user?.id && h.status === "awaiting_confirmation")
    .reduce((s, h) => s + Number(h.cash_amount) + Number(h.upi_amount), 0);
  const receivedConfirmed = myHandovers
    .filter((h) => h.handed_to === user?.id && h.status === "confirmed")
    .reduce((s, h) => s + Number(h.cash_amount) + Number(h.upi_amount), 0);

  const todayStart = startOfDay(new Date()).toISOString();
  const todayReceivedConfirmed = myHandovers
    .filter((h) => h.handed_to === user?.id && h.status === "confirmed" && h.created_at >= todayStart)
    .reduce((s, h) => s + Number(h.cash_amount) + Number(h.upi_amount), 0);

  const salesTotalAll = (userSalesTotals?.totalCash || 0) + (userSalesTotals?.totalUpi || 0);
  const salesToday = (userSalesTotals?.todayCash || 0) + (userSalesTotals?.todayUpi || 0);

  const notHandedOver = salesTotalAll + receivedConfirmed - sentConfirmed - sentPending;
  const awaitingAmount = sentPending;

  const breakdownSales = salesToday;
  const breakdownStaff = todayReceivedConfirmed;
  const breakdownPast = Math.max(0, notHandedOver - breakdownSales - breakdownStaff);

  const incoming = myHandovers.filter((h) => h.handed_to === user?.id && h.status === "awaiting_confirmation");

  // Fetch partial_collections setting
  const { data: partialSetting } = useQuery({
    queryKey: ["partial-collections-setting"],
    queryFn: async () => {
      const { data } = await supabase.from("company_settings").select("value").eq("key", "partial_collections").maybeSingle();
      return data?.value === "true";
    },
  });

  // Fetch expense categories
  const { data: expenseCategories = [] } = useQuery({
    queryKey: ["expense-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_categories")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch expense claims (own for staff, all for admin)
  const { data: expenseClaims = [], isLoading: expenseClaimsLoading } = useQuery({
    queryKey: ["expense-claims", user?.id, isAdminOrManager],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_claims")
        .select("*, expense_categories(id, name, color, icon)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
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

  const pendingExpenseClaimsForReview = useMemo(() => {
    return isAdminOrManager 
      ? (expenseClaims || []).filter((e: any) => e.status === "pending")
      : [];
  }, [expenseClaims, isAdminOrManager]);

  const handleCreate = async () => {
    if (!toUserId || !amount || Number(amount) <= 0) {
      toast.error("Select a recipient and enter a valid amount");
      return;
    }
    // If partial collections disabled, require exact full balance
    if (!partialSetting && !isFinalizer && Number(amount) < Math.max(0, notHandedOver)) {
      toast.error(`Partial handovers are disabled. Enter the full balance: ₹${Math.max(0, notHandedOver).toLocaleString()}`);
      return;
    }
    if (!isFinalizer && Number(amount) > Math.max(0, notHandedOver)) {
      toast.error("Amount exceeds your available balance");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("handovers").insert({
      user_id: user!.id,
      handed_to: toUserId,
      cash_amount: Number(amount),
      upi_amount: 0,
      status: "awaiting_confirmation",
      notes: notes || null,
    });
    setSubmitting(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Handover sent for confirmation");

      // Notify the recipient
      sendNotification({
        userId: toUserId,
        title: "Handover Received",
        message: `₹${Number(amount).toLocaleString()} handover awaiting your confirmation`,
        type: "handover",
        entityType: "handover",
      });

      setCreateOpen(false);
      setAmount("");
      setNotes("");
      setToUserId("");
      qc.invalidateQueries({ queryKey: ["handovers"] });
    }
  };

  const handleConfirm = async (id: string) => {
    if (actionLoading) return;
    const handover = myHandovers.find((h) => h.id === id);
    if (handover?.user_id === user?.id) {
      toast.error("You cannot confirm your own handover");
      return;
    }
    setActionLoading(id);
    const { error } = await supabase.from("handovers").update({
      status: "confirmed",
      confirmed_by: user!.id,
      confirmed_at: new Date().toISOString(),
    }).eq("id", id);
    setActionLoading(null);
    if (error) toast.error(error.message);
    else {
      toast.success("Handover confirmed");
      if (handover?.user_id) {
        sendNotification({
          userId: handover.user_id,
          title: "Handover Confirmed",
          message: `Your ₹${Number(handover.cash_amount).toLocaleString()} handover was confirmed`,
          type: "handover",
          entityType: "handover",
          entityId: id,
        });
      }
      qc.invalidateQueries({ queryKey: ["handovers"] });
    }
  };

  const handleReject = async (id: string) => {
    if (actionLoading) return;
    const handover = myHandovers.find((h) => h.id === id);
    setActionLoading(id);
    const { error } = await supabase.from("handovers").update({
      status: "rejected",
      rejected_at: new Date().toISOString(),
    }).eq("id", id);
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
    }
  };

  const handleCancel = async (id: string) => {
    if (actionLoading) return;
    const handover = myHandovers.find((h) => h.id === id);
    if (!handover || handover.user_id !== user?.id) {
      toast.error("You can only cancel your own pending handovers");
      return;
    }
    if (handover.status !== "awaiting_confirmation") {
      toast.error("Only pending handovers can be cancelled");
      return;
    }
    setActionLoading(id);
    const { error } = await supabase.from("handovers").update({
      status: "cancelled",
    }).eq("id", id);
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
      // Generate display ID
      const { data: displayId } = await supabase.rpc("generate_display_id", {
        prefix: "EXC",
        seq_name: "expense_claims_display_seq"
      });

      const { error } = await supabase.from("expense_claims").insert({
        display_id: displayId || `EXC-${Date.now()}`,
        user_id: user!.id,
        category_id: expenseCategory,
        original_category_id: expenseCategory,
        amount: Number(expenseAmount),
        expense_date: expenseDate,
        description: expenseDescription.trim(),
        receipt_url: expenseReceiptUrl,
        status: "pending",
      });

      if (error) throw error;

      toast.success("Expense claim submitted for approval");
      
      // Notify admins
      const adminIds = await getAdminUserIds();
      sendNotificationToMany({
        userIds: adminIds,
        title: "New Expense Claim",
        message: `₹${Number(expenseAmount).toLocaleString()} expense claim requires your review`,
        type: "expense",
        entityType: "expense_claim",
      });

      setExpenseOpen(false);
      setExpenseAmount("");
      setExpenseDescription("");
      setExpenseCategory("");
      setExpenseDate(new Date().toISOString().split("T")[0]);
      setExpenseReceiptUrl(null);
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
      const updates: any = {
        status: action === "approve" ? "approved" : "rejected",
        reviewed_by: user!.id,
        reviewed_at: new Date().toISOString(),
        reviewer_notes: reviewNotes.trim() || null,
      };

      // If approving with different category or amount
      if (action === "approve") {
        if (reviewCategory && reviewCategory !== reviewExpense.category_id) {
          updates.category_id = reviewCategory;
        }
        if (reviewAmount && Number(reviewAmount) !== Number(reviewExpense.amount)) {
          updates.approved_amount = Number(reviewAmount);
        } else {
          updates.approved_amount = Number(reviewExpense.amount);
        }
      }

      const { error } = await supabase
        .from("expense_claims")
        .update(updates)
        .eq("id", reviewExpense.id);

      if (error) throw error;

      toast.success(`Expense claim ${action === "approve" ? "approved" : "rejected"}`);
      
      // Notify the claimant
      sendNotification({
        userId: reviewExpense.user_id,
        title: `Expense Claim ${action === "approve" ? "Approved" : "Rejected"}`,
        message: action === "approve" 
          ? `Your ₹${Number(updates.approved_amount).toLocaleString()} expense claim was approved`
          : `Your ₹${Number(reviewExpense.amount).toLocaleString()} expense claim was rejected`,
        type: "expense",
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

  const getCategoryName = (categoryId: string | null) => {
    const cat = expenseCategories.find((c: any) => c.id === categoryId);
    return cat?.name || "Unknown Category";
  };

  const getCategoryColor = (categoryId: string | null) => {
    const cat = expenseCategories.find((c: any) => c.id === categoryId);
    return cat?.color || "#6b7280";
  };

  const getProfile = (userId: string | null) => profileMap?.[userId || ""] || { name: "Unknown", avatar: null };
  const getName = (userId: string | null) => getProfile(userId).name;
  const getInitials = (name: string) => name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  const UserAvatar = ({ userId, size = "sm" }: { userId: string | null; size?: "sm" | "md" | "lg" }) => {
    const p = getProfile(userId);
    const cls = size === "lg" ? "h-10 w-10" : size === "md" ? "h-9 w-9" : "h-7 w-7";
    const textCls = size === "lg" ? "text-sm" : size === "md" ? "text-xs" : "text-[10px]";
    return (
      <Avatar className={`${cls} ring-2 ring-background`}>
        <AvatarImage src={p.avatar || undefined} alt={p.name} />
        <AvatarFallback className={`bg-primary/10 text-primary font-semibold ${textCls}`}>
          {getInitials(p.name) || <User className="h-3 w-3" />}
        </AvatarFallback>
      </Avatar>
    );
  };

  const HandoverCard = ({ item, showActions = false }: { item: typeof myHandovers[0]; showActions?: boolean }) => {
    const isSender = item.user_id === user?.id;
    const isReceiver = item.handed_to === user?.id;
    const total = Number(item.cash_amount) + Number(item.upi_amount);
    const statusLabel = item.status === "confirmed" ? "Confirmed" 
      : item.status === "rejected" ? "Rejected" 
      : item.status === "cancelled" ? "Cancelled"
      : "Pending";
    const isLoading = actionLoading === item.id;
    const canCancel = isSender && item.status === "awaiting_confirmation";

    return (
      <div className={`group flex items-center gap-4 rounded-lg border bg-card px-4 py-3 hover:shadow-sm transition-shadow border-l-4 ${
        item.status === "confirmed" ? "border-l-green-500" :
        item.status === "rejected" ? "border-l-red-500" :
        item.status === "cancelled" ? "border-l-slate-400" :
        "border-l-orange-500"
      }`}>
        <div className="flex items-center -space-x-2.5 shrink-0">
          <UserAvatar userId={item.user_id} size="lg" />
          <UserAvatar userId={item.handed_to} size="lg" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-bold tabular-nums">₹{total.toLocaleString()}</span>
            <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${
              item.status === "confirmed" ? "bg-success/10 text-success" :
              item.status === "rejected" ? "bg-destructive/10 text-destructive" :
              item.status === "cancelled" ? "bg-muted text-muted-foreground" :
              "bg-warning/10 text-warning"
            }`}>{statusLabel}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {getName(item.user_id)} → {getName(item.handed_to)}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[11px] text-muted-foreground">
              {format(new Date(item.created_at), "dd MMM, hh:mm a")}
            </span>
            {isSender && (
              <span className="text-[10px] font-medium bg-primary/8 text-primary px-1.5 py-px rounded">Sent</span>
            )}
            {isReceiver && (
              <span className="text-[10px] font-medium bg-accent text-accent-foreground px-1.5 py-px rounded">Received</span>
            )}
          </div>
          {item.notes && (
            <p className="text-[11px] text-muted-foreground/70 italic mt-1 truncate">"{item.notes}"</p>
          )}
        </div>

        {showActions && (
          <div className="flex flex-col gap-1.5 shrink-0">
            <Button size="sm" className="h-7 text-xs gap-1 px-2.5" onClick={() => handleConfirm(item.id)} disabled={isLoading}>
              {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />} Accept
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 px-2.5 text-destructive hover:text-destructive" onClick={() => handleReject(item.id)} disabled={isLoading}>
              {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />} Reject
            </Button>
          </div>
        )}

        {canCancel && !showActions && (
          <Button 
            size="sm" 
            variant="ghost" 
            className="h-7 text-xs gap-1 px-2.5 text-muted-foreground hover:text-destructive shrink-0" 
            onClick={() => setCancelConfirmId(item.id)}
            disabled={isLoading}
          >
            {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />} Cancel
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
      : "Pending";
    const displayAmount = item.status === "approved" && item.approved_amount 
      ? Number(item.approved_amount) 
      : Number(item.amount);
    const wasAmountChanged = item.status === "approved" && item.approved_amount && Number(item.approved_amount) !== Number(item.amount);
    const wasCategoryChanged = item.status === "approved" && item.category_id !== item.original_category_id;

    return (
      <div className={`group flex items-center gap-4 rounded-lg border bg-card px-4 py-3 hover:shadow-sm transition-shadow border-l-4 ${
        item.status === "approved" ? "border-l-green-500" :
        item.status === "rejected" ? "border-l-red-500" :
        "border-l-orange-500"
      }`}>
        <div className="flex items-center justify-center h-10 w-10 rounded-lg shrink-0" style={{ backgroundColor: `${getCategoryColor(item.category_id)}20` }}>
          <Receipt className="h-5 w-5" style={{ color: getCategoryColor(item.category_id) }} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-bold tabular-nums">₹{displayAmount.toLocaleString()}</span>
            {wasAmountChanged && (
              <span className="text-[10px] text-muted-foreground line-through">₹{Number(item.amount).toLocaleString()}</span>
            )}
            <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${
              item.status === "approved" ? "bg-success/10 text-success" :
              item.status === "rejected" ? "bg-destructive/10 text-destructive" :
              "bg-warning/10 text-warning"
            }`}>{statusLabel}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate" title={item.description}>
            {item.description}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span 
              className="text-[10px] font-medium px-1.5 py-px rounded"
              style={{ backgroundColor: `${getCategoryColor(item.category_id)}20`, color: getCategoryColor(item.category_id) }}
            >
              {getCategoryName(item.category_id)}
              {wasCategoryChanged && " (changed)"}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {format(new Date(item.expense_date), "dd MMM yyyy")}
            </span>
            {!isOwner && (
              <span className="text-[10px] font-medium bg-primary/8 text-primary px-1.5 py-px rounded">
                by {getName(item.user_id)}
              </span>
            )}
          </div>
          {item.reviewer_notes && item.status !== "pending" && (
            <p className="text-[11px] text-muted-foreground/70 italic mt-1 truncate">Note: "{item.reviewer_notes}"</p>
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

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const balanceLabel = isFinalizer ? "Total Income" : "Not Handed Over";
  const balanceColor = isFinalizer ? "text-success" : "text-destructive";

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader
        title="Handovers"
        subtitle="Track money flow between team members"
        primaryAction={!isFinalizer ? { label: "Create Handover", icon: Send, onClick: () => setCreateOpen(true) } : undefined}
      />

      {/* Balance Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Popover>
          <PopoverTrigger asChild>
            <button className="stat-card text-left w-full cursor-pointer hover:ring-2 hover:ring-primary/20 transition-all group">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-muted-foreground">{balanceLabel}</span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <p className={`text-xl font-bold ${balanceColor}`}>₹{Math.max(0, notHandedOver - myApprovedExpenses).toLocaleString()}</p>
              {myApprovedExpenses > 0 && (
                <p className="text-[10px] text-success mt-0.5">₹{myApprovedExpenses.toLocaleString()} owed to you</p>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" align="start">
            <p className="text-xs font-semibold text-foreground mb-2.5">Balance Breakdown</p>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ShoppingCart className="h-3 w-3" /> Sales (Today)
                </span>
                <span className="text-xs font-semibold">₹{breakdownSales.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users className="h-3 w-3" /> Staff (Today)
                </span>
                <span className="text-xs font-semibold">₹{breakdownStaff.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" /> Carried Forward
                </span>
                <span className="text-xs font-semibold">₹{breakdownPast.toLocaleString()}</span>
              </div>
              {myApprovedExpenses > 0 && (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs text-success">
                    <Receipt className="h-3 w-3" /> Expenses Owed
                  </span>
                  <span className="text-xs font-semibold text-success">-₹{myApprovedExpenses.toLocaleString()}</span>
                </div>
              )}
              <div className="border-t pt-1.5 flex items-center justify-between">
                <span className="text-xs font-bold">Total</span>
                <span className="text-xs font-bold text-primary">₹{Math.max(0, notHandedOver - myApprovedExpenses).toLocaleString()}</span>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <div className="stat-card">
          <div className="mb-1">
            <span className="text-xs font-medium text-muted-foreground">Awaiting Confirmation</span>
          </div>
          <p className="text-xl font-bold text-warning">₹{awaitingAmount.toLocaleString()}</p>
        </div>
      </div>

      {/* Incoming requiring action */}
      {incoming.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-warning flex items-center gap-1.5 uppercase tracking-wide">
            <ArrowDownLeft className="h-3.5 w-3.5" /> Action Required ({incoming.length})
          </h3>
          <div className="space-y-2">
            {incoming.map((item) => (
              <HandoverCard key={item.id} item={item} showActions />
            ))}
          </div>
        </div>
      )}

      {/* Expense Claims requiring review (for admins) */}
      {isAdminOrManager && pendingExpenseClaimsForReview.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-warning flex items-center gap-1.5 uppercase tracking-wide">
            <Receipt className="h-3.5 w-3.5" /> Expense Claims to Review ({pendingExpenseClaimsForReview.length})
          </h3>
          <div className="space-y-2">
            {pendingExpenseClaimsForReview.slice(0, 3).map((item: any) => (
              <ExpenseClaimCard key={item.id} item={item} showReviewAction />
            ))}
            {pendingExpenseClaimsForReview.length > 3 && (
              <p className="text-xs text-muted-foreground text-center py-1">
                +{pendingExpenseClaimsForReview.length - 3} more in Expenses tab
              </p>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="mine" className="w-full">
        <TabsList className="w-full flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="mine" className="flex-1 gap-1.5 text-xs min-w-[80px]">
            <Banknote className="h-3.5 w-3.5" /> Handovers
          </TabsTrigger>
          {(canSubmitExpenses || isAdminOrManager) && (
            <TabsTrigger value="expenses" className="flex-1 gap-1.5 text-xs min-w-[80px]">
              <Receipt className="h-3.5 w-3.5" /> Expenses
              {myPendingExpenses > 0 && !isAdminOrManager && (
                <span className="ml-1 bg-warning/20 text-warning text-[10px] px-1 rounded">
                  {myExpenseClaims.filter((e: any) => e.status === "pending").length}
                </span>
              )}
            </TabsTrigger>
          )}
          {isAdminOrManager && (
            <TabsTrigger value="all" className="flex-1 gap-1.5 text-xs min-w-[80px]">
              <Users className="h-3.5 w-3.5" /> All
            </TabsTrigger>
          )}
          {canSeeBalances && (
            <TabsTrigger value="balances" className="flex-1 gap-1.5 text-xs min-w-[80px]">
              <Eye className="h-3.5 w-3.5" /> Balances
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="mine" className="space-y-4 mt-3">
          {myHandovers.filter(h => !(h.handed_to === user?.id && h.status === "awaiting_confirmation")).length === 0 ? (
            <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">No handovers yet.</div>
          ) : groupByDate(myHandovers.filter(h => !(h.handed_to === user?.id && h.status === "awaiting_confirmation"))).map(([date, items]) => (
            <div key={date} className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{formatDateGroup(date)}</span>
                <div className="flex-1 h-px bg-border" />
              </div>
              {items.map((item) => <HandoverCard key={item.id} item={item} />)}
            </div>
          ))}
        </TabsContent>

        {isAdminOrManager && (
          <TabsContent value="all" className="space-y-4 mt-3">
            {(handovers || []).length === 0 ? (
              <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">No handovers recorded.</div>
            ) : groupByDate(handovers || []).map(([date, items]) => (
              <div key={date} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{formatDateGroup(date)}</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                {items.map((item) => <HandoverCard key={item.id} item={item} />)}
              </div>
            ))}
          </TabsContent>
        )}

        {canSeeBalances && (
          <TabsContent value="balances" className="space-y-2 mt-3">
            {!allStaffBalances || Object.keys(allStaffBalances).length === 0 ? (
              <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">No staff balances to show.</div>
            ) : (
              <div className="space-y-2">
                {Object.entries(allStaffBalances)
                  .sort(([, a], [, b]) => b.total - a.total)
                  .map(([uid, bal]) => {
                    const withUser = bal.total + bal.sentPending; // awaiting is still "with" the user
                    return (
                      <div key={uid} className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
                        <UserAvatar userId={uid} size="lg" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{getName(uid)}</p>
                          <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                            <span>Sales: ₹{bal.sales.toLocaleString()}</span>
                            <span>Received: ₹{bal.received.toLocaleString()}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-base font-bold tabular-nums ${withUser > 0 ? "text-destructive" : "text-success"}`}>
                            ₹{Math.max(0, withUser).toLocaleString()}
                          </p>
                          {bal.sentPending > 0 && (
                            <p className="text-[10px] text-warning">₹{bal.sentPending.toLocaleString()} awaiting</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </TabsContent>
        )}

        {/* Expenses Tab */}
        {(canSubmitExpenses || isAdminOrManager) && (
          <TabsContent value="expenses" className="space-y-4 mt-3">
            {/* Add Expense Button for users with permission or admins */}
            {(canSubmitExpenses || isAdminOrManager) && (
              <Button 
                onClick={() => setExpenseOpen(true)} 
                className="w-full gap-2"
                variant="outline"
              >
                <Receipt className="h-4 w-4" /> Submit Expense Claim
              </Button>
            )}

            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="stat-card">
                <span className="text-xs font-medium text-muted-foreground">Pending Claims</span>
                <p className="text-xl font-bold text-warning">₹{myPendingExpenses.toLocaleString()}</p>
              </div>
              <div className="stat-card">
                <span className="text-xs font-medium text-muted-foreground">Approved (Owed)</span>
                <p className="text-xl font-bold text-success">₹{myApprovedExpenses.toLocaleString()}</p>
              </div>
            </div>

            {/* Expense Claims List */}
            {expenseClaimsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (isAdminOrManager ? expenseClaims : myExpenseClaims).length === 0 ? (
              <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
                {canSubmitExpenses 
                  ? "No expense claims yet. Submit your first claim above."
                  : "No expense claims to show."}
              </div>
            ) : (
              <div className="space-y-2">
                {(isAdminOrManager ? expenseClaims : myExpenseClaims).map((item: any) => (
                  <ExpenseClaimCard 
                    key={item.id} 
                    item={item} 
                    showReviewAction={isAdminOrManager} 
                  />
                ))}
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* Create Handover Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Handover</DialogTitle>
            <DialogDescription>Send money to another team member for confirmation.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-primary/5 p-3 text-center">
              <p className="text-xs text-muted-foreground">Available Balance</p>
              <p className="text-2xl font-bold text-primary">₹{Math.max(0, notHandedOver).toLocaleString()}</p>
            </div>
            <div className="space-y-2">
              <Label>Send To</Label>
              <Select value={toUserId} onValueChange={setToUserId}>
                <SelectTrigger><SelectValue placeholder="Select staff member" /></SelectTrigger>
                <SelectContent>
                  {(staffProfiles || []).map((p) => {
                    const detail = p.phone || p.email || "No contact";
                    return (
                      <SelectItem key={p.user_id} value={p.user_id}>
                        <div className="flex w-full items-center justify-between gap-3">
                          <span className="font-medium">{p.full_name}</span>
                          <span className="text-xs text-muted-foreground">{p.roleLabel}</span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{detail}</p>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Amount (₹)</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Enter amount" min="1" />
              {partialSetting === false && !isFinalizer && (
                <p className="text-xs text-warning flex items-center gap-1">
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  Partial handovers are disabled — full balance of ₹{Math.max(0, notHandedOver).toLocaleString()} required
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add any notes..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              Send Handover
            </Button>
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
            <Button variant="outline" onClick={() => setCancelConfirmId(null)}>
              Keep it
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => cancelConfirmId && handleCancel(cancelConfirmId)}
              disabled={!!actionLoading}
            >
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
                <SelectTrigger>
                  <SelectValue placeholder="Select expense category" />
                </SelectTrigger>
                <SelectContent>
                  {expenseCategories.map((cat: any) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      <div className="flex items-center gap-2">
                        <div 
                          className="h-2.5 w-2.5 rounded-full" 
                          style={{ backgroundColor: cat.color || "#6b7280" }} 
                        />
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
                <Input 
                  type="number" 
                  value={expenseAmount} 
                  onChange={(e) => setExpenseAmount(e.target.value)} 
                  placeholder="0.00" 
                  min="1" 
                />
              </div>
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input 
                  type="date" 
                  value={expenseDate} 
                  onChange={(e) => setExpenseDate(e.target.value)} 
                  max={new Date().toISOString().split("T")[0]}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description *</Label>
              <Textarea 
                value={expenseDescription} 
                onChange={(e) => setExpenseDescription(e.target.value)} 
                placeholder="What was this expense for? (e.g., Taxi fare for customer visit, Office supplies purchase)"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Image className="h-4 w-4" />
                Receipt Photo (Optional)
              </Label>
              <p className="text-xs text-muted-foreground">
                Upload a photo of the receipt or bill for faster approval
              </p>
              <ImageUpload
                folder="expense-receipts"
                currentUrl={expenseReceiptUrl}
                onUploaded={(url) => setExpenseReceiptUrl(url)}
                onRemoved={() => setExpenseReceiptUrl(null)}
                size="lg"
              />
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
              {/* Claim Details */}
              <div className="rounded-lg bg-muted/50 p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Submitted by</span>
                  <span className="text-sm font-medium">{getName(reviewExpense.user_id)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Original Amount</span>
                  <span className="text-sm font-bold">₹{Number(reviewExpense.amount).toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Expense Date</span>
                  <span className="text-sm">{format(new Date(reviewExpense.expense_date), "dd MMM yyyy")}</span>
                </div>
                <div className="pt-1 border-t">
                  <span className="text-xs text-muted-foreground">Description</span>
                  <p className="text-sm mt-0.5">{reviewExpense.description}</p>
                </div>
                {/* Receipt Image */}
                {reviewExpense.receipt_url && (
                  <div className="pt-2 border-t">
                    <span className="text-xs text-muted-foreground">Receipt</span>
                    <a
                      href={reviewExpense.receipt_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block mt-1"
                    >
                      <img
                        src={reviewExpense.receipt_url}
                        alt="Receipt"
                        className="max-h-40 rounded-md border cursor-pointer hover:opacity-90 transition-opacity"
                      />
                      <span className="text-xs text-primary mt-1 inline-flex items-center gap-1">
                        <Eye className="h-3 w-3" /> Click to view full size
                      </span>
                    </a>
                  </div>
                )}
              </div>

              {/* Adjustable Fields */}
              <div className="space-y-2">
                <Label>Category (can change for accounting)</Label>
                <Select value={reviewCategory} onValueChange={setReviewCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {expenseCategories.map((cat: any) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        <div className="flex items-center gap-2">
                          <div 
                            className="h-2.5 w-2.5 rounded-full" 
                            style={{ backgroundColor: cat.color || "#6b7280" }} 
                          />
                          {cat.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Approved Amount (₹)</Label>
                <Input 
                  type="number" 
                  value={reviewAmount} 
                  onChange={(e) => setReviewAmount(e.target.value)} 
                  placeholder="0.00" 
                  min="0"
                />
                {reviewAmount && Number(reviewAmount) !== Number(reviewExpense.amount) && (
                  <p className="text-xs text-warning flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Amount differs from original claim (₹{Number(reviewExpense.amount).toLocaleString()})
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Notes (optional)</Label>
                <Textarea 
                  value={reviewNotes} 
                  onChange={(e) => setReviewNotes(e.target.value)} 
                  placeholder="Add notes for the claimant (e.g., reason for adjustment or rejection)"
                  rows={2}
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button 
              variant="ghost" 
              onClick={() => setReviewExpense(null)}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => handleReviewExpenseClaim("reject")}
              disabled={!!actionLoading}
            >
              {actionLoading === reviewExpense?.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <XCircle className="h-4 w-4 mr-2" />}
              Reject
            </Button>
            <Button 
              onClick={() => handleReviewExpenseClaim("approve")}
              disabled={!!actionLoading || !reviewAmount || Number(reviewAmount) <= 0}
            >
              {actionLoading === reviewExpense?.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Handovers;
