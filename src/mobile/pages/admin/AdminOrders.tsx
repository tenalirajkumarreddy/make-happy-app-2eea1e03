import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  X,
  ClipboardList,
  Clock,
  CheckCircle2,
  Truck,
  XCircle,
  Package,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { toast } from "sonner";
import { MobileListSkeleton } from "@/components/shared/MobileListSkeleton";
import { OrderFulfillmentDialog } from "@/components/orders/OrderFulfillmentDialog";
import { Button } from "@/components/ui/button";

const STATUS_CONFIG: Record<
  string,
  { color: string; icon: React.ElementType }
> = {
  pending: { color: "amber", icon: Clock },
  confirmed: { color: "blue", icon: CheckCircle2 },
  delivered: { color: "emerald", icon: Truck },
  cancelled: { color: "red", icon: XCircle },
};

// Type for order fulfillment
interface FulfillOrder {
  id: string;
  display_id: string;
  store_id: string;
  customer_id: string | null;
  order_type: "simple" | "detailed";
  status: string;
  requirement_note: string | null;
  order_items?: Array<{
    id: string;
    product_id: string;
    quantity: number;
    unit_price: number | null;
    products?: {
      id: string;
      name: string;
      sku: string;
      base_price: number;
      image_url?: string;
    };
  }>;
  stores?: {
    id: string;
    name: string;
    store_type_id: string | null;
    customer_id: string | null;
  };
}

export function AdminOrders() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [fulfillOrder, setFulfillOrder] = useState<FulfillOrder | null>(null);
  const [loadingOrderId, setLoadingOrderId] = useState<string | null>(null);

  const { data: orders, isLoading } = useQuery({
    queryKey: ["admin-mobile-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, display_id, status, requirement_note, created_at, stores(name), customers(name)",
        )
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data as any[]) || [];
    },
    refetchInterval: 60_000,
  });

  const statusCounts = (orders || []).reduce(
    (acc: Record<string, number>, o: any) => {
      acc[o.status] = (acc[o.status] || 0) + 1;
      return acc;
    },
    {},
  );

  const filtered = (orders || []).filter((o: any) => {
    const matchStatus = statusFilter === "all" || o.status === statusFilter;
    if (!search) return matchStatus;
    const q = search.toLowerCase();
    return (
      matchStatus &&
      (o.display_id?.toLowerCase().includes(q) ||
        o.stores?.name?.toLowerCase().includes(q) ||
        o.customers?.name?.toLowerCase().includes(q))
    );
  });

  // Open fulfillment dialog for an order
  const handleOpenFulfillment = async (orderId: string) => {
    setLoadingOrderId(orderId);
    try {
      const { data: orderData, error } = await supabase
        .from("orders")
        .select(
          `
          *,
          stores(id, name, store_type_id, customer_id),
          order_items(id, product_id, quantity, unit_price, products(id, name, sku, base_price, image_url))
        `,
        )
        .eq("id", orderId)
        .single();

      if (error) throw error;
      setFulfillOrder(orderData as unknown as FulfillOrder);
    } catch (error) {
      toast.error("Failed to load order details");
    } finally {
      setLoadingOrderId(null);
    }
  };

  return (
    <div className="pb-8 bg-muted dark:bg-[#0f1115] min-h-full">
      {/* Premium Hero Header */}
      <div className="bg-background dark:bg-[#1a1d24] px-5 pt-3 pb-6 rounded-b-[2rem] shadow-sm mb-6 relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-orange-500/10 blur-3xl rounded-full pointer-events-none" />
        <div className="absolute top-10 -left-10 w-32 h-32 bg-amber-500/10 blur-3xl rounded-full pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center text-center">
          <p className="text-muted-foreground text-[11px] font-bold uppercase tracking-widest mb-1">
            Total Orders
          </p>
          <h2 className="text-foreground text-5xl font-black tracking-tighter mt-1 mb-2">
            {orders?.length ?? 0}
          </h2>
          <div className="flex flex-wrap justify-center gap-2 mt-2">
            {Object.entries(statusCounts).map(([status, count]) => {
              if (!count) return null;
              const config = STATUS_CONFIG[status] || {
                color: "slate",
                icon: Clock,
              };
              const colorClasses = {
                amber:
                  "text-amber-700 bg-amber-100 dark:text-amber-400 dark:bg-amber-500/20",
                blue: "text-blue-700 bg-blue-100 dark:text-blue-400 dark:bg-blue-500/20",
                emerald:
                  "text-emerald-700 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-500/20",
                red: "text-red-700 bg-red-100 dark:text-red-400 dark:bg-red-500/20",
              }[config.color as keyof typeof STATUS_CONFIG | "slate"];

              return (
                <span
                  key={status}
                  className={cn(
                    "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md",
                    colorClasses,
                  )}
                >
                  {status}: {String(count)}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      <div className="px-5 space-y-4">
        {/* Modern floating search bar */}
        <div className="bg-background dark:bg-[#1a1d24] rounded-2xl p-2 shadow-sm flex items-center pr-3 border-transparent focus-within:border-orange-500 dark:focus-within:border-orange-500 transition-colors border">
          <Search className="h-5 w-5 text-muted-foreground ml-2 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search store, customer, or ID..."
            className="flex-1 bg-transparent border-none focus:ring-0 text-sm px-3 h-10 text-foreground placeholder:text-muted-foreground"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="h-8 w-8 flex items-center justify-center bg-secondary text-secondary-foreground rounded-full active:scale-95 transition-transform shrink-0"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Status filter pills */}
        <div className="flex gap-2 overflow-x-auto pb-2 pt-1 scrollbar-hide -mx-5 px-5 snap-x">
          {["all", "pending", "confirmed", "delivered", "cancelled"].map(
            (s) => {
              const isSelected = statusFilter === s;
              const count =
                s === "all" ? (orders?.length ?? 0) : statusCounts[s] || 0;

              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={cn(
                    "snap-start px-4 py-2 rounded-xl text-[13px] font-bold tracking-tight whitespace-nowrap transition-all active:scale-95 shadow-sm border",
                    isSelected
                      ? "bg-orange-500 text-white border-orange-500 dark:bg-orange-600 dark:border-orange-600"
                      : "bg-background dark:bg-[#1a1d24] text-muted-foreground border-border",
                  )}
                >
                  {s === "all"
                    ? "All Orders"
                    : s.charAt(0).toUpperCase() + s.slice(1)}{" "}
                  <span
                    className={cn(
                      "ml-1.5 px-1.5 py-0.5 rounded-md text-[10px]",
                      isSelected
                        ? "bg-background/20 text-white"
                        : "bg-secondary text-secondary-foreground text-muted-foreground",
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            },
          )}
        </div>

        <div className="flex items-center justify-between px-1 mt-2 mb-2">
          <h3 className="text-[15px] font-bold text-foreground tracking-tight">
            Order Records
          </h3>
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            {filtered.length} found
          </span>
        </div>

        {isLoading ? (
          <MobileListSkeleton items={6} showStats={false} titleWidth="w-40" />
        ) : filtered.length === 0 ? (
          <div className="bg-background dark:bg-[#1a1d24] rounded-2xl py-12 text-center shadow-sm">
            <div className="h-14 w-14 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
              <ClipboardList className="h-6 w-6 text-muted-foreground dark:text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold text-foreground">
              No orders found
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Change your filters or search
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((order: any) => {
              const config = STATUS_CONFIG[order.status] || {
                color: "slate",
                icon: Clock,
              };
              const StatusIcon = config.icon;

              const colorClasses = {
                amber:
                  "text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/10",
                blue: "text-blue-700 bg-blue-50 dark:text-blue-400 dark:bg-blue-500/10",
                emerald:
                  "text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/10",
                red: "text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-500/10",
                slate: "text-foreground bg-muted dark:text-muted-foreground ",
              }[config.color as keyof typeof STATUS_CONFIG | "slate"];

              return (
                <div
                  key={order.id}
                  className="bg-background dark:bg-[#1a1d24] rounded-2xl shadow-sm p-4 active:scale-[0.98] transition-all border border-transparent hover:border-border dark:hover:border-border"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1 min-w-0 pr-3">
                      <h4 className="text-[15px] font-bold text-foreground truncate">
                        {order.stores?.name ?? "Store"}
                      </h4>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {order.customers?.name ?? "Customer"}
                      </p>
                    </div>
                    <div
                      className={cn(
                        "inline-flex items-center gap-1.5 px-2 py-1 rounded-md shrink-0",
                        colorClasses,
                      )}
                    >
                      <StatusIcon className="h-3 w-3" />
                      <span className="text-[10px] font-bold tracking-widest uppercase">
                        {order.status}
                      </span>
                    </div>
                  </div>

                  {order.requirement_note && (
                    <div className="bg-muted/50 p-2.5 rounded-xl mb-3 mt-2 border border-border">
                      <p className="text-xs text-muted-foreground italic line-clamp-2">
                        "{order.requirement_note}"
                      </p>
                    </div>
                  )}

                  <div className="pt-3 mt-1 border-t border-border/50 flex items-end justify-between">
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium tracking-tight">
                      <Clock className="h-3.5 w-3.5" />
                      {format(new Date(order.created_at), "dd MMM, hh:mm a")}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {order.status === "pending" && (
                        <Button
                          size="sm"
                          className="h-7 text-xs rounded-lg"
                          onClick={() => handleOpenFulfillment(order.id)}
                          disabled={loadingOrderId === order.id}
                        >
                          {loadingOrderId === order.id ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          ) : (
                            <Package className="h-3.5 w-3.5 mr-1" />
                          )}
                          Fulfill
                        </Button>
                      )}
                      <span className="text-[10px] font-bold text-muted-foreground tracking-widest uppercase bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded">
                        {order.display_id}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Order Fulfillment Dialog */}
      <OrderFulfillmentDialog
        order={fulfillOrder}
        open={!!fulfillOrder}
        onOpenChange={(open) => {
          if (!open) setFulfillOrder(null);
        }}
        onFulfilled={() => {
          qc.invalidateQueries({ queryKey: ["admin-mobile-orders"] });
          qc.invalidateQueries({ queryKey: ["orders"] });
          qc.invalidateQueries({ queryKey: ["sales"] });
        }}
      />
    </div>
  );
}
