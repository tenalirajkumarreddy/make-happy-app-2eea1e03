import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, CreditCard, RotateCcw, Receipt, Wallet, TrendingUp, TrendingDown } from "lucide-react";
import { format, subDays } from "date-fns";
import { ReportFilters, DateRange } from "./ReportFilters";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { generatePrintHTML } from "@/utils/printUtils";
import { ReportContainer, ReportKPICard } from "@/components/reports/ReportContainer";

interface DayBookEntry {
  id: string;
  type: "sale" | "payment" | "sale_return" | "purchase" | "purchase_return" | "expense" | "vendor_payment";
  display_id: string;
  date: string;
  time: string;
  description: string;
  party_name: string;
  debit: number;
  credit: number;
  balance: number;
  payment_method?: string;
  notes?: string;
}

export default function DayBookReport() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 0),
    to: new Date(),
  });
  const { data: companyInfo } = useCompanySettings();

  // Fetch all data sources
  const { data: sales = [], isLoading: salesLoading } = useQuery({
    queryKey: ["daybook-sales", dateRange],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales")
        .select("id, display_id, total_amount, cash_amount, upi_amount, notes, created_at, stores(name, customers(name))")
        .gte("created_at", format(dateRange.from, "yyyy-MM-dd"))
        .lte("created_at", format(dateRange.to, "yyyy-MM-dd") + "T23:59:59")
        .order("created_at", { ascending: true });
      return data || [];
    },
  });

  const { data: transactions = [], isLoading: txnLoading } = useQuery({
    queryKey: ["daybook-transactions", dateRange],
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("id, display_id, payment_date, total_amount, cash_amount, upi_amount, notes, created_at, stores(name, customers(name))")
        .gte("payment_date", format(dateRange.from, "yyyy-MM-dd"))
        .lte("payment_date", format(dateRange.to, "yyyy-MM-dd"))
        .order("created_at", { ascending: true });
      return data || [];
    },
  });

  const { data: purchases = [], isLoading: purchLoading } = useQuery({
    queryKey: ["daybook-purchases", dateRange],
    queryFn: async () => {
      const { data } = await supabase
        .from("purchases")
        .select("id, display_id, purchase_date, total_amount, notes, created_at, vendors(name)")
        .gte("purchase_date", format(dateRange.from, "yyyy-MM-dd"))
        .lte("purchase_date", format(dateRange.to, "yyyy-MM-dd"))
        .order("created_at", { ascending: true });
      return data || [];
    },
  });

  const { data: vendorPayments = [], isLoading: vpLoading } = useQuery({
    queryKey: ["daybook-vendor-payments", dateRange],
    queryFn: async () => {
      const { data } = await supabase
        .from("vendor_payments")
        .select("id, display_id, payment_date, amount, payment_method, notes, created_at, vendors(name)")
        .gte("payment_date", format(dateRange.from, "yyyy-MM-dd"))
        .lte("payment_date", format(dateRange.to, "yyyy-MM-dd"))
        .order("created_at", { ascending: true });
      return data || [];
    },
  });

  const { data: expenses = [], isLoading: expLoading } = useQuery({
    queryKey: ["daybook-expenses", dateRange],
    queryFn: async () => {
      const { data } = await supabase
        .from("expenses")
        .select("id, expense_date, amount, description, notes, created_at, expense_categories(name)")
        .gte("expense_date", format(dateRange.from, "yyyy-MM-dd"))
        .lte("expense_date", format(dateRange.to, "yyyy-MM-dd"))
        .order("created_at", { ascending: true });
      return data || [];
    },
  });

  const { data: saleReturns = [], isLoading: srLoading } = useQuery({
    queryKey: ["daybook-sale-returns", dateRange],
    queryFn: async () => {
      const { data } = await supabase
        .from("sale_returns")
        .select("id, display_id, return_date, total_amount, reason, created_at, stores(name, customers(name))")
        .gte("return_date", format(dateRange.from, "yyyy-MM-dd"))
        .lte("return_date", format(dateRange.to, "yyyy-MM-dd"))
        .eq("status", "completed")
        .order("created_at", { ascending: true });
      return data || [];
    },
  });

  const isLoading = salesLoading || txnLoading || purchLoading || vpLoading || expLoading || srLoading;

  // Combine and sort all entries
  const entries = useMemo(() => {
    const allEntries: DayBookEntry[] = [];
    let runningBalance = 0;

    // Sales (Credit - money coming in)
    sales.forEach((s: any) => {
      runningBalance += Number(s.total_amount);
      const cashReceived = Number(s.cash_amount || 0) + Number(s.upi_amount || 0);
      const paymentMethod = s.upi_amount > 0 && s.cash_amount > 0 ? "Mixed" : s.upi_amount > 0 ? "UPI" : "Cash";
      allEntries.push({
        id: s.id,
        type: "sale",
        display_id: s.display_id,
        date: format(new Date(s.created_at), "yyyy-MM-dd"),
        time: format(new Date(s.created_at), "HH:mm"),
        description: "Sale",
        party_name: s.stores?.customers?.name || s.stores?.name || "Walk-in",
        debit: 0,
        credit: Number(s.total_amount),
        balance: runningBalance,
        payment_method: paymentMethod,
        notes: s.notes,
      });
    });

    // Customer Payments (Credit - money coming in)
    transactions.forEach((t: any) => {
      const amount = Number(t.total_amount || 0);
      if (amount <= 0) return;

      const paymentMethod = Number(t.upi_amount || 0) > 0 && Number(t.cash_amount || 0) > 0
        ? "Mixed"
        : Number(t.upi_amount || 0) > 0
          ? "UPI"
          : "Cash";

      runningBalance += amount;
      allEntries.push({
        id: t.id,
        type: "payment",
        display_id: t.display_id,
        date: t.payment_date,
        time: format(new Date(t.created_at), "HH:mm"),
        description: "Payment Received",
        party_name: t.stores?.customers?.name || t.stores?.name || "Customer",
        debit: 0,
        credit: amount,
        balance: runningBalance,
        payment_method: paymentMethod,
        notes: t.notes,
      });
    });

    // Purchases (Debit - money going out / liability)
    purchases.forEach((p: any) => {
      runningBalance -= Number(p.total_amount);
      allEntries.push({
        id: p.id,
        type: "purchase",
        display_id: p.display_id,
        date: p.purchase_date,
        time: format(new Date(p.created_at), "HH:mm"),
        description: "Purchase",
        party_name: p.vendors?.name || "Vendor",
        debit: Number(p.total_amount),
        credit: 0,
        balance: runningBalance,
        payment_method: "N/A",
        notes: p.notes,
      });
    });

    // Vendor Payments (Debit - money going out)
    vendorPayments.forEach((vp: any) => {
      runningBalance -= Number(vp.amount);
      allEntries.push({
        id: vp.id,
        type: "vendor_payment",
        display_id: vp.display_id,
        date: vp.payment_date,
        time: format(new Date(vp.created_at), "HH:mm"),
        description: "Vendor Payment",
        party_name: vp.vendors?.name || "Vendor",
        debit: Number(vp.amount),
        credit: 0,
        balance: runningBalance,
        payment_method: vp.payment_method,
        notes: vp.notes,
      });
    });

    // Expenses (Debit - money going out)
    expenses.forEach((e: any) => {
      runningBalance -= Number(e.amount);
      allEntries.push({
        id: e.id,
        type: "expense",
        display_id: `EXP-${e.id.slice(0, 6)}`,
        date: e.expense_date,
        time: format(new Date(e.created_at), "HH:mm"),
        description: e.description || "Expense",
        party_name: e.expense_categories?.name || "Expense",
        debit: Number(e.amount),
        credit: 0,
        balance: runningBalance,
        notes: e.notes,
      });
    });

    // Sale Returns (Debit - money going back)
    saleReturns.forEach((sr: any) => {
      runningBalance -= Number(sr.total_amount);
      allEntries.push({
        id: sr.id,
        type: "sale_return",
        display_id: sr.display_id,
        date: sr.return_date,
        time: format(new Date(sr.created_at), "HH:mm"),
        description: "Sale Return",
        party_name: sr.stores?.customers?.name || sr.stores?.name || "Customer",
        debit: Number(sr.total_amount),
        credit: 0,
        balance: runningBalance,
        notes: sr.reason,
      });
    });

    // Sort by date and time
    allEntries.sort((a, b) => {
      const dateCompare = new Date(a.date).getTime() - new Date(b.date).getTime();
      if (dateCompare !== 0) return dateCompare;
      return a.time.localeCompare(b.time);
    });

    // Recalculate running balance after sorting
    let balance = 0;
    allEntries.forEach((entry) => {
      balance += entry.credit - entry.debit;
      entry.balance = balance;
    });

    return allEntries;
  }, [sales, transactions, purchases, vendorPayments, expenses, saleReturns]);

  // Calculate totals
  const totals = useMemo(() => {
    const totalCredit = entries.reduce((sum, e) => sum + e.credit, 0);
    const totalDebit = entries.reduce((sum, e) => sum + e.debit, 0);
    const netBalance = totalCredit - totalDebit;
    const totalSales = sales.reduce((sum, s: any) => sum + Number(s.total_amount), 0);
    const totalPayments = transactions.filter((t: any) => t.type === "payment").reduce((sum, t: any) => sum + Number(t.amount), 0);
    const totalPurchases = purchases.reduce((sum, p: any) => sum + Number(p.total_amount), 0);
    const totalExpenses = expenses.reduce((sum, e: any) => sum + Number(e.amount), 0);
    
    return { totalCredit, totalDebit, netBalance, totalSales, totalPayments, totalPurchases, totalExpenses };
  }, [entries, sales, transactions, purchases, expenses]);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "sale": return <ShoppingCart className="h-4 w-4 text-green-600" />;
      case "payment": return <CreditCard className="h-4 w-4 text-blue-600" />;
      case "sale_return": return <RotateCcw className="h-4 w-4 text-orange-600" />;
      case "purchase": return <Receipt className="h-4 w-4 text-purple-600" />;
      case "vendor_payment": return <Wallet className="h-4 w-4 text-red-600" />;
      case "expense": return <TrendingDown className="h-4 w-4 text-red-500" />;
      default: return null;
    }
  };

  const getTypeBadge = (type: string) => {
    const variants: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      sale: { label: "Sale", variant: "default" },
      payment: { label: "Payment", variant: "secondary" },
      sale_return: { label: "Return", variant: "destructive" },
      purchase: { label: "Purchase", variant: "outline" },
      vendor_payment: { label: "Vendor Pay", variant: "destructive" },
      expense: { label: "Expense", variant: "destructive" },
    };
    const config = variants[type] || { label: type, variant: "secondary" };
    return <Badge variant={config.variant} className="text-xs">{config.label}</Badge>;
  };

  const generateHTML = () => {
    const entryRows = entries.map((e) => `
      <tr>
        <td>
          <div class="font-medium">${format(new Date(e.date), "dd MMM")}</div>
          <div style="font-size: 0.75rem; color: #64748b;">${e.time}</div>
        </td>
        <td>${e.type.replace("_", " ").toUpperCase()}</td>
        <td class="font-mono" style="font-size: 0.75rem;">${e.display_id}</td>
        <td class="font-medium">${e.party_name}</td>
        <td>
          <div>${e.description}</div>
          ${e.payment_method ? `<div style="font-size: 0.75rem; color: #64748b;">${e.payment_method.replace("_", " ")}</div>` : ""}
        </td>
        <td class="text-right font-mono ${e.debit > 0 ? 'text-neg font-bold' : ''}">
          ${e.debit > 0 ? `₹${e.debit.toLocaleString()}` : "—"}
        </td>
        <td class="text-right font-mono ${e.credit > 0 ? 'text-pos font-bold' : ''}">
          ${e.credit > 0 ? `₹${e.credit.toLocaleString()}` : "—"}
        </td>
        <td class="text-right font-mono font-bold ${e.balance >= 0 ? 'text-pos' : 'text-neg'}">
          ₹${e.balance.toLocaleString()}
        </td>
      </tr>
    `).join("");

    const htmlContent = `
      <div class="kpi-row">
        <div class="kpi-card highlight">
          <div class="kpi-label">Total Credits</div>
          <div class="kpi-value text-pos">₹${totals.totalCredit.toLocaleString()}</div>
        </div>
        <div class="kpi-card highlight">
          <div class="kpi-label">Total Debits</div>
          <div class="kpi-value text-neg">₹${totals.totalDebit.toLocaleString()}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Net Balance</div>
          <div class="kpi-value ${totals.netBalance >= 0 ? 'text-pos' : 'text-neg'}">₹${totals.netBalance.toLocaleString()}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Entries</div>
          <div class="kpi-value">${entries.length}</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>ID</th>
            <th>Party</th>
            <th>Description</th>
            <th class="text-right">Debit</th>
            <th class="text-right">Credit</th>
            <th class="text-right">Balance</th>
          </tr>
        </thead>
        <tbody>
          ${entryRows}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="5" class="text-right font-bold">TOTAL</td>
            <td class="text-right font-mono font-bold text-neg">₹${totals.totalDebit.toLocaleString()}</td>
            <td class="text-right font-mono font-bold text-pos">₹${totals.totalCredit.toLocaleString()}</td>
            <td class="text-right font-mono font-bold ${totals.netBalance >= 0 ? 'text-pos' : 'text-neg'}">
              ₹${totals.netBalance.toLocaleString()}
            </td>
          </tr>
        </tfoot>
      </table>
    `;

    return generatePrintHTML({
      title: "Day Book Ledger",
      dateRange: `${format(dateRange.from, "MMM d, yyyy")} - ${format(dateRange.to, "MMM d, yyyy")}`,
      companyInfo: companyInfo || { companyName: "System", address: "", phone: "", email: "", gstin: "" },
      htmlContent,
    });
  };

  const summaryCards = [
    { label: "Total Credits", value: `₹${totals.totalCredit.toLocaleString()}`, icon: TrendingUp, iconColor: "green" },
    { label: "Total Debits", value: `₹${totals.totalDebit.toLocaleString()}`, icon: TrendingDown, iconColor: "red" },
    { label: "Net Balance", value: `₹${totals.netBalance.toLocaleString()}`, icon: Wallet, iconColor: totals.netBalance >= 0 ? "green" : "red" },
    { label: "Transactions", value: entries.length.toString(), icon: Receipt, iconColor: "blue" },
  ];

  const filtersSection = (
    <ReportFilters dateRange={dateRange} onDateRangeChange={setDateRange} />
  );

  const summaryCardsSection = (
    <>
      <ReportKPICard
        label="Total Credits"
        value={`₹${totals.totalCredit.toLocaleString()}`}
        icon={TrendingUp}
        trend="up"
        highlight
      />
      <ReportKPICard
        label="Total Debits"
        value={`₹${totals.totalDebit.toLocaleString()}`}
        icon={TrendingDown}
        trend="down"
      />
      <ReportKPICard
        label="Net Balance"
        value={`₹${totals.netBalance.toLocaleString()}`}
        icon={Wallet}
        trend={totals.netBalance >= 0 ? "up" : "down"}
        highlight
      />
      <ReportKPICard
        label="Transactions"
        value={entries.length.toString()}
        icon={Receipt}
      />
    </>
  );

  return (
    <ReportContainer
      title="Day Book"
      subtitle="Complete chronological record of all financial transactions"
      icon={Receipt}
      dateRange={`${format(dateRange.from, "MMM d, yyyy")} - ${format(dateRange.to, "MMM d, yyyy")}`}
      onPrint={generateHTML}
      isLoading={isLoading}
      filters={filtersSection}
      summaryCards={summaryCardsSection}
    >
      {entries.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Receipt className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">No transactions found for this period</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Transaction Ledger</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-semibold text-xs">Date</th>
                    <th className="text-left p-3 font-semibold text-xs">Type</th>
                    <th className="text-left p-3 font-semibold text-xs">ID</th>
                    <th className="text-left p-3 font-semibold text-xs">Party</th>
                    <th className="text-left p-3 font-semibold text-xs">Description</th>
                    <th className="text-right p-3 font-semibold text-xs">Debit</th>
                    <th className="text-right p-3 font-semibold text-xs">Credit</th>
                    <th className="text-right p-3 font-semibold text-xs">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={`${entry.type}-${entry.id}`} className="border-b hover:bg-muted/30">
                      <td className="p-3">
                        <div className="flex flex-col">
                          <span className="font-medium text-sm">{format(new Date(entry.date), "dd MMM")}</span>
                          <span className="text-xs text-muted-foreground">{entry.time}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          {getTypeIcon(entry.type)}
                          {getTypeBadge(entry.type)}
                        </div>
                      </td>
                      <td className="p-3 font-mono text-xs text-muted-foreground">{entry.display_id}</td>
                      <td className="p-3 font-medium">{entry.party_name}</td>
                      <td className="p-3">
                        <div className="flex flex-col">
                          <span className="text-sm">{entry.description}</span>
                          {entry.payment_method && (
                            <span className="text-xs text-muted-foreground capitalize">{entry.payment_method.replace("_", " ")}</span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-right font-medium text-red-600">
                        {entry.debit > 0 ? `₹${entry.debit.toLocaleString()}` : "—"}
                      </td>
                      <td className="p-3 text-right font-medium text-green-600">
                        {entry.credit > 0 ? `₹${entry.credit.toLocaleString()}` : "—"}
                      </td>
                      <td className="p-3 text-right font-bold">
                        <span className={entry.balance >= 0 ? "text-green-600" : "text-red-600"}>
                          ₹{entry.balance.toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/50 font-semibold">
                  <tr>
                    <td colSpan={5} className="p-3 text-right">TOTAL</td>
                    <td className="p-3 text-right text-red-600">₹{totals.totalDebit.toLocaleString()}</td>
                    <td className="p-3 text-right text-green-600">₹{totals.totalCredit.toLocaleString()}</td>
                    <td className="p-3 text-right">
                      <span className={totals.netBalance >= 0 ? "text-green-600" : "text-red-600"}>
                        ₹{totals.netBalance.toLocaleString()}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </ReportContainer>
  );
}
