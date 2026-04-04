import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShoppingCart, CreditCard, RotateCcw, Receipt, Wallet, TrendingUp, TrendingDown } from "lucide-react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { ReportFilters, DateRange } from "./ReportFilters";
import { ReportExportBar } from "./ReportExportBar";
import { ReportSummaryCards } from "./ReportSummaryCards";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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
        .select("id, display_id, transaction_date, amount, type, payment_method, notes, created_at, stores(name, customers(name))")
        .gte("transaction_date", format(dateRange.from, "yyyy-MM-dd"))
        .lte("transaction_date", format(dateRange.to, "yyyy-MM-dd"))
        .order("created_at", { ascending: true });
      return data || [];
    },
  });

  const { data: purchases = [], isLoading: purchLoading } = useQuery({
    queryKey: ["daybook-purchases", dateRange],
    queryFn: async () => {
      const { data } = await supabase
        .from("purchases")
        .select("id, display_id, purchase_date, total_amount, paid_amount, payment_method, notes, created_at, vendors(name)")
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
      if (t.type === "payment") {
        runningBalance += Number(t.amount);
        allEntries.push({
          id: t.id,
          type: "payment",
          display_id: t.display_id,
          date: t.transaction_date,
          time: format(new Date(t.created_at), "HH:mm"),
          description: "Payment Received",
          party_name: t.stores?.customers?.name || t.stores?.name || "Customer",
          debit: 0,
          credit: Number(t.amount),
          balance: runningBalance,
          payment_method: t.payment_method,
          notes: t.notes,
        });
      }
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
        payment_method: p.payment_method,
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

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Day Book Report", 14, 20);
    doc.setFontSize(10);
    doc.text(`${format(dateRange.from, "MMM d, yyyy")} - ${format(dateRange.to, "MMM d, yyyy")}`, 14, 28);

    autoTable(doc, {
      startY: 35,
      head: [["Date", "Time", "Type", "ID", "Party", "Description", "Debit", "Credit", "Balance"]],
      body: entries.map((e) => [
        format(new Date(e.date), "dd/MM/yy"),
        e.time,
        e.type.replace("_", " ").toUpperCase(),
        e.display_id,
        e.party_name,
        e.description,
        e.debit > 0 ? `₹${e.debit.toLocaleString()}` : "",
        e.credit > 0 ? `₹${e.credit.toLocaleString()}` : "",
        `₹${e.balance.toLocaleString()}`,
      ]),
      foot: [["", "", "", "", "", "TOTAL", `₹${totals.totalDebit.toLocaleString()}`, `₹${totals.totalCredit.toLocaleString()}`, `₹${totals.netBalance.toLocaleString()}`]],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [41, 128, 185] },
      footStyles: { fillColor: [236, 240, 241], textColor: [0, 0, 0], fontStyle: "bold" },
    });

    doc.save(`daybook-${format(dateRange.from, "yyyy-MM-dd")}-${format(dateRange.to, "yyyy-MM-dd")}.pdf`);
  };

  const summaryCards = [
    { label: "Total Credits", value: `₹${totals.totalCredit.toLocaleString()}`, icon: TrendingUp, iconColor: "green" },
    { label: "Total Debits", value: `₹${totals.totalDebit.toLocaleString()}`, icon: TrendingDown, iconColor: "red" },
    { label: "Net Balance", value: `₹${totals.netBalance.toLocaleString()}`, icon: Wallet, iconColor: totals.netBalance >= 0 ? "green" : "red" },
    { label: "Transactions", value: entries.length.toString(), icon: Receipt, iconColor: "blue" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Day Book</h2>
          <p className="text-sm text-muted-foreground">Complete chronological record of all financial transactions</p>
        </div>
        <ReportExportBar onExportPDF={exportPDF} showExcel={false} showCSV={false} showPrint={false} />
      </div>

      <ReportFilters dateRange={dateRange} onDateRangeChange={setDateRange} />

      <ReportSummaryCards cards={summaryCards} />

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Receipt className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">No transactions found for this period</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Transaction Ledger</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr className="text-left text-sm">
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">ID</th>
                    <th className="px-4 py-3 font-medium">Party</th>
                    <th className="px-4 py-3 font-medium">Description</th>
                    <th className="px-4 py-3 font-medium text-right">Debit</th>
                    <th className="px-4 py-3 font-medium text-right">Credit</th>
                    <th className="px-4 py-3 font-medium text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {entries.map((entry) => (
                    <tr key={`${entry.type}-${entry.id}`} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 text-sm">
                        <div className="flex flex-col">
                          <span className="font-medium">{format(new Date(entry.date), "dd MMM")}</span>
                          <span className="text-xs text-muted-foreground">{entry.time}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {getTypeIcon(entry.type)}
                          {getTypeBadge(entry.type)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{entry.display_id}</td>
                      <td className="px-4 py-3 text-sm font-medium">{entry.party_name}</td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex flex-col">
                          <span>{entry.description}</span>
                          {entry.payment_method && (
                            <span className="text-xs text-muted-foreground capitalize">{entry.payment_method.replace("_", " ")}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-red-600">
                        {entry.debit > 0 ? `₹${entry.debit.toLocaleString()}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-green-600">
                        {entry.credit > 0 ? `₹${entry.credit.toLocaleString()}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-bold">
                        <span className={entry.balance >= 0 ? "text-green-600" : "text-red-600"}>
                          ₹{entry.balance.toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/70 font-semibold">
                  <tr>
                    <td colSpan={5} className="px-4 py-3 text-right">TOTAL</td>
                    <td className="px-4 py-3 text-right text-red-600">₹{totals.totalDebit.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-green-600">₹{totals.totalCredit.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">
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
    </div>
  );
}
