import { useState, useEffect } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Plus, RotateCcw, Search, Package, CheckCircle, XCircle, Clock, Eye, Minus } from "lucide-react";
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
import { useSearchParams } from "react-router-dom";

const SaleReturns = () => {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const canApprove = ["super_admin", "manager"].includes(role || "");
  const [searchParams] = useSearchParams();

  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Form state
  const [saleId, setSaleId] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [returnItems, setReturnItems] = useState<Array<{ sale_item_id: string; quantity: number; max_qty: number; product_name: string; unit_price: number; selected: boolean }>>([]);
  const [saving, setSaving] = useState(false);

  // Auto-open create dialog with sale_id from URL
  useEffect(() => {
    const saleIdParam = searchParams.get("sale_id");
    if (saleIdParam && !showCreate) {
      setSaleId(saleIdParam);
      setShowCreate(true);
    }
  }, [searchParams, showCreate]);

  // Auto-select sale when saleId is set from URL
  useEffect(() => {
    if (saleId && returnItems.length === 0 && sales.length > 0) {
      const sale = sales.find((s: any) => s.id === saleId);
      if (sale) {
        handleSaleSelect(saleId);
      }
    }
  }, [saleId, sales, returnItems.length]);

  // Fetch returns
  const { data: returns = [], isLoading } = useQuery({
    queryKey: ["sale-returns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_returns")
        .select(`
          *,
          sales(display_id, total_amount),
          stores(name, customers(name)),
          profiles:created_by(full_name),
          approver:approved_by(full_name)
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch sales for dropdown
  const { data: sales = [] } = useQuery({
    queryKey: ["sales-for-return"],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales")
        .select("id, display_id, created_at, total_amount, store_id, customer_id, stores(name, customers(name))")
        .order("created_at", { ascending: false })
        .limit(100);
      return data || [];
    },
  });

  // Fetch sale items when sale is selected
  const { data: saleItems = [] } = useQuery({
    queryKey: ["sale-items-for-return", saleId],
    queryFn: async () => {
      if (!saleId) return [];
      const { data } = await supabase
        .from("sale_items")
        .select("id, product_id, quantity, unit_price, total, products(name)")
        .eq("sale_id", saleId);
      return data || [];
    },
    enabled: !!saleId,
  });

  // Fetch return detail
  const { data: returnDetail } = useQuery({
    queryKey: ["sale-return-detail", showDetail],
    queryFn: async () => {
      if (!showDetail) return null;
      const { data: ret } = await supabase
        .from("sale_returns")
        .select(`
          *,
          sales(display_id, total_amount, created_at),
          stores(name, customers(name)),
          profiles:created_by(full_name),
          approver:approved_by(full_name)
        `)
        .eq("id", showDetail)
        .single();
      
      const { data: items } = await supabase
        .from("sale_return_items")
        .select("*, products(name)")
        .eq("return_id", showDetail);
      
      return { ...ret, items: items || [] };
    },
    enabled: !!showDetail,
  });

  const resetForm = () => {
    setSaleId("");
    setReason("");
    setNotes("");
    setReturnItems([]);
  };

  const handleSaleSelect = (id: string) => {
    setSaleId(id);
    // Initialize return items from sale items
    const items = saleItems.map((si: any) => ({
      sale_item_id: si.id,
      quantity: 0,
      max_qty: si.quantity,
      product_name: si.products?.name || "Product",
      unit_price: si.unit_price,
      selected: false,
    }));
    setReturnItems(items);
  };

  // Update return items when sale items load
  const updateReturnItemsFromSale = () => {
    if (saleItems.length > 0 && returnItems.length === 0) {
      const items = saleItems.map((si: any) => ({
        sale_item_id: si.id,
        quantity: 0,
        max_qty: Number(si.quantity),
        product_name: si.products?.name || "Product",
        unit_price: Number(si.unit_price),
        selected: false,
      }));
      setReturnItems(items);
    }
  };

  // Call when saleItems changes - wrapped in useEffect to avoid infinite renders
  useEffect(() => {
    if (saleId && saleItems.length > 0 && returnItems.length === 0) {
      updateReturnItemsFromSale();
    }
  }, [saleId, saleItems]);

  const toggleItem = (idx: number) => {
    setReturnItems((prev) => {
      const updated = [...prev];
      updated[idx].selected = !updated[idx].selected;
      // If selecting, set default quantity to 1 (or max if only 1 available)
      if (updated[idx].selected && updated[idx].quantity === 0) {
        updated[idx].quantity = Math.min(1, updated[idx].max_qty);
      }
      return updated;
    });
  };

  const updateItemQuantity = (idx: number, qty: number) => {
    setReturnItems((prev) => {
      const updated = [...prev];
      updated[idx].quantity = Math.min(Math.max(0, qty), updated[idx].max_qty);
      // Auto-select if quantity > 0
      if (updated[idx].quantity > 0) {
        updated[idx].selected = true;
      } else {
        updated[idx].selected = false;
      }
      return updated;
    });
  };

  const calculateTotal = () => {
    return returnItems
      .filter((item) => item.selected && item.quantity > 0)
      .reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
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
      // Get sale details
      const sale = sales.find((s: any) => s.id === saleId);
      
      // Generate display ID
      const { data: displayId } = await supabase.rpc("generate_sale_return_display_id");
      
      // Calculate total
      const totalAmount = calculateTotal();

      // Create return
      const { data: newReturn, error: returnError } = await supabase
        .from("sale_returns")
        .insert({
          display_id: displayId,
          sale_id: saleId,
          store_id: sale?.store_id,
          customer_id: sale?.customer_id,
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
        sale_item_id: item.sale_item_id,
        product_id: saleItems.find((si: any) => si.id === item.sale_item_id)?.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total: item.quantity * item.unit_price,
      }));

      const { error: itemsError } = await supabase
        .from("sale_return_items")
        .insert(returnItemsData);

      if (itemsError) throw itemsError;

      toast.success("Sale return created successfully");
      setShowCreate(false);
      resetForm();
      qc.invalidateQueries({ queryKey: ["sale-returns"] });
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

      if (newStatus === "completed") {
        const { data: result, error: processError } = await supabase.rpc("process_completed_sale_return", {
          p_return_id: id,
        });
        if (processError) throw processError;
        const resultRow = Array.isArray(result) ? result[0] : result;
        if (resultRow && !resultRow.success) {
          throw new Error(resultRow.message || "Failed to process return");
        }
        toast.success(resultRow?.message || "Return processed successfully");
      } else {
        const { error } = await supabase
          .from("sale_returns")
          .update(updates)
          .eq("id", id)
          .eq("status", "approved");

        if (error) throw error;
        toast.success(`Return ${newStatus}`);
      }

      qc.invalidateQueries({ queryKey: ["sale-returns"] });
      qc.invalidateQueries({ queryKey: ["sale-return-detail", id] });
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["stores"] });
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
      r.sales?.display_id?.toLowerCase().includes(search.toLowerCase()) ||
      r.stores?.name?.toLowerCase().includes(search.toLowerCase()) ||
      r.stores?.customers?.name?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const columns = [
    { header: "Return ID", accessor: (r: any) => <span className="font-mono text-sm">{r.display_id}</span> },
    { header: "Sale", accessor: (r: any) => <span className="font-mono text-sm text-muted-foreground">{r.sales?.display_id}</span> },
    { header: "Customer", accessor: (r: any) => r.stores?.customers?.name || r.stores?.name || "—" },
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
        title="Sale Returns"
        subtitle="Manage product returns from customers"
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
            <p className="text-muted-foreground">No sale returns found</p>
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
                    <p className="text-sm text-muted-foreground">Sale: {r.sales?.display_id}</p>
                  </div>
                  {getStatusBadge(r.status)}
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{r.stores?.customers?.name || r.stores?.name}</span>
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
            <DialogTitle>Record Sale Return</DialogTitle>
            <DialogDescription>Create a return request for a sale</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <Label>Select Sale *</Label>
              <Select value={saleId} onValueChange={handleSaleSelect}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select a sale to return" />
                </SelectTrigger>
                <SelectContent>
                  {sales.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.display_id} - {s.stores?.customers?.name || s.stores?.name} - ₹{Number(s.total_amount).toLocaleString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {saleId && returnItems.length > 0 && (
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Items to Return
                </Label>
                <div className="border rounded-lg divide-y">
                  {returnItems.map((item, idx) => (
                    <div
                      key={item.sale_item_id}
                      className={`p-3 flex items-center gap-3 transition-colors ${
                        item.selected ? "bg-primary/5" : ""
                      }`}
                    >
                      <Checkbox
                        checked={item.selected}
                        onCheckedChange={() => toggleItem(idx)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{item.product_name}</p>
                        <p className="text-xs text-muted-foreground">
                          ₹{item.unit_price} × max {item.max_qty}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => updateItemQuantity(idx, item.quantity - 1)}
                          disabled={!item.selected || item.quantity <= 0}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Input
                          type="number"
                          min={0}
                          max={item.max_qty}
                          value={item.quantity}
                          onChange={(e) => updateItemQuantity(idx, parseInt(e.target.value) || 0)}
                          className="w-14 h-7 text-center text-sm"
                          disabled={!item.selected}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => updateItemQuantity(idx, item.quantity + 1)}
                          disabled={!item.selected || item.quantity >= item.max_qty}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <p className="font-medium w-20 text-right text-sm">
                        ₹{(item.quantity * item.unit_price).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    {returnItems.filter(i => i.selected && i.quantity > 0).length} items selected
                  </p>
                  <p className="font-semibold">
                    Total Return: ₹{calculateTotal().toLocaleString()}
                  </p>
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
                  <SelectItem value="wrong_item">Wrong Item Delivered</SelectItem>
                  <SelectItem value="not_needed">Not Needed Anymore</SelectItem>
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
        <Button type="submit" disabled={saving || !saleId || returnItems.filter(i => i.selected && i.quantity > 0).length === 0}>
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
                  <p className="text-sm text-muted-foreground">Sale</p>
                  <p className="font-medium">{returnDetail.sales?.display_id}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Customer</p>
                  <p className="font-medium">{returnDetail.stores?.customers?.name || returnDetail.stores?.name}</p>
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
                        <p className="font-medium">{item.products?.name || "Product"}</p>
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
                    Mark as Completed (Process Refund)
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

export default SaleReturns;
