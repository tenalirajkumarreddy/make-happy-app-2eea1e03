import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText, ShoppingCart, CreditCard, RotateCcw, Printer, X } from "lucide-react";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { ReportFilters, DateRange } from "./ReportFilters";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { generatePrintHTML } from "@/utils/printUtils";

interface CustomerStatementProps {
  customerId: string;
  customerName: string;
  storeId?: string;
  storeName?: string;
  onClose?: () => void;
}

interface StatementEntry {
  id: string;
  type: "sale" | "payment" | "return" | "adjustment" | "opening";
  display_id: string;
  date: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  payment_method?: string;
  handled_by?: string;
  notes?: string;
}

export function CustomerStatement({ customerId, customerName, storeId, storeName, onClose }: CustomerStatementProps) {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: startOfMonth(subMonths(new Date(), 2)),
    to: new Date(),
  });
  const { data: companySettings } = useCompanySettings();

  // Fetch business info
  const { data: businessInfo } = useQuery({
    queryKey: ["business-info"],
    queryFn: async () => {
      const { data } = await supabase.from("business_info").select("*").single();
      return data;
    },
  });

  // Fetch customer details
  const { data: customer } = useQuery({
    queryKey: ["customer-detail", customerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("customers")
        .select("*, stores(id, name, display_id, opening_balance, outstanding)")
        .eq("id", customerId)
        .single();
      return data;
    },
    enabled: !!customerId,
  });

  // Fetch sales for the customer's stores
  const { data: sales = [], isLoading: salesLoading } = useQuery({
    queryKey: ["statement-sales", customerId, storeId, dateRange],
    queryFn: async () => {
      let query = supabase
        .from("sales")
        .select("id, display_id, total_amount, cash_amount, upi_amount, notes, created_at, recorded_by, stores(id, name), profiles:recorded_by(full_name)")
        .gte("created_at", format(dateRange.from, "yyyy-MM-dd"))
        .lte("created_at", format(dateRange.to, "yyyy-MM-dd") + "T23:59:59");

      if (storeId) {
        query = query.eq("store_id", storeId);
      } else {
        // Get all stores for this customer
        const { data: stores } = await supabase.from("stores").select("id").eq("customer_id", customerId);
        if (stores && stores.length > 0) {
          query = query.in("store_id", stores.map(s => s.id));
        }
      }

      const { data } = await query.order("created_at", { ascending: true });
      return data || [];
    },
    enabled: !!customerId,
  });

  // Fetch transactions (payments)
  const { data: transactions = [], isLoading: txnLoading } = useQuery({
    queryKey: ["statement-transactions", customerId, storeId, dateRange],
    queryFn: async () => {
      let query = supabase
        .from("transactions")
        .select("id, display_id, transaction_date, amount, type, payment_method, notes, created_at, recorded_by, stores(id, name), profiles:recorded_by(full_name)")
        .gte("transaction_date", format(dateRange.from, "yyyy-MM-dd"))
        .lte("transaction_date", format(dateRange.to, "yyyy-MM-dd"));

      if (storeId) {
        query = query.eq("store_id", storeId);
      } else {
        const { data: stores } = await supabase.from("stores").select("id").eq("customer_id", customerId);
        if (stores && stores.length > 0) {
          query = query.in("store_id", stores.map(s => s.id));
        }
      }

      const { data } = await query.order("transaction_date", { ascending: true });
      return data || [];
    },
    enabled: !!customerId,
  });

  // Fetch sale returns
  const { data: returns = [], isLoading: returnsLoading } = useQuery({
    queryKey: ["statement-returns", customerId, storeId, dateRange],
    queryFn: async () => {
      let query = supabase
        .from("sale_returns")
        .select("id, display_id, return_date, total_amount, reason, notes, created_at, stores(id, name)")
        .eq("status", "completed")
        .gte("return_date", format(dateRange.from, "yyyy-MM-dd"))
        .lte("return_date", format(dateRange.to, "yyyy-MM-dd"));

      if (storeId) {
        query = query.eq("store_id", storeId);
      } else {
        const { data: stores } = await supabase.from("stores").select("id").eq("customer_id", customerId);
        if (stores && stores.length > 0) {
          query = query.in("store_id", stores.map(s => s.id));
        }
      }

      const { data } = await query.order("return_date", { ascending: true });
      return data || [];
    },
    enabled: !!customerId,
  });

  const isLoading = salesLoading || txnLoading || returnsLoading;

  // Calculate opening balance before the date range
  const openingBalance = useMemo(() => {
    if (storeId) {
      const store = customer?.stores?.find((s: any) => s.id === storeId);
      return Number(store?.opening_balance || 0);
    }
    return customer?.stores?.reduce((sum: number, s: any) => sum + Number(s.opening_balance || 0), 0) || 0;
  }, [customer, storeId]);

  // Combine and calculate running balance
  const entries = useMemo(() => {
    const allEntries: StatementEntry[] = [];
    
    // Add opening balance entry
    allEntries.push({
      id: "opening",
      type: "opening",
      display_id: "—",
      date: format(dateRange.from, "yyyy-MM-dd"),
      description: "Opening Balance",
      debit: openingBalance > 0 ? openingBalance : 0,
      credit: openingBalance < 0 ? Math.abs(openingBalance) : 0,
      balance: openingBalance,
    });

    // Add sales (debit - customer owes us)
    sales.forEach((s: any) => {
      const paymentMethod = (s.upi_amount > 0 && s.cash_amount > 0) ? "Mixed" : s.upi_amount > 0 ? "UPI" : "Cash";
      allEntries.push({
        id: s.id,
        type: "sale",
        display_id: s.display_id,
        date: format(new Date(s.created_at), "yyyy-MM-dd"),
        description: `Sale ${s.stores?.name ? `at ${s.stores.name}` : ""}`,
        debit: Number(s.total_amount),
        credit: 0,
        balance: 0,
        payment_method: paymentMethod,
        handled_by: s.profiles?.full_name,
        notes: s.notes,
      });
    });

    // Add payments (credit - customer paid us)
    transactions.forEach((t: any) => {
      if (t.type === "payment") {
        allEntries.push({
          id: t.id,
          type: "payment",
          display_id: t.display_id,
          date: t.transaction_date,
          description: `Payment Received${t.stores?.name ? ` (${t.stores.name})` : ""}`,
          debit: 0,
          credit: Number(t.amount),
          balance: 0,
          payment_method: t.payment_method,
          handled_by: t.profiles?.full_name,
          notes: t.notes,
        });
      } else if (t.type === "adjustment") {
        const isDebit = Number(t.amount) > 0;
        allEntries.push({
          id: t.id,
          type: "adjustment",
          display_id: t.display_id,
          date: t.transaction_date,
          description: `Balance Adjustment${t.stores?.name ? ` (${t.stores.name})` : ""}`,
          debit: isDebit ? Number(t.amount) : 0,
          credit: isDebit ? 0 : Math.abs(Number(t.amount)),
          balance: 0,
          notes: t.notes,
        });
      }
    });

    // Add returns (credit - reduces what customer owes)
    returns.forEach((r: any) => {
      allEntries.push({
        id: r.id,
        type: "return",
        display_id: r.display_id,
        date: r.return_date,
        description: `Sale Return${r.stores?.name ? ` (${r.stores.name})` : ""}`,
        debit: 0,
        credit: Number(r.total_amount),
        balance: 0,
        notes: r.reason,
      });
    });

    // Sort by date
    allEntries.sort((a, b) => {
      if (a.type === "opening") return -1;
      if (b.type === "opening") return 1;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });

    // Calculate running balance
    let balance = 0;
    allEntries.forEach((entry) => {
      balance += entry.debit - entry.credit;
      entry.balance = balance;
    });

    return allEntries;
  }, [sales, transactions, returns, openingBalance, dateRange]);

  // Totals
  const totals = useMemo(() => {
    const totalDebit = entries.reduce((sum, e) => sum + e.debit, 0);
    const totalCredit = entries.reduce((sum, e) => sum + e.credit, 0);
    const closingBalance = entries.length > 0 ? entries[entries.length - 1].balance : openingBalance;
    return { totalDebit, totalCredit, closingBalance };
  }, [entries, openingBalance]);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "sale": return <ShoppingCart className="h-4 w-4 text-blue-600" />;
      case "payment": return <CreditCard className="h-4 w-4 text-green-600" />;
      case "return": return <RotateCcw className="h-4 w-4 text-orange-600" />;
      default: return <FileText className="h-4 w-4 text-gray-600" />;
    }
  };

  const handlePrintHTML = () => {
    const info = companySettings || businessInfo;
    if (!info) return;
    const fmt = (n: number) => `₹${Math.abs(n).toLocaleString("en-IN")}`;
    const htmlContent = `
      <div style="margin-bottom:16px;padding:12px 16px;background:#f8f9fa;border-radius:6px;">
        <p style="margin:0 0 4px;font-size:13px;"><strong>Customer:</strong> ${customerName}${storeName ? ` • ${storeName}` : ""}</p>
      </div>

      <div class="kpi-row">
        <div class="kpi-card"><div class="kpi-label">Opening Balance</div><div class="kpi-value">${fmt(openingBalance)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Total Debit</div><div class="kpi-value">${fmt(totals.totalDebit)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Total Credit</div><div class="kpi-value">${fmt(totals.totalCredit)}</div></div>
        <div class="kpi-card highlight"><div class="kpi-label">Closing Balance</div><div class="kpi-value ${totals.closingBalance >= 0 ? 'text-neg' : 'text-pos'}">${fmt(totals.closingBalance)} ${totals.closingBalance >= 0 ? 'Due' : 'Advance'}</div></div>
      </div>

      <h2>Account Ledger</h2>
      <table>
        <thead><tr><th>Date</th><th>Type</th><th>ID</th><th>Description</th><th class="text-right">Debit</th><th class="text-right">Credit</th><th class="text-right">Balance</th></tr></thead>
        <tbody>
          ${entries.map(e => `
            <tr${e.type === 'opening' ? ' style="background:#f1f5f9;"' : ''}>
              <td>${format(new Date(e.date), "dd/MM/yy")}</td>
              <td><span style="text-transform:capitalize;">${e.type}</span></td>
              <td class="font-mono">${e.display_id}</td>
              <td>${e.description}${e.payment_method ? ` <span style="opacity:0.6;">(${e.payment_method})</span>` : ''}</td>
              <td class="text-right font-semibold" style="color:#2563eb;">${e.debit > 0 ? fmt(e.debit) : '—'}</td>
              <td class="text-right font-semibold" style="color:#16a34a;">${e.credit > 0 ? fmt(e.credit) : '—'}</td>
              <td class="text-right font-semibold" style="color:${e.balance >= 0 ? '#dc2626' : '#16a34a'};">${fmt(e.balance)}</td>
            </tr>
          `).join("")}
        </tbody>
        <tfoot>
          <tr style="background:var(--accent);color:white;font-weight:700;">
            <td colspan="4">TOTAL</td>
            <td class="text-right">${fmt(totals.totalDebit)}</td>
            <td class="text-right">${fmt(totals.totalCredit)}</td>
            <td class="text-right">${fmt(totals.closingBalance)}</td>
          </tr>
        </tfoot>
      </table>
    `;
    const html = generatePrintHTML({
      title: "Customer Statement",
      dateRange: `${format(dateRange.from, "MMM d, yyyy")} — ${format(dateRange.to, "MMM d, yyyy")}`,
      metadata: { "Customer": customerName, "Debit": fmt(totals.totalDebit), "Credit": fmt(totals.totalCredit), "Closing": `${fmt(totals.closingBalance)} ${totals.closingBalance >= 0 ? 'Due' : 'Adv'}` },
      companyInfo: info,
      htmlContent,
    });
    const win = window.open("", "_blank");
    if (win) { win.document.write(html); win.document.close(); win.onload = () => { win.print(); }; }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Customer Statement</h2>
          <p className="text-sm text-muted-foreground">
            {customerName} {storeName && `• ${storeName}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handlePrintHTML}>
            <Printer className="h-4 w-4 mr-2" />
            Print / PDF
          </Button>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <ReportFilters dateRange={dateRange} onDateRangeChange={setDateRange} />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Opening Balance</p>
          <p className="text-2xl font-bold">₹{openingBalance.toLocaleString()}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total Debit (Sales)</p>
          <p className="text-2xl font-bold text-blue-600">₹{totals.totalDebit.toLocaleString()}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total Credit (Payments)</p>
          <p className="text-2xl font-bold text-green-600">₹{totals.totalCredit.toLocaleString()}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Closing Balance</p>
          <p className={`text-2xl font-bold ${totals.closingBalance >= 0 ? "text-red-600" : "text-green-600"}`}>
            ₹{Math.abs(totals.closingBalance).toLocaleString()}
            <span className="text-xs font-normal ml-1">{totals.closingBalance >= 0 ? "Due" : "Advance"}</span>
          </p>
        </Card>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr className="text-left text-sm">
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">ID</th>
                    <th className="px-4 py-3 font-medium">Description</th>
                    <th className="px-4 py-3 font-medium text-right">Debit</th>
                    <th className="px-4 py-3 font-medium text-right">Credit</th>
                    <th className="px-4 py-3 font-medium text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {entries.map((entry, idx) => (
                    <tr key={`${entry.type}-${entry.id}`} className={entry.type === "opening" ? "bg-muted/30" : "hover:bg-muted/20"}>
                      <td className="px-4 py-3 text-sm">{format(new Date(entry.date), "dd MMM yyyy")}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {getTypeIcon(entry.type)}
                          <Badge variant="outline" className="text-xs capitalize">{entry.type}</Badge>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{entry.display_id}</td>
                      <td className="px-4 py-3 text-sm">
                        <div>
                          <span>{entry.description}</span>
                          {entry.payment_method && (
                            <span className="text-xs text-muted-foreground ml-2 capitalize">({entry.payment_method.replace("_", " ")})</span>
                          )}
                        </div>
                        {entry.handled_by && <p className="text-xs text-muted-foreground">By: {entry.handled_by}</p>}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-blue-600">
                        {entry.debit > 0 ? `₹${entry.debit.toLocaleString()}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-green-600">
                        {entry.credit > 0 ? `₹${entry.credit.toLocaleString()}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-bold">
                        <span className={entry.balance >= 0 ? "text-red-600" : "text-green-600"}>
                          ₹{Math.abs(entry.balance).toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/70 font-semibold">
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-right">TOTAL</td>
                    <td className="px-4 py-3 text-right text-blue-600">₹{totals.totalDebit.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-green-600">₹{totals.totalCredit.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={totals.closingBalance >= 0 ? "text-red-600" : "text-green-600"}>
                        ₹{Math.abs(totals.closingBalance).toLocaleString()}
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
