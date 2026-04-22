import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, Loader2, Factory, Package, AlertTriangle, CheckCircle2, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import { format, subDays } from 'date-fns';

export default function ProductionLog() {
  const { warehouse } = useAuth();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dateRange, setDateRange] = useState<'7' | '30' | '90'>('30');

  // Form state
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [quantityProduced, setQuantityProduced] = useState<string>('');
  const [wastageQuantity, setWastageQuantity] = useState<string>('0');
  const [productionDate, setProductionDate] = useState<string>(
    format(new Date(), 'yyyy-MM-dd')
  );
  const [notes, setNotes] = useState('');

  const rangeStart = subDays(new Date(), parseInt(dateRange));

  const { data: products } = useQuery({
    queryKey: ['products_finished'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, unit')
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: true,
  });

  const { data: logs, isLoading } = useQuery({
    queryKey: ['production_log', warehouse?.id, dateRange],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('production_log')
        .select(`
          *,
          products(name, unit)
        `)
        .eq('warehouse_id', warehouse?.id)
        .gte('production_date', rangeStart.toISOString())
        .order('production_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!warehouse?.id,
  });

  const addMutation = useMutation({
    mutationFn: async (payload: {
      warehouse_id: string;
      product_id: string;
      quantity_produced: number;
      wastage_quantity: number;
      production_date: string;
      notes: string;
    }) => {
      const { error } = await supabase
        .from('production_log')
        .insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['production_log'] });
      toast.success('Production log recorded');
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(`Failed: ${error.message}`);
    },
  });

  const resetForm = () => {
    setSelectedProduct('');
    setQuantityProduced('');
    setWastageQuantity('0');
    setProductionDate(format(new Date(), 'yyyy-MM-dd'));
    setNotes('');
  };

  const handleSubmit = () => {
    if (!warehouse?.id || !selectedProduct || !quantityProduced) return;
    addMutation.mutate({
      warehouse_id: warehouse.id,
      product_id: selectedProduct,
      quantity_produced: parseInt(quantityProduced),
      wastage_quantity: parseInt(wastageQuantity) || 0,
      production_date: productionDate,
      notes,
    });
  };

  // Summary stats  
  const totalProduced = logs?.reduce((s: number, l: any) => s + l.quantity_produced, 0) || 0;
  const totalWastage = logs?.reduce((s: number, l: any) => s + l.wastage_quantity, 0) || 0;
  const wastageRate = totalProduced > 0 ? ((totalWastage / (totalProduced + totalWastage)) * 100) : 0;
  const uniqueProducts = new Set(logs?.map((l: any) => l.product_id)).size;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Production Log"
        description="Record daily production output and wastage for overhead cost absorption."
      />

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Label className="text-sm font-medium">Period</Label>
          <Select value={dateRange} onValueChange={(v: '7' | '30' | '90') => setDateRange(v)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" /> Log Production
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Log Production Run</DialogTitle>
              <DialogDescription>
                Record a production batch with output and wastage.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Product</Label>
                <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    {products?.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
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
              </div>

              <div className="space-y-2">
                <Label>Production Date</Label>
                <Input
                  type="date"
                  value={productionDate}
                  onChange={(e) => setProductionDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Notes (Optional)</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Night shift batch, machine #3"
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={!selectedProduct || !quantityProduced || addMutation.isPending}>
                {addMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Record
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <CheckCircle2 className="w-3 h-3 text-green-500" />
              Total Produced
            </div>
            <div className="text-2xl font-bold">{totalProduced.toLocaleString('en-IN')}</div>
            <div className="text-xs text-muted-foreground">units</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <AlertTriangle className="w-3 h-3 text-yellow-500" />
              Total Wastage
            </div>
            <div className="text-2xl font-bold">{totalWastage.toLocaleString('en-IN')}</div>
            <div className="text-xs text-muted-foreground">units</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <BarChart3 className="w-3 h-3" />
              Wastage Rate
            </div>
            <div className={`text-2xl font-bold ${wastageRate > 5 ? 'text-red-500' : 'text-green-600'}`}>
              {wastageRate.toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground">{wastageRate > 5 ? 'Above target' : 'On target'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Package className="w-3 h-3" />
              Products
            </div>
            <div className="text-2xl font-bold">{uniqueProducts}</div>
            <div className="text-xs text-muted-foreground">unique items</div>
          </CardContent>
        </Card>
      </div>

      {/* Log table */}
      <Card>
        <CardHeader>
          <CardTitle>Production Records</CardTitle>
          <CardDescription>Production output log for the selected period.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : !logs?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              <Factory className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No production records yet.</p>
              <p className="text-sm">Click "Log Production" to record a batch.</p>
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
                  const yieldPct = totalInput > 0 ? ((log.quantity_produced / totalInput) * 100) : 100;
                  return (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium">
                        {format(new Date(log.production_date), 'dd MMM yyyy')}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{log.products?.name || 'Unknown'}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-green-600">
                        {log.quantity_produced.toLocaleString('en-IN')}
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
                        {log.notes || '—'}
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
}
