import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { format } from "date-fns";
import { ArrowDownLeft, ArrowUpRight, ArrowRightLeft, Package, Loader2 } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Movement {
  id: string;
  quantity: number;
  type: string;
  reason?: string;
  created_at: string;
  product?: { name: string; sku: string };
  creator_name?: string;
}

interface Transfer {
  id: string;
  display_id: string;
  transfer_type: string;
  status: string;
  quantity: number;
  actual_quantity?: number;
  difference?: number;
  description?: string;
  created_at: string;
  product?: { name: string; sku: string; unit: string };
  from_warehouse?: { name: string };
  to_warehouse?: { name: string };
  from_user?: { full_name: string };
  to_user?: { full_name: string };
}

interface StockHistoryViewProps {
  warehouseId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MovementTypeBadge = ({ type }: { type: string }) => {
  const map: Record<string, { label: string; className: string }> = {
    sale: { label: "Sale", className: "bg-blue-50 text-blue-700 border-blue-200" },
    transfer_out: { label: "Transfer Out", className: "bg-orange-50 text-orange-700 border-orange-200" },
    transfer_in: { label: "Transfer In", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    adjustment: { label: "Adjustment", className: "bg-amber-50 text-amber-700 border-amber-200" },
    return: { label: "Return", className: "bg-purple-50 text-purple-700 border-purple-200" },
    purchase: { label: "Purchase", className: "bg-teal-50 text-teal-700 border-teal-200" },
  };
  const cfg = map[type] ?? { label: type, className: "bg-gray-50 text-gray-600 border-gray-200" };
  return <Badge variant="outline" className={cfg.className}>{cfg.label}</Badge>;
};

const TransferTypeBadge = ({ type }: { type: string }) => {
  const map: Record<string, { label: string; className: string }> = {
    warehouse_to_staff: { label: "W → Staff", className: "bg-indigo-50 text-indigo-700 border-indigo-200" },
    staff_to_warehouse: { label: "Staff → W", className: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200" },
    staff_to_staff: { label: "Staff → Staff", className: "bg-rose-50 text-rose-700 border-rose-200" },
  };
  const cfg = map[type] ?? { label: type, className: "bg-gray-50 text-gray-600 border-gray-200" };
  return <Badge variant="outline" className={cfg.className}>{cfg.label}</Badge>;
};

const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, string> = {
    completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    cancelled: "bg-red-50 text-red-700 border-red-200",
    rejected: "bg-red-50 text-red-700 border-red-200",
  };
  return (
    <Badge variant="outline" className={map[status] ?? "bg-gray-50 text-gray-600 border-gray-200"}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
};

const QtyDisplay = ({ qty, type }: { qty: number; type: string }) => {
  const positive = ["purchase", "transfer_in", "return"].includes(type) || (type === "adjustment" && qty > 0);
  const color = positive ? "text-emerald-600" : "text-red-500";
  const sign = positive ? "+" : qty < 0 ? "" : "-";
  return <span className={`font-medium ${color}`}>{sign}{Math.abs(qty)}</span>;
};

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

const EmptyState = ({ message }: { message: string }) => (
  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
    <Package className="h-10 w-10 mb-3 opacity-20" />
    <p className="text-sm">{message}</p>
  </div>
);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StockHistoryView({ warehouseId }: StockHistoryViewProps) {
  const [tab, setTab] = useState<"movements" | "transfers">("movements");

  // ── Stock Movements ─────────────────────────────────────────────────────────
  const { data: movements = [], isLoading: isLoadingMovements } = useQuery({
    queryKey: ["stock-movements", warehouseId],
    queryFn: async () => {
      if (!warehouseId) return [];
      const { data, error } = await supabase
        .from("stock_movements")
        .select("id, quantity, type, reason, created_at, created_by, product:products(name, sku)")
        .eq("warehouse_id", warehouseId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      if (!data?.length) return [];

      const userIds = [...new Set(data.filter((m) => m.created_by).map((m) => m.created_by))] as string[];
      const profileMap: Record<string, string> = {};
      if (userIds.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", userIds);
        for (const p of profiles ?? []) profileMap[p.user_id] = p.full_name ?? "Unknown";
      }

      return data.map((m) => ({
        ...m,
        product: Array.isArray(m.product) ? m.product[0] : m.product,
        creator_name: m.created_by ? (profileMap[m.created_by] ?? "Unknown") : "System",
      })) as Movement[];
    },
    enabled: !!warehouseId,
  });

  // ── Stock Transfers ─────────────────────────────────────────────────────────
  const { data: transfers = [], isLoading: isLoadingTransfers } = useQuery({
    queryKey: ["stock-transfers", warehouseId],
    queryFn: async () => {
      if (!warehouseId) return [];
      const { data, error } = await supabase
        .from("stock_transfers")
        .select(`
          id, display_id, transfer_type, status, quantity, actual_quantity, difference,
          description, created_at,
          product:products!stock_transfers_product_id_fkey(name, sku, unit),
          from_warehouse:warehouses!stock_transfers_from_warehouse_id_fkey(name),
          to_warehouse:warehouses!stock_transfers_to_warehouse_id_fkey(name),
          from_user:profiles!stock_transfers_from_user_id_profiles_fkey(full_name),
          to_user:profiles!stock_transfers_to_user_id_profiles_fkey(full_name)
        `)
        .or(`from_warehouse_id.eq.${warehouseId},to_warehouse_id.eq.${warehouseId}`)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []).map((t) => ({
        ...t,
        product: Array.isArray(t.product) ? t.product[0] : t.product,
        from_warehouse: Array.isArray(t.from_warehouse) ? t.from_warehouse[0] : t.from_warehouse,
        to_warehouse: Array.isArray(t.to_warehouse) ? t.to_warehouse[0] : t.to_warehouse,
        from_user: Array.isArray(t.from_user) ? t.from_user[0] : t.from_user,
        to_user: Array.isArray(t.to_user) ? t.to_user[0] : t.to_user,
      })) as Transfer[];
    },
    enabled: !!warehouseId,
  });

  const isLoading = tab === "movements" ? isLoadingMovements : isLoadingTransfers;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as "movements" | "transfers")}>
        <TabsList>
          <TabsTrigger value="movements" className="flex items-center gap-2">
            <ArrowDownLeft className="h-3.5 w-3.5" />
            Stock Movements
            <Badge variant="secondary" className="ml-1">{movements.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="transfers" className="flex items-center gap-2">
            <ArrowRightLeft className="h-3.5 w-3.5" />
            Transfers
            <Badge variant="secondary" className="ml-1">{transfers.length}</Badge>
          </TabsTrigger>
        </TabsList>

        {/* ── Movements ── */}
        <TabsContent value="movements">
          <Card>
            <CardContent className="p-0">
              {isLoadingMovements ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
                </div>
              ) : movements.length === 0 ? (
                <EmptyState message="No stock movements recorded yet." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
                      <tr>
                        <th className="px-4 py-3 font-medium">Date</th>
                        <th className="px-4 py-3 font-medium">Product</th>
                        <th className="px-4 py-3 font-medium">Type</th>
                        <th className="px-4 py-3 font-medium text-right">Qty</th>
                        <th className="px-4 py-3 font-medium">By</th>
                        <th className="px-4 py-3 font-medium">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {movements.map((m) => (
                        <tr key={m.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 whitespace-nowrap text-slate-600 font-medium">
                            {format(new Date(m.created_at), "MMM d, yy HH:mm")}
                          </td>
                          <td className="px-4 py-3 font-medium">{m.product?.name ?? "Unknown"}</td>
                          <td className="px-4 py-3"><MovementTypeBadge type={m.type} /></td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <QtyDisplay qty={m.quantity} type={m.type} />
                          </td>
                          <td className="px-4 py-3 text-slate-600">{m.creator_name ?? "—"}</td>
                          <td className="px-4 py-3 text-muted-foreground max-w-[180px] truncate" title={m.reason ?? ""}>
                            {m.reason ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Transfers ── */}
        <TabsContent value="transfers">
          <Card>
            <CardContent className="p-0">
              {isLoadingTransfers ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
                </div>
              ) : transfers.length === 0 ? (
                <EmptyState message="No stock transfers recorded yet." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
                      <tr>
                        <th className="px-4 py-3 font-medium">Date</th>
                        <th className="px-4 py-3 font-medium">Ref</th>
                        <th className="px-4 py-3 font-medium">Product</th>
                        <th className="px-4 py-3 font-medium">Type</th>
                        <th className="px-4 py-3 font-medium">Route</th>
                        <th className="px-4 py-3 font-medium text-right">Qty</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {transfers.map((t) => {
                        const route =
                          t.transfer_type === "warehouse_to_staff"
                            ? `${t.from_warehouse?.name ?? "W"} → ${t.to_user?.full_name ?? "?"}`
                            : t.transfer_type === "staff_to_warehouse"
                            ? `${t.from_user?.full_name ?? "?"} → ${t.to_warehouse?.name ?? "W"}`
                            : `${t.from_user?.full_name ?? "?"} → ${t.to_user?.full_name ?? "?"}`;

                        return (
                          <tr key={t.id} className="hover:bg-slate-50/50">
                            <td className="px-4 py-3 whitespace-nowrap text-slate-600 font-medium">
                              {format(new Date(t.created_at), "MMM d, yy HH:mm")}
                            </td>
                            <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                              {t.display_id}
                            </td>
                            <td className="px-4 py-3 font-medium">{t.product?.name ?? "Unknown"}</td>
                            <td className="px-4 py-3"><TransferTypeBadge type={t.transfer_type} /></td>
                            <td className="px-4 py-3 text-slate-600 max-w-[160px] truncate" title={route}>
                              {route}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className="font-medium">{t.quantity}</span>
                              {t.actual_quantity != null && t.actual_quantity !== t.quantity && (
                                <span className="text-xs text-muted-foreground ml-1">
                                  (actual: {t.actual_quantity})
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                            <td className="px-4 py-3 text-muted-foreground max-w-[150px] truncate" title={t.description ?? ""}>
                              {t.description ?? "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
