import { useState, useMemo } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useFixedCostReminders } from "@/hooks/useFixedCostReminders";
import { 
  Loader2, Receipt, Calendar, TrendingUp, AlertCircle, 
  Users, Truck, Zap, Car, Megaphone, Briefcase, Wrench, MoreHorizontal,
  CheckCircle2, CreditCard, FolderOpen, Tag, Plus
} from "lucide-react";
import { toast } from "sonner";
import { logActivity } from "@/lib/activityLogger";

// Icon map for categories
const categoryIcons: Record<string, any> = {
  'users': Users,
  'truck': Truck,
  'calendar': Calendar,
  'zap': Zap,
  'car': Car,
  'megaphone': Megaphone,
  'briefcase': Briefcase,
  'wrench': Wrench,
  'more-horizontal': MoreHorizontal,
  'receipt': Receipt,
};

const Expenses = () => {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const isAdmin = role === "super_admin" || role === "manager";

  // Check and send fixed cost reminders
  useFixedCostReminders();

  // Dialog states
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [showAddFixedCost, setShowAddFixedCost] = useState(false);
  const [showPayFixedCost, setShowPayFixedCost] = useState(false);
  const [showFixedCostsSheet, setShowFixedCostsSheet] = useState(false);
  const [selectedFixedCost, setSelectedFixedCost] = useState<any>(null);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string | null>(null);

  // Expense form state
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentReference, setPaymentReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Category form state
  const [catName, setCatName] = useState("");
  const [catDescription, setCatDescription] = useState("");
  const [catColor, setCatColor] = useState("#6366f1");

  // Fixed cost form state
  const [fcName, setFcName] = useState("");
  const [fcDescription, setFcDescription] = useState("");
  const [fcAmount, setFcAmount] = useState("");
  const [fcFrequency, setFcFrequency] = useState("monthly");
  const [fcDueDay, setFcDueDay] = useState("1");
  const [fcReminderDays, setFcReminderDays] = useState("3");
  const [fcVendorName, setFcVendorName] = useState("");

  // Fixed cost payment form
  const [fcPayAmount, setFcPayAmount] = useState("");
  const [fcPayDate, setFcPayDate] = useState(new Date().toISOString().split("T")[0]);
  const [fcPayMethod, setFcPayMethod] = useState("bank_transfer");
  const [fcPayReference, setFcPayReference] = useState("");
  const [fcPayNotes, setFcPayNotes] = useState("");

  // Date filter
  const [dateRange, setDateRange] = useState("month");

  // Fetch categories
  const { data: categories = [] } = useQuery({
    queryKey: ["expense-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_categories")
        .select("*")
        .eq("is_active", true)
        .order("is_system", { ascending: false })
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch expenses
  const { data: expenses = [], isLoading: loadingExpenses } = useQuery({
    queryKey: ["expenses", dateRange],
    queryFn: async () => {
      let query = supabase
        .from("expenses")
        .select("*, expense_categories(name, color, icon)")
        .order("expense_date", { ascending: false });

      // Apply date filter
      const now = new Date();
      if (dateRange === "week") {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        query = query.gte("expense_date", weekAgo.toISOString().split("T")[0]);
      } else if (dateRange === "month") {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        query = query.gte("expense_date", monthStart.toISOString().split("T")[0]);
      } else if (dateRange === "quarter") {
        const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        query = query.gte("expense_date", quarterStart.toISOString().split("T")[0]);
      } else if (dateRange === "year") {
        const yearStart = new Date(now.getFullYear(), 0, 1);
        query = query.gte("expense_date", yearStart.toISOString().split("T")[0]);
      }

      const { data, error } = await query.limit(500);
      if (error) throw error;
      return data;
    },
  });

  // Fetch fixed costs
  const { data: fixedCosts = [], isLoading: loadingFixedCosts } = useQuery({
    queryKey: ["fixed-costs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fixed_costs")
        .select("*")
        .eq("is_active", true)
        .order("next_due_date");
      if (error) throw error;
      return data;
    },
  });

  // Calculate summary
  const summary = useMemo(() => {
    const total = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const byCategory = categories.map((cat) => {
      const catExpenses = expenses.filter((e) => e.category_id === cat.id);
      return {
        ...cat,
        total: catExpenses.reduce((sum, e) => sum + Number(e.amount), 0),
        count: catExpenses.length,
      };
    }).filter(c => c.total > 0).sort((a, b) => b.total - a.total);

    const salaries = expenses.filter(e => e.source_type === 'salary').reduce((sum, e) => sum + Number(e.amount), 0);
    const purchases = expenses.filter(e => e.source_type === 'vendor_payment').reduce((sum, e) => sum + Number(e.amount), 0);
    const fixedCostPayments = expenses.filter(e => e.source_type === 'fixed_cost').reduce((sum, e) => sum + Number(e.amount), 0);
    const manual = expenses.filter(e => e.source_type === 'manual' || !e.source_type).reduce((sum, e) => sum + Number(e.amount), 0);

    return { total, byCategory, salaries, purchases, fixedCostPayments, manual };
  }, [expenses, categories]);

  // Fixed costs due soon
  const fixedCostsDue = useMemo(() => {
    const today = new Date();
    return fixedCosts.map(fc => {
      const dueDate = new Date(fc.next_due_date);
      const daysUntil = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return {
        ...fc,
        daysUntil,
        status: daysUntil < 0 ? 'overdue' : daysUntil <= 3 ? 'due_soon' : 'upcoming'
      };
    });
  }, [fixedCosts]);

  // Handlers
  const resetExpenseForm = () => {
    setCategoryId("");
    setAmount("");
    setExpenseDate(new Date().toISOString().split("T")[0]);
    setDescription("");
    setPaymentMethod("cash");
    setPaymentReference("");
    setNotes("");
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryId || !amount) {
      toast.error("Category and amount are required");
      return;
    }
    setSaving(true);

    try {
      const { data: idData } = await supabase.rpc("generate_display_id", {
        prefix: "EXP",
        seq_name: "expenses_display_id_seq"
      });

      const { error } = await supabase.from("expenses").insert({
        display_id: idData,
        category_id: categoryId,
        amount: parseFloat(amount),
        expense_date: expenseDate,
        description: description.trim() || null,
        payment_method: paymentMethod,
        payment_reference: paymentReference.trim() || null,
        source_type: "manual",
        notes: notes.trim() || null,
        created_by: user!.id,
      });

      if (error) throw error;

      toast.success("Expense recorded");
      logActivity(user!.id, `Recorded expense ${idData}`, "expense");
      qc.invalidateQueries({ queryKey: ["expenses"] });
      setShowAddExpense(false);
      resetExpenseForm();
    } catch (error: any) {
      toast.error(error.message || "Failed to record expense");
    } finally {
      setSaving(false);
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) {
      toast.error("Category name is required");
      return;
    }
    setSaving(true);

    try {
      if (editingCategory) {
        const { error } = await supabase.from("expense_categories")
          .update({ name: catName.trim(), description: catDescription.trim() || null, color: catColor })
          .eq("id", editingCategory.id);
        if (error) throw error;
        toast.success("Category updated");
      } else {
        const { error } = await supabase.from("expense_categories").insert({
          name: catName.trim(),
          description: catDescription.trim() || null,
          color: catColor,
        });
        if (error) throw error;
        toast.success("Category added");
      }
      qc.invalidateQueries({ queryKey: ["expense-categories"] });
      setShowAddCategory(false);
      setEditingCategory(null);
      setCatName("");
      setCatDescription("");
      setCatColor("#6366f1");
    } catch (error: any) {
      toast.error(error.message || "Failed to save category");
    } finally {
      setSaving(false);
    }
  };

  const handleAddFixedCost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fcName.trim() || !fcAmount) {
      toast.error("Name and amount are required");
      return;
    }
    setSaving(true);

    try {
      const { data: idData } = await supabase.rpc("generate_display_id", {
        prefix: "FC",
        seq_name: "fixed_costs_display_id_seq"
      });

      // Calculate initial next due date
      const today = new Date();
      let nextDue: Date;
      const dueDay = parseInt(fcDueDay);
      
      if (fcFrequency === "monthly") {
        nextDue = new Date(today.getFullYear(), today.getMonth(), dueDay);
        if (nextDue <= today) {
          nextDue = new Date(today.getFullYear(), today.getMonth() + 1, dueDay);
        }
      } else if (fcFrequency === "weekly") {
        nextDue = new Date(today.getTime() + (7 - today.getDay() + dueDay) % 7 * 24 * 60 * 60 * 1000);
      } else if (fcFrequency === "quarterly") {
        const currentQuarter = Math.floor(today.getMonth() / 3);
        nextDue = new Date(today.getFullYear(), currentQuarter * 3 + 3, dueDay);
      } else {
        nextDue = new Date(today.getFullYear() + 1, 0, dueDay);
      }

      const { error } = await supabase.from("fixed_costs").insert({
        display_id: idData,
        name: fcName.trim(),
        description: fcDescription.trim() || null,
        amount: parseFloat(fcAmount),
        frequency: fcFrequency,
        due_day: parseInt(fcDueDay),
        next_due_date: nextDue.toISOString().split("T")[0],
        reminder_days_before: parseInt(fcReminderDays),
        vendor_name: fcVendorName.trim() || null,
        created_by: user!.id,
      });

      if (error) throw error;

      toast.success("Fixed cost added");
      logActivity(user!.id, `Added fixed cost: ${fcName}`, "fixed_cost");
      qc.invalidateQueries({ queryKey: ["fixed-costs"] });
      setShowAddFixedCost(false);
      setFcName("");
      setFcDescription("");
      setFcAmount("");
      setFcFrequency("monthly");
      setFcDueDay("1");
      setFcReminderDays("3");
      setFcVendorName("");
    } catch (error: any) {
      toast.error(error.message || "Failed to add fixed cost");
    } finally {
      setSaving(false);
    }
  };

  const handlePayFixedCost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFixedCost || !fcPayAmount) {
      toast.error("Amount is required");
      return;
    }
    setSaving(true);

    try {
      const { data: idData } = await supabase.rpc("generate_display_id", {
        prefix: "FCP",
        seq_name: "fixed_cost_payments_display_id_seq"
      });

      const { error } = await supabase.from("fixed_cost_payments").insert({
        display_id: idData,
        fixed_cost_id: selectedFixedCost.id,
        amount: parseFloat(fcPayAmount),
        payment_date: fcPayDate,
        payment_method: fcPayMethod,
        payment_reference: fcPayReference.trim() || null,
        notes: fcPayNotes.trim() || null,
        created_by: user!.id,
      });

      if (error) throw error;

      toast.success("Payment recorded");
      logActivity(user!.id, `Paid fixed cost: ${selectedFixedCost.name}`, "fixed_cost_payment");
      qc.invalidateQueries({ queryKey: ["fixed-costs"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      setShowPayFixedCost(false);
      setSelectedFixedCost(null);
      setFcPayAmount("");
      setFcPayDate(new Date().toISOString().split("T")[0]);
      setFcPayMethod("bank_transfer");
      setFcPayReference("");
      setFcPayNotes("");
    } catch (error: any) {
      toast.error(error.message || "Failed to record payment");
    } finally {
      setSaving(false);
    }
  };

  const openPayFixedCost = (fc: any) => {
    setSelectedFixedCost(fc);
    setFcPayAmount(String(fc.amount));
    setShowPayFixedCost(true);
  };

  // Filter expenses by selected category
  const filteredExpenses = useMemo(() => {
    if (!selectedCategoryFilter) return expenses;
    return expenses.filter((e) => e.category_id === selectedCategoryFilter);
  }, [expenses, selectedCategoryFilter]);

  // Calculate category totals for the sidebar
  const categoriesWithTotals = useMemo(() => {
    return categories.map((cat) => {
      const catExpenses = expenses.filter((e) => e.category_id === cat.id);
      return {
        ...cat,
        total: catExpenses.reduce((sum, e) => sum + Number(e.amount), 0),
        count: catExpenses.length,
      };
    });
  }, [expenses, categories]);

  // Table columns
  const expenseColumns = [
    { header: "ID", accessor: "display_id" as const, className: "font-mono text-xs" },
    { header: "Date", accessor: (row: any) => new Date(row.expense_date).toLocaleDateString("en-IN"), className: "text-sm" },
    { 
      header: "Category", 
      accessor: (row: any) => {
        const IconComponent = categoryIcons[row.expense_categories?.icon] || Receipt;
        return (
          <div className="flex items-center gap-2">
            <div 
              className="w-6 h-6 rounded flex items-center justify-center" 
              style={{ backgroundColor: row.expense_categories?.color + '20' }}
            >
              <IconComponent className="h-3.5 w-3.5" style={{ color: row.expense_categories?.color }} />
            </div>
            <span className="text-sm">{row.expense_categories?.name || "—"}</span>
          </div>
        );
      }
    },
    { header: "Description", accessor: (row: any) => row.description || "—", className: "text-sm truncate max-w-[200px]" },
    { 
      header: "Source", 
      accessor: (row: any) => {
        const sourceLabels: Record<string, string> = {
          manual: "Manual",
          salary: "Salary",
          vendor_payment: "Purchase",
          fixed_cost: "Fixed Cost"
        };
        return <Badge variant="outline" className="text-xs">{sourceLabels[row.source_type] || "Manual"}</Badge>;
      }
    },
    { header: "Amount", accessor: (row: any) => `₹${Number(row.amount).toLocaleString()}`, className: "font-semibold text-right" },
  ];

  // Category sidebar component (reusable for desktop and sheet)
  const CategorySidebar = () => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Categories</h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowAddCategory(true)}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      
      {/* All categories button */}
      <button
        onClick={() => setSelectedCategoryFilter(null)}
        className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${
          selectedCategoryFilter === null 
            ? 'bg-primary/10 border-primary/30' 
            : 'bg-background hover:bg-muted border-transparent'
        }`}
      >
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
          <FolderOpen className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">All Expenses</p>
          <p className="text-xs text-muted-foreground">{expenses.length} entries</p>
        </div>
        <span className="text-sm font-semibold">₹{summary.total.toLocaleString()}</span>
      </button>

      <div className="h-px bg-border my-2" />

      {/* Category list */}
      <ScrollArea className="h-[calc(100vh-400px)] lg:h-auto lg:max-h-[500px]">
        <div className="space-y-2 pr-2">
          {categoriesWithTotals.map((cat) => {
            const IconComponent = categoryIcons[cat.icon] || Receipt;
            const isSelected = selectedCategoryFilter === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategoryFilter(isSelected ? null : cat.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${
                  isSelected 
                    ? 'bg-primary/10 border-primary/30' 
                    : 'bg-background hover:bg-muted border-transparent'
                }`}
              >
                <div 
                  className="w-9 h-9 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: cat.color + '20' }}
                >
                  <IconComponent className="h-4 w-4" style={{ color: cat.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{cat.name}</p>
                  <p className="text-xs text-muted-foreground">{cat.count} expense{cat.count !== 1 ? 's' : ''}</p>
                </div>
                {cat.total > 0 && (
                  <span className="text-sm font-semibold">₹{cat.total.toLocaleString()}</span>
                )}
                {cat.is_system && (
                  <Badge variant="secondary" className="text-[10px] px-1.5">System</Badge>
                )}
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );

  // Fixed costs sidebar component (for sheet)
  const FixedCostsSidebar = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Fixed Costs</h3>
        <Button size="sm" onClick={() => { setShowFixedCostsSheet(false); setShowAddFixedCost(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>

      {loadingFixedCosts ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : fixedCostsDue.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Calendar className="h-10 w-10 mx-auto mb-2 opacity-50" />
          <p>No fixed costs configured</p>
          <p className="text-sm">Add recurring expenses like rent, utilities, etc.</p>
        </div>
      ) : (
        <ScrollArea className="h-[calc(100vh-200px)]">
          <div className="space-y-3 pr-2">
            {fixedCostsDue.map((fc) => (
              <Card key={fc.id} className={`relative overflow-hidden ${fc.status === 'overdue' ? 'border-red-300 bg-red-50/50' : fc.status === 'due_soon' ? 'border-amber-300 bg-amber-50/50' : ''}`}>
                {fc.status === 'overdue' && (
                  <div className="absolute top-0 right-0 bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-bl font-medium">
                    OVERDUE
                  </div>
                )}
                {fc.status === 'due_soon' && (
                  <div className="absolute top-0 right-0 bg-amber-500 text-white text-[10px] px-2 py-0.5 rounded-bl font-medium">
                    DUE SOON
                  </div>
                )}
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-semibold text-sm">{fc.name}</h4>
                      <p className="text-xs text-muted-foreground mt-0.5">{fc.description || fc.vendor_name || '—'}</p>
                    </div>
                    <Badge variant="outline" className="capitalize text-[10px]">{fc.frequency}</Badge>
                  </div>
                  
                  <div className="mt-3 space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Amount</span>
                      <span className="font-semibold">₹{Number(fc.amount).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Next Due</span>
                      <span className={fc.status === 'overdue' ? 'text-red-600 font-medium' : fc.status === 'due_soon' ? 'text-amber-600 font-medium' : ''}>
                        {new Date(fc.next_due_date).toLocaleDateString("en-IN")}
                      </span>
                    </div>
                  </div>

                  <Button size="sm" className="w-full mt-3" variant={fc.status === 'overdue' ? 'destructive' : 'default'} onClick={() => { setShowFixedCostsSheet(false); openPayFixedCost(fc); }}>
                    <CreditCard className="h-4 w-4 mr-1" /> Record Payment
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Expenses"
        subtitle="Track and manage all business expenses"
        action={isAdmin ? (
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setShowAddCategory(true)}>
              <Tag className="h-4 w-4 mr-2" /> Create Category
            </Button>
            <Button variant="outline" onClick={() => setShowAddFixedCost(true)}>
              <Calendar className="h-4 w-4 mr-2" /> Add Fixed Cost
            </Button>
            <Button onClick={() => setShowAddExpense(true)}>
              <Receipt className="h-4 w-4 mr-2" /> Record Expense
            </Button>
          </div>
        ) : (
          <Button onClick={() => setShowAddExpense(true)}>
            <Receipt className="h-4 w-4 mr-2" /> Record Expense
          </Button>
        )}
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Expenses</p>
                <p className="text-2xl font-bold mt-1">₹{summary.total.toLocaleString()}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Salaries</p>
                <p className="text-2xl font-bold mt-1">₹{summary.salaries.toLocaleString()}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                <Users className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Purchases</p>
                <p className="text-2xl font-bold mt-1">₹{summary.purchases.toLocaleString()}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center">
                <Truck className="h-5 w-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Fixed Costs</p>
                <p className="text-2xl font-bold mt-1">₹{summary.fixedCostPayments.toLocaleString()}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Fixed Costs Due Soon Alert */}
      {fixedCostsDue.filter(fc => fc.status === 'overdue' || fc.status === 'due_soon').length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-semibold text-amber-800">Fixed Costs Due Soon</h4>
                <div className="mt-2 space-y-2">
                  {fixedCostsDue.filter(fc => fc.status === 'overdue' || fc.status === 'due_soon').map((fc) => (
                    <div key={fc.id} className="flex items-center justify-between bg-white rounded-lg p-3 border">
                      <div>
                        <p className="font-medium">{fc.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {fc.status === 'overdue' ? (
                            <span className="text-red-600 font-medium">Overdue by {Math.abs(fc.daysUntil)} days</span>
                          ) : (
                            <span>Due in {fc.daysUntil} day{fc.daysUntil !== 1 ? 's' : ''}</span>
                          )}
                          {' • '}₹{Number(fc.amount).toLocaleString()}
                        </p>
                      </div>
                      <Button size="sm" onClick={() => openPayFixedCost(fc)}>
                        <CreditCard className="h-4 w-4 mr-1" /> Pay Now
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main content with categories sidebar for desktop */}
      <div className="flex gap-6">
        {/* Categories sidebar - visible on large screens */}
        <Card className="hidden lg:block w-80 shrink-0 h-fit sticky top-6">
          <CardContent className="p-4">
            <CategorySidebar />
          </CardContent>
        </Card>

        {/* Main expenses table */}
        <div className="flex-1 min-w-0">
          {/* Date filter and category sheet trigger for mobile/tablet */}
          <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
            {/* Mobile: Categories Sheet */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" className="lg:hidden">
                  <Tag className="h-4 w-4 mr-2" />
                  {selectedCategoryFilter 
                    ? categoriesWithTotals.find(c => c.id === selectedCategoryFilter)?.name || 'Category'
                    : 'All Categories'
                  }
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-80">
                <SheetHeader>
                  <SheetTitle>Filter by Category</SheetTitle>
                  <SheetDescription>Select a category to filter expenses</SheetDescription>
                </SheetHeader>
                <div className="mt-4">
                  <CategorySidebar />
                </div>
              </SheetContent>
            </Sheet>

            <div className="flex items-center gap-2 ml-auto">
              {/* Fixed Costs Sheet */}
              <Sheet open={showFixedCostsSheet} onOpenChange={setShowFixedCostsSheet}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Calendar className="h-4 w-4 mr-2" />
                    Fixed Costs
                    {fixedCostsDue.filter(fc => fc.status === 'overdue' || fc.status === 'due_soon').length > 0 && (
                      <Badge variant="destructive" className="ml-2 h-5 w-5 p-0 justify-center rounded-full">
                        {fixedCostsDue.filter(fc => fc.status === 'overdue' || fc.status === 'due_soon').length}
                      </Badge>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-96">
                  <SheetHeader>
                    <SheetTitle>Fixed Costs</SheetTitle>
                    <SheetDescription>Manage recurring expenses</SheetDescription>
                  </SheetHeader>
                  <div className="mt-4">
                    <FixedCostsSidebar />
                  </div>
                </SheetContent>
              </Sheet>

              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                  <SelectItem value="quarter">This Quarter</SelectItem>
                  <SelectItem value="year">This Year</SelectItem>
                  <SelectItem value="all">All Time</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Category filter badge */}
          {selectedCategoryFilter && (
            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm text-muted-foreground">Filtered by:</span>
              <Badge 
                variant="secondary" 
                className="gap-1 pr-1"
                style={{ 
                  backgroundColor: (categoriesWithTotals.find(c => c.id === selectedCategoryFilter)?.color || '#6366f1') + '20',
                  color: categoriesWithTotals.find(c => c.id === selectedCategoryFilter)?.color || '#6366f1'
                }}
              >
                {categoriesWithTotals.find(c => c.id === selectedCategoryFilter)?.name}
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-4 w-4 ml-1 hover:bg-transparent" 
                  onClick={() => setSelectedCategoryFilter(null)}
                >
                  <span className="text-lg leading-none">&times;</span>
                </Button>
              </Badge>
            </div>
          )}

          {/* Expenses table */}
          {loadingExpenses ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <DataTable
              columns={expenseColumns}
              data={filteredExpenses}
              searchKey="description"
              searchPlaceholder="Search expenses..."
            />
          )}
        </div>
      </div>

      {/* Add Expense Dialog */}
      <Dialog open={showAddExpense} onOpenChange={setShowAddExpense}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Record Expense</DialogTitle>
            <DialogDescription>Add a new expense entry to track your spending.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddExpense} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Category *</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.filter(c => !c.is_system).map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded" style={{ backgroundColor: cat.color }} />
                          {cat.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Amount (₹) *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="mt-1"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Date</Label>
                <Input
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What was this expense for?"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Payment Reference</Label>
              <Input
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="Transaction ID, cheque number, etc."
                className="mt-1"
              />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional notes..."
                className="mt-1"
                rows={2}
              />
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Receipt className="mr-2 h-4 w-4" />}
              Record Expense
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Category Dialog */}
      <Dialog open={showAddCategory} onOpenChange={(open) => { setShowAddCategory(open); if (!open) setEditingCategory(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCategory ? "Edit Category" : "Add Category"}</DialogTitle>
            <DialogDescription>Create expense categories to organize your spending.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddCategory} className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                placeholder="e.g., Office Rent"
                className="mt-1"
                required
              />
            </div>
            <div>
              <Label>Description</Label>
              <Input
                value={catDescription}
                onChange={(e) => setCatDescription(e.target.value)}
                placeholder="Brief description"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Color</Label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="color"
                  value={catColor}
                  onChange={(e) => setCatColor(e.target.value)}
                  className="w-12 h-10 rounded border cursor-pointer"
                />
                <Input
                  value={catColor}
                  onChange={(e) => setCatColor(e.target.value)}
                  placeholder="#6366f1"
                  className="font-mono"
                />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editingCategory ? "Update Category" : "Add Category"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Fixed Cost Dialog */}
      <Dialog open={showAddFixedCost} onOpenChange={setShowAddFixedCost}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Fixed Cost</DialogTitle>
            <DialogDescription>Set up recurring expenses like rent, utilities, subscriptions, etc.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddFixedCost} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Name *</Label>
                <Input
                  value={fcName}
                  onChange={(e) => setFcName(e.target.value)}
                  placeholder="e.g., Office Rent"
                  className="mt-1"
                  required
                />
              </div>
              <div className="col-span-2">
                <Label>Description</Label>
                <Input
                  value={fcDescription}
                  onChange={(e) => setFcDescription(e.target.value)}
                  placeholder="Brief description"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Amount (₹) *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={fcAmount}
                  onChange={(e) => setFcAmount(e.target.value)}
                  placeholder="0.00"
                  className="mt-1"
                  required
                />
              </div>
              <div>
                <Label>Frequency</Label>
                <Select value={fcFrequency} onValueChange={setFcFrequency}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Due Day</Label>
                <Input
                  type="number"
                  min="1"
                  max="31"
                  value={fcDueDay}
                  onChange={(e) => setFcDueDay(e.target.value)}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">Day of month (1-31)</p>
              </div>
              <div>
                <Label>Remind Before</Label>
                <Select value={fcReminderDays} onValueChange={setFcReminderDays}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 day</SelectItem>
                    <SelectItem value="3">3 days</SelectItem>
                    <SelectItem value="5">5 days</SelectItem>
                    <SelectItem value="7">7 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Payee / Vendor</Label>
                <Input
                  value={fcVendorName}
                  onChange={(e) => setFcVendorName(e.target.value)}
                  placeholder="Who receives this payment?"
                  className="mt-1"
                />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Calendar className="mr-2 h-4 w-4" />}
              Add Fixed Cost
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Pay Fixed Cost Dialog */}
      <Dialog open={showPayFixedCost} onOpenChange={setShowPayFixedCost}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              {selectedFixedCost && `Record payment for ${selectedFixedCost.name}`}
            </DialogDescription>
          </DialogHeader>
          {selectedFixedCost && (
            <form onSubmit={handlePayFixedCost} className="space-y-4">
              <Card className="bg-muted/50">
                <CardContent className="p-3">
                  <div className="flex justify-between text-sm">
                    <span>Expected Amount</span>
                    <span className="font-semibold">₹{Number(selectedFixedCost.amount).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span>Due Date</span>
                    <span>{new Date(selectedFixedCost.next_due_date).toLocaleDateString("en-IN")}</span>
                  </div>
                </CardContent>
              </Card>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Amount (₹) *</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={fcPayAmount}
                    onChange={(e) => setFcPayAmount(e.target.value)}
                    className="mt-1"
                    required
                  />
                </div>
                <div>
                  <Label>Payment Date</Label>
                  <Input
                    type="date"
                    value={fcPayDate}
                    onChange={(e) => setFcPayDate(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Payment Method</Label>
                  <Select value={fcPayMethod} onValueChange={setFcPayMethod}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="upi">UPI</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Reference</Label>
                  <Input
                    value={fcPayReference}
                    onChange={(e) => setFcPayReference(e.target.value)}
                    placeholder="Transaction ID"
                    className="mt-1"
                  />
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea
                  value={fcPayNotes}
                  onChange={(e) => setFcPayNotes(e.target.value)}
                  placeholder="Additional notes..."
                  className="mt-1"
                  rows={2}
                />
              </div>
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Record Payment
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Expenses;
