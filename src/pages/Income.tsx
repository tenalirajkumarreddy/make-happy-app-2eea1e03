/**
 * Income Page
 * Track all income sources: Collections, Direct Payments, Other Income
 * Prime Manager functionality - daily reset and collections tracking
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermission } from "@/hooks/usePermission";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { format, startOfDay, endOfDay, subDays } from "date-fns";
import {
  Wallet,
  TrendingUp,
  Users,
  Building2,
  Calendar,
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
  RefreshCw,
  DollarSign,
  Receipt,
  HandCoins,
  PiggyBank,
  Clock,
  CheckCircle,
  AlertCircle,
  Download,
  Filter,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

// Income categories
const INCOME_CATEGORIES = [
  { value: "rent", label: "Rent Received", icon: Building2, color: "text-blue-600 dark:text-blue-400" },
  { value: "interest", label: "Interest Income", icon: PiggyBank, color: "text-green-600 dark:text-green-400" },
  { value: "refund", label: "Refunds", icon: ArrowDownLeft, color: "text-purple-600 dark:text-purple-400" },
  { value: "lending", label: "Money Lent", icon: HandCoins, color: "text-amber-600 dark:text-amber-400" },
  { value: "misc", label: "Miscellaneous", icon: DollarSign, color: "text-slate-600 dark:text-slate-400" },
];

interface IncomeEntry {
  id: string;
  entry_type: "collection" | "direct_payment" | "other_income" | "opening_balance";
  source_type: "sale" | "handover" | "direct" | "adjustment" | "opening";
  source_id: string | null;
  cash_amount: number;
  upi_amount: number;
  total_amount: number;
  category: string | null;
  subcategory: string | null;
  recorded_by: string;
  recorder_name?: string;
  warehouse_id: string;
  warehouse_name?: string;
  notes: string | null;
  receipt_url: string | null;
  created_at: string;
}

export function Income() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = role === "super_admin";
  const isManager = role === "manager";
  const isPrimeManager = usePermission("finalizer").allowed;

  const [activeTab, setActiveTab] = useState("collections");
  const [dateFilter, setDateFilter] = useState("today");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Dialog states
  const [showOtherIncome, setShowOtherIncome] = useState(false);
  const [showDirectPayment, setShowDirectPayment] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Form states
  const [incomeAmount, setIncomeAmount] = useState("");
  const [incomeCategory, setIncomeCategory] = useState("");
  const [incomeNotes, setIncomeNotes] = useState("");
  const [paymentCash, setPaymentCash] = useState("");
  const [paymentUPI, setPaymentUPI] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentFrom, setPaymentFrom] = useState("");

  // Fetch income entries
  const { data: incomeData, isLoading } = useQuery({
    queryKey: ["income-entries", dateFilter, categoryFilter],
    queryFn: async () => {
      let dateRange: { from: Date; to: Date };

      const now = new Date();
      switch (dateFilter) {
        case "today":
          dateRange = { from: startOfDay(now), to: endOfDay(now) };
          break;
        case "yesterday":
          const yesterday = subDays(now, 1);
          dateRange = { from: startOfDay(yesterday), to: endOfDay(yesterday) };
          break;
        case "week":
          dateRange = { from: subDays(now, 7), to: now };
          break;
        case "month":
          dateRange = { from: subDays(now, 30), to: now };
          break;
        default:
          dateRange = { from: startOfDay(now), to: endOfDay(now) };
      }

      // Get income entries
      const { data: entries, error } = await supabase
        .from("income_entries")
        .select(`
          *,
          recorder:profiles!recorded_by(full_name),
          warehouse:warehouses!warehouse_id(name)
        `)
        .gte("created_at", dateRange.from.toISOString())
        .lte("created_at", dateRange.to.toISOString())
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Get handover summaries for collections
      let handovers: any[] = [];
      try {
        const { data, error } = await supabase
          .from("handovers")
          .select(`
            id, cash_amount, upi_amount, status, handover_date, confirmed_at, created_at, user_id, handed_to
          `)
          .eq("status", "completed")
          .gte("handover_date", dateRange.from.toISOString().split('T')[0])
          .lte("handover_date", dateRange.to.toISOString().split('T')[0]);
        
        if (!error) {
          handovers = data || [];
        }
      } catch (e) {
        // Handovers table might not exist or be empty
        handovers = [];
      }

      // Get sales for collections
      const { data: sales } = await supabase
        .from("sales")
        .select("id, total_amount, cash_amount, upi_amount, created_at, display_id")
        .gte("created_at", dateRange.from.toISOString())
        .lte("created_at", dateRange.to.toISOString());

      return {
        entries: (entries || []).map((e: any) => ({
          ...e,
          recorder_name: e.recorder?.full_name,
          warehouse_name: e.warehouse?.name,
        })),
        handovers: handovers || [],
        sales: sales || [],
      };
    },
  });

  // Get prime manager cash account
  const { data: primeAccount } = useQuery({
    queryKey: ["prime-manager-account", user?.id],
    queryFn: async () => {
      if (!isPrimeManager) return null;

      const { data, error } = await supabase
        .from("staff_cash_accounts")
        .select("*")
        .eq("user_id", user?.id)
        .eq("account_type", "prime_manager")
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: isPrimeManager,
  });

  // Staff cash accounts (for Prime Manager view)
  const { data: staffCashAccounts = [] } = useQuery({
    queryKey: ["staff-cash-accounts", isPrimeManager],
    queryFn: async () => {
      if (!isPrimeManager) return [];
      
      const { data, error } = await supabase
        .from("staff_cash_accounts")
        .select(`
          user_id,
          cash_amount,
          upi_amount,
          account_type,
          last_reset_at,
          profiles(full_name),
          user_roles(role),
          warehouses(name)
        `)
        .in("account_type", ["manager", "agent", "pos", "operator", "prime_manager"])
        .order("account_type", { ascending: true });
      
      if (error) throw error;
      
      // Transform the data to flatten the nested objects
      return (data || []).map((item: any) => ({
        user_id: item.user_id,
        cash_amount: parseFloat(item.cash_amount || 0),
        upi_amount: parseFloat(item.upi_amount || 0),
        account_type: item.account_type,
        last_reset_at: item.last_reset_at,
        full_name: item.profiles?.full_name || "Unknown",
        role: item.user_roles?.role || item.account_type,
        warehouse_name: item.warehouses?.name,
      }));
    },
    enabled: isPrimeManager,
  });

  // Calculate stats
  const stats = {
    totalCollections: incomeData?.entries
      .filter((e: IncomeEntry) => e.entry_type === "collection")
      .reduce((s: number, e: IncomeEntry) => s + (e.total_amount || 0), 0) || 0,
    totalDirect: incomeData?.entries
      .filter((e: IncomeEntry) => e.entry_type === "direct_payment")
      .reduce((s: number, e: IncomeEntry) => s + (e.total_amount || 0), 0) || 0,
    totalOther: incomeData?.entries
      .filter((e: IncomeEntry) => e.entry_type === "other_income")
      .reduce((s: number, e: IncomeEntry) => s + (e.total_amount || 0), 0) || 0,
    totalCash: incomeData?.entries.reduce(
      (s: number, e: IncomeEntry) => s + (e.cash_amount || 0),
      0
    ) || 0,
    totalUPI: incomeData?.entries.reduce(
      (s: number, e: IncomeEntry) => s + (e.upi_amount || 0),
      0
    ) || 0,
  };

  const totalIncome = stats.totalCollections + stats.totalDirect + stats.totalOther;

  // Handle daily reset (Prime Manager)
  const handleDailyReset = async () => {
    if (!isPrimeManager || !user?.id) return;

    try {
      const totalAmount = (primeAccount?.cash_amount || 0) + (primeAccount?.upi_amount || 0);

      // Create income entry for daily reset
      const { error: incomeError } = await supabase.from("income_entries").insert({
        entry_type: "opening_balance",
        source_type: "opening",
        cash_amount: primeAccount?.cash_amount || 0,
        upi_amount: primeAccount?.upi_amount || 0,
        total_amount: totalAmount,
        recorded_by: user.id,
        warehouse_id: primeAccount?.warehouse_id,
        notes: `Daily reset - ${format(new Date(), "MMM d, yyyy")}`,
      });

      if (incomeError) throw incomeError;

      // Reset prime manager account
      const { error: resetError } = await supabase
        .from("staff_cash_accounts")
        .update({
          cash_amount: 0,
          upi_amount: 0,
          last_reset_at: new Date().toISOString(),
          reset_amount: totalAmount,
        })
        .eq("user_id", user.id)
        .eq("account_type", "prime_manager");

      if (resetError) throw resetError;

      toast.success(`Daily reset complete! ₹${totalAmount.toLocaleString("en-IN")} recorded as income`);
      queryClient.invalidateQueries({ queryKey: ["prime-manager-account"] });
      queryClient.invalidateQueries({ queryKey: ["income-entries"] });
      setShowResetConfirm(false);
    } catch (error) {
      toast.error("Failed to perform daily reset");
    }
  };

  // Record other income
  const handleRecordIncome = async () => {
    if (!incomeAmount || !incomeCategory) {
      toast.error("Please fill all required fields");
      return;
    }

    try {
      const { error } = await supabase.from("income_entries").insert({
        entry_type: "other_income",
        source_type: "direct",
        cash_amount: parseFloat(incomeAmount),
        upi_amount: 0,
        total_amount: parseFloat(incomeAmount),
        category: incomeCategory,
        recorded_by: user?.id,
        warehouse_id: primeAccount?.warehouse_id,
        notes: incomeNotes,
      });

      if (error) throw error;

      toast.success("Income recorded successfully");
      setShowOtherIncome(false);
      setIncomeAmount("");
      setIncomeCategory("");
      setIncomeNotes("");
      queryClient.invalidateQueries({ queryKey: ["income-entries"] });
    } catch (error) {
      toast.error("Failed to record income");
    }
  };

  // Record direct payment
  const handleRecordPayment = async () => {
    const cash = parseFloat(paymentCash) || 0;
    const upi = parseFloat(paymentUPI) || 0;

    if (cash + upi <= 0) {
      toast.error("Please enter payment amount");
      return;
    }

    try {
      const { error } = await supabase.from("income_entries").insert({
        entry_type: "direct_payment",
        source_type: "direct",
        cash_amount: cash,
        upi_amount: upi,
        total_amount: cash + upi,
        recorded_by: user?.id,
        warehouse_id: primeAccount?.warehouse_id,
        notes: `${paymentNotes}${paymentFrom ? ` - From: ${paymentFrom}` : ""}`,
      });

      if (error) throw error;

      toast.success("Payment recorded");
      setShowDirectPayment(false);
      setPaymentCash("");
      setPaymentUPI("");
      setPaymentNotes("");
      setPaymentFrom("");
      queryClient.invalidateQueries({ queryKey: ["income-entries"] });
    } catch (error) {
      toast.error("Failed to record payment");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Income" subtitle="Track all income sources" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Income Management"
        subtitle={`${format(new Date(), "MMMM d, yyyy")} • ₹${totalIncome.toLocaleString("en-IN")} total income`}
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Collections</p>
                <p className="text-2xl font-bold text-green-600">
                  ₹{stats.totalCollections.toLocaleString("en-IN")}
                </p>
              </div>
              <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                <Wallet className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Direct Payments</p>
                <p className="text-2xl font-bold text-blue-600">
                  ₹{stats.totalDirect.toLocaleString("en-IN")}
                </p>
              </div>
              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Other Income</p>
                <p className="text-2xl font-bold text-amber-600">
                  ₹{stats.totalOther.toLocaleString("en-IN")}
                </p>
              </div>
              <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Income</p>
                <p className="text-2xl font-bold text-primary">
                  ₹{totalIncome.toLocaleString("en-IN")}
                </p>
              </div>
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Receipt className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Prime Manager Alert */}
      {isPrimeManager && primeAccount && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center">
                  <HandCoins className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-semibold">Prime Manager Account</h3>
                  <p className="text-sm text-muted-foreground">
                    Current holding: ₹
                    {((primeAccount.cash_amount || 0) + (primeAccount.upi_amount || 0)).toLocaleString("en-IN")}
                  </p>
                </div>
              </div>
              <Button
                variant="default"
                className="bg-amber-600 hover:bg-amber-700"
                onClick={() => setShowResetConfirm(true)}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Daily Reset
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Staff Cash Accounts - Only for Prime Manager */}
      {isPrimeManager && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5" />
              Staff Cash Holdings
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 pt-0">
            {staffCashAccounts.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">No staff cash accounts found</p>
            ) : (
              <div className="space-y-3">
                {staffCashAccounts.map((staff: any) => (
                  <div
                    key={staff.user_id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                          {staff.full_name?.charAt(0)?.toUpperCase() || "U"}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{staff.full_name}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline" className="text-xs">
                            {staff.role}
                          </Badge>
                          {staff.warehouse_name && (
                            <span>• {staff.warehouse_name}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">
                        ₹{((staff.cash_amount || 0) + (staff.upi_amount || 0)).toLocaleString("en-IN")}
                      </p>
<div className="flex gap-2 text-xs text-muted-foreground">
                          {(staff.cash_amount || 0) > 0 && (
                            <span className="text-green-600 dark:text-green-400">
                              ₹{(staff.cash_amount || 0).toLocaleString("en-IN")} C
                            </span>
                          )}
                          {(staff.upi_amount || 0) > 0 && (
                            <span className="text-blue-600 dark:text-blue-400">
                              ₹{(staff.upi_amount || 0).toLocaleString("en-IN")} U
                            </span>
                          )}
                        </div>
                    </div>
                  </div>
                ))}
                
                {/* Total Staff Holdings */}
                <Separator />
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-3">
<div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                          <Wallet className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <p className="font-semibold">Total Staff Holdings</p>
                      <p className="text-xs text-muted-foreground">
                        {staffCashAccounts.length} staff members
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold">
                      ₹{staffCashAccounts.reduce((sum: number, s: any) => 
                        sum + (s.cash_amount || 0) + (s.upi_amount || 0), 0
                      ).toLocaleString("en-IN")}
                    </p>
                    <div className="flex gap-2 text-xs text-muted-foreground">
                      <span className="text-green-600">
                        ₹{staffCashAccounts.reduce((sum: number, s: any) => sum + (s.cash_amount || 0), 0).toLocaleString("en-IN")} Cash
                      </span>
                      <span className="text-blue-600">
                        ₹{staffCashAccounts.reduce((sum: number, s: any) => sum + (s.upi_amount || 0), 0).toLocaleString("en-IN")} UPI
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search entries..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="w-[140px]">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="yesterday">Yesterday</SelectItem>
              <SelectItem value="week">Last 7 Days</SelectItem>
              <SelectItem value="month">Last 30 Days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => setShowDirectPayment(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Direct Payment
          </Button>
          <Button onClick={() => setShowOtherIncome(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Other Income
          </Button>
        </div>
      </div>

      {/* Income Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
<TabsList className="w-full">
            <TabsTrigger value="collections" className="flex-1">
              <Wallet className="h-4 w-4 mr-2" />
              Collections
              <Badge variant="secondary" className="ml-2">
                {incomeData?.entries.filter((e: IncomeEntry) => e.entry_type === "collection").length || 0}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="direct" className="flex-1">
              <DollarSign className="h-4 w-4 mr-2" />
              Direct
              <Badge variant="secondary" className="ml-2">
                {incomeData?.entries.filter((e: IncomeEntry) => e.entry_type === "direct_payment").length || 0}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="other" className="flex-1">
              <TrendingUp className="h-4 w-4 mr-2" />
              Other
              <Badge variant="secondary" className="ml-2">
                {incomeData?.entries.filter((e: IncomeEntry) => e.entry_type === "other_income").length || 0}
              </Badge>
            </TabsTrigger>
            {isPrimeManager && (
              <TabsTrigger value="staff" className="flex-1">
                <Users className="h-4 w-4 mr-2" />
                Staff
                <Badge variant="secondary" className="ml-2">
                  {staffCashAccounts.length}
                </Badge>
              </TabsTrigger>
            )}
          </TabsList>

        {/* Collections Tab */}
        <TabsContent value="collections" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                Collections from Sales & Handovers
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-0">
              {incomeData?.entries.filter((e: IncomeEntry) => e.entry_type === "collection")
                .length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No collections recorded</p>
              ) : (
                <div className="space-y-4">
                  {incomeData?.entries
                    .filter((e: IncomeEntry) => e.entry_type === "collection")
                    .map((entry: IncomeEntry) => (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between p-4 rounded-lg border hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                            <Wallet className="h-5 w-5 text-green-600" />
                          </div>
                          <div>
                            <p className="font-medium">
                              {entry.source_type === "handover"
                                ? "Handover"
                                : entry.source_type === "sale"
                                ? "Sale"
                                : "Collection"}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {format(new Date(entry.created_at), "MMM d, h:mm a")} • {entry.warehouse_name}
                            </p>
                            {entry.notes && (
                              <p className="text-sm text-muted-foreground mt-1">{entry.notes}</p>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-semibold">
                            ₹{entry.total_amount.toLocaleString("en-IN")}
                          </p>
                          <div className="flex gap-2 text-xs text-muted-foreground">
                            {entry.cash_amount > 0 && (
                              <span className="text-green-600">
                                ₹{entry.cash_amount.toLocaleString("en-IN")} Cash
                              </span>
                            )}
                            {entry.upi_amount > 0 && (
                              <span className="text-blue-600">
                                ₹{entry.upi_amount.toLocaleString("en-IN")} UPI
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
</Card>
      </TabsContent>

      {/* Staff Cash Accounts Tab (Prime Manager Only) */}
      {isPrimeManager && (
        <TabsContent value="staff" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5" />
                Staff Cash Holdings
              </CardTitle>
              <CardDescription>
                View all staff cash accounts and initiate handover confirmations
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 pt-0">
              {staffCashAccounts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No staff cash accounts found</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <Card className="bg-blue-50/50">
                      <CardContent className="p-4">
                        <p className="text-sm text-muted-foreground">Total Staff</p>
                        <p className="text-2xl font-bold">{staffCashAccounts.length}</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-green-50/50">
                      <CardContent className="p-4">
                        <p className="text-sm text-muted-foreground">Total Cash</p>
                        <p className="text-2xl font-bold">
                          ₹{staffCashAccounts.reduce((sum: number, s: any) => sum + (s.cash_amount || 0), 0).toLocaleString("en-IN")}
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="bg-blue-50/50">
                      <CardContent className="p-4">
                        <p className="text-sm text-muted-foreground">Total UPI</p>
                        <p className="text-2xl font-bold">
                          ₹{staffCashAccounts.reduce((sum: number, s: any) => sum + (s.upi_amount || 0), 0).toLocaleString("en-IN")}
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="bg-amber-50/50">
                      <CardContent className="p-4">
                        <p className="text-sm text-muted-foreground">Total Holdings</p>
                        <p className="text-2xl font-bold">
                          ₹{staffCashAccounts.reduce((sum: number, s: any) => sum + (s.cash_amount || 0) + (s.upi_amount || 0), 0).toLocaleString("en-IN")}
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Staff List */}
                  <div className="space-y-3">
                    {staffCashAccounts
                      .sort((a: any, b: any) => {
                        const totalA = (a.cash_amount || 0) + (a.upi_amount || 0);
                        const totalB = (b.cash_amount || 0) + (b.upi_amount || 0);
                        return totalB - totalA;
                      })
                      .map((staff: any) => {
                        const totalHolding = (staff.cash_amount || 0) + (staff.upi_amount || 0);
                        const hasHoldings = totalHolding > 0;
                        
                        return (
                          <div
                            key={staff.user_id}
                            className={cn(
                              "flex items-center justify-between p-4 rounded-lg border transition-colors",
                              hasHoldings ? "bg-amber-50/30 border-amber-200" : "hover:bg-slate-50"
                            )}
                          >
                            <div className="flex items-center gap-4">
                              <Avatar className="h-12 w-12">
                                <AvatarFallback className={cn(
                                  "text-sm font-semibold",
                                  staff.account_type === "prime_manager" ? "bg-amber-100 text-amber-700" : "bg-primary/10 text-primary"
                                )}>
                                  {staff.full_name?.charAt(0)?.toUpperCase() || "U"}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-semibold flex items-center gap-2">
                                  {staff.full_name}
                                  {staff.account_type === "prime_manager" && (
                                    <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                                      Prime Manager
                                    </Badge>
                                  )}
                                </p>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <Badge variant="outline" className="text-xs capitalize">
                                    {staff.role}
                                  </Badge>
                                  {staff.warehouse_name && (
                                    <span>• {staff.warehouse_name}</span>
                                  )}
                                  {staff.last_reset_at && (
                                    <span className="text-xs">
                                      • Last reset: {format(new Date(staff.last_reset_at), "MMM d")}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className={cn(
                                "text-lg font-bold",
                                hasHoldings ? "text-amber-700" : "text-muted-foreground"
                              )}>
                                ₹{totalHolding.toLocaleString("en-IN")}
                              </p>
                              <div className="flex gap-2 text-xs justify-end">
                                {(staff.cash_amount || 0) > 0 && (
                                  <span className="text-green-600">
                                    ₹{(staff.cash_amount || 0).toLocaleString("en-IN")} C
                                  </span>
                                )}
                                {(staff.upi_amount || 0) > 0 && (
                                  <span className="text-blue-600">
                                    ₹{(staff.upi_amount || 0).toLocaleString("en-IN")} U
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </CardContent>
</Card>
      </TabsContent>
      )}
      </Tabs>

      {/* Daily Reset Confirmation Dialog */}
      <Dialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Daily Reset - Prime Manager</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
              <p className="text-sm text-amber-800 mb-2">
                This will reset your cash holdings to zero and record:
              </p>
              <div className="space-y-1">
                <p className="font-medium">
                  Cash: ₹{(primeAccount?.cash_amount || 0).toLocaleString("en-IN")}
                </p>
                <p className="font-medium">
                  UPI: ₹{(primeAccount?.upi_amount || 0).toLocaleString("en-IN")}
                </p>
                <Separator className="my-2" />
                <p className="text-lg font-bold text-amber-700">
                  Total: ₹{((primeAccount?.cash_amount || 0) + (primeAccount?.upi_amount || 0)).toLocaleString("en-IN")}
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-4">
              This action cannot be undone. The amount will be recorded as today's income.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetConfirm(false)}>
              Cancel
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700"
              onClick={handleDailyReset}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Confirm Reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Other Income Dialog */}
      <Dialog open={showOtherIncome} onOpenChange={setShowOtherIncome}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Other Income</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Category *</Label>
              <Select value={incomeCategory} onValueChange={setIncomeCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {INCOME_CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      <div className="flex items-center gap-2">
                        <cat.icon className={cn("h-4 w-4", cat.color)} />
                        {cat.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Amount (₹) *</Label>
              <Input
                type="number"
                placeholder="0.00"
                value={incomeAmount}
                onChange={(e) => setIncomeAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input
                placeholder="Optional description..."
                value={incomeNotes}
                onChange={(e) => setIncomeNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOtherIncome(false)}>
              Cancel
            </Button>
            <Button onClick={handleRecordIncome}>Record Income</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Direct Payment Dialog */}
      <Dialog open={showDirectPayment} onOpenChange={setShowDirectPayment}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Direct Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cash Amount (₹)</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={paymentCash}
                  onChange={(e) => setPaymentCash(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>UPI Amount (₹)</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={paymentUPI}
                  onChange={(e) => setPaymentUPI(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>From (Optional)</Label>
              <Input
                placeholder="Customer name or source..."
                value={paymentFrom}
                onChange={(e) => setPaymentFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input
                placeholder="Optional notes..."
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDirectPayment(false)}>
              Cancel
            </Button>
            <Button onClick={handleRecordPayment}>Record Payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default Income;
