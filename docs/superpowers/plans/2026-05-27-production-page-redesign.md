# Production Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken feasibility calculator in Production.tsx with a working production recording page, and expose it to super_admin, manager, and operator on web and mobile.

**Architecture:**
- New `record_production_with_stock` RPC inserts into `production_log`, upserts `product_stock` (finished goods), and logs `stock_movements` — no BOM deduction (consumption-based accounting).
- `Production.tsx` rewritten as a recording form + mini stats + recent logs table.
- Route guard expanded to include `operator` role.
- Menu entries added for manager and operator on web sidebar and mobile navigation.

**Tech Stack:** React + Vite + TypeScript, Supabase (RPC + Postgres), shadcn/ui, recharts (existing bar chart), @tanstack/react-query

---

### Task 1: Create `record_production_with_stock` RPC migration

**Files:**
- Create: `supabase/migrations/20260527000003_record_production_with_stock.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Atomic production recording RPC that increases finished goods stock
-- Does NOT deduct raw materials (consumption is calculated at end-of-day closing stock)

CREATE OR REPLACE FUNCTION public.record_production_with_stock(
  p_warehouse_id UUID,
  p_product_id UUID,
  p_quantity_produced INTEGER,
  p_wastage_quantity INTEGER DEFAULT 0,
  p_production_date DATE DEFAULT CURRENT_DATE,
  p_notes TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, production_log_id UUID, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id UUID;
  v_rows_affected INTEGER;
BEGIN
  -- Validate inputs
  IF p_quantity_produced <= 0 THEN
    RETURN QUERY SELECT false, NULL::UUID, 'Quantity must be positive'::TEXT;
    RETURN;
  END IF;

  IF p_wastage_quantity < 0 THEN
    RETURN QUERY SELECT false, NULL::UUID, 'Wastage cannot be negative'::TEXT;
    RETURN;
  END IF;

  -- Step 1: Insert production log record
  INSERT INTO public.production_log (
    warehouse_id, product_id, quantity_produced,
    production_date, wastage_quantity, notes, created_by
  ) VALUES (
    p_warehouse_id, p_product_id, p_quantity_produced,
    p_production_date, p_wastage_quantity, p_notes, p_created_by
  )
  RETURNING id INTO v_log_id;

  -- Step 2: Add finished goods to warehouse stock
  UPDATE public.product_stock
  SET quantity = quantity + p_quantity_produced,
      updated_at = now()
  WHERE warehouse_id = p_warehouse_id
    AND product_id = p_product_id;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  IF v_rows_affected = 0 THEN
    INSERT INTO public.product_stock (product_id, warehouse_id, quantity, updated_at)
    VALUES (p_product_id, p_warehouse_id, p_quantity_produced, now());
  END IF;

  -- Step 3: Log stock movement
  INSERT INTO public.stock_movements (
    product_id, warehouse_id, quantity, type,
    reference_id, reason, created_by, created_at
  ) VALUES (
    p_product_id, p_warehouse_id, p_quantity_produced, 'production',
    v_log_id::text, 'Production batch', p_created_by, now()
  );

  RETURN QUERY SELECT true, v_log_id, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, NULL::UUID, SQLERRM;
END;
$$;
```

- [ ] **Step 2: Apply migration to Supabase**

Run: `supabase_apply_migration` with project_id=`vrhptrtgrpftycvojaqo`, name=`20260527000003_record_production_with_stock`, query from Step 1

- [ ] **Step 3: Verify RPC exists**

```bash
npx supabase db query "SELECT proname FROM pg_proc WHERE proname = 'record_production_with_stock'" --db-url "..."
```
Expected: returns 1 row

---

### Task 2: Rewrite Production.tsx — recording form + stats + logs

**Files:**
- Rewrite: `src/pages/Production.tsx`

- [ ] **Step 1: Rewrite the entire file**

```tsx
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, Factory, CheckCircle2, AlertTriangle, BarChart3 } from "lucide-react";
import { format } from "date-fns";

const ProductionPage = () => {
  const { warehouse, user } = useAuth();
  const queryClient = useQueryClient();

  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [quantityProduced, setQuantityProduced] = useState<string>("");
  const [wastageQuantity, setWastageQuantity] = useState<string>("0");
  const [productionDate, setProductionDate] = useState<string>(
    format(new Date(), "yyyy-MM-dd")
  );
  const [notes, setNotes] = useState("");

  useEffect(() => {
    document.title = "Production";
  }, []);

  const { data: products } = useQuery({
    queryKey: ["products-finished"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, unit")
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: logs, isLoading: logsLoading } = useQuery({
    queryKey: ["production-page-logs", warehouse?.id],
    queryFn: async () => {
      if (!warehouse?.id) return [];
      const today = new Date().toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("production_log")
        .select(`*, products(name)`)
        .eq("warehouse_id", warehouse.id)
        .gte("production_date", today + "T00:00:00")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!warehouse?.id,
  });

  const recordMutation = useMutation({
    mutationFn: async () => {
      if (!warehouse?.id || !selectedProduct || !quantityProduced) {
        throw new Error("Missing required fields");
      }
      const { data, error } = await (supabase as any).rpc(
        "record_production_with_stock",
        {
          p_warehouse_id: warehouse.id,
          p_product_id: selectedProduct,
          p_quantity_produced: parseInt(quantityProduced, 10),
          p_wastage_quantity: parseInt(wastageQuantity, 10) || 0,
          p_production_date: productionDate,
          p_notes: notes || null,
          p_created_by: user?.id || null,
        }
      );
      if (error) throw error;
      if (!data?.[0]?.success) throw new Error(data?.[0]?.error || "Production recording failed");
      return data[0];
    },
    onSuccess: () => {
      toast.success("Production recorded successfully");
      queryClient.invalidateQueries({ queryKey: ["production-page-logs"] });
      setSelectedProduct("");
      setQuantityProduced("");
      setWastageQuantity("0");
      setProductionDate(format(new Date(), "yyyy-MM-dd"));
      setNotes("");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const totalProduced = logs?.reduce((s: number, l: any) => s + l.quantity_produced, 0) || 0;
  const totalWastage = logs?.reduce((s: number, l: any) => s + l.wastage_quantity, 0) || 0;
  const wastageRate = totalProduced + totalWastage > 0
    ? (totalWastage / (totalProduced + totalWastage)) * 100
    : 0;
  const recordCount = logs?.length || 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Production"
        subtitle="Record production output. Finished goods stock is updated automatically."
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <CheckCircle2 className="w-3 h-3 text-green-500" />
              Produced Today
            </div>
            <div className="text-2xl font-bold">{totalProduced.toLocaleString("en-IN")}</div>
            <div className="text-xs text-muted-foreground">units</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <AlertTriangle className="w-3 h-3 text-yellow-500" />
              Wastage Today
            </div>
            <div className="text-2xl font-bold">{totalWastage.toLocaleString("en-IN")}</div>
            <div className="text-xs text-muted-foreground">units</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <BarChart3 className="w-3 h-3" />
              Wastage Rate
            </div>
            <div className={`text-2xl font-bold ${wastageRate > 5 ? "text-red-500" : "text-green-600"}`}>
              {wastageRate.toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground">{wastageRate > 5 ? "Above target" : "On target"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Factory className="w-3 h-3" />
              Records
            </div>
            <div className="text-2xl font-bold">{recordCount}</div>
            <div className="text-xs text-muted-foreground">batches today</div>
          </CardContent>
        </Card>
      </div>

      {/* Recording Form */}
      <Card>
        <CardHeader>
          <CardTitle>Record Production</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Product</Label>
              <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                <SelectTrigger>
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  {products?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Quantity Produced</Label>
              <Input
                type="number"
                value={quantityProduced}
                onChange={(e) => setQuantityProduced(e.target.value)}
                placeholder="0"
                min="1"
              />
            </div>
            <div className="space-y-2">
              <Label>Wastage (Units)</Label>
              <Input
                type="number"
                value={wastageQuantity}
                onChange={(e) => setWastageQuantity(e.target.value)}
                placeholder="0"
                min="0"
              />
            </div>
            <div className="space-y-2">
              <Label>Production Date</Label>
              <Input
                type="date"
                value={productionDate}
                onChange={(e) => setProductionDate(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <Label>Notes (Optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Night shift batch, machine #3"
              rows={2}
            />
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              onClick={() => recordMutation.mutate()}
              disabled={!selectedProduct || !quantityProduced || recordMutation.isPending}
            >
              {recordMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Record Production
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Today's Production Logs */}
      <Card>
        <CardHeader>
          <CardTitle>Today's Production</CardTitle>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : !logs?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              <Factory className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No production recorded today.</p>
              <p className="text-sm">Use the form above to record a production batch.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Produced</TableHead>
                  <TableHead className="text-right">Wastage</TableHead>
                  <TableHead className="text-right">Yield</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log: any) => {
                  const totalInput = log.quantity_produced + log.wastage_quantity;
                  const yieldPct = totalInput > 0 ? (log.quantity_produced / totalInput) * 100 : 100;
                  return (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium">
                        {format(new Date(log.production_date), "dd MMM yyyy")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{log.products?.name || "Unknown"}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-green-600">
                        {log.quantity_produced.toLocaleString("en-IN")}
                      </TableCell>
                      <TableCell className="text-right">
                        {log.wastage_quantity > 0 ? (
                          <span className="text-yellow-600">{log.wastage_quantity}</span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={yieldPct >= 95 ? "default" : "destructive"}>
                          {yieldPct.toFixed(1)}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm max-w-[150px] truncate">
                        {log.notes || "\u2014"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ProductionPage;
```

- [ ] **Step 2: Check for unused imports**

Run: `npm run lint -- src/pages/Production.tsx 2>&1`
Expected: No errors; `@typescript-eslint/no-explicit-any` warnings only (pre-existing).

---

### Task 3: Expand route guard to include operator

**Files:**
- Modify: `src/App.tsx:207`

- [ ] **Step 1: Update RouteGuard allowed roles**

```tsx
<Route path="/production" element={<RoleGuard allowed={["super_admin", "manager", "operator"]}><ProductionPage /></RoleGuard>} />
```

---

### Task 4: Add Production to web sidebar for manager and operator

**Files:**
- Modify: `src/components/layout/AppSidebar.tsx`

- [ ] **Step 1: Add Production to manager's Operations section**

In the manager block (around line 194-204), add `{ label: "Production", path: "/production", icon: Factory }` to the Operations items array, e.g. after "Map":

```tsx
{ label: "Map", path: "/map", icon: Map },
{ label: "Production", path: "/production", icon: Factory },
```

- [ ] **Step 2: Add Production to operator's Counter section**

In the operator block (around line 280-297), add to the Counter items:

```tsx
{ label: "Attendance", path: "/attendance", icon: Calendar },
{ label: "Production", path: "/production", icon: Factory },
{ label: "Invoices", path: "/invoices", icon: FileText },
```

---

### Task 5: Add Production to mobile navigation

**Files:**
- Modify: `src/mobile/MobileApp.tsx`

- [ ] **Step 1: Add Production to manager's STAFF_MENU_BY_ROLE**

In the manager section (around line 200-247), add a Manufacturing section after the Insights section or as part of Operations:

```tsx
{ section: "Manufacturing", items: [
  { id: "production", label: "Production", path: "/production", icon: Factory },
  { id: "production-log", label: "Production Log", path: "/admin/production-log", icon: ClipboardCheck },
]},
```

- [ ] **Step 2: Add Production button to PosHome for operators**

In `src/mobile/pages/pos/PosHome.tsx`, add a Production button in the Quick Actions grid (around line 176-195), after the "Record Sale" and "View History" buttons:

```tsx
<button
  onClick={() => window.location.href = "/production"}
  className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm active:scale-95 transition-all"
>
  <div className="h-8 w-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
    <Factory className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
  </div>
  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">Production</span>
</button>
```

Also add `Factory` to the lucide import at the top of PosHome.tsx.

- [ ] **Step 3: Verify mobile rendering in MobileApp.tsx**

The `/production` route is already rendered in StaffApp's `renderCurrentScreen()` at line 334:
```tsx
if (path === "/production") return <MobilePageWrapper><Production /></MobilePageWrapper>;
```
No changes needed here — the web page wrapper already works.

---

### Task 6: Sync archive SQL files

**Files:**
- Modify: `ACTIVE_SQL.sql`
- Modify: `TOTAL_MIGRATION.sql`
- Modify: `aqua_prime_schema.sql`

- [ ] **Step 1: Append the new RPC to each archive file**

Append the `record_production_with_stock` SQL (from Task 1 Step 1) at the end of each archive file.

---

### Task 7: Verify the build

- [ ] **Step 1: Run lint**

```bash
npm run lint 2>&1
```
Expected: 0 errors (warnings only, no new ones from changed files)

- [ ] **Step 2: Run tests**

```bash
npm run test 2>&1
```
Expected: All tests pass (no new test failures from changes)
