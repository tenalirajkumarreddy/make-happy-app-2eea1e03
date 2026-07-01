import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { Package, ArrowUp, ArrowDown, RefreshCw } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { CardSkeletonList } from "@/mobile/components/CardSkeleton";
import { format } from "date-fns";

interface StockHistorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface StockMovement {
  id: string;
  product_id: string;
  quantity: number;
  type: string;
  reason: string;
  notes: string | null;
  created_at: string;
  products?: { name: string; sku: string };
  profiles?: { full_name: string } | null;
}

export function StockHistorySheet({ open, onOpenChange }: StockHistorySheetProps) {
  const { currentWarehouse } = useWarehouse();

  const { data: movements = [], isLoading } = useQuery({
    queryKey: ["mobile-stock-history", currentWarehouse?.id],
    queryFn: async () => {
      let query = supabase
        .from("stock_movements")
        .select(`
          *,
          products(name, sku),
          profiles:user_id(full_name)
        `)
        .order("created_at", { ascending: false })
        .limit(100);

      if (currentWarehouse?.id) {
        query = query.eq("warehouse_id", currentWarehouse.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as StockMovement[];
    },
    enabled: open,
  });

  const getMovementIcon = (quantity: number) => {
    if (quantity > 0) return <ArrowUp className="h-4 w-4 text-success" />;
    if (quantity < 0) return <ArrowDown className="h-4 w-4 text-destructive" />;
    return <RefreshCw className="h-4 w-4 text-muted-foreground" />;
  };

  const getMovementColor = (quantity: number) => {
    if (quantity > 0) return "text-success";
    if (quantity < 0) return "text-destructive";
    return "text-muted-foreground";
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl pb-10 !p-0 max-h-[90vh] overflow-y-auto">
        <div className="px-6">
          <SheetHeader className="mb-5 text-left">
            <SheetTitle className="text-lg font-bold">Stock History</SheetTitle>
          </SheetHeader>

          {isLoading ? (
            <CardSkeletonList count={4} />
          ) : movements.length === 0 ? (
            <div className="py-8 text-center">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-2 opacity-50" />
              <p className="text-sm text-muted-foreground">No stock movements found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {movements.map((movement) => (
                <div
                  key={movement.id}
                  className="rounded-xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 flex items-center gap-3"
                >
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                    {getMovementIcon(movement.quantity)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {movement.products?.name || "Product"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {movement.reason}
                      {movement.profiles?.full_name ? ` — by ${movement.profiles.full_name}` : ""}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-sm font-bold ${getMovementColor(movement.quantity)}`}>
                      {movement.quantity > 0 ? "+" : ""}{movement.quantity}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(movement.created_at), "dd MMM, hh:mm a")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
