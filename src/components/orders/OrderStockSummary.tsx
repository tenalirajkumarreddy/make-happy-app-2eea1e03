import { useMemo } from "react";
import { Package } from "lucide-react";

interface OrderItem {
  product_id: string;
  quantity: number;
  products?: { name?: string; sku?: string } | null;
}

interface Order {
  status?: string;
  order_type?: string;
  order_items?: OrderItem[] | null;
}

interface OrderStockSummaryProps {
  orders: Order[];
}

export function OrderStockSummary({ orders }: OrderStockSummaryProps) {
  const { items, activeOrderCount, totalUnits } = useMemo(() => {
    if (!orders) return { items: [], activeOrderCount: 0, totalUnits: 0 };
    const map = new Map<string, { name: string; totalQty: number }>();
    let activeOrderCount = 0;
    let totalUnits = 0;
    for (const order of orders) {
      if (order.status !== "pending" && order.status !== "confirmed") continue;
      if (order.order_type !== "detailed" || !order.order_items) continue;
      activeOrderCount++;
      for (const item of order.order_items) {
        const key = item.product_id;
        const existing = map.get(key);
        const name = item.products?.name || key.slice(0, 8);
        if (existing) {
          existing.totalQty += item.quantity;
        } else {
          map.set(key, { name, totalQty: item.quantity });
        }
        totalUnits += item.quantity;
      }
    }
    return {
      items: Array.from(map.values()).sort((a, b) => b.totalQty - a.totalQty),
      activeOrderCount,
      totalUnits,
    };
  }, [orders]);

  const top = items.slice(0, 5);
  const remaining = items.length - 5;

  if (items.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-amber-600" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Stock needed
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded font-medium">
            {activeOrderCount} order{activeOrderCount !== 1 ? "s" : ""}
          </span>
          <span className="bg-muted px-1.5 py-0.5 rounded font-medium">
            {totalUnits} unit{totalUnits !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
      <div className="space-y-1.5">
        {top.map((item, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <span className="text-foreground truncate flex-1">
              {item.name}
            </span>
            <span className="font-bold tabular-nums text-amber-700 dark:text-amber-300 ml-2 shrink-0">
              × {item.totalQty}
            </span>
          </div>
        ))}
        {remaining > 0 && (
          <p className="text-xs text-muted-foreground pt-0.5">
            +{remaining} more item{remaining !== 1 ? "s" : ""}
          </p>
        )}
      </div>
    </div>
  );
}
