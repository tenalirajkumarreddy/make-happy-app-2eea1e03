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
  const items = useMemo(() => {
    if (!orders) return [];
    const map = new Map<string, { name: string; totalQty: number }>();
    for (const order of orders) {
      if (order.status !== "pending") continue;
      if (order.order_type !== "detailed" || !order.order_items) continue;
      for (const item of order.order_items) {
        const key = item.product_id;
        const existing = map.get(key);
        const name = item.products?.name || key.slice(0, 8);
        if (existing) {
          existing.totalQty += item.quantity;
        } else {
          map.set(key, { name, totalQty: item.quantity });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.totalQty - a.totalQty);
  }, [orders]);

  const top = items.slice(0, 5);
  const remaining = items.length - 5;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <Package className="h-4 w-4 text-slate-500" />
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          Stock needed {items.length > 0 ? `(${items.length} items)` : ""}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-slate-500 italic">
          No pending orders with product requirements
        </p>
      ) : (
        <div className="space-y-1.5">
          {top.map((item, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="text-slate-700 dark:text-slate-200 truncate flex-1">
                {item.name}
              </span>
              <span className="font-bold tabular-nums text-amber-700 dark:text-amber-300 ml-2 shrink-0">
                × {item.totalQty}
              </span>
            </div>
          ))}
          {remaining > 0 && (
            <p className="text-xs text-slate-400 dark:text-slate-500 pt-0.5">
              +{remaining} more items
            </p>
          )}
        </div>
      )}
    </div>
  );
}
