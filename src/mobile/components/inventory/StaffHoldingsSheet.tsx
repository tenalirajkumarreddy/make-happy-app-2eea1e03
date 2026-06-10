import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { Users, Package } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { CardSkeletonList } from "@/mobile/components/CardSkeleton";

interface StaffHoldingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface StaffStock {
  user_id: string;
  product_id: string;
  quantity: number;
  profiles?: { full_name: string; email: string };
  products?: { name: string; sku: string };
}

export function StaffHoldingsSheet({ open, onOpenChange }: StaffHoldingsSheetProps) {
  const { currentWarehouse } = useWarehouse();

  const { data: staffStock = [], isLoading } = useQuery({
    queryKey: ["mobile-staff-holdings", currentWarehouse?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_stock")
        .select(`
          *,
          profiles:user_id(full_name, email),
          products:product_id(name, sku)
        `)
        .gt("quantity", 0)
        .order("quantity", { ascending: false });

      if (error) throw error;
      return (data || []) as StaffStock[];
    },
    enabled: open,
  });

  // Group by staff member
  const groupedByStaff = staffStock.reduce((acc, item) => {
    const staffName = item.profiles?.full_name || "Unknown";
    if (!acc[staffName]) {
      acc[staffName] = { name: staffName, email: item.profiles?.email, items: [] };
    }
    acc[staffName].items.push(item);
    return acc;
  }, {} as Record<string, { name: string; email?: string; items: StaffStock[] }>);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl pb-10 px-0 max-h-[90vh] overflow-y-auto">
        <div className="px-6">
          <SheetHeader className="mb-5 text-left">
            <SheetTitle className="text-lg font-bold">Staff Holdings</SheetTitle>
          </SheetHeader>

          {isLoading ? (
            <CardSkeletonList count={4} />
          ) : Object.keys(groupedByStaff).length === 0 ? (
            <div className="py-8 text-center">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-2 opacity-50" />
              <p className="text-sm text-muted-foreground">No staff holdings found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {Object.values(groupedByStaff).map((staff) => (
                <div
                  key={staff.name}
                  className="rounded-xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden"
                >
                  <div className="px-4 py-3 bg-muted/50 border-b border-slate-100 dark:border-slate-700">
                    <p className="text-sm font-semibold">{staff.name}</p>
                    {staff.email && (
                      <p className="text-xs text-muted-foreground">{staff.email}</p>
                    )}
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-700">
                    {staff.items.map((item) => (
                      <div key={`${item.user_id}-${item.product_id}`} className="px-4 py-2.5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm">{item.products?.name || "Product"}</p>
                            <p className="text-xs text-muted-foreground">{item.products?.sku}</p>
                          </div>
                        </div>
                        <Badge variant="secondary" className="font-mono">
                          {item.quantity}
                        </Badge>
                      </div>
                    ))}
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
