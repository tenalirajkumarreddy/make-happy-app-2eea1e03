import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Inbox } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { format } from 'date-fns';
import { StockTransfer } from '@/lib/types';

interface PendingReturnsProps {
  onReview: (transfer: StockTransfer) => void;
}

export const PendingReturns: React.FC<PendingReturnsProps> = ({ onReview }) => {
  const { warehouse, role } = useAuth();
  const canView = role === 'super_admin' || role === 'manager';

  const { data: pendingReturns, isLoading } = useQuery({
    queryKey: ['pending_returns', warehouse?.id],
    queryFn: async () => {
      if (!warehouse?.id) return [];
      const { data, error } = await supabase
        .from('stock_transfers')
        .select(`
          *,
          product:products(name, unit),
          staff:workers!stock_transfers_from_user_id_fkey(full_name, avatar_url)
        `)
        .eq('to_warehouse_id', warehouse.id)
        .eq('status', 'pending')
        .eq('transfer_type', 'staff_to_warehouse')
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as StockTransfer[];
    },
    enabled: !!warehouse?.id && canView,
  });

  if (!canView) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending Stock Returns</CardTitle>
        <CardDescription>Review and process stock returns from staff members.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center items-center h-24">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !pendingReturns || pendingReturns.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <Inbox className="mx-auto h-12 w-12" />
            <p className="mt-4">No pending returns to review.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pendingReturns.map((transfer) => (
              <div key={transfer.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-4">
                  <Avatar>
                    <AvatarImage src={transfer.staff?.avatar_url || undefined} />
                    <AvatarFallback>{transfer.staff?.full_name?.charAt(0) || 'U'}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold">
                      Return from {transfer.staff?.full_name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {transfer.product?.name}: <span className="font-bold">{transfer.quantity} {transfer.product?.unit}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Requested on {format(new Date(transfer.created_at), 'd MMM yyyy, h:mm a')}
                    </p>
                    {transfer.description && <p className="text-sm italic">"{transfer.description}"</p>}
                  </div>
                </div>
                <Button size="sm" onClick={() => onReview(transfer)}>Review</Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
