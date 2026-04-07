import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activityLogger";
import { sendNotificationToMany, getAdminUserIds } from "@/lib/notifications";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Plus, Trash2, XCircle, Package, Download, X, CalendarIcon } from "lucide-react";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { useState, useEffect } from "react";
import { OrderFulfillmentDialog } from "@/components/orders/OrderFulfillmentDialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { format } from "date-fns";

interface OrderItem {
  product_id: string;
  quantity: number;
  unit_price?: number;
}

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

const Orders = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [cancelOrderId, setCancelOrderId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [fulfillOrder, setFulfillOrder] = useState<FulfillOrder | null>(null);
  const [loadingOrderDetails, setLoadingOrderDetails] = useState<string | null>(null);

  // List filters
  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const [filterFrom, setFilterFrom] = useState(thirtyDaysAgo);
  const [filterTo, setFilterTo] = useState(today);
  const [filterCustomer, setFilterCustomer] = useState("all");
  const PAGE_SIZE = 100;
  const [loadedPages, setLoadedPages] = useState(1);

  // Reset to page 1 whenever any filter changes
  useEffect(() => {
    setLoadedPages(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, filterFrom, filterTo, filterCustomer]);

  // Form state
  const [customerId, setCustomerId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [orderType, setOrderType] = useState("simple");
  const [requirementNote, setRequirementNote] = useState("");
  const [orderItems, setOrderItems] = useState<OrderItem[]>([{ product_id: "", quantity: 1 }]);

  const { data: orders, isLoading, isFetching } = useQuery({
    queryKey: ["orders", statusFilter, filterFrom, filterTo, filterCustomer, loadedPages],
    queryFn: async () => {
      let query = supabase
        .from("orders")
        .select("*, stores(name), customers(name)")
        .order("created_at", { ascending: false });
      // Server-side filters
      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      if (filterFrom) query = query.gte("created_at", filterFrom + "T00:00:00");
      if (filterTo) query = query.lte("created_at", filterTo + "T23:59:59");
      if (filterCustomer !== "all") query = query.eq("customer_id", filterCustomer);
      // Cursor pagination
      query = query.range(0, loadedPages * PAGE_SIZE - 1);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const hasMoreOrders = (orders?.length || 0) >= loadedPages * PAGE_SIZE;

  const { data: customers = [] } = useQuery({
    queryKey: ["customers-for-orders"],
    queryFn: async () => {
      const { data } = await supabase.from("customers").select("id, name").eq("is_active", true);
      return data || [];
    },
  });

  const { data: stores } = useQuery({
    queryKey: ["stores-for-order", customerId],
    queryFn: async () => {
      let q = supabase.from("stores").select("id, name, display_id, store_type_id, customer_id").eq("is_active", true);
      if (customerId) q = q.eq("customer_id", customerId);
      const { data } = await q;
      return data || [];
    },
    enabled: !!customerId,
  });

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id, name, sku, base_price, image_url").eq("is_active", true);
      return data || [];
    },
  });

  // Load store pricing data for order creation
  const { data: storePricing } = useQuery({
    queryKey: ["store-pricing", storeId],
    queryFn: async () => {
      const { data } = await supabase.from("store_pricing").select("product_id, price").eq("store_id", storeId);
      return new Map((data || []).map(sp => [sp.product_id, sp.price]));
    },
    enabled: !!storeId,
  });

  const { data: storeTypePricing } = useQuery({
    queryKey: ["store-type-pricing", storeId],
    queryFn: async () => {
      const store = stores?.find(s => s.id === storeId);
      if (!store?.store_type_id) return new Map<string, number>();
      const { data } = await supabase.from("store_type_pricing").select("product_id, price").eq("store_type_id", store.store_type_id);
      return new Map((data || []).map(tp => [tp.product_id, tp.price]));
    },
    enabled: !!storeId && !!stores,
  });

  // Get price for product using hierarchy: store > store_type > base
  const getProductPrice = (productId: string): number => {
    const product = products?.find(p => p.id === productId);
    if (!product) return 0;
    if (storePricing?.has(productId)) return storePricing.get(productId)!;
    if (storeTypePricing?.has(productId)) return storeTypePricing.get(productId)!;
    return product.base_price;
  };

  const addItem = () => setOrderItems([...orderItems, { product_id: "", quantity: 1 }]);
  const removeItem = (idx: number) => setOrderItems(orderItems.filter((_, i) => i !== idx));

  const resetForm = () => {
    setCustomerId(""); setStoreId(""); setOrderType("simple"); setRequirementNote("");
    setOrderItems([{ product_id: "", quantity: 1 }]);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId) { toast.error("Please select a store"); return; }
    if (orderType === "simple" && !requirementNote.trim()) { toast.error("Please describe the requirement"); return; }
    if (orderType === "detailed" && !orderItems.some((i) => i.product_id)) { toast.error("Please add at least one product"); return; }
    setSaving(true);

    const { data: displayId } = await supabase.rpc("generate_display_id", { prefix: "ORD", seq_name: "ord_display_seq" });

    const { data: order, error } = await supabase.from("orders").insert({
      display_id: displayId,
      store_id: storeId,
      customer_id: customerId,
      order_type: orderType,
      source: "manual",
      created_by: user!.id,
      requirement_note: requirementNote || null,
    }).select("id").single();

    if (error) { toast.error(error.message); setSaving(false); return; }

    if (orderType === "detailed") {
      const validItems = orderItems.filter((i) => i.product_id);
      if (validItems.length > 0) {
        await supabase.from("order_items").insert(
          validItems.map((i) => ({ 
            order_id: order.id, 
            product_id: i.product_id, 
            quantity: i.quantity,
            unit_price: getProductPrice(i.product_id)
          }))
        );
      }
    }

    logActivity(user!.id, "Created order", "order", displayId, order.id);
    toast.success("Order created");

    // Notify admins/managers
    const storeName = stores?.find((s) => s.id === storeId)?.name || "store";
    getAdminUserIds()
      .then((ids) => {
        const others = ids.filter((id) => id !== user!.id);
        if (others.length > 0) {
          sendNotificationToMany(others, {
            title: "New Order Created",
            message: `Order ${displayId} (${orderType}) placed for ${storeName}`,
            type: "order",
            entityType: "order",
            entityId: order.id,
          });
        }
      })
      .catch((error) => {
        console.error("Failed to notify admins about new order:", error);
        // Non-critical: notification failure shouldn't block order creation
      });

    setSaving(false);
    setShowAdd(false);
    resetForm();
    qc.invalidateQueries({ queryKey: ["orders"] });
  };

  // Open fulfillment dialog with full order details
  const handleOpenFulfillment = async (orderId: string) => {
    setLoadingOrderDetails(orderId);
    try {
      // Fetch order with items and store info for the dialog
      const { data: orderData, error } = await supabase
        .from("orders")
        .select(`
          *,
          stores(id, name, store_type_id, customer_id),
          order_items(id, product_id, quantity, unit_price, products(id, name, sku, base_price, image_url))
        `)
        .eq("id", orderId)
        .single();

      if (error) throw error;

      setFulfillOrder(orderData as unknown as FulfillOrder);
    } catch (error) {
      console.error("Error loading order details:", error);
      toast.error("Failed to load order details");
    } finally {
      setLoadingOrderDetails(null);
    }
  };

  const exportCSV = () => {
    const rows = (filteredOrders || []).map((o) => ({
      "Order ID": o.display_id,
      "Store": (o as any).stores?.name || "",
      "Customer": (o as any).customers?.name || "",
      "Type": o.order_type,
      "Source": o.source,
      "Status": o.status,
      "Note": o.requirement_note || "",
      "Created": new Date(o.created_at).toLocaleString("en-IN"),
    }));
    
    // Handle empty data case
    if (rows.length === 0) {
      toast.info("No orders to export");
      return;
    }
    
    const header = Object.keys(rows[0]).join(",");
    const csv = [header, ...rows.map((r) => Object.values(r).map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `orders-${statusFilter}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const handleCancel = async () => {
    if (!cancelOrderId || !cancelReason.trim()) { toast.error("Please provide a reason"); return; }
    setCancelling(true);
    const { error } = await supabase
      .from("orders")
      .update({
        status: "cancelled",
        cancellation_reason: cancelReason,
        cancelled_by: user!.id,
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", cancelOrderId)
      .eq("status", "pending");
    setCancelling(false);
    if (error) { toast.error(error.message); return; }

    const order = orders?.find((o) => o.id === cancelOrderId);
    logActivity(user!.id, "Cancelled order", "order", order?.display_id || "", cancelOrderId, { reason: cancelReason });

    // Notify customer if linked
    if (order?.customers && (order as any).customer_id) {
      const { data: custData } = await supabase.from("customers").select("user_id").eq("id", (order as any).customer_id).single();
      if (custData?.user_id) {
        sendNotificationToMany([custData.user_id], {
          title: "Order Cancelled",
          message: `Order ${order?.display_id} was cancelled. Reason: ${cancelReason}`,
          type: "order",
          entityType: "order",
          entityId: cancelOrderId,
        });
      }
    }

    toast.success("Order cancelled");
    setCancelOrderId(null);
    setCancelReason("");
    qc.invalidateQueries({ queryKey: ["orders"] });
  };

  // Filtering is now done server-side; local array mirrors the fetched page(s)
  const filteredOrders = orders || [];

  const activeOrderFilterCount = [filterCustomer !== "all", filterFrom !== thirtyDaysAgo, filterTo !== today].filter(Boolean).length;

  const clearOrderFilters = () => {
    setFilterFrom(thirtyDaysAgo);
    setFilterTo(today);
    setFilterCustomer("all");
  };

  const columns = [
    { header: "Order ID", accessor: "display_id" as const, className: "font-mono text-xs" },
    { header: "Store", accessor: (row: any) => row.stores?.name || "—", className: "font-medium" },
    { header: "Type", accessor: (row: any) => <Badge variant="secondary">{row.order_type}</Badge>, className: "hidden sm:table-cell" },
    { header: "Source", accessor: (row: any) => <Badge variant="outline">{row.source}</Badge>, className: "hidden md:table-cell" },
    { header: "Customer", accessor: (row: any) => row.customers?.name || "—", className: "text-muted-foreground text-sm hidden lg:table-cell" },
    { header: "Status", accessor: (row: any) => <StatusBadge status={row.status === "delivered" ? "active" : row.status as any} label={row.status} /> },
    { header: "Date", accessor: (row: any) => new Date(row.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }), className: "text-muted-foreground text-xs hidden sm:table-cell" },
    {
      header: "Actions",
      accessor: (row: any) => row.status === "pending" ? (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 text-xs text-green-600" onClick={() => handleOpenFulfillment(row.id)} disabled={loadingOrderDetails === row.id}>
            {loadingOrderDetails === row.id ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Package className="h-3.5 w-3.5 mr-1" />}
            Fulfill
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => setCancelOrderId(row.id)}>
            <XCircle className="h-3.5 w-3.5 mr-1" /> Cancel
          </Button>
        </div>
      ) : row.status === "cancelled" ? (
        <span className="text-xs text-muted-foreground truncate max-w-[120px] block" title={row.cancellation_reason}>{row.cancellation_reason || "—"}</span>
      ) : null,
    },
  ];

  if (isLoading) {
    return <TableSkeleton columns={7} />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Orders" subtitle="Manage customer orders and fulfillment" primaryAction={{ label: "Create Order", onClick: () => setShowAdd(true) }} actions={[{ label: "Export CSV", icon: Download, onClick: exportCSV, variant: "outline" as const }]} />

      <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full">
        <TabsList className="bg-muted/50 p-1 h-11">
          <TabsTrigger value="all" className="px-6 rounded-md transition-all data-[state=active]:shadow-sm">All</TabsTrigger>
          <TabsTrigger value="pending" className="px-6 rounded-md transition-all data-[state=active]:shadow-sm">Pending</TabsTrigger>
          <TabsTrigger value="delivered" className="px-6 rounded-md transition-all data-[state=active]:shadow-sm">Delivered</TabsTrigger>
          <TabsTrigger value="cancelled" className="px-6 rounded-md transition-all data-[state=active]:shadow-sm">Cancelled</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl border bg-card shadow-sm">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="h-9 text-xs gap-1.5 justify-start font-medium flex-1 min-w-[110px] sm:flex-none bg-accent/5 focus:bg-accent/10 transition-colors">
              <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-primary/60" />
              {filterFrom ? format(new Date(filterFrom + "T00:00:00"), "dd MMM yy") : "From"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={filterFrom ? new Date(filterFrom + "T00:00:00") : undefined} onSelect={(d) => setFilterFrom(d ? format(d, "yyyy-MM-dd") : "")} initialFocus />
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="h-9 text-xs gap-1.5 justify-start font-medium flex-1 min-w-[110px] sm:flex-none bg-accent/5 focus:bg-accent/10 transition-colors">
              <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-primary/60" />
              {filterTo ? format(new Date(filterTo + "T00:00:00"), "dd MMM yy") : "To"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={filterTo ? new Date(filterTo + "T00:00:00") : undefined} onSelect={(d) => setFilterTo(d ? format(d, "yyyy-MM-dd") : "")} initialFocus />
          </PopoverContent>
        </Popover>
        <Select value={filterCustomer} onValueChange={setFilterCustomer}>
          <SelectTrigger className="h-9 text-xs flex-1 min-w-[140px] sm:flex-none sm:w-48 bg-accent/5 focus:bg-accent/10 transition-colors font-medium">
            <SelectValue placeholder="All customers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All customers</SelectItem>
            {customers?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {activeOrderFilterCount > 0 && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearOrderFilters}>
            <X className="h-3 w-3 mr-1" /> Clear ({activeOrderFilterCount})
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{filteredOrders.length}{hasMoreOrders ? "+" : ""} result{filteredOrders.length !== 1 ? "s" : ""}</span>
      </div>

      <DataTable
        columns={columns}
        data={filteredOrders}
        searchKey="display_id"
        searchPlaceholder="Search by order ID..."
        emptyMessage={statusFilter === "all" ? "No orders created yet." : `No ${statusFilter} orders.`}
        renderMobileCard={(row: any) => (
          <div className="rounded-lg border bg-card p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                  <span className="font-mono text-xs text-primary font-medium">{row.display_id}</span>
                  <Badge variant="secondary" className="text-xs h-5 px-1.5">{row.order_type}</Badge>
                  <Badge variant="outline" className="text-xs h-5 px-1.5">{row.source}</Badge>
                </div>
                <h3 className="font-semibold text-sm text-foreground truncate">{row.stores?.name || "—"}</h3>
                <p className="text-xs text-muted-foreground truncate">{row.customers?.name || "—"}</p>
              </div>
              <StatusBadge status={row.status === "delivered" ? "active" : row.status as any} label={row.status} />
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50 gap-2 flex-wrap">
              <p className="text-[10px] text-muted-foreground">{new Date(row.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}</p>
              {row.status === "pending" && (
                <div className="flex items-center gap-1.5">
                  <Button variant="outline" size="sm" className="h-7 text-xs text-green-600 border-green-600/40" onClick={(e) => { e.stopPropagation(); handleOpenFulfillment(row.id); }} disabled={loadingOrderDetails === row.id}>
                    {loadingOrderDetails === row.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Package className="h-3 w-3 mr-1" />}Fulfill
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs text-destructive border-destructive/40" onClick={(e) => { e.stopPropagation(); setCancelOrderId(row.id); }}>
                    <XCircle className="h-3 w-3 mr-1" />Cancel
                  </Button>
                </div>
              )}
              {row.status === "cancelled" && row.cancellation_reason && (
                <span className="text-xs text-muted-foreground italic truncate max-w-[180px]">{row.cancellation_reason}</span>
              )}
            </div>
          </div>
        )}
      />

      {hasMoreOrders && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" size="sm" onClick={() => setLoadedPages((p) => p + 1)} disabled={isFetching} className="gap-1.5">
            {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Load more
          </Button>
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={(v) => { setShowAdd(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Create Order</DialogTitle></DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <Label>Customer</Label>
              <Select value={customerId} onValueChange={(v) => { setCustomerId(v); setStoreId(""); }}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>{customers?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Store</Label>
              <Select value={storeId} onValueChange={setStoreId} disabled={!customerId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select store" /></SelectTrigger>
                <SelectContent>{stores?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.display_id})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Order Type</Label>
              <Select value={orderType} onValueChange={setOrderType}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="simple">Simple (Note only)</SelectItem>
                  <SelectItem value="detailed">Detailed (Products + Qty)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Requirement Note</Label>
              <Textarea value={requirementNote} onChange={(e) => setRequirementNote(e.target.value)} className="mt-1" placeholder="e.g., Need water bottles urgently" />
            </div>

            {orderType === "detailed" && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Products</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addItem}><Plus className="h-3 w-3 mr-1" />Add</Button>
                </div>
                <div className="space-y-2">
                  {orderItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Select value={item.product_id} onValueChange={(v) => { const u = [...orderItems]; u[idx].product_id = v; setOrderItems(u); }}>
                        <SelectTrigger className="flex-1"><SelectValue placeholder="Product" /></SelectTrigger>
                        <SelectContent>{products?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>)}</SelectContent>
                      </Select>
                      <Input type="number" min={1} value={item.quantity} onChange={(e) => { const u = [...orderItems]; u[idx].quantity = Number(e.target.value); setOrderItems(u); }} className="w-20" placeholder="Qty" />
                      {orderItems.length > 1 && (
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(idx)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Order
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Order Fulfillment Dialog */}
      <OrderFulfillmentDialog
        order={fulfillOrder}
        open={!!fulfillOrder}
        onOpenChange={(open) => { if (!open) setFulfillOrder(null); }}
        onFulfilled={() => qc.invalidateQueries({ queryKey: ["orders"] })}
      />

      {/* Cancel Order Dialog */}
      <Dialog open={!!cancelOrderId} onOpenChange={(v) => { if (!v) { setCancelOrderId(null); setCancelReason(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cancel Order</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to cancel order <span className="font-mono font-medium text-foreground">{orders?.find((o) => o.id === cancelOrderId)?.display_id}</span>?
            </p>
            <div>
              <Label>Reason for cancellation</Label>
              <Select value={cancelReason} onValueChange={setCancelReason}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select reason" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="By Mistake">By Mistake</SelectItem>
                  <SelectItem value="Stock Available">Stock Available</SelectItem>
                  <SelectItem value="Other Brands">Other Brands</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setCancelOrderId(null); setCancelReason(""); }}>Back</Button>
              <Button variant="destructive" onClick={handleCancel} disabled={cancelling || !cancelReason}>
                {cancelling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Orders;