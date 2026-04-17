import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import { StockTransfer } from '@/lib/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, Loader2 } from 'lucide-react';

const reviewSchema = z.object({
  actual_quantity: z.coerce.number().min(0, "Actual quantity cannot be negative."),
  action_taken: z.enum(['keep', 'flag']).optional(),
  notes: z.string().optional(),
});

type ReviewFormData = z.infer<typeof reviewSchema>;

interface ReturnReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  transfer: StockTransfer;
}

export const ReturnReviewModal: React.FC<ReturnReviewModalProps> = ({ isOpen, onClose, transfer }) => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [difference, setDifference] = useState(0);

  const form = useForm<ReviewFormData>({
    resolver: zodResolver(reviewSchema),
    defaultValues: {
      actual_quantity: transfer.quantity,
      notes: '',
    },
  });

  const actualQuantity = form.watch('actual_quantity');

  useEffect(() => {
    const diff = transfer.quantity - (actualQuantity || 0);
    setDifference(diff);
  }, [actualQuantity, transfer.quantity]);

  const processReturn = useMutation({
    mutationFn: async ({ approved, payload }: { approved: boolean, payload: any }) => {
      const { error } = await supabase.rpc('process_stock_return', { ...payload, p_approved: approved });
      if (error) throw error;
    },
    onSuccess: (_, { approved }) => {
      toast.success(`Return ${approved ? 'approved' : 'rejected'} successfully!`);
      queryClient.invalidateQueries({ queryKey: ['pending_returns'] });
      queryClient.invalidateQueries({ queryKey: ['products_with_stock'] });
      onClose();
    },
    onError: (error) => {
      toast.error(`Failed to process return: ${error.message}`);
    }
  });

  const onSubmit = (data: ReviewFormData, approved: boolean) => {
    if (!user) return;

    if (difference > 0 && !data.action_taken && approved) {
        toast.warning("Please select how to handle the difference.");
        return;
    }

    processReturn.mutate({
        approved,
        payload: {
            p_transfer_id: transfer.id,
            p_actual_quantity: data.actual_quantity,
            p_difference: difference,
            p_action: data.action_taken || 'keep',
            p_notes: data.notes,
            p_reviewed_by: user.id,
        }
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Review Stock Return</DialogTitle>
          <DialogDescription>
            Product: <strong>{transfer.product?.name}</strong> from <strong>{transfer.staff?.full_name}</strong>
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form>
            <div className="space-y-4 py-4">
              <div className="p-3 bg-muted rounded-md text-sm">
                <p>Requested Quantity: <strong>{transfer.quantity} {transfer.product?.unit}</strong></p>
                <p>Expected in hand: <strong>{transfer.quantity} {transfer.product?.unit}</strong></p>
              </div>

              <FormField control={form.control} name="actual_quantity" render={({ field }) => (
                <FormItem>
                  <FormLabel>Actual Quantity Received</FormLabel>
                  <FormControl><Input type="number" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}/>

              {difference !== 0 && (
                <Alert variant={difference > 0 ? "destructive" : "default"}>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>
                    {difference > 0 ? 'Discrepancy Detected' : 'Excess Stock Received'}
                  </AlertTitle>
                  <AlertDescription>
                    Difference: <strong>{difference} {transfer.product?.unit}</strong>
                    {difference > 0 && " missing."}
                    {difference < 0 && " extra."}
                  </AlertDescription>
                </Alert>
              )}

              {difference > 0 && (
                <FormField control={form.control} name="action_taken" render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel>Handle Difference:</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        className="flex flex-col space-y-1"
                      >
                        <FormItem className="flex items-center space-x-3 space-y-0">
                          <FormControl><RadioGroupItem value="keep" /></FormControl>
                          <FormLabel className="font-normal">Keep with User (Staff is responsible for the missing stock)</FormLabel>
                        </FormItem>
                        <FormItem className="flex items-center space-x-3 space-y-0">
                          <FormControl><RadioGroupItem value="flag" /></FormControl>
                          <FormLabel className="font-normal">Flag as Error (Log discrepancy, staff stock becomes 0)</FormLabel>
                        </FormItem>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}

              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl><Textarea placeholder="Add any notes about the return or discrepancy..." {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}/>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose} disabled={processReturn.isPending}>Cancel</Button>
              <Button type="button" variant="destructive" onClick={() => form.handleSubmit((data) => onSubmit(data, false))()} disabled={processReturn.isPending}>
                {processReturn.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reject'}
              </Button>
              <Button type="button" onClick={() => form.handleSubmit((data) => onSubmit(data, true))()} disabled={processReturn.isPending}>
                {processReturn.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Approve'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

