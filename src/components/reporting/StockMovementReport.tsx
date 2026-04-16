import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateRangePicker } from '@/components/shared/DateRangePicker';
import { useDebounce } from '@/hooks/useDebounce';

const StockMovementReport: React.FC = () => {
  const { profile } = useAuth();
  const warehouseId = profile?.default_warehouse_id;

  const [filters, setFilters] = useState({
    productId: null,
    userId: null,
    type: null,
    dateRange: { from: undefined, to: undefined },
  });

  const debouncedFilters = useDebounce(filters, 300);

  const { data: history, isLoading, error } = useQuery({
    queryKey: ['stock-movement-history', warehouseId, debouncedFilters],
    queryFn: async () => {
      if (!warehouseId) return [];
      const { data, error } = await supabase.rpc('get_stock_movement_history', {
        p_warehouse_id: warehouseId,
        p_product_id: debouncedFilters.productId,
        p_user_id: debouncedFilters.userId,
        p_type: debouncedFilters.type,
        p_start_date: debouncedFilters.dateRange.from,
        p_end_date: debouncedFilters.dateRange.to,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!warehouseId,
  });

  const { data: products } = useQuery({
    queryKey: ['products', warehouseId],
    queryFn: async () => {
        const { data } = await supabase.from('products').select('id, name').eq('warehouse_id', warehouseId);
        return data;
    },
    enabled: !!warehouseId
  });

  const { data: staff } = useQuery({
    queryKey: ['staff', warehouseId],
    queryFn: async () => {
        const { data } = await supabase.from('workers').select('id, full_name').eq('warehouse_id', warehouseId);
        return data;
    },
    enabled: !!warehouseId
  });

  const movementTypes = useMemo(() => [
    'purchase', 'sale', 'adjustment', 'warehouse_to_staff', 'staff_to_warehouse', 'staff_to_staff'
  ], []);

  const renderContent = () => {
    if (isLoading) {
      return (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>From</TableHead>
              <TableHead>To</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>Initiated By</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(10)].map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                <TableCell><Skeleton className="h-4 w-[150px]" /></TableCell>
                <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                <TableCell><Skeleton className="h-4 w-[50px]" /></TableCell>
                <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      );
    }

    if (error) {
      return <div className="text-red-500">Error loading stock movement history: {error.message}</div>;
    }

    if (!history || history.length === 0) {
      return <div className="text-center text-muted-foreground py-8">No stock movements found for the selected filters.</div>;
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Product</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>From</TableHead>
            <TableHead>To</TableHead>
            <TableHead className="text-right">Quantity</TableHead>
            <TableHead>Initiated By</TableHead>
            <TableHead>Reason</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {history.map((item) => (
            <TableRow key={item.id}>
              <TableCell>{format(new Date(item.created_at), 'dd MMM yyyy, HH:mm')}</TableCell>
              <TableCell>{item.product_name}</TableCell>
              <TableCell>
                <Badge variant="secondary">{item.type.replace(/_/g, ' ')}</Badge>
              </TableCell>
              <TableCell>{item.from_location}</TableCell>
              <TableCell>{item.to_location}</TableCell>
              <TableCell className="text-right font-medium">{item.quantity_change}</TableCell>
              <TableCell>{item.initiated_by}</TableCell>
              <TableCell className="max-w-[200px] truncate">{item.reason}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stock Movement History</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-4 mb-4 p-4 bg-muted/50 rounded-lg">
            <Select onValueChange={(value) => setFilters(f => ({...f, productId: value}))}>
                <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter by product..." />
                </SelectTrigger>
                <SelectContent>
                    {products?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
            </Select>
            <Select onValueChange={(value) => setFilters(f => ({...f, userId: value}))}>
                <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter by staff..." />
                </SelectTrigger>
                <SelectContent>
                    {staff?.map(s => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}
                </SelectContent>
            </Select>
            <Select onValueChange={(value) => setFilters(f => ({...f, type: value}))}>
                <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter by type..." />
                </SelectTrigger>
                <SelectContent>
                    {movementTypes.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>)}
                </SelectContent>
            </Select>
            <DateRangePicker
                date={filters.dateRange}
                onDateChange={(range) => setFilters(f => ({...f, dateRange: range}))}
            />
        </div>
        {renderContent()}
      </CardContent>
    </Card>
  );
};

export default StockMovementReport;
