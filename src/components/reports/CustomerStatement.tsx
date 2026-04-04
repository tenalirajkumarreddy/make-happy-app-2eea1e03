import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText, ShoppingCart, CreditCard, RotateCcw, Download, Printer, X } from "lucide-react";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { ReportFilters, DateRange } from "./ReportFilters";
import { PrintPreview, PrintHeader, PrintFooter, PrintTable } from "./PrintPreview";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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
  const [showPrint, setShowPrint] = useState(false);

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

  const exportPDF = () => {
    const doc = new jsPDF();
    
    // Header
    if (businessInfo) {
      doc.setFontSize(14);
      doc.text(businessInfo.company_name || "Company", 14, 15);
      doc.setFontSize(9);
      if (businessInfo.address) doc.text(businessInfo.address, 14, 22);
      if (businessInfo.gstin) doc.text(`GSTIN: ${businessInfo.gstin}`, 14, 27);
    }
    
    doc.setFontSize(12);
    doc.text("Customer Statement", 14, 38);
    doc.setFontSize(10);
    doc.text(`Customer: ${customerName}`, 14, 45);
    if (storeName) doc.text(`Store: ${storeName}`, 14, 51);
    doc.text(`Period: ${format(dateRange.from, "MMM d, yyyy")} - ${format(dateRange.to, "MMM d, yyyy")}`, 14, storeName ? 57 : 51);

    const startY = storeName ? 65 : 58;

    autoTable(doc, {
      startY,
      head: [["Date", "ID", "Description", "Debit (₹)", "Credit (₹)", "Balance (₹)"]],
      body: entries.map((e) => [
        format(new Date(e.date), "dd/MM/yyyy"),
        e.display_id,
        e.description + (e.payment_method ? ` (${e.payment_method})` : ""),
        e.debit > 0 ? e.debit.toLocaleString() : "",
        e.credit > 0 ? e.credit.toLocaleString() : "",
        e.balance.toLocaleString(),
      ]),
      foot: [[
        "", "", "TOTAL",
        totals.totalDebit.toLocaleString(),
        totals.totalCredit.toLocaleString(),
        totals.closingBalance.toLocaleString()
      ]],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [59, 130, 246] },
      footStyles: { fillColor: [229, 231, 235], textColor: [0, 0, 0], fontStyle: "bold" },
    });

    // Closing summary
    const finalY = (doc as any).lastAutoTable.finalY || startY + 50;
    doc.setFontSize(10);
    doc.text(`Closing Balance: ₹${totals.closingBalance.toLocaleString()}`, 14, finalY + 10);
    doc.setFontSize(8);
    doc.text(`Generated on ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, finalY + 18);

    doc.save(`statement-${customerName.replace(/\s+/g, "-")}-${format(dateRange.from, "yyyyMMdd")}-${format(dateRange.to, "yyyyMMdd")}.pdf`);
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
          <Button variant="outline" size="sm" onClick={exportPDF}>
            <Download className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowPrint(true)}>
            <Printer className="h-4 w-4 mr-2" />
            Print
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

      {/* Print Preview Dialog */}
      <PrintPreview 
        open={showPrint} 
        onOpenChange={setShowPrint}
        title="Customer Statement"
        onDownloadPDF={exportPDF}
      >
        <PrintHeader
          companyName={businessInfo?.company_name}
          address={businessInfo?.address}
          phone={businessInfo?.phone}
          gstin={businessInfo?.gstin}
          title="Customer Statement"
          subtitle={`${customerName}${storeName ? ` • ${storeName}` : ""}`}
          dateRange={`${format(dateRange.from, "dd MMM yyyy")} - ${format(dateRange.to, "dd MMM yyyy")}`}
        />

        <div className="mb-4 p-3 bg-gray-50 rounded">
          <div className="grid grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Opening Balance</p>
              <p className="font-semibold">₹{openingBalance.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-gray-500">Total Debit</p>
              <p className="font-semibold">₹{totals.totalDebit.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-gray-500">Total Credit</p>
              <p className="font-semibold">₹{totals.totalCredit.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-gray-500">Closing Balance</p>
              <p className="font-bold text-lg">₹{Math.abs(totals.closingBalance).toLocaleString()} {totals.closingBalance >= 0 ? "Due" : "Advance"}</p>
            </div>
          </div>
        </div>

        <PrintTable
          headers={["Date", "Type", "ID", "Description", "Debit", "Credit", "Balance"]}
          rows={entries.map((e) => [
            format(new Date(e.date), "dd/MM/yy"),
            e.type.charAt(0).toUpperCase() + e.type.slice(1),
            e.display_id,
            `${e.description}${e.payment_method ? ` (${e.payment_method})` : ""}`,
            e.debit > 0 ? `₹${e.debit.toLocaleString()}` : "—",
            e.credit > 0 ? `₹${e.credit.toLocaleString()}` : "—",
            `₹${Math.abs(e.balance).toLocaleString()}`,
          ])}
          footer={["", "", "", "TOTAL", `₹${totals.totalDebit.toLocaleString()}`, `₹${totals.totalCredit.toLocaleString()}`, `₹${Math.abs(totals.closingBalance).toLocaleString()}`]}
        />

        <PrintFooter generatedAt={format(new Date(), "dd/MM/yyyy HH:mm")} />
      </PrintPreview>
    </div>
  );
}
