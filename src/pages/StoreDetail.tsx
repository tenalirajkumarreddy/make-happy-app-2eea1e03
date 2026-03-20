import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DataTable } from "@/components/shared/DataTable";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { StatCard } from "@/components/shared/StatCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Loader2, ArrowLeft, DollarSign, ShoppingCart, Banknote,
  MapPin, Store as StoreIcon, Phone,
  Pencil, X, Save, AlertTriangle, ScanLine, Trash2, Scale, ArrowRightLeft, Package, ShieldCheck,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { usePermission } from "@/hooks/usePermission";
import { showErrorToast } from "@/lib/errorUtils";
import { QrScanner } from "@/components/shared/QrScanner";
import { parseUpiQr } from "@/lib/upiParser";
import { StoreLedger } from "@/components/stores/StoreLedger";
import { logActivity } from "@/lib/activityLogger";
import { ImageUpload } from "@/components/shared/ImageUpload";
import { KycReviewDialog } from "@/components/customers/KycReviewDialog";

const StoreDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { role, user } = useAuth();
  const canEdit = role === "super_admin" || role === "manager";
  const { allowed: canEditBalance } = usePermission("edit_balance");

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [showAdjustBalance, setShowAdjustBalance] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showKycDialog, setShowKycDialog] = useState(false);
  const [transferCustomerId, setTransferCustomerId] = useState("");
  const [transferSaving, setTransferSaving] = useState(false);
  const [adjustSaving, setAdjustSaving] = useState(false);
  const [newBalanceInput, setNewBalanceInput] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    alternate_phone: "",
    street: "",
    area: "",
    city: "",
    district: "",
    state: "",
    pincode: "",
    store_type_id: "",
    route_id: "",
    credit_limit_no_kyc: "",
    credit_limit_kyc: "",
  });

  const { data: store, isLoading } = useQuery({
    queryKey: ["store", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("*, customers(id, name, is_active, kyc_status, kyc_selfie_url, kyc_aadhar_front_url, kyc_aadhar_back_url, kyc_rejection_reason, kyc_submitted_at, kyc_verified_at), store_types(name), routes(name)")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Customer list for transfer
  const { data: allCustomers } = useQuery({
    queryKey: ["customers-for-transfer"],
    queryFn: async () => {
      const { data } = await supabase.from("customers").select("id, name, display_id").eq("is_active", true).order("name");
      return data || [];
    },
    enabled: canEdit,
  });

  const { data: allRoutes } = useQuery({
    queryKey: ["routes-for-edit"],
    queryFn: async () => {
      const { data } = await supabase.from("routes").select("id, name").order("name");
      return data || [];
    },
    enabled: canEdit,
  });

  const { data: allStoreTypes } = useQuery({
    queryKey: ["store-types-for-edit"],
    queryFn: async () => {
      const { data } = await supabase.from("store_types").select("id, name").order("name");
      return data || [];
    },
    enabled: canEdit,
  });

  // Products with pricing hierarchy for the Products tab
  const { data: storeProducts } = useQuery({
    queryKey: ["store-products-tab", id, store?.store_type_id],
    queryFn: async () => {
      if (!store?.store_type_id) {
        const { data } = await supabase.from("products").select("id, name, sku, base_price").eq("is_active", true).order("name");
        return data || [];
      }
      const { data: accessData } = await supabase
        .from("store_type_products")
        .select("product_id, products(id, name, sku, base_price)")
        .eq("store_type_id", store.store_type_id);
      if (accessData && accessData.length > 0) {
        return accessData.map((a: any) => a.products).filter(Boolean);
      }
      const { data } = await supabase.from("products").select("id, name, sku, base_price").eq("is_active", true).order("name");
      return data || [];
    },
    enabled: !!store,
  });

  const { data: storeTypePricing } = useQuery({
    queryKey: ["store-type-pricing-tab", store?.store_type_id],
    queryFn: async () => {
      const { data } = await supabase.from("store_type_pricing").select("product_id, price").eq("store_type_id", store!.store_type_id!);
      const map: Record<string, number> = {};
      data?.forEach((p) => { map[p.product_id] = Number(p.price); });
      return map;
    },
    enabled: !!store?.store_type_id,
  });

  const { data: storePricingMap } = useQuery({
    queryKey: ["store-pricing-tab", id],
    queryFn: async () => {
      const { data } = await supabase.from("store_pricing").select("product_id, price").eq("store_id", id!);
      const map: Record<string, number> = {};
      data?.forEach((p) => { map[p.product_id] = Number(p.price); });
      return map;
    },
    enabled: !!id,
  });

  const getEffectivePrice = (productId: string, basePrice: number): { price: number; label: string } => {
    if (storePricingMap && productId in storePricingMap) return { price: storePricingMap[productId], label: "store" };
    if (storeTypePricing && productId in storeTypePricing) return { price: storeTypePricing[productId], label: "type" };
    return { price: basePrice, label: "base" };
  };

  const handleTransfer = async () => {
    if (!store || !id || !transferCustomerId) return;
    if (transferCustomerId === store.customer_id) {
      toast.error("Store already belongs to this customer");
      return;
    }
    setTransferSaving(true);
    const { error } = await supabase.from("stores").update({ customer_id: transferCustomerId }).eq("id", id);
    setTransferSaving(false);
    if (error) { showErrorToast(error); return; }
    const newCust = allCustomers?.find((c) => c.id === transferCustomerId);
    logActivity(user!.id, `Transferred store to ${newCust?.name}`, "store", store.display_id, id);
    toast.success(`Store transferred to ${newCust?.name}`);
    setShowTransfer(false);
    setTransferCustomerId("");
    qc.invalidateQueries({ queryKey: ["store", id] });
    qc.invalidateQueries({ queryKey: ["stores"] });
  };

  const { data: sales } = useQuery({
    queryKey: ["store-sales", id],
    queryFn: async () => {
      const { data } = await supabase.from("sales").select("*, stores(name)").eq("store_id", id!).order("created_at", { ascending: false }).limit(50);
      return data || [];
    },
    enabled: !!id,
  });

  const { data: profiles } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name, avatar_url");
      return data || [];
    },
  });

  const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || []);
  const getRecorder = (uid: string) => profileMap.get(uid);


  const { data: transactions } = useQuery({
    queryKey: ["store-transactions", id],
    queryFn: async () => {
      const { data } = await supabase.from("transactions").select("*").eq("store_id", id!).order("created_at", { ascending: false }).limit(50);
      return data || [];
    },
    enabled: !!id,
  });

  const { data: orders } = useQuery({
    queryKey: ["store-orders", id],
    queryFn: async () => {
      const { data } = await supabase.from("orders").select("*").eq("store_id", id!).order("created_at", { ascending: false }).limit(50);
      return data || [];
    },
    enabled: !!id,
  });

  const { data: visits } = useQuery({
    queryKey: ["store-visits", id],
    queryFn: async () => {
      const { data } = await supabase.from("store_visits").select("*, route_sessions(routes(name))").eq("store_id", id!).order("visited_at", { ascending: false }).limit(50);
      return data || [];
    },
    enabled: !!id,
  });

  const { data: balanceAdjustments } = useQuery({
    queryKey: ["balance-adjustments", id],
    queryFn: async () => {
      const { data } = await supabase.from("balance_adjustments").select("*").eq("store_id", id!).order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });

  const { data: qrCodes } = useQuery({
    queryKey: ["store-qr-codes", id],
    queryFn: async () => {
      const { data } = await supabase.from("store_qr_codes").select("*").eq("store_id", id!).order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });


  const handleQrScanned = async (rawData: string) => {
    const upi = parseUpiQr(rawData);
    if (!upi) { toast.error("Not a valid UPI QR code"); return; }
    const { error } = await supabase.from("store_qr_codes").insert({
      store_id: id!,
      upi_id: upi.pa,
      payee_name: upi.pn || null,
      raw_data: rawData,
    });
    if (error) {
      showErrorToast(error);
      return;
    }
    toast.success("QR code linked to store");
    qc.invalidateQueries({ queryKey: ["store-qr-codes", id] });
  };

  const handleDeleteQr = async (qrId: string) => {
    const { error } = await supabase.from("store_qr_codes").delete().eq("id", qrId);
    if (error) { showErrorToast(error); return; }
    toast.success("QR code removed");
    qc.invalidateQueries({ queryKey: ["store-qr-codes", id] });
  };

  const handleAdjustBalance = async () => {
    if (!store || !id || !user) return;
    if (!canEditBalance) {
      toast.error("You do not have permission to adjust balance");
      return;
    }
    const newBal = parseFloat(newBalanceInput);
    if (isNaN(newBal)) { toast.error("Enter a valid amount"); return; }
    const oldBal = Number(store.outstanding);
    if (newBal === oldBal) { toast.error("New balance is the same as current"); return; }

    setAdjustSaving(true);
    const adjustment = newBal - oldBal;

    const { error } = await supabase.from("balance_adjustments").insert({
      store_id: id,
      customer_id: store.customer_id,
      old_outstanding: oldBal,
      new_outstanding: newBal,
      adjustment_amount: adjustment,
      reason: adjustReason || null,
      adjusted_by: user.id,
    });

    if (error) { showErrorToast(error); setAdjustSaving(false); return; }

    await supabase.from("stores").update({ outstanding: newBal }).eq("id", id);
    logActivity(user.id, "Balance adjustment", "store", store.display_id, id, { old: oldBal, new: newBal, adjustment });

    toast.success("Balance adjusted");
    setAdjustSaving(false);
    setShowAdjustBalance(false);
    setNewBalanceInput("");
    setAdjustReason("");
    qc.invalidateQueries({ queryKey: ["store", id] });
    qc.invalidateQueries({ queryKey: ["balance-adjustments", id] });
    };

  const startEditing = () => {
    if (!store || !store.is_active) return;
    setForm({
      name: store.name || "",
      phone: store.phone || "",
      alternate_phone: store.alternate_phone || "",
      street: store.street || "",
      area: store.area || "",
      city: store.city || "",
      district: store.district || "",
      state: store.state || "",
      pincode: store.pincode || "",
      store_type_id: store.store_type_id || "",
      route_id: store.route_id || "",
      credit_limit_no_kyc: String(store.credit_limit_no_kyc || 0),
      credit_limit_kyc: String(store.credit_limit_kyc || 0),
    });
    setPhotoUrl(store.photo_url || null);
    setEditing(true);
  };

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    const address = [form.street, form.area, form.city, form.district, form.state, form.pincode].filter(Boolean).join(", ");
    const { error } = await supabase
      .from("stores")
      .update({
        name: form.name,
        phone: form.phone || null,
        alternate_phone: form.alternate_phone || null,
        street: form.street || null,
        area: form.area || null,
        city: form.city || null,
        district: form.district || null,
        state: form.state || null,
        pincode: form.pincode || null,
        address: address || null,
        store_type_id: form.store_type_id || null,
        route_id: form.route_id || null,
        photo_url: photoUrl || null,
        credit_limit_no_kyc: Number(form.credit_limit_no_kyc) || 0,
        credit_limit_kyc: Number(form.credit_limit_kyc) || 0,
      })
      .eq("id", id);
    setSaving(false);
    if (error) { showErrorToast(error); return; }
    toast.success("Store updated");
    setEditing(false);
    qc.invalidateQueries({ queryKey: ["store", id] });
    qc.invalidateQueries({ queryKey: ["stores"] });
  };

  const handleToggleActive = async () => {
    if (!store || !id) return;
    // Prevent activating store if customer is inactive
    const customerActive = (store as any).customers?.is_active;
    if (!store.is_active && customerActive === false) {
      toast.error("Cannot activate store: the customer is inactive. Activate the customer first.");
      return;
    }
    const newVal = !store.is_active;
    setToggling(true);
    const { error } = await supabase.from("stores").update({ is_active: newVal }).eq("id", id);
    setToggling(false);
    if (error) { showErrorToast(error); return; }
    toast.success(`Store ${newVal ? "activated" : "deactivated"}`);
    setEditing(false);
    qc.invalidateQueries({ queryKey: ["store", id] });
    qc.invalidateQueries({ queryKey: ["stores"] });
    qc.invalidateQueries({ queryKey: ["customer-stores", store.customer_id] });
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!store) {
    return <div className="text-center py-20 text-muted-foreground">Store not found</div>;
  }

  const isInactive = !store.is_active;
  const totalSales = sales?.reduce((s, r) => s + Number(r.total_amount), 0) || 0;
  const totalCollected = transactions?.reduce((s, r) => s + Number(r.total_amount), 0) || 0;
  const fullAddress = [store.street, store.area, store.city, store.district, store.state, store.pincode].filter(Boolean).join(", ") || store.address || "Not provided";




  const orderColumns = [
    { header: "Order ID", accessor: "display_id" as const, className: "font-mono text-xs" },
    { header: "Type", accessor: "order_type" as const, className: "hidden sm:table-cell" },
    { header: "Source", accessor: "source" as const, className: "hidden sm:table-cell" },
    { header: "Status", accessor: (row: any) => <StatusBadge status={row.status === "delivered" ? "active" : row.status === "cancelled" ? "rejected" : "pending"} label={row.status} /> },
    { header: "Date", accessor: (row: any) => new Date(row.created_at).toLocaleDateString("en-IN"), className: "text-muted-foreground text-xs" },
  ];

  const visitColumns = [
    { header: "Route", accessor: (row: any) => (row.route_sessions as any)?.routes?.name || "—" },
    { header: "Notes", accessor: (row: any) => row.notes || "—", className: "text-sm hidden sm:table-cell" },
    { header: "Location", accessor: (row: any) => row.lat ? `${row.lat.toFixed(4)}, ${row.lng.toFixed(4)}` : "—", className: "text-xs text-muted-foreground hidden md:table-cell" },
    { header: "Visited At", accessor: (row: any) => new Date(row.visited_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }), className: "text-muted-foreground text-xs" },
  ];

  // Unified compact card renderer
  const renderCompactCard = (type: "sale" | "txn" | "order" | "visit") => (row: any) => {
    const p = type !== "visit" ? getRecorder(row.recorded_by || row.created_by) : null;
    return (
      <div className="rounded-xl border bg-card px-3 py-2.5 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] text-muted-foreground">
            {type === "visit" ? ((row.route_sessions as any)?.routes?.name || "Visit") : row.display_id}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {new Date(type === "visit" ? row.visited_at : row.created_at).toLocaleDateString("en-IN")}
          </span>
        </div>

        {type === "sale" && (
          <>
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-sm font-bold text-foreground">₹{Number(row.total_amount).toLocaleString()}</span>
              <span className={`text-xs font-medium ${Number(row.outstanding_amount) > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                Due: ₹{Number(row.outstanding_amount).toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between mt-1.5 text-[11px] text-muted-foreground">
              <span>Cash ₹{Number(row.cash_amount).toLocaleString()} · UPI ₹{Number(row.upi_amount).toLocaleString()}</span>
              {p && (
                <div className="flex items-center gap-1">
                  <Avatar className="h-4 w-4">
                    <AvatarImage src={p?.avatar_url || undefined} />
                    <AvatarFallback className="text-[8px] bg-primary/10 text-primary">{(p?.full_name || "?").charAt(0)}</AvatarFallback>
                  </Avatar>
                  <span>{p?.full_name || "—"}</span>
                </div>
              )}
            </div>
          </>
        )}

        {type === "txn" && (
          <>
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-sm font-bold text-foreground">₹{Number(row.total_amount).toLocaleString()}</span>
              <span className="text-xs text-muted-foreground">
                Bal: ₹{Number(row.old_outstanding).toLocaleString()} → ₹{Number(row.new_outstanding).toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between mt-1.5 text-[11px] text-muted-foreground">
              <span>Cash ₹{Number(row.cash_amount).toLocaleString()} · UPI ₹{Number(row.upi_amount).toLocaleString()}</span>
              {row.notes && <span className="truncate max-w-[120px]">{row.notes}</span>}
            </div>
          </>
        )}

        {type === "order" && (
          <>
            <div className="flex items-center justify-between mt-1.5">
              <StatusBadge status={row.status === "delivered" ? "active" : row.status === "cancelled" ? "rejected" : "pending"} label={row.status} />
              <span className="text-xs text-muted-foreground capitalize">{row.order_type} · {row.source}</span>
            </div>
            {row.requirement_note && (
              <p className="text-[11px] text-muted-foreground mt-1.5 truncate">{row.requirement_note}</p>
            )}
          </>
        )}

        {type === "visit" && (
          <>
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-sm font-medium text-foreground">
                {new Date(row.visited_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
              </span>
              {row.lat && <span className="text-[11px] text-muted-foreground">{row.lat.toFixed(4)}, {row.lng?.toFixed(4)}</span>}
            </div>
            {row.notes && <p className="text-[11px] text-muted-foreground mt-1.5 truncate">{row.notes}</p>}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <Button variant="ghost" size="sm" onClick={() => navigate("/stores")} className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2">
        <ArrowLeft className="h-4 w-4" />
        Stores
      </Button>

      {isInactive && (
        <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
          <div>
            <p className="text-sm font-medium text-destructive">This store is inactive</p>
            <p className="text-xs text-muted-foreground mt-0.5">No sales, orders, or modifications can be made. Activate the store to resume operations.</p>
          </div>
        </div>
      )}

      <Card className={`overflow-hidden ${isInactive ? "opacity-75" : ""}`}>
        {/* Banner */}
        <div className="h-24 sm:h-32 bg-gradient-to-br from-primary/20 via-accent/30 to-primary/10 relative">
          {store.lat && store.lng && (
            <a
              href={`https://www.google.com/maps?q=${store.lat},${store.lng}`}
              target="_blank" rel="noopener noreferrer"
              className="absolute top-3 right-3 flex items-center gap-1.5 text-xs font-medium bg-card/80 backdrop-blur-sm rounded-full px-3 py-1.5 text-primary hover:bg-card transition-colors shadow-sm"
            >
              <MapPin className="h-3.5 w-3.5" /> Map
            </a>
          )}
        </div>

        <CardContent className="relative px-4 sm:px-6 pb-5 -mt-10 sm:-mt-12">
          {/* Identity row: photo + name/id */}
          <div className="flex items-end gap-4">
            <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-xl border-4 border-card bg-muted flex items-center justify-center overflow-hidden shadow-md shrink-0">
              {store.photo_url ? (
                <img src={store.photo_url} alt={store.name} className="w-full h-full object-cover" />
              ) : (
                <StoreIcon className="h-10 w-10 text-muted-foreground/40" />
              )}
            </div>
            <div className="flex-1 min-w-0 pb-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-foreground leading-tight">{store.name}</h1>
                <StatusBadge status={store.is_active ? "active" : "inactive"} />
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span className="text-sm text-muted-foreground font-mono">{store.display_id}</span>
                {(store as any).store_types?.name && (
                  <Badge variant="secondary" className="text-xs">{(store as any).store_types.name}</Badge>
                )}
              </div>
            </div>
          </div>

          {/* Action bar — separate row, always wraps cleanly */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {canEdit && (
              <>
                <div className="flex items-center gap-2 rounded-full border bg-muted/50 px-3 py-1.5">
                  <Label htmlFor="store-active-toggle" className="text-xs font-medium text-muted-foreground cursor-pointer select-none">
                    {store.is_active ? "Active" : "Inactive"}
                  </Label>
                  <Switch
                    id="store-active-toggle"
                    checked={store.is_active}
                    onCheckedChange={handleToggleActive}
                    disabled={toggling}
                  />
                </div>
                {!isInactive && (
                  !editing ? (
                    <Button variant="outline" size="sm" onClick={startEditing} className="gap-1.5 rounded-full h-8">
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                  ) : (
                    <div className="flex gap-1.5">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving} className="rounded-full h-8 w-8 p-0">
                        <X className="h-4 w-4" />
                      </Button>
                      <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5 rounded-full h-8">
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        Save
                      </Button>
                    </div>
                  )
                )}
              </>
            )}
            {canEditBalance && !isInactive && (
              <Button variant="outline" size="sm" onClick={() => { setNewBalanceInput(String(store.outstanding)); setShowAdjustBalance(true); }} className="gap-1.5 rounded-full h-8">
                <Scale className="h-3.5 w-3.5" /> Adjust Balance
              </Button>
            )}
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => setShowTransfer(true)} className="gap-1.5 rounded-full h-8">
                <ArrowRightLeft className="h-3.5 w-3.5" /> Transfer
              </Button>
            )}
          </div>

          <Separator className="my-4" />

          {editing ? (
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <ImageUpload folder="stores" currentUrl={photoUrl} onUploaded={setPhotoUrl} onRemoved={() => setPhotoUrl(null)} size="lg" />
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="space-y-1.5"><Label className="text-xs">Store Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label className="text-xs">Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label className="text-xs">Alt. Phone</Label><Input value={form.alternate_phone} onChange={(e) => setForm({ ...form, alternate_phone: e.target.value })} /></div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Store Type</Label>
                    <Select value={form.store_type_id} onValueChange={(v) => setForm({ ...form, store_type_id: v === "__none" ? "" : v })}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select type" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">None</SelectItem>
                        {allStoreTypes?.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Route</Label>
                    <Select value={form.route_id} onValueChange={(v) => setForm({ ...form, route_id: v === "__none" ? "" : v })}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select route" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">None</SelectItem>
                        {allRoutes?.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5"><Label className="text-xs">Street</Label><Input value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label className="text-xs">Area</Label><Input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label className="text-xs">City</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label className="text-xs">District</Label><Input value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label className="text-xs">State</Label><Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label className="text-xs">Pincode</Label><Input value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} /></div>
                  {canEdit && (
                    <>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Credit Limit (No KYC) ₹</Label>
                        <Input type="number" min="0" value={form.credit_limit_no_kyc} onChange={(e) => setForm({ ...form, credit_limit_no_kyc: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Credit Limit (KYC Done) ₹</Label>
                        <Input type="number" min="0" value={form.credit_limit_kyc} onChange={(e) => setForm({ ...form, credit_limit_kyc: e.target.value })} />
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-2">
                <InfoItem label="Customer" value={(store as any).customers?.name || "—"} />
                <InfoItem label="Route" value={(store as any).routes?.name || "Not assigned"} />
                <InfoItem label="Phone" value={store.phone || "Not provided"} />
                <InfoItem label="Address" value={fullAddress} />
                <InfoItem label="Opening Bal." value={`₹${Number(store.opening_balance).toLocaleString()}`} />
                <InfoItem label="Created" value={new Date(store.created_at).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" })} />
              </div>
              {/* Credit Limits — visible to all staff */}
              <div className="flex flex-wrap gap-4 pt-1 border-t border-border/50">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Credit (No KYC)</span>
                  <span className="text-sm font-semibold text-foreground">₹{Number(store.credit_limit_no_kyc || 0).toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Credit (KYC Done)</span>
                  <span className="text-sm font-semibold text-success">₹{Number(store.credit_limit_kyc || 0).toLocaleString()}</span>
                </div>
                {/* Customer KYC status */}
                {(() => {
                  const cust = (store as any).customers;
                  if (!cust) return null;
                  const kycStatus: string = cust.kyc_status || "not_requested";
                  return (
                    <div className="flex items-center gap-2 ml-auto">
                      <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Customer KYC:</span>
                      <Badge
                        variant="outline"
                        className={
                          kycStatus === "verified" ? "border-emerald-300 text-emerald-600 bg-emerald-50" :
                          kycStatus === "pending" ? "border-amber-300 text-amber-600 bg-amber-50" :
                          kycStatus === "rejected" ? "border-red-300 text-red-600 bg-red-50" :
                          "text-muted-foreground"
                        }
                      >
                        {kycStatus.replace("_", " ")}
                      </Badge>
                      {canEdit && (kycStatus === "pending" || kycStatus === "rejected") && (
                        <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 rounded-full" onClick={() => setShowKycDialog(true)}>
                          Review KYC
                        </Button>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard title="Total Sales" value={`₹${totalSales.toLocaleString()}`} icon={DollarSign} iconColor="bg-primary" />
        <StatCard title="Collections" value={`₹${totalCollected.toLocaleString()}`} icon={Banknote} iconColor="bg-success" />
        <StatCard title="Outstanding" value={`₹${Number(store.outstanding).toLocaleString()}`} icon={Banknote} iconColor="bg-warning" />
        <StatCard title="Orders" value={String(orders?.length || 0)} icon={ShoppingCart} iconColor="bg-info" />
      </div>

      <Tabs defaultValue="ledger">
        <TabsList className="w-full sm:w-auto overflow-x-auto">
          <TabsTrigger value="ledger" className="text-xs sm:text-sm">Ledger ({(sales?.length || 0) + (transactions?.length || 0)})</TabsTrigger>
          <TabsTrigger value="orders" className="text-xs sm:text-sm">Orders ({orders?.length || 0})</TabsTrigger>
          <TabsTrigger value="products" className="text-xs sm:text-sm">
            <Package className="h-3.5 w-3.5 mr-1" />Products ({storeProducts?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="visits" className="text-xs sm:text-sm">Visits ({visits?.length || 0})</TabsTrigger>
          <TabsTrigger value="qr" className="text-xs sm:text-sm">QR ({qrCodes?.length || 0})</TabsTrigger>
        </TabsList>
        <TabsContent value="ledger" className="mt-4">
          <StoreLedger
            sales={sales || []}
            transactions={transactions || []}
            balanceAdjustments={balanceAdjustments || []}
            openingBalance={Number(store.opening_balance)}
            storeCreatedAt={store.created_at}
            profileMap={profileMap}
          />
        </TabsContent>
        <TabsContent value="orders" className="mt-4">
          {(orders?.length || 0) === 0 ? <EmptyTab label="No orders yet" /> : (
            <DataTable columns={orderColumns} data={orders || []} searchKey="display_id" searchPlaceholder="Search orders..."
              renderMobileCard={renderCompactCard("order")} />
          )}
        </TabsContent>
        <TabsContent value="products" className="mt-4">
          {(!storeProducts || storeProducts.length === 0) ? (
            <EmptyTab label="No products assigned to this store type" />
          ) : (
            <div className="space-y-2">
              {storeProducts.map((p: any) => {
                const { price, label } = getEffectivePrice(p.id, Number(p.base_price));
                return (
                  <div key={p.id} className="flex items-center justify-between rounded-lg border bg-card px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{p.name}</p>
                      <Badge variant="outline" className="text-[10px] mt-0.5">{p.sku}</Badge>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      <p className="text-sm font-bold">₹{price.toLocaleString()}</p>
                      <span className={`text-[10px] font-medium capitalize px-1.5 py-0.5 rounded-full ${
                        label === "store" ? "bg-primary/10 text-primary" :
                        label === "type" ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {label} price
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
        <TabsContent value="visits" className="mt-4">
          {(visits?.length || 0) === 0 ? <EmptyTab label="No visits recorded" /> : (
            <DataTable columns={visitColumns} data={visits || []} searchKey="notes" searchPlaceholder="Search..."
              renderMobileCard={renderCompactCard("visit")} />
          )}
        </TabsContent>
        <TabsContent value="qr" className="mt-4">
          <div className="space-y-4">
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => setShowQrScanner(true)} className="gap-2">
                <ScanLine className="h-4 w-4" /> Scan & Add QR
              </Button>
            )}
            {(qrCodes?.length || 0) === 0 ? <EmptyTab label="No QR codes linked" /> : (
              <div className="space-y-2">
                {qrCodes?.map((qr: any) => (
                  <div key={qr.id} className="flex items-center justify-between rounded-lg border bg-card p-3">
                    <div>
                      <p className="font-mono text-sm">{qr.upi_id}</p>
                      {qr.payee_name && <p className="text-xs text-muted-foreground mt-0.5">{qr.payee_name}</p>}
                      <p className="text-[11px] text-muted-foreground mt-0.5">Added {new Date(qr.created_at).toLocaleDateString("en-IN")}</p>
                    </div>
                    {canEdit && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteQr(qr.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
      {/* Adjust Balance Dialog */}
      <Dialog open={showAdjustBalance} onOpenChange={(v) => { setShowAdjustBalance(v); if (!v) { setNewBalanceInput(""); setAdjustReason(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Adjust Balance</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">Current Outstanding</Label>
              <p className="text-lg font-bold">₹{Number(store?.outstanding || 0).toLocaleString()}</p>
            </div>
            <div>
              <Label>New Outstanding (₹)</Label>
              <Input type="number" value={newBalanceInput} onChange={(e) => setNewBalanceInput(e.target.value)} className="mt-1" />
              {newBalanceInput && !isNaN(parseFloat(newBalanceInput)) && (
                <p className="text-xs mt-1 text-muted-foreground">
                  Adjustment: <span className={parseFloat(newBalanceInput) - Number(store?.outstanding || 0) > 0 ? "text-destructive font-medium" : "text-success font-medium"}>
                    {parseFloat(newBalanceInput) - Number(store?.outstanding || 0) > 0 ? "+" : ""}₹{(parseFloat(newBalanceInput) - Number(store?.outstanding || 0)).toLocaleString()}
                  </span>
                </p>
              )}
            </div>
            <div>
              <Label>Reason</Label>
              <Input value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} className="mt-1" placeholder="e.g. Correction after physical count" />
            </div>
            <Button onClick={handleAdjustBalance} className="w-full" disabled={adjustSaving}>
              {adjustSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Adjustment
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Transfer Store Dialog */}
      <Dialog open={showTransfer} onOpenChange={setShowTransfer}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Transfer Store</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Move <strong>{store?.name}</strong> from <strong>{(store as any)?.customers?.name}</strong> to another customer.</p>
          <div className="space-y-3 mt-2">
            <div>
              <Label>New Customer</Label>
              <Select value={transferCustomerId} onValueChange={setTransferCustomerId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>
                  {allCustomers?.filter((c) => c.id !== store?.customer_id).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name} ({c.display_id})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransfer(false)}>Cancel</Button>
            <Button onClick={handleTransfer} disabled={transferSaving || !transferCustomerId}>
              {transferSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* KYC Review Dialog */}
      {canEdit && showKycDialog && (store as any).customers && (
        <KycReviewDialog
          customer={(store as any).customers}
          open={showKycDialog}
          onOpenChange={setShowKycDialog}
          onDone={() => {
            setShowKycDialog(false);
            qc.invalidateQueries({ queryKey: ["store", id] });
          }}
        />
      )}
    </div>
  );
};

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-sm font-medium text-foreground truncate">{value}</p>
    </div>
  );
}

function EmptyTab({ label }: { label: string }) {
  return <div className="rounded-xl border border-dashed bg-card p-10 text-center text-muted-foreground">{label}</div>;
}

export default StoreDetail;
