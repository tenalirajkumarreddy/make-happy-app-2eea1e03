import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

interface StockHistoryViewProps {
  warehouseId: string;
}

export function StockHistoryView({ warehouseId }: StockHistoryViewProps) {
  const { data: movements, isLoading } = useQuery({
    queryKey: ['stock-movements', warehouseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_movements')
        .select(`
          id,
          quantity,
          type,
          reason,
          created_at,
          product:products (name, sku),
          created_by
        `)
        .eq('warehouse_id', warehouseId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Extract unique user IDs from created_by
      const userIds = [...new Set(data.filter(m => m.created_by).map(m => m.created_by))] as string[];
      
      let profiles = [];
      if (userIds.length > 0) {
        const { data: pData } = await supabase
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', userIds);
        profiles = pData || [];
      }
      
      // Stitch data together, ensuring arrays from the join are flattened
      return data.map(m => ({
        ...m,
        product: Array.isArray(m.product) ? m.product[0] : m.product,
        creator_name: profiles.find(p => p.user_id === m.created_by)?.full_name || 'System'
      }));
    },
    enabled: !!warehouseId,
  });

  const getTypePill = (type: string) => {
    switch (type) {
      case 'sale': return <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200">Sale</Badge>;
      case 'transfer_out':
      case 'transfer_in': return <Badge variant="outline" className="bg-purple-50 text-purple-600 border-purple-200">Transfer</Badge>;
      case 'adjustment': return <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200">Adjustment</Badge>;
      case 'return': return <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-200">Return</Badge>;
      case 'purchase': return <Badge variant="outline" className="bg-teal-50 text-teal-600 border-teal-200">Purchase</Badge>;
      default: return <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200">{type}</Badge>;
    }
  };

  const getQtyDisplay = (qty: number, type: string) => {
    const isPositive = ['purchase', 'transfer_in', 'return'].includes(type) || (type === 'adjustment' && qty > 0);
    const sign = isPositive ? '+' : (qty < 0 ? '' : '-'); 
    const color = isPositive ? 'text-emerald-600' : 'text-red-500';
    
    return <span className={`font-medium ${color}`} border-none="true">{sign}{Math.abs(qty)}</span>;
  };

  const getPartyDisplay = (type: string, creatorName: string) => {
    if (['transfer_out', 'transfer_in', 'return'].includes(type)) {
      return creatorName;
    }
    return '—';
  };

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading stock movements...</div>;
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium text-right">Qty</th>
                <th className="px-4 py-3 font-medium">Party</th>
                <th className="px-4 py-3 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {movements && movements.length > 0 ? (
                movements.map((movement) => (
                  <tr key={movement.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600 font-medium">
                      {format(new Date(movement.created_at), 'MMM d, yy HH:mm')}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {movement.product?.name || 'Unknown'}
                    </td>
                    <td className="px-4 py-3">
                      {getTypePill(movement.type)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {getQtyDisplay(movement.quantity, movement.type)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {getPartyDisplay(movement.type, movement.creator_name)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate" title={movement.reason || ''}>
                      {movement.reason || '—'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    No stock movements recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
