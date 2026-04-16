import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Download, FileText, ArrowUpRight, ArrowDownRight, Printer } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DataTable } from "@/components/shared/DataTable";

interface LedgerEntry {
  customer_id: string;
  store_id: string;
  record_id: string;
  reference: string;
  transaction_type: string;
  transaction_date: string;
  debit: number;
  credit: number;
  balance_impact: number;
  opening_balance: number | null;
  closing_balance: number | null;
  recorded_by: string | null;
  recorded_by_name: string | null;
  store_name: string;
  notes: string | null;
}

interface CustomerLedgerProps {
  customerId: string;
  customerName?: string;
}

export function CustomerLedger({ customerId, customerName }: CustomerLedgerProps) {
  const [showStatement, setShowStatement] = useState(false);

  const { data: ledger, isLoading } = useQuery({
    queryKey: ["customer-ledger", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_ledger")
        .select("*")
        .eq("customer_id", customerId)
        .order("transaction_date", { ascending: false })
        .limit(100);

      if (error) throw error;
      return data as LedgerEntry[];
    },
  });

  const { data: summary } = useQuery({
    queryKey: ["customer-ledger-summary", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("generate_customer_statement", {
          p_customer_id: customerId,
          p_from_date: null,
          p_to_date: null,
        });

      if (error) throw error;
      return data?.[0];
    },
  });

  const exportToCSV = () => {
    if (!ledger) return;

    const headers = ["Date", "Type", "Reference", "Store", "Debit", "Credit", "Balance", "Notes"];
    const rows = ledger.map((entry) => [
      format(new Date(entry.transaction_date), "yyyy-MM-dd"),
      entry.transaction_type,
      entry.reference,
      entry.store_name,
      entry.debit || "",
      entry.credit || "",
      entry.closing_balance || "",
      entry.notes || "",
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ledger-${customerId}-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success("Ledger exported");
  };

  const printStatement = () => {
    setShowStatement(true);
    setTimeout(() => window.print(), 500);
  };

  const columns = [
    {
      header: "Date",
      accessor: (row: LedgerEntry) => format(new Date(row.transaction_date), "dd MMM yyyy"),
      className: "whitespace-nowrap text-xs",
    },
    {
      header: "Type",
      accessor: (row: LedgerEntry) => (
        <div className="flex items-center gap-1">
          {row.transaction_type === "SALE" && (
            <>
              <ArrowUpRight className="h-3 w-3 text-red-500" />
              <Badge variant="destructive" className="text-[10px]">
                SALE
              </Badge>
            </>
          )}
          {row.transaction_type === "PAYMENT" && (
            <>
              <ArrowDownRight className="h-3 w-3 text-green-500" />
              <Badge variant="default" className="bg-green-500 text-[10px]">
                PAYMENT
              </Badge>
            </>
          )}
          {row.transaction_type === "RETURN" && (
            <>
              <ArrowDownRight className="h-3 w-3 text-blue-500" />
              <Badge variant="secondary" className="text-[10px]">
                RETURN
              </Badge>
            </>
          )}
        </div>
      ),
      className: "w-28",
    },
    {
      header: "Reference",
      accessor: (row: LedgerEntry) => (
        <span className="font-mono text-xs">{row.reference}</span>
      ),
    },
    {
      header: "Store",
      accessor: (row: LedgerEntry) => row.store_name,
      className: "max-w-xs truncate text-sm",
    },
    {
      header: "Debit",
      accessor: (row: LedgerEntry) =>
        row.debit > 0 ? (
          <span className="text-red-600 font-medium">
            ₹{row.debit.toLocaleString()}
          </span>
        ) : (
          ""
        ),
      className: "text-right font-mono",
    },
    {
      header: "Credit",
      accessor: (row: LedgerEntry) =>
        row.credit > 0 ? (
          <span className="text-green-600 font-medium">
            ₹{row.credit.toLocaleString()}
          </span>
        ) : (
          ""
        ),
      className: "text-right font-mono",
    },
    {
      header: "Balance",
      accessor: (row: LedgerEntry) => (
        <span className="font-medium">
          ₹{row.closing_balance?.toLocaleString() || "—"}
        </span>
      ),
      className: "text-right font-mono font-semibold",
    },
    {
      header: "By",
      accessor: (row: LedgerEntry) => row.recorded_by_name || "—",
      className: "text-xs text-muted-foreground",
    },
  ];

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Opening Balance</p>
              <p className="text-lg font-bold">
                ₹{Number(summary.opening_balance).toLocaleString()}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total Sales</p>
              <p className="text-lg font-bold text-red-600">
                ₹{Number(summary.total_sales).toLocaleString()}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total Payments</p>
              <p className="text-lg font-bold text-green-600">
                ₹{Number(summary.total_payments).toLocaleString()}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Closing Balance</p>
              <p className="text-lg font-bold">
                ₹{Number(summary.closing_balance).toLocaleString()}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={exportToCSV}>
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
        <Button variant="outline" size="sm" onClick={printStatement}>
          <Printer className="mr-2 h-4 w-4" />
          Print Statement
        </Button>
      </div>

      {/* Ledger Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Transaction History
            <Badge variant="secondary" className="ml-2">
              {ledger?.length || 0} entries
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={ledger || []}
            keyExtractor={(row) => row.record_id}
          />
        </CardContent>
      </Card>

      {/* Statement Dialog for Printing */}
      <Dialog open={showStatement} onOpenChange={setShowStatement}>
        <DialogContent className="max-w-3xl print:max-w-full">
          <DialogHeader>
            <DialogTitle>Customer Statement</DialogTitle>
          </DialogHeader>

          <div className="print:block">
            {summary && (
              <div className="space-y-4">
                <div className="border-b pb-4">
                  <h2 className="text-xl font-bold">{customerName || "Customer"}</h2>
                  <p className="text-muted-foreground">
                    Statement Period: {format(new Date(), "dd MMM yyyy")}
                  </p>
                </div>

                <div className="grid grid-cols-4 gap-4 py-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Opening Balance</p>
                    <p className="text-lg font-bold">
                      ₹{Number(summary.opening_balance).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Sales</p>
                    <p className="text-lg font-bold text-red-600">
                      ₹{Number(summary.total_sales).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Payments</p>
                    <p className="text-lg font-bold text-green-600">
                      ₹{Number(summary.total_payments).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Closing Balance</p>
                    <p className="text-lg font-bold">
                      ₹{Number(summary.closing_balance).toLocaleString()}
                    </p>
                  </div>
                </div>

                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Date</th>
                      <th className="text-left">Type</th>
                      <th className="text-left">Reference</th>
                      <th className="text-right">Debit</th>
                      <th className="text-right">Credit</th>
                      <th className="text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger?.map((entry) => (
                      <tr key={entry.record_id} className="border-b">
                        <td className="py-2">
                          {format(new Date(entry.transaction_date), "dd MMM yyyy")}
                        </td>
                        <td>{entry.transaction_type}</td>
                        <td className="font-mono text-xs">{entry.reference}</td>
                        <td className="text-right text-red-600">
                          {entry.debit > 0 ? `₹${entry.debit.toLocaleString()}` : ""}
                        </td>
                        <td className="text-right text-green-600">
                          {entry.credit > 0 ? `₹${entry.credit.toLocaleString()}` : ""}
                        </td>
                        <td className="text-right font-medium">
                          ₹{entry.closing_balance?.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
