import { StatCard } from "@/components/shared/StatCard";
import { formatDate, formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { PageHeader } from "@/components/shared/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ShoppingCart,
  Banknote,
  Smartphone,
  MapPin,
  HandCoins,
  AlertCircle,
  WifiOff,
  RefreshCw,
  Loader2,
  Package,
  ArrowRightLeft,
  Boxes,
  History,
  User,
  Building2
} from "lucide-react";
import { DashboardSkeleton } from "@/components/shared/DashboardSkeleton";
import { QuickActionDrawer } from "@/components/agent/QuickActionDrawer";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { Button } from "@/components/ui/button";
import { RouteSessionPanel } from "@/components/routes/RouteSessionPanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StockTransferModal } from "@/components/inventory/StockTransferModal";
import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";

interface StaffStockItem {
  id: string;
  product_id: string;
  quantity: number;
  product: {
    id: string;
    name: string;
    sku: string;
    base_price: number;
    image_url?: string;
  };
}

const AgentDashboard = () => {
  const { user, profile, role } = useAuth();
  const { isOnline, pendingCount, syncing, syncQueue } = useOnlineStatus();
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferSearch, setTransferSearch] = useState("");

  const { data: stats, isLoading } = useQuery({
    queryKey: ["agent-dashboard", user?.id],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];

      const [salesRes, txnRes, visitsRes, ordersRes, profileRes, pendingHandoversRes] = await Promise.all([
        supabase.from("sales").select("total_amount, cash_amount, upi_amount").eq("recorded_by", user!.id).gte("created_at", today + "T00:00:00"),
        supabase.from("transactions").select("total_amount, cash_amount, upi_amount").eq("received_by", user!.id).gte("created_at", today + "T00:00:00"),
        supabase.from("store_visits").select("id, stores(name)").gte("visited_at", today + "T00:00:00"),
        supabase.from("orders").select("id, display_id, stores(name), created_at").eq("status", "pending").order("created_at", { ascending: false }).limit(10),
        supabase.from("profiles").select("holding_balance, holding_balance_updated_at").eq("user_id", user!.id).single(),
        supabase.from("handovers").select("cash_amount, upi_amount").eq("user_id", user!.id).eq("status", "awaiting_confirmation"),
      ]);

      const todaySales = salesRes.data || [];
      const todayTxns = txnRes.data || [];

      const totalSale = todaySales.reduce((s, r) => s + Number(r.total_amount), 0);
      const totalCash = todaySales.reduce((s, r) => s + Number(r.cash_amount), 0) + todayTxns.reduce((s, r) => s + Number(r.cash_amount), 0);
      const totalUpi = todaySales.reduce((s, r) => s + Number(r.upi_amount), 0) + todayTxns.reduce((s, r) => s + Number(r.upi_amount), 0);

      // Use materialized holding_balance from profiles (single source of truth)
      const materializedHolding = Number(profileRes.data?.holding_balance || 0);
      const pendingHandoverAmount = (pendingHandoversRes.data || []).reduce((s, r) => s + Number(r.cash_amount) + Number(r.upi_amount), 0);
      
      // Today's handoverable = materialized balance - pending handovers (since those are already deducted)
      const todayHandoverable = Math.max(0, materializedHolding - pendingHandoverAmount);
      const totalPendingHandoverable = materializedHolding;

      return {
        storesCovered: visitsRes.data?.length || 0,
        totalSale,
        totalCash,
        totalUpi,
        todayHandoverable,
        totalPendingHandoverable,
        pendingOrders: ordersRes.data || [],
        materializedHolding,
        holdingUpdatedAt: profileRes.data?.holding_balance_updated_at,
      };
    },
    enabled: !!user,
  });

  // Fetch staff stock holdings
  const { data: staffStock, isLoading: isLoadingStock } = useQuery({
    queryKey: ["agent-stock-holdings", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_stock")
        .select(`
          id, product_id, quantity, amount_value, last_received_at,
          product:products!staff_stock_product_id_fkey(id, name, sku, unit, base_price, image_url)
        `)
        .eq("user_id", user!.id)
        .gt("quantity", 0);
      
      if (error) throw error;
      
      return (data || []).map((item: any) => ({
        ...item,
        product: Array.isArray(item.product) ? item.product[0] : item.product,
      })) as StaffStockItem[];
    },
    enabled: !!user,
  });

  // Fetch pending stock requests
  const { data: stockRequests } = useQuery({
    queryKey: ["agent-stock-requests", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_requests")
        .select(`
          id, display_id, quantity, status, requested_at, request_notes,
          product:products!stock_requests_product_id_fkey(name, sku),
          from_user:profiles!stock_requests_from_user_id_fkey(full_name),
          to_user:profiles!stock_requests_to_user_id_fkey(full_name)
        `)
        .or(`to_user_id.eq.${user!.id},requested_by.eq.${user!.id}`)
        .eq("status", "pending")
        .order("requested_at", { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Fetch stock transfer history
  const { data: stockHistory } = useQuery({
    queryKey: ["agent-stock-history", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_transfers")
        .select(`
          id, display_id, transfer_type, quantity, status, created_at, description,
          product:products!stock_transfers_product_id_fkey(name, sku, image_url),
          from_user:profiles!stock_transfers_from_user_id_profiles_fkey(full_name),
          to_user:profiles!stock_transfers_to_user_id_profiles_fkey(full_name),
          from_warehouse:warehouses!stock_transfers_from_warehouse_id_fkey(name),
          to_warehouse:warehouses!stock_transfers_to_warehouse_id_fkey(name)
        `)
        .or(`from_user_id.eq.${user!.id},to_user_id.eq.${user!.id}`)
        .order("created_at", { ascending: false })
        .limit(20);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  if (isLoading) return <DashboardSkeleton />;
  const s = stats!;

  const totalStockValue = staffStock?.reduce((sum, item) => sum + (item.amount_value || 0), 0) || 0;
  const totalStockItems = staffStock?.reduce((sum, item) => sum + item.quantity, 0) || 0;
  const pendingRequests = stockRequests?.filter((r: any) => r.status === "pending") || [];

  // Format transfer history for display
  // Format transfer party for table display
  const formatParty = (transfer: any, side: "from" | "to") => {
    const isOutgoing = transfer.from_user_id === user?.id;
    
    if (side === "from") {
      if (transfer.from_warehouse) return { label: transfer.from_warehouse.name, type: "warehouse" };
      if (transfer.from_user) return { label: isOutgoing ? "You" : transfer.from_user.full_name, type: "staff" };
    } else {
      if (transfer.to_warehouse) return { label: transfer.to_warehouse.name, type: "warehouse" };
      if (transfer.to_user) return { label: isOutgoing ? transfer.to_user.full_name : "You", type: "staff" };
    }
    return { label: "—", type: "unknown" };
  };

  // Party badge component
  const PartyBadge = ({ label, type }: { label: string; type: string }) => (
    <span className="inline-flex items-center gap-1 text-sm">
      {type === "warehouse" ? (
        <Building2 className="h-3.5 w-3.5 text-blue-500" />
      ) : (
        <User className="h-3.5 w-3.5 text-emerald-500" />
      )}
      {label}
    </span>
  );

  // Filter transfers based on search
  const filteredTransfers = stockHistory?.filter((t: any) => {
    if (!transferSearch) return true;
    const q = transferSearch.toLowerCase();
    return (
      t.product?.name?.toLowerCase().includes(q) ||
      t.from_warehouse?.name?.toLowerCase().includes(q) ||
      t.to_warehouse?.name?.toLowerCase().includes(q) ||
      t.from_user?.full_name?.toLowerCase().includes(q) ||
      t.to_user?.full_name?.toLowerCase().includes(q) ||
      t.description?.toLowerCase().includes(q)
    );
  }) || [];

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Dashboard" subtitle={`Welcome, ${profile?.full_name || "Agent"}! Here's your daily summary.`} />

      {/* Offline / pending sync banner */}
      {(!isOnline || pendingCount > 0) && (
        <div className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${!isOnline ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-warning/30 bg-warning/5 text-warning"}`}>
          <div className="flex items-center gap-2">
            <WifiOff className="h-4 w-4 shrink-0" />
            <span>
              {!isOnline
                ? `You're offline${pendingCount > 0 ? ` — ${pendingCount} action${pendingCount > 1 ? "s" : ""} queued` : ""}`
                : `${pendingCount} action${pendingCount > 1 ? "s" : ""} pending sync`}
            </span>
          </div>
          {isOnline && pendingCount > 0 && (
            <Button size="sm" variant="outline" onClick={syncQueue} disabled={syncing} className="h-7 gap-1.5 text-xs shrink-0">
              {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Sync Now
            </Button>
          )}
        </div>
      )}

      {/* Quick Action Button - Floating */}
      <div className="fixed bottom-6 right-4 z-50 sm:bottom-8 sm:right-8">
        <QuickActionDrawer />
      </div>

      <Tabs defaultValue="sales" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 lg:max-w-[400px]">
          <TabsTrigger value="sales">Sales Activity</TabsTrigger>
          <TabsTrigger value="stock">Stock Holdings</TabsTrigger>
        </TabsList>

      <TabsContent value="sales" className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          <StatCard title="Stores Covered" value={String(s.storesCovered)} icon={MapPin} iconColor="primary" />
          <StatCard title="Sales Recorded" value={`₹${s.totalSale.toLocaleString()}`} icon={ShoppingCart} iconColor="success" />
          <StatCard title="Cash Collected" value={`₹${s.totalCash.toLocaleString()}`} icon={Banknote} iconColor="warning" />
          <StatCard title="UPI Collected" value={`₹${s.totalUpi.toLocaleString()}`} icon={Smartphone} iconColor="info" />
          <StatCard title="Your Holding" value={`₹${s.totalPendingHandoverable.toLocaleString()}`} icon={HandCoins} iconColor="primary" />
          <StatCard title="Today's Handoverable" value={`₹${s.todayHandoverable.toLocaleString()}`} icon={HandCoins} iconColor="orange" />
        </div>
        
        {/* Materialized Balance Sync Status */}
        {s.holdingUpdatedAt && (
          <div className="flex items-center justify-center text-xs text-muted-foreground">
            <span>Balance last synced: {new Date(s.holdingUpdatedAt).toLocaleString()}</span>
          </div>
        )}

          {/* Route session — next store navigation */}
          <RouteSessionPanel />

          <div className="rounded-xl border bg-card p-5">
            <h3 className="text-sm font-semibold mb-4">Pending Orders</h3>
            {s.pendingOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No pending orders</p>
            ) : (
              <div className="space-y-3">
                {s.pendingOrders.map((order: any) => (
                  <div key={order.id} className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">{order.stores?.name || "—"}</p>
                      <p className="text-xs text-muted-foreground font-mono">{order.display_id}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium text-warning">Pending</p>
                      <p className="text-xs text-muted-foreground">{formatDate(order.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="stock" className="space-y-6">
          {/* Stock Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <StatCard 
              title="Stock Items" 
              value={String(staffStock?.length || 0)} 
              icon={Package} 
              iconColor="primary" 
            />
            <StatCard 
              title="Total Units" 
              value={String(totalStockItems)} 
              icon={Boxes} 
              iconColor="success" 
            />
            <StatCard 
              title="Stock Value" 
              value={formatCurrency(totalStockValue)} 
              icon={HandCoins} 
              iconColor="warning" 
            />
            <StatCard 
              title="Pending Requests" 
              value={String(pendingRequests.length)} 
              icon={ArrowRightLeft} 
              iconColor={pendingRequests.length > 0 ? "destructive" : "info"} 
            />
          </div>

          {/* Stock Holdings List */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">My Stock Holdings</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Products assigned to you from warehouse
                </p>
              </div>
              <Button onClick={() => setShowTransferModal(true)} size="sm">
                <ArrowRightLeft className="h-4 w-4 mr-2" />
                Transfer Stock
              </Button>
            </CardHeader>
            <CardContent>
              {isLoadingStock ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !staffStock || staffStock.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
                  <h3 className="text-sm font-medium text-muted-foreground">No stock assigned</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Stock will appear here once transferred from warehouse
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {staffStock.map((item) => (
                    <div 
                      key={item.id} 
                      className="flex items-center justify-between p-4 rounded-lg border bg-muted/20 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <Avatar className="h-10 w-10 rounded-lg">
                          <AvatarImage src={item.product?.image_url} className="object-cover" />
                          <AvatarFallback className="rounded-lg bg-primary/10">
                            <Package className="h-4 w-4 text-primary" />
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-sm">{item.product?.name || "Unknown Product"}</p>
                          <p className="text-xs text-muted-foreground">
                            SKU: {item.product?.sku || "N/A"} • ₹{item.product?.base_price?.toLocaleString() || 0} each
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold">{item.quantity}</p>
                        <p className="text-xs text-muted-foreground">units</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

      {/* Pending Stock Requests */}
      {pendingRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              Pending Stock Requests
              <Badge variant="secondary">{pendingRequests.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingRequests.map((request: any) => (
                <div
                  key={request.id}
                  className="flex items-center justify-between p-4 rounded-lg border border-warning/20 bg-warning/5"
                >
                  <div>
                    <p className="font-medium text-sm">
                      {request.product?.name || "Unknown Product"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {request.quantity} units • From: {request.from_user?.full_name || "Unknown"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {request.status}
                    </Badge>
                    <Button size="sm" variant="outline">Review</Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stock Transfer History Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Transfer History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Search */}
          <div className="px-6 pb-4">
            <div className="relative max-w-sm">
              <ArrowRightLeft className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search transfers…"
                value={transferSearch}
                onChange={(e) => setTransferSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {!stockHistory || stockHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ArrowRightLeft className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">No transfers found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransfers.map((t: any) => {
                    const from = formatParty(t, "from");
                    const to = formatParty(t, "to");
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(t.created_at), "dd MMM yy, HH:mm")}
                        </TableCell>
                        <TableCell className="font-medium">
                          {t.product?.name ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{t.quantity}</Badge>
                        </TableCell>
                        <TableCell>
                          <PartyBadge label={from.label} type={from.type} />
                        </TableCell>
                        <TableCell>
                          <PartyBadge label={to.label} type={to.type} />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                          {t.description || "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </TabsContent>
      </Tabs>

      {/* Stock Transfer Modal */}
      <StockTransferModal
        isOpen={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        allowedTransferTypes={["staff_to_staff", "staff_to_warehouse"]}
        currentUserId={user?.id}
      />
    </div>
  );
};

export default AgentDashboard;
