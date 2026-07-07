import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Check, X, AlertCircle } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface TargetChangeRequest {
  id: string;
  store_id: string;
  proposed_by: string;
  current_target: number;
  proposed_target: number;
  reason: string;
  status: string;
  created_at: string;
  profiles?: { full_name: string } | null;
  stores?: { name: string } | null;
}

export default function AdminTargetApprovals() {
  const [reviewNote, setReviewNote] = useState('');
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: requests, isLoading, refetch } = useQuery({
    queryKey: ['target-change-requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('target_change_requests')
        .select(`
          *,
          profiles(full_name),
          stores(name)
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as TargetChangeRequest[];
    },
  });

  const handleApprove = async (id: string) => {
    try {
      const { data } = await supabase.auth.getUser();
      const reviewerId = data.user?.id;

      if (!reviewerId) {
        toast({ title: "Error", description: "Not authenticated", variant: "destructive" });
        return;
      }

      const { error } = await supabase.rpc('process_target_change', {
        p_request_id: id,
        p_new_status: 'approved',
        p_reviewer_id: reviewerId,
        p_note: reviewNote,
      });

      if (error) throw error;
      toast({ title: "Target change approved" });
      setReviewNote('');
      setReviewingId(null);
      refetch();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleReject = async (id: string) => {
    try {
      const { data } = await supabase.auth.getUser();
      const reviewerId = data.user?.id;

      if (!reviewerId) {
        toast({ title: "Error", description: "Not authenticated", variant: "destructive" });
        return;
      }

      const { error } = await supabase.rpc('process_target_change', {
        p_request_id: id,
        p_new_status: 'rejected',
        p_reviewer_id: reviewerId,
        p_note: reviewNote,
      });

      if (error) throw error;
      toast({ title: "Target change rejected" });
      setReviewNote('');
      setReviewingId(null);
      refetch();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Target Approvals"
        subtitle="Review and approve marketer target change requests."
      />

      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Loading requests...</div>
      ) : !requests || requests.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed rounded-lg">
          <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No pending target change requests</p>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((req) => (
            <Card key={req.id} className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h4 className="font-semibold">{req.stores?.name || 'Store'}</h4>
                    <Badge variant="outline" className="text-xs">Pending</Badge>
                  </div>
                  
                  <p className="text-sm text-muted-foreground mb-4">
                    Requested by {req.profiles?.full_name || 'Marketer'} on {new Date(req.created_at).toLocaleDateString()}
                  </p>

                  <div className="flex items-center gap-6 mb-4">
                    <div className="text-center">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Current</p>
                      <p className="text-xl font-bold">{req.current_target}</p>
                    </div>
                    <div className="text-muted-foreground">→</div>
                    <div className="text-center">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Proposed</p>
                      <p className="text-xl font-bold text-primary">{req.proposed_target}</p>
                    </div>
                    <div className="text-muted-foreground">=</div>
                    <div className="text-center">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Diff</p>
                      <p className={`text-xl font-bold ${req.proposed_target > req.current_target ? 'text-green-600' : 'text-red-600'}`}>
                        {req.proposed_target > req.current_target ? '+' : ''}{req.proposed_target - req.current_target}
                      </p>
                    </div>
                  </div>

                  {req.reason && (
                    <div className="rounded-lg bg-muted/50 p-3 mb-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Reason</p>
                      <p className="text-sm">{req.reason}</p>
                    </div>
                  )}

                  {reviewingId === req.id && (
                    <div className="mb-4">
                      <label className="text-sm font-medium mb-2 block">Review Note (optional)</label>
                      <Textarea 
                        placeholder="Add a note about why you approve or reject..."
                        value={reviewNote}
                        onChange={(e) => setReviewNote(e.target.value)}
                      />
                    </div>
                  )}

                  <div className="flex gap-2">
                    {reviewingId === req.id ? (
                      <>
                        <Button 
                          variant="default" 
                          className="bg-green-600 hover:bg-green-700"
                          onClick={() => handleApprove(req.id)}
                        >
                          <Check className="h-4 w-4 mr-1.5" />
                          Confirm Approve
                        </Button>
                        <Button 
                          variant="destructive"
                          onClick={() => handleReject(req.id)}
                        >
                          <X className="h-4 w-4 mr-1.5" />
                          Confirm Reject
                        </Button>
                        <Button 
                          variant="ghost"
                          onClick={() => { setReviewingId(null); setReviewNote(''); }}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button 
                          variant="outline"
                          onClick={() => setReviewingId(req.id)}
                        >
                          Review
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
