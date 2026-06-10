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
        .gte("created_at", today + "T00:00:00")
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
