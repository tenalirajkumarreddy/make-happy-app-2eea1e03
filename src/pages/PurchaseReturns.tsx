import { useState, useEffect } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { Loader2, Plus, RotateCcw, Search, Package, CheckCircle, XCircle, Clock, Eye } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DataTable } from "@/components/shared/DataTable";
import { ResponsiveDataView } from "@/components/shared/ResponsiveDataView";
import { useIsMobile } from "@/hooks/use-mobile";

const PurchaseReturns = () => {
  const { user, role } = useAuth();
  const { currentWarehouse } = useWarehouse();
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const canApprove = ["super_admin", "manager"].includes(role || "");

  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Form state
  const [purchaseId, setPurchaseId] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [returnItems, setReturnItems] = useState<Array<{ 
    purchase_item_id: string; 
    quantity: number; 
    max_qty: number; 
    item_name: string; 
    unit_price: number;
    item_type: string;
    item_id: string;
  }>>([]);
  const [saving, setSaving] = useState(false);

  // Fetch returns
  const { data: returns = [], isLoading } = useQuery({
    queryKey: ["purchase-returns", currentWarehouse?.id],
    queryFn: async () => {
      let query = (supabase as any)
        .from("purchase_returns")
        .select(`
          *,
          purchases(display_id, total_amount),
          vendors(name),
          profiles:created_by(full_name),
          approver:approved_by(full_name)
        `)
        .order("created_at", { ascending: false });

      if (currentWarehouse?.id) {
        query = query.eq("warehouse_id", currentWarehouse.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch purchases for dropdown
  const { data: purchases = [] } = useQuery({
    queryKey: ["purchases-for-return", currentWarehouse?.id],
    queryFn: async () => {
      let query = (supabase as any)
        .from("purchases")
        .select("id, display_id, purchase_date, total_amount, vendor_id, vendors(name)")
        .order("purchase_date", { ascending: false })
        .limit(100);

      if (currentWarehouse?.id) {
        query = query.eq("warehouse_id", currentWarehouse.id);
      }

      const { data } = await query;
      return data || [];
    },
  });

  // Fetch purchase items when purchase is selected
  const { data: purchaseItems = [] } = useQuery({
    queryKey: ["purchase-items-for-return", purchaseId],
    queryFn: async () => {
      if (!purchaseId) return [];
      const { data } = await supabase
        .from("purchase_items")
        .select("id, item_type, item_id, quantity, unit_price, total, products(name), raw_materials(name)")
        .eq("purchase_id", purchaseId);
      return data || [];
    },
    enabled: !!purchaseId,
  });

  // Fetch return detail
  const { data: returnDetail } = useQuery({
    queryKey: ["purchase-return-detail", showDetail],
    queryFn: async () => {
      if (!showDetail) return null;
      const { data: ret } = await (supabase
        .from("purchase_returns")
        .select(`
          *,
          purchases(display_id, total_amount, purchase_date),
          vendors(name),
          profiles:created_by(full_name),
          approver:approved_by(full_name)
        `)
        .eq("id", showDetail)
        .single() as any);
      
      const { data: items } = await supabase
        .from("purchase_return_items")
        .select("*, products(name), raw_materials(name)")
        .eq("return_id", showDetail);
      
      return { ...ret, items: items || [] };
    },
    enabled: !!showDetail,
  });

  const resetForm = () => {
    setPurchaseId("");
    setReason("");
    setNotes("");
    setReturnItems([]);
  };

  const handlePurchaseSelect = (id: string) => {
    setPurchaseId(id);
    setReturnItems([]);
  };

  // Update return items when purchase items load - wrapped in useEffect to avoid infinite renders
  useEffect(() => {
    if (purchaseId && purchaseItems.length > 0 && returnItems.length === 0) {
      const items = purchaseItems.map((pi: any) => ({
        purchase_item_id: pi.id,
        quantity: 0,
        max_qty: Number(pi.quantity),
        item_name: pi.item_type === "product" 
          ? (pi.products?.name || "Product") 
          : (pi.raw_materials?.name || "Raw Material"),
        unit_price: Number(pi.unit_price),
        item_type: pi.item_type,
        item_id: pi.item_id,
      }));
      setReturnItems(items);
    }
  }, [purchaseId, purchaseItems]);

  const updateItemQuantity = (idx: number, qty: number) => {
    setReturnItems((prev) => {
      const updated = [...prev];
      updated[idx].quantity = Math.min(Math.max(0, qty), updated[idx].max_qty);
      return updated;
    });
  };

  const calculateTotal = () => {
    return returnItems.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const itemsToReturn = returnItems.filter((i) => i.quantity > 0);
    if (itemsToReturn.length === 0) {
      toast.error("Please select at least one item to return");
      return;
    }
    if (!reason.trim()) {
      toast.error("Please provide a reason for the return");
      return;
    }

    setSaving(true);
    try {
      // Get purchase details
      const purchase = purchases.find((p: any) => p.id === purchaseId);
      
      // Generate display ID
      const { data: displayId } = await supabase.rpc("generate_purchase_return_display_id");
      
      // Calculate total
      const totalAmount = calculateTotal();

      // Create return
      const { data: newReturn, error: returnError } = await supabase
        .from("purchase_returns")
        .insert({
          display_id: displayId,
          warehouse_id: currentWarehouse?.id || null,
          purchase_id: purchaseId,
          vendor_id: (purchase as any)?.vendor_id,
          return_date: new Date().toISOString().split("T")[0],
          total_amount: totalAmount,
          reason,
          notes,
          status: "pending",
          created_by: user?.id,
        })
        .select("id")
        .single();

      if (returnError) throw returnError;

      // Create return items
      const returnItemsData = itemsToReturn.map((item) => ({
        return_id: newReturn.id,
        purchase_item_id: item.purchase_item_id,
        item_type: item.item_type,
        item_id: item.item_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total: item.quantity * item.unit_price,
      }));

      const { error: itemsError } = await supabase
        .from("purchase_return_items")
        .insert(returnItemsData);

      if (itemsError) throw itemsError;

      toast.success("Purchase return created successfully");
      setShowCreate(false);
      resetForm();
      qc.invalidateQueries({ queryKey: ["purchase-returns"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to create return");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusUpdate = async (id: string, newStatus: "approved" | "rejected" | "completed") => {
    try {
      const updates: any = { status: newStatus };
      if (newStatus === "approved" || newStatus === "rejected") {
        updates.approved_by = user?.id;
        updates.approved_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("purchase_returns")
        .update(updates)
        .eq("id", id);

      if (error) throw error;

      toast.success(`Return ${newStatus}`);
      qc.invalidateQueries({ queryKey: ["purchase-returns"] });
      qc.invalidateQueries({ queryKey: ["purchase-return-detail", id] });
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case "approved":
        return <Badge variant="secondary" className="bg-blue-100 text-blue-800"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
      case "completed":
        return <Badge variant="default" className="bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 mr-1" />Completed</Badge>;
      case "rejected":
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const filteredReturns = returns.filter((r: any) => {
    const matchesSearch = !search || 
      r.display_id?.toLowerCase().includes(search.toLowerCase()) ||
      r.purchases?.display_id?.toLowerCase().includes(search.toLowerCase()) ||
      r.vendors?.name?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const columns = [
    { header: "Return ID", accessor: (r: any) => <span className="font-mono text-sm">{r.display_id}</span> },
    { header: "Purchase", accessor: (r: any) => <span className="font-mono text-sm text-muted-foreground">{r.purchases?.display_id}</span> },
    { header: "Vendor", accessor: (r: any) => r.vendors?.name || "—" },
    { header: "Date", accessor: (r: any) => format(new Date(r.return_date), "dd MMM yyyy") },
    { header: "Amount", accessor: (r: any) => <span className="font-semibold">₹{Number(r.total_amount).toLocaleString()}</span> },
    { header: "Status", accessor: (r: any) => getStatusBadge(r.status) },
    { header: "Actions", accessor: (r: any) => (
      <Button variant="ghost" size="sm" onClick={() => setShowDetail(r.id)}>
        <Eye className="h-4 w-4" />
      </Button>
    )},
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Purchase Returns"
        subtitle="Manage returns to vendors"
        primaryAction={{ label: "Record Return", onClick: () => setShowCreate(true), icon: Plus }}
      />

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search returns..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredReturns.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <RotateCcw className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">No purchase returns found</p>
          </CardContent>
        </Card>
      ) : isMobile ? (
        <ResponsiveDataView
          data={filteredReturns}
          renderMobileCard={(r: any) => (
            <Card key={r.id} className="entity-card-mobile" onClick={() => setShowDetail(r.id)}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold">{r.display_id}</p>
                    <p className="text-sm text-muted-foreground">Purchase: {r.purchases?.display_id}</p>
                  </div>
                  {getStatusBadge(r.status)}
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{r.vendors?.name}</span>
                  <span className="font-semibold">₹{Number(r.total_amount).toLocaleString()}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{format(new Date(r.return_date), "dd MMM yyyy")}</p>
              </CardContent>
            </Card>
          )}
        />
      ) : (
        <DataTable data={filteredReturns} columns={columns} />
      )}

      {/* Create Return Dialog */}
      <Dialog open={showCreate} onOpenChange={(open) => { setShowCreate(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record Purchase Return</DialogTitle>
            <DialogDescription>Create a return request for a purchase</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <Label>Select Purchase *</Label>
              <Select value={purchaseId} onValueChange={handlePurchaseSelect}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select a purchase to return" />
                </SelectTrigger>
                <SelectContent>
                  {purchases.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.display_id} - {p.vendors?.name} - ₹{Number(p.total_amount).toLocaleString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {purchaseId && returnItems.length > 0 && (
              <div className="space-y-3">
                <Label>Items to Return</Label>
                <div className="border rounded-lg divide-y">
                  {returnItems.map((item, idx) => (
                    <div key={item.purchase_item_id} className="p-3 flex items-center gap-4">
                      <div className="flex-1">
                        <p className="font-medium">{item.item_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {item.item_type === "raw_material" ? "Raw Material" : "Product"} • ₹{item.unit_price} × max {item.max_qty}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-sm">Qty:</Label>
                        <Input
                          type="number"
                          min={0}
                          max={item.max_qty}
                          value={item.quantity}
                          onChange={(e) => updateItemQuantity(idx, parseInt(e.target.value) || 0)}
                          className="w-20"
                        />
                      </div>
                      <p className="font-medium w-24 text-right">
                        ₹{(item.quantity * item.unit_price).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end p-3 bg-muted/50 rounded-lg">
                  <p className="font-semibold">Total Return: ₹{calculateTotal().toLocaleString()}</p>
                </div>
              </div>
            )}

            <div>
              <Label>Reason for Return *</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select reason" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="damaged">Damaged Product</SelectItem>
                  <SelectItem value="defective">Defective/Quality Issue</SelectItem>
                  <SelectItem value="wrong_item">Wrong Item Received</SelectItem>
                  <SelectItem value="excess">Excess Quantity</SelectItem>
                  <SelectItem value="expired">Expired Product</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Additional Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any additional details..."
                className="mt-1"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setShowCreate(false); resetForm(); }}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !purchaseId || calculateTotal() === 0}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Create Return
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Return Detail Dialog */}
      <Dialog open={!!showDetail} onOpenChange={(open) => !open && setShowDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Return Details</DialogTitle>
            <DialogDescription>{returnDetail?.display_id}</DialogDescription>
          </DialogHeader>
          
          {returnDetail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Purchase</p>
                  <p className="font-medium">{returnDetail.purchases?.display_id}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Vendor</p>
                  <p className="font-medium">{returnDetail.vendors?.name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Return Date</p>
                  <p className="font-medium">{format(new Date(returnDetail.return_date), "dd MMM yyyy")}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  {getStatusBadge(returnDetail.status)}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Created By</p>
                  <p className="font-medium">{returnDetail.profiles?.full_name || "—"}</p>
                </div>
                {returnDetail.approver && (
                  <div>
                    <p className="text-sm text-muted-foreground">Approved By</p>
                    <p className="font-medium">{returnDetail.approver.full_name}</p>
                  </div>
                )}
              </div>

              <div>
                <p className="text-sm text-muted-foreground mb-2">Reason</p>
                <p className="capitalize">{returnDetail.reason?.replace("_", " ")}</p>
              </div>

              {returnDetail.notes && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Notes</p>
                  <p>{returnDetail.notes}</p>
                </div>
              )}

              <div>
                <p className="text-sm text-muted-foreground mb-2">Items</p>
                <div className="border rounded-lg divide-y">
                  {returnDetail.items?.map((item: any) => (
                    <div key={item.id} className="p-3 flex items-center justify-between">
                      <div>
                        <p className="font-medium">
                          {item.item_type === "product" 
                            ? (item.products?.name || "Product")
                            : (item.raw_materials?.name || "Raw Material")}
                        </p>
                        <p className="text-sm text-muted-foreground">₹{Number(item.unit_price).toLocaleString()} × {item.quantity}</p>
                      </div>
                      <p className="font-semibold">₹{Number(item.total).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end mt-2">
                  <p className="font-bold text-lg">Total: ₹{Number(returnDetail.total_amount).toLocaleString()}</p>
                </div>
              </div>

              {canApprove && returnDetail.status === "pending" && (
                <div className="flex gap-2 pt-4 border-t">
                  <Button 
                    className="flex-1" 
                    onClick={() => handleStatusUpdate(returnDetail.id, "approved")}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Approve
                  </Button>
                  <Button 
                    variant="destructive" 
                    className="flex-1"
                    onClick={() => handleStatusUpdate(returnDetail.id, "rejected")}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Reject
                  </Button>
                </div>
              )}

              {canApprove && returnDetail.status === "approved" && (
                <div className="pt-4 border-t">
                  <Button 
                    className="w-full"
                    onClick={() => handleStatusUpdate(returnDetail.id, "completed")}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Mark as Completed (Process Return)
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PurchaseReturns;
