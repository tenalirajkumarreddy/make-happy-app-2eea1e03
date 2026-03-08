import { useMemo, useState } from "react";
import { DataTable } from "@/components/shared/DataTable";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Package, Tag } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type LedgerEntry = {
  id: string;
  type: "sale" | "payment" | "correction";
  date: string;
  display_id: string;
  description: string;
  total_amount: number;
  cash_amount: number;
  upi_amount: number;
  outstanding: number; // new_outstanding = running balance
  notes: string | null;
  recorded_by: string;
  raw: any;
};

interface StoreLedgerProps {
  sales: any[];
  transactions: any[];
  openingBalance: number;
  storeCreatedAt: string;
  profileMap: Map<string, { user_id: string; full_name: string; avatar_url: string | null }>;
}

export function StoreLedger({ sales, transactions, openingBalance, storeCreatedAt, profileMap }: StoreLedgerProps) {
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  const ledgerEntries = useMemo(() => {
    const entries: LedgerEntry[] = [];

    for (const s of sales) {
      entries.push({
        id: s.id,
        type: "sale",
        date: s.created_at,
        display_id: s.display_id,
        description: `Sale #${s.display_id}`,
        total_amount: Number(s.total_amount),
        cash_amount: Number(s.cash_amount),
        upi_amount: Number(s.upi_amount),
        outstanding: Number(s.new_outstanding),
        notes: s.notes,
        recorded_by: s.recorded_by,
        raw: s,
      });
    }

    for (const t of transactions) {
      const paymentMethod = Number(t.cash_amount) > 0 && Number(t.upi_amount) > 0
        ? "Cash+UPI"
        : Number(t.upi_amount) > 0 ? "UPI" : "Cash";
      entries.push({
        id: t.id,
        type: "payment",
        date: t.created_at,
        display_id: t.display_id,
        description: `Payment (${paymentMethod}) #${t.display_id}`,
        total_amount: Number(t.total_amount),
        cash_amount: Number(t.cash_amount),
        upi_amount: Number(t.upi_amount),
        outstanding: Number(t.new_outstanding),
        notes: t.notes,
        recorded_by: t.recorded_by,
        raw: t,
      });
    }

    // Sort newest first
    entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Add opening balance as the very last (oldest) entry
    entries.push({
      id: "__opening_balance__",
      type: "correction" as const,
      date: storeCreatedAt,
      display_id: "",
      description: "Opening Balance",
      total_amount: openingBalance,
      cash_amount: 0,
      upi_amount: 0,
      outstanding: openingBalance,
      notes: null,
      recorded_by: "",
      raw: null,
    });

    return entries;
  }, [sales, transactions, openingBalance]);

  const selectedEntry = ledgerEntries.find((e) => e.id === selectedEntryId);
  const isSaleSelected = selectedEntry?.type === "sale";

  const { data: saleItems, isLoading: loadingSaleItems } = useQuery({
    queryKey: ["sale-items-detail", selectedEntryId],
    queryFn: async () => {
      const { data } = await supabase
        .from("sale_items")
        .select("*, products(name, sku)")
        .eq("sale_id", selectedEntryId!);
      return data || [];
    },
    enabled: !!selectedEntryId && isSaleSelected,
  });

  const getRecorder = (uid: string) => profileMap.get(uid);

  const columns = [
    {
      header: "Date",
      accessor: (row: LedgerEntry) => row.date ? new Date(row.date).toLocaleDateString("en-IN") : "—",
      className: "text-muted-foreground text-xs",
    },
    {
      header: "Description",
      accessor: (row: LedgerEntry) => {
        if (row.id === "__opening_balance__") {
          return (
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted shadow-sm">
                <Tag className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium text-sm uppercase tracking-wide text-muted-foreground">Opening Balance</p>
                <p className="text-sm font-semibold">₹{row.outstanding.toLocaleString()}</p>
              </div>
            </div>
          );
        }
        return (
          <div>
            <p className="font-medium text-sm">{row.description}</p>
            <p className="text-[11px] text-muted-foreground uppercase">{row.type === "sale" ? "SALE" : row.type === "payment" ? "PAYMENT" : "CORRECTION"}</p>
            {row.notes && (
              <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                <span className="w-0.5 h-3 bg-primary/40 rounded-full inline-block" />
                <span className="italic">{row.notes}</span>
              </p>
            )}
          </div>
        );
      },
    },
    {
      header: "Debit (-)",
      accessor: (row: LedgerEntry) =>
        row.type === "sale" ? (
          <span className="text-destructive font-medium">₹{row.total_amount.toLocaleString()}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      header: "Credit (+)",
      accessor: (row: LedgerEntry) =>
        row.type === "payment" ? (
          <span className="text-success font-medium">₹{row.total_amount.toLocaleString()}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      header: "Balance",
      accessor: (row: LedgerEntry) => (
        <span className={row.outstanding < 0 ? "text-destructive font-semibold" : "text-foreground font-semibold"}>
          {row.outstanding < 0 ? "-" : ""}₹{Math.abs(row.outstanding).toLocaleString()}
        </span>
      ),
    },
  ];

  const renderMobileCard = (row: LedgerEntry) => {
    const p = getRecorder(row.recorded_by);

    if (row.id === "__opening_balance__") {
      return (
        <div className="rounded-xl border bg-card px-3 py-2.5 shadow-sm">
          <div className="flex items-center justify-between">
            <Badge variant="secondary" className="text-[10px] h-5">PAYMENT</Badge>
            <span className="text-[11px] text-muted-foreground">
              {new Date(row.date).toLocaleDateString("en-IN")}
            </span>
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <span className="font-medium text-sm text-muted-foreground">Opening Balance</span>
            <span className="text-sm font-bold text-success">₹{row.total_amount.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between mt-1 text-[11px] text-muted-foreground">
            <span>Bal: ₹{Math.abs(row.outstanding).toLocaleString()}</span>
            <span>Admin</span>
          </div>
        </div>
      );
    }

    return (
      <div
        className="rounded-xl border bg-card px-3 py-2.5 shadow-sm cursor-pointer"
        onClick={() => setSelectedEntryId(row.id)}
      >
        <div className="flex items-center justify-between">
          <Badge variant={row.type === "sale" ? "destructive" : "secondary"} className="text-[10px] h-5">
            {row.type === "sale" ? "SALE" : "PAYMENT"}
          </Badge>
          <span className="text-[11px] text-muted-foreground">
            {new Date(row.date).toLocaleDateString("en-IN")}
          </span>
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span className="font-mono text-xs text-muted-foreground">{row.display_id}</span>
          <span className={`text-sm font-bold ${row.type === "sale" ? "text-destructive" : "text-success"}`}>
            {row.type === "sale" ? "-" : "+"}₹{row.total_amount.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center justify-between mt-1 text-[11px] text-muted-foreground">
          <span>Bal: ₹{Math.abs(row.outstanding).toLocaleString()}</span>
          {p && <span>{p.full_name}</span>}
        </div>
      </div>
    );
  };

  return (
    <>
      {ledgerEntries.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center text-muted-foreground">
          No ledger entries yet
        </div>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={ledgerEntries}
            searchKey="display_id"
            searchPlaceholder="Search by ID..."
            onRowClick={(row: any) => setSelectedEntryId(row.id)}
            renderMobileCard={renderMobileCard}
          />
        </>
      )}

      {/* Entry Detail Dialog */}
      <Dialog open={!!selectedEntryId} onOpenChange={(v) => { if (!v) setSelectedEntryId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedEntry?.type === "sale" ? "Sale Details" : selectedEntry?.type === "payment" ? "Payment Details" : "Entry Details"}
            </DialogTitle>
          </DialogHeader>
          {selectedEntry && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-muted-foreground">{selectedEntry.display_id}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(selectedEntry.date).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Total</span>
                  <span className="font-bold">₹{selectedEntry.total_amount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Cash</span>
                  <span>₹{selectedEntry.cash_amount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>UPI</span>
                  <span>₹{selectedEntry.upi_amount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span>Balance After</span>
                  <span className={selectedEntry.outstanding < 0 ? "text-destructive" : ""}>
                    ₹{Math.abs(selectedEntry.outstanding).toLocaleString()}
                  </span>
                </div>
              </div>

              {selectedEntry.notes && (
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm italic">{selectedEntry.notes}</p>
                </div>
              )}

              {/* Sale items */}
              {isSaleSelected && (
                <div>
                  <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
                    <Package className="h-4 w-4 text-muted-foreground" /> Items
                  </p>
                  {loadingSaleItems ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : saleItems && saleItems.length > 0 ? (
                    <div className="space-y-1.5">
                      {saleItems.map((item: any) => (
                        <div key={item.id} className="flex items-center justify-between rounded-lg border bg-card p-2.5 text-sm">
                          <div>
                            <p className="font-medium">{item.products?.name || "—"}</p>
                            <p className="text-[11px] text-muted-foreground">{item.products?.sku} · Qty: {Number(item.quantity)}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">₹{Number(item.total_price).toLocaleString()}</p>
                            <p className="text-[11px] text-muted-foreground">@ ₹{Number(item.unit_price).toLocaleString()}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No items recorded</p>
                  )}
                </div>
              )}

              {(() => {
                const p = getRecorder(selectedEntry.recorded_by);
                return p ? (
                  <div className="flex items-center gap-2 pt-2 border-t">
                    <Avatar className="h-5 w-5">
                      <AvatarImage src={p?.avatar_url || undefined} />
                      <AvatarFallback className="text-[9px] bg-primary/10 text-primary">
                        {(p?.full_name || "?").charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs text-muted-foreground">Recorded by {p?.full_name || "—"}</span>
                  </div>
                ) : null;
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
