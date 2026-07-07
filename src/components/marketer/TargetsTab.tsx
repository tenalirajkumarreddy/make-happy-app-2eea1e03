import { useState } from "react";
import { useMarketerTarget } from "@/hooks/useMarketerTarget";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Target, TrendingUp, TrendingDown, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export function TargetsTab() {
  const { data: target, isLoading } = useMarketerTarget();
  const [proposedTarget, setProposedTarget] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmitRequest = async () => {
    if (!proposedTarget || !reason) {
      toast({ title: "Error", description: "Please fill in all fields", variant: "destructive" });
      return;
    }
    
    setSubmitting(true);
    try {
      const { error } = await supabase.from('target_change_requests').insert({
        current_target: target?.target_amount || 0,
        proposed_target: parseInt(proposedTarget),
        reason,
      });

      if (error) throw error;
      toast({ title: "Request submitted for admin approval" });
      setProposedTarget('');
      setReason('');
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) return <div className="py-12 text-center text-muted-foreground">Loading...</div>;

  if (!target) {
    return (
      <div className="text-center py-12 border-2 border-dashed rounded-lg">
        <Target className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
        <p className="text-muted-foreground">No active target set for this month</p>
      </div>
    );
  }

  const percentage = Math.min((target.current_progress / target.target_amount) * 100, 100);
  const isBehind = target.current_progress < target.target_amount;
  const remaining = target.target_amount - target.current_progress;

  return (
    <div className="space-y-6">
      {/* Current Target Card */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Current Target</h3>
          <div className={`p-2 rounded-full ${isBehind ? 'bg-amber-100' : 'bg-green-100'}`}>
            {isBehind ? <TrendingDown className="h-4 w-4 text-amber-600" /> : <TrendingUp className="h-4 w-4 text-green-600" />}
          </div>
        </div>
        
        <div className="flex items-end justify-between mb-4">
          <div>
            <p className="text-3xl font-bold">{target.current_progress} <span className="text-lg font-normal text-muted-foreground">/ {target.target_amount} {target.target_type === 'units' ? 'units' : '₹'}</span></p>
            <p className="text-sm text-muted-foreground mt-1">
              {isBehind ? `${remaining} remaining to hit target` : 'Target achieved! 🎉'}
            </p>
          </div>
          <div className="text-right">
            <p className={`text-2xl font-bold ${isBehind ? 'text-amber-600' : 'text-green-600'}`}>{percentage.toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground">achieved</p>
            </div>
        </div>

        <Progress value={percentage} className="h-3" />

        <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Current Progress</p>
            <p className="text-lg font-semibold">{target.current_progress}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Target</p>
            <p className="text-lg font-semibold">{target.target_amount}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Remaining</p>
            <p className={`text-lg font-semibold ${isBehind ? 'text-amber-600' : 'text-green-600'}`}>{remaining}</p>
          </div>
        </div>
      </Card>

      {/* Request Target Change */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Request Target Change</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Proposed New Target</label>
            <Input 
              type="number"
              placeholder="e.g., 4000"
              value={proposedTarget}
              onChange={(e) => setProposedTarget(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Reason</label>
            <Input 
              placeholder="e.g., Seasonal demand increase"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>
        <Button 
          className="mt-4" 
          onClick={handleSubmitRequest}
          disabled={submitting}
        >
          <Check className="h-4 w-4 mr-1.5" />
          {submitting ? 'Submitting...' : 'Submit Request'}
        </Button>
      </Card>
    </div>
  );
}
