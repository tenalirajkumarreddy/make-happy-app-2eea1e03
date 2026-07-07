import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCallback } from "react";

export interface FollowUp {
  id: string;
  store_id: string;
  store_name?: string;
  reason: 'low_stock' | 'run_out' | 'must_order' | 'target_at_risk' | 'overdue_payment';
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'done' | 'snoozed' | 'auto_resolved' | 'cancelled_by_sale' | 'expired';
  scheduled_date: string;
  snooze_until?: string;
  depletion_date?: string;
  last_sale_date?: string;
  last_sale_amount?: number;
  notes?: string;
  created_at: string;
}

export function useFollowUps(filter: 'today' | 'week' | 'overdue' | 'snoozed' | 'all' = 'today') {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['follow-ups', user?.id, filter],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const sevenDaysFuture = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      let query = supabase
        .from('follow_up_schedule')
        .select(`
          *,
          stores(name)
        `)
        .eq('marketer_id', user!.id)
        .in('status', ['pending', 'snoozed']);

      switch (filter) {
        case 'today':
          query = query.lte('scheduled_date', today).gte('scheduled_date', today);
          break;
        case 'week':
          query = query.lte('scheduled_date', sevenDaysFuture).gte('scheduled_date', today);
          break;
        case 'overdue':
          query = query.lt('scheduled_date', today);
          break;
        case 'snoozed':
          query = query.eq('status', 'snoozed');
          break;
      }

      const { data, error } = await query.order('priority', { ascending: false }).order('scheduled_date', { ascending: true });

      if (error) throw error;

      return (data || []).map((item: any) => ({
        ...item,
        store_name: item.stores?.name,
      })) as FollowUp[];
    },
    enabled: !!user?.id,
  });
}

export function useFollowUpActions(followUpId: string) {
  const markAsDone = useCallback(async () => {
    const { error } = await supabase
      .from('follow_up_schedule')
      .update({
        status: 'done',
        completed_at: new Date().toISOString(),
      })
      .eq('id', followUpId);

    if (error) throw error;
    return true;
  }, [followUpId]);

  const snooze = useCallback(async (days: number) => {
    const snoozeUntil = new Date();
    snoozeUntil.setDate(snoozeUntil.getDate() + days);
    
    const { error } = await supabase
      .from('follow_up_schedule')
      .update({
        status: 'snoozed',
        snooze_until: snoozeUntil.toISOString().split('T')[0],
      })
      .eq('id', followUpId);

    if (error) throw error;
    return true;
  }, [followUpId]);

  return { markAsDone, snooze };
}
