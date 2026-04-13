import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  ArrowRightLeft,
  Building2,
  ChevronDown,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  User,
  Warehouse,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ─── Types ────────────────────────────────────────────────────────────────────

type TransferRow = {
  id: string;
  created_at: string;
  product_id: string;
  quantity: number;
  description: string | null;
  from_warehouse_id: string | null;
  from_staff_id: string | null;
  to_warehouse_id: string | null;
  to_staff_id: string | null;
  from_warehouse: { name: string } | null;
  to_warehouse: { name: string } | null;
  from_staff: { full_name: string } | null;
  to_staff: { full_name: string } | null;
  product: { name: string } | null;
};

type FormState = {
  product_id: string;
  quantity: string;
  from_type: "warehouse" | "staff";
  from_id: string;
  to_type: "warehouse" | "staff";
  to_id: string;
  description: string;
};

const DEFAULT_FORM: FormState = {
  product_id: "",
  quantity: "",
  from_type: "warehouse",
  from_id: "",
  to_type: "staff",
  to_id: "",
  description: "",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function StockTransfers() {
  const { user, role } = useAuth();
  const { currentWarehouse } = useWarehouse();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);

  const isAdmin = role === "super_admin" || role === "manager";

  // ── Products query ──────────────────────────────────────────────────────────
  const { data: products = [] } = useQuery({
    queryKey: ["products-for-transfer"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── Staff query ─────────────────────────────────────────────────────────────
  const { data: staffList = [] } = useQuery({
    queryKey: ["staff-for-transfer", currentWarehouse?.id],
    queryFn: async () => {
      let q = supabase
        .from("user_roles")
        .select("user_id, profiles(id, full_name)")
        .in("role", ["agent", "marketer", "pos", "manager"]);
      if (currentWarehouse?.id && !isAdmin) {
        q = q.eq("warehouse_id", currentWarehouse.id);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.user_id as string,
        name: (r.profiles?.full_name as string) ?? "Unknown",
      }));
    },
  });

  // ── Warehouses query (admin needs to pick any warehouse) ────────────────────
  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: isAdmin,
  });

  // ── Transfers history ───────────────────────────────────────────────────────
  const {
    data: transfers = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["stock-transfers", currentWarehouse?.id],
    queryFn: async () => {
      let q = supabase
        .from("stock_transfers")
        .select(
          `id, created_at, product_id, quantity, description,
           from_warehouse_id, from_staff_id:from_user_id, to_warehouse_id, to_staff_id:to_user_id,
           from_warehouse:warehouses!stock_transfers_from_warehouse_id_fkey(name),
           to_warehouse:warehouses!stock_transfers_to_warehouse_id_fkey(name),
           from_staff:profiles!stock_transfers_from_user_id_profiles_fkey(full_name),
           to_staff:profiles!stock_transfers_to_user_id_profiles_fkey(full_name),
           product:products(name)`
        )
        .order("created_at", { ascending: false })
        .limit(200);

      if (currentWarehouse?.id) {
        q = q.or(
          `from_warehouse_id.eq.${currentWarehouse.id},to_warehouse_id.eq.${currentWarehouse.id}`
        );
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as TransferRow[];
    },
  });

  // ── Mutation ────────────────────────────────────────────────────────────────
  const { mutate: submitTransfer, status } = useMutation({
    mutationFn: async (f: FormState) => {
      const qty = parseFloat(f.quantity);
      if (!qty || qty <= 0) throw new Error("Quantity must be greater than 0");
      if (!f.product_id) throw new Error("Select a product");
      if (!f.from_id) throw new Error("Select a source");
      if (!f.to_id) throw new Error("Select a destination");
      if (f.from_type === f.to_type && f.from_id === f.to_id)
        throw new Error("Source and destination must differ");

      const payload = {
        p_product_id: f.product_id,
        p_quantity: qty,
        p_from_warehouse_id: f.from_type === "warehouse" ? f.from_id : null,
        p_from_staff_id: f.from_type === "staff" ? f.from_id : null,
        p_to_warehouse_id: f.to_type === "warehouse" ? f.to_id : null,
        p_to_staff_id: f.to_type === "staff" ? f.to_id : null,
        p_description: f.description.trim() || null,
        p_performed_by: user?.id ?? null,
      };

      const { error } = await supabase.rpc("record_stock_transfer", payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transfer recorded successfully");
      qc.invalidateQueries({ queryKey: ["stock-transfers"] });
      qc.invalidateQueries({ queryKey: ["product_stock"] });
      qc.invalidateQueries({ queryKey: ["staff-stock"] });
      setDialogOpen(false);
      setForm(DEFAULT_FORM);
    },
    onError: (err: any) => {
      toast.error(err?.message ?? "Transfer failed");
    },
  });

  const isSaving = status === "pending";

  // ── Filtered transfers ──────────────────────────────────────────────────────
  const filtered = transfers.filter((t) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      t.product?.name?.toLowerCase().includes(q) ||
      t.from_warehouse?.name?.toLowerCase().includes(q) ||
      t.to_warehouse?.name?.toLowerCase().includes(q) ||
      t.from_staff?.full_name?.toLowerCase().includes(q) ||
      t.to_staff?.full_name?.toLowerCase().includes(q) ||
      t.description?.toLowerCase().includes(q)
    );
  });

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const formatParty = (t: TransferRow, side: "from" | "to") => {
    if (side === "from") {
      if (t.from_warehouse) return { label: t.from_warehouse.name, type: "warehouse" };
      if (t.from_staff) return { label: t.from_staff.full_name, type: "staff" };
    } else {
      if (t.to_warehouse) return { label: t.to_warehouse.name, type: "warehouse" };
      if (t.to_staff) return { label: t.to_staff.full_name, type: "staff" };
    }
    return { label: "—", type: "unknown" };
  };

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

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Stock Transfers</h1>
          <p className="text-sm text-muted-foreground">
            Move inventory between warehouses and staff
            {currentWarehouse && (
              <span className="ml-1 font-medium text-foreground">
                · {currentWarehouse.name}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Transfer
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search transfers…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Transfer History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
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
                  {filtered.map((t) => {
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

      {/* ── New Transfer Dialog ────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5" />
              New Stock Transfer
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Product */}
            <div className="space-y-1.5">
              <Label>Product *</Label>
              <Select
                value={form.product_id}
                onValueChange={(v) => setForm((f) => ({ ...f, product_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Quantity */}
            <div className="space-y-1.5">
              <Label>Quantity *</Label>
              <Input
                type="number"
                min="1"
                placeholder="e.g. 50"
                value={form.quantity}
                onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
              />
            </div>

            {/* From */}
            <div className="space-y-1.5">
              <Label>From *</Label>
              <div className="grid grid-cols-2 gap-2">
                <Select
                  value={form.from_type}
                  onValueChange={(v: "warehouse" | "staff") =>
                    setForm((f) => ({ ...f, from_type: v, from_id: "" }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="warehouse">
                      <span className="flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5" /> Warehouse
                      </span>
                    </SelectItem>
                    <SelectItem value="staff">
                      <span className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5" /> Staff
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={form.from_id}
                  onValueChange={(v) => setForm((f) => ({ ...f, from_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {form.from_type === "warehouse"
                      ? (isAdmin ? warehouses : currentWarehouse ? [currentWarehouse] : []).map(
                          (w: any) => (
                            <SelectItem key={w.id} value={w.id}>
                              {w.name}
                            </SelectItem>
                          )
                        )
                      : staffList.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* To */}
            <div className="space-y-1.5">
              <Label>To *</Label>
              <div className="grid grid-cols-2 gap-2">
                <Select
                  value={form.to_type}
                  onValueChange={(v: "warehouse" | "staff") =>
                    setForm((f) => ({ ...f, to_type: v, to_id: "" }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="warehouse">
                      <span className="flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5" /> Warehouse
                      </span>
                    </SelectItem>
                    <SelectItem value="staff">
                      <span className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5" /> Staff
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={form.to_id}
                  onValueChange={(v) => setForm((f) => ({ ...f, to_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {form.to_type === "warehouse"
                      ? (isAdmin ? warehouses : currentWarehouse ? [currentWarehouse] : []).map(
                          (w: any) => (
                            <SelectItem key={w.id} value={w.id}>
                              {w.name}
                            </SelectItem>
                          )
                        )
                      : staffList.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                placeholder="Optional note about this transfer…"
                rows={2}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => submitTransfer(form)}
              disabled={isSaving}
            >
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Record Transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
