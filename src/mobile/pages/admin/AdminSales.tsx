import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { Loader2, Plus, Eye, Wallet, ChevronRight, Receipt, RotateCcw, ShoppingCart, Printer } from "lucide-react";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { format } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface SaleItem {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  products?: {
    name: string;
    sku: string;
  };
}

interface Sale {
  id: string;
  display_id: string;
  store_id: string;
  total_amount: number;
  cash_amount: number;
  upi_amount: number;
  outstanding_amount: number;
  created_at: string;
  recorded_by: string;
  stores?: { name: string; display_id: string };
  customers?: { name: string; display_id: string };
  sale_items?: SaleItem[];
}

interface Profile {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
}

export function AdminSales({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { user, role } = useAuth();
  const { currentWarehouse } = useWarehouse();
  const qc = useQueryClient();

  const [paymentFilter, setPaymentFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Fetch sales with complete item details
  const { data: sales, isLoading } = useQuery({
    queryKey: ["mobile-sales", currentWarehouse?.id, paymentFilter],
    queryFn: async () => {
      let query = supabase
        .from("sales")
        .select(`
          *, 
          stores(name, display_id), 
          customers(name, display_id),
          sale_items(id, product_id, quantity, unit_price, total_price, products(name, sku))
        `)
        .order("created_at", { ascending: false })
        .limit(100);

      if (currentWarehouse?.id) query = query.eq("warehouse_id", currentWarehouse.id);
      if (paymentFilter === "cash") query = query.gt("cash_amount", 0).eq("upi_amount", 0);
      if (paymentFilter === "upi") query = query.gt("upi_amount", 0).eq("cash_amount", 0);
      if (paymentFilter === "outstanding") query = query.gt("outstanding_amount", 0);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Sale[];
    },
  });

  // Fetch profiles for recorder names
  const { data: profileMap = {} } = useQuery({
    queryKey: ["mobile-profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name, avatar_url");
      const map: Record<string, Profile> = {};
      (data || []).forEach((p: Profile) => {
        map[p.user_id] = p;
      });
      return map;
    },
  });

  // Filter by search term
  const filteredSales = useMemo(() => {
    return (sales || []).filter((sale) =>
      sale.display_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sale.stores?.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [sales, searchTerm]);

  const getRecorderName = (userId: string) => {
    return profileMap[userId]?.full_name || "Unknown";
  };

  const getRecorderAvatar = (userId: string) => {
    return profileMap[userId]?.avatar_url || null;
  };

  const formatAmount = (amount: number) => {
    return `Rs ${Math.round(amount).toLocaleString('en-IN')}`;
  };

  return (
    <div className="pb-6">
      {/* Gradient Header */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 dark:from-slate-900 dark:via-blue-950 dark:to-indigo-950 px-4 pt-4 pb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-white text-lg font-bold">Sales</h2>
            <p className="text-blue-200/80 text-xs mt-0.5">All recorded sales</p>
          </div>
          <Button size="sm" className="gap-1 bg-white/20 hover:bg-white/30 text-white border-0 rounded-xl" onClick={() => onNavigate("/sales")}>
            <Plus className="h-4 w-4" /> Record
          </Button>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="px-4 -mt-3 space-y-2 mb-4">
        <Input placeholder="Search sale ID or store..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="text-sm h-10 rounded-xl bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm" />
        <Select value={paymentFilter} onValueChange={setPaymentFilter}>
          <SelectTrigger className="h-10 text-sm rounded-xl bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sales</SelectItem>
            <SelectItem value="cash">Cash only</SelectItem>
            <SelectItem value="upi">UPI only</SelectItem>
            <SelectItem value="outstanding">Has outstanding</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Sales List */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filteredSales.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <Wallet className="h-12 w-12 text-muted-foreground mx-auto mb-2 opacity-50" />
          <p className="text-sm text-muted-foreground">No sales found</p>
        </div>
      ) : (
        <div className="px-4 space-y-3">
          {filteredSales.map((sale) => {
            const itemCount = sale.sale_items?.length || 0;
            
            return (
              <div
                key={sale.id}
                className="rounded-2xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden"
              >
                {/* Card Content */}
                <div
                  onClick={() => {
                    setSelectedSale(sale);
                    setShowDetailModal(true);
                  }}
                  className="p-3 active:bg-muted transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono font-semibold text-primary">{sale.display_id}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {sale.stores?.name || "Unknown Store"}
                      </p>
                    </div>
                    <p className="text-sm font-bold tabular-nums text-primary">{formatAmount(sale.total_amount)}</p>
                  </div>

                  {/* Sale Items Preview */}
                  {sale.sale_items && sale.sale_items.length > 0 && (
                    <div className="space-y-1 mb-2">
                      {sale.sale_items.slice(0, 2).map((item, idx) => (
                        <div key={idx} className="flex justify-between text-xs">
                          <span className="text-muted-foreground truncate flex-1">
                            {item.products?.name} × {item.quantity}
                          </span>
                          <span className="font-medium tabular-nums ml-2">
                            {formatAmount(item.total_price)}
                          </span>
                        </div>
                      ))}
                      {sale.sale_items.length > 2 && (
                        <p className="text-[10px] text-muted-foreground">
                          +{sale.sale_items.length - 2} more items
                        </p>
                      )}
                    </div>
                  )}

                  {/* Payment Badges */}
                  <div className="flex items-center gap-1.5 mb-2">
                    {sale.cash_amount > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                        Cash {formatAmount(sale.cash_amount)}
                      </span>
                    )}
                    {sale.upi_amount > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                        UPI {formatAmount(sale.upi_amount)}
                      </span>
                    )}
                    {sale.outstanding_amount > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                        Due {formatAmount(sale.outstanding_amount)}
                      </span>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <div className="flex items-center gap-1.5">
                      <Avatar className="h-5 w-5">
                        <AvatarImage src={getRecorderAvatar(sale.recorded_by) || undefined} />
                        <AvatarFallback className="text-[9px] bg-primary/10">
                          {getRecorderName(sale.recorded_by).charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">
                        {getRecorderName(sale.recorded_by)}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(sale.created_at), "dd MMM, hh:mm a")}
                    </span>
                  </div>
                </div>

                {/* Action Buttons Row */}
                <div className="flex border-t border-border/50">
                  <button
                    onClick={() => onNavigate(`/sales?receipt=${sale.id}`)}
                    className="flex-1 py-2.5 flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground hover:bg-muted active:bg-muted/80 transition-colors border-r border-border/50"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Receipt
                  </button>
                  <button
                    onClick={() => onNavigate(`/sales?highlight=${sale.id}`)}
                    className="flex-1 py-2.5 flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground hover:bg-muted active:bg-muted/80 transition-colors border-r border-border/50"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    View
                  </button>
                  {sale.outstanding_amount > 0 && (
                    <button
                      onClick={() => onNavigate(`/sale-returns?sale_id=${sale.id}`)}
                      className="flex-1 py-2.5 flex items-center justify-center gap-1.5 text-xs font-medium text-primary hover:bg-primary/5 active:bg-primary/10 transition-colors"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Return
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Modal */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Sale Details</DialogTitle>
          </DialogHeader>

          {selectedSale && (
            <div className="space-y-4">
              {/* Sale Info */}
              <div className="rounded-lg bg-muted/50 p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Sale ID</span>
                  <span className="font-mono text-sm font-semibold">{selectedSale.display_id}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Store</span>
                  <span className="text-sm font-medium text-right max-w-[150px] truncate">{selectedSale.stores?.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Date</span>
                  <span className="text-xs">{format(new Date(selectedSale.created_at), "dd MMM yy, hh:mm a")}</span>
                </div>
              </div>

              {/* Sale Items */}
              {selectedSale.sale_items && selectedSale.sale_items.length > 0 && (
                <div className="rounded-lg border bg-card overflow-hidden">
                  <div className="bg-muted/30 px-3 py-2 border-b">
                    <p className="text-xs font-semibold text-muted-foreground">Sale Items ({selectedSale.sale_items.length})</p>
                  </div>
                  <div className="divide-y">
                    {selectedSale.sale_items.map((item, idx) => (
                      <div key={idx} className="px-3 py-2.5">
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-sm font-medium">{item.products?.name}</span>
                          <span className="text-sm font-semibold tabular-nums">{formatAmount(item.total_price)}</span>
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>SKU: {item.products?.sku || item.product_id.slice(0, 8)}</span>
                          <span>Qty: {item.quantity} × {formatAmount(item.unit_price)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Payment Summary */}
              <div className="rounded-lg border bg-card p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Total Amount</span>
                  <span className="font-semibold text-primary">{formatAmount(selectedSale.total_amount)}</span>
                </div>
                {selectedSale.cash_amount > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-green-700">Cash</span>
                    <span className="text-sm">{formatAmount(selectedSale.cash_amount)}</span>
                  </div>
                )}
                {selectedSale.upi_amount > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-purple-700">UPI</span>
                    <span className="text-sm">{formatAmount(selectedSale.upi_amount)}</span>
                  </div>
                )}
                {selectedSale.outstanding_amount > 0 && (
                  <div className="flex justify-between items-center pt-1 border-t">
                    <span className="text-xs text-red-700 font-medium">Outstanding</span>
                    <span className="text-sm font-semibold text-red-700">{formatAmount(selectedSale.outstanding_amount)}</span>
                  </div>
                )}
              </div>

              {/* Recorder Info */}
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                <Avatar className="h-6 w-6">
                  <AvatarImage src={getRecorderAvatar(selectedSale.recorded_by) || undefined} />
                  <AvatarFallback className="text-[10px] bg-primary/10">
                    {getRecorderName(selectedSale.recorded_by).charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground">
                    Recorded by {getRecorderName(selectedSale.recorded_by)}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => {
                    setShowDetailModal(false);
                    onNavigate(`/sales?receipt=${selectedSale.id}`);
                  }}
                >
                  <Printer className="h-3 w-3 mr-1" />
                  Receipt
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => {
                    setShowDetailModal(false);
                    onNavigate(`/sales?highlight=${selectedSale.id}`);
                  }}
                >
                  <Eye className="h-3 w-3 mr-1" />
                  View Full
                </Button>
                {selectedSale.outstanding_amount > 0 && (
                  <Button
                    size="sm"
                    className="text-xs col-span-2"
                    onClick={() => {
                      setShowDetailModal(false);
                      onNavigate(`/sale-returns?sale_id=${selectedSale.id}`);
                    }}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Process Return
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
