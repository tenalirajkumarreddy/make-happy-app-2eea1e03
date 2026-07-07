import { FollowUp, useFollowUpActions } from "@/hooks/useFollowUps";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Phone, 
  MapPin, 
  MessageCircle, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  TrendingUp,
  ShoppingCart
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

interface FollowUpCardProps {
  followUp: FollowUp;
  onRefresh: () => void;
}

export function FollowUpCard({ followUp, onRefresh }: FollowUpCardProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState<string | null>(null);
  const { markAsDone, snooze } = useFollowUpActions(followUp.id);

  const getReasonLabel = (reason: FollowUp['reason']) => {
    switch (reason) {
      case 'low_stock': return 'Order Needed';
      case 'run_out': return 'Run Out';
      case 'must_order': return 'Must Order';
      case 'target_at_risk': return 'Target at risk';
      case 'overdue_payment': return 'Overdue Payment';
    }
  };

  const getPriorityColor = (priority: FollowUp['priority']) => {
    switch (priority) {
      case 'critical': return 'bg-red-100 text-red-700 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'medium': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'low': return 'bg-blue-100 text-blue-700 border-blue-200';
    }
  };

  const getReasonIcon = (reason: FollowUp['reason']) => {
    switch (reason) {
      case 'run_out': return <AlertCircle className="h-4 w-4" />;
      case 'must_order': return <AlertCircle className="h-4 w-4" />;
      case 'target_at_risk': return <TrendingUp className="h-4 w-4" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  const handleMarkDone = async () => {
    try {
      setLoading('done');
      await markAsDone();
      toast({ title: "Follow-up completed" });
      onRefresh();
    } catch (error) {
      toast({ title: "Error", description: "Failed to mark as done", variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  const handleSnooze = async (days: number) => {
    try {
      setLoading('snooze');
      await snooze(days);
      toast({ title: `Follow-up snoozed for ${days} days` });
      onRefresh();
    } catch (error) {
      toast({ title: "Error", description: "Failed to snooze", variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  const handleCall = () => {
    toast({ title: "Dialing store..." });
  };

  const handleVisit = () => {
    navigate(`/stores/${followUp.store_id}`);
  };

  const handleWhatsApp = () => {
    toast({ title: "Opening WhatsApp..." });
  };

  const handleRecordSale = () => {
    navigate(`/sales?store=${followUp.store_id}`);
  };

  return (
    <Card className={`border-l-4 ${
      followUp.priority === 'critical' ? 'border-l-red-500' :
      followUp.priority === 'high' ? 'border-l-orange-500' :
      'border-l-amber-500'
    }`}>
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-full ${
              followUp.priority === 'critical' ? 'bg-red-100 text-red-600' :
              followUp.priority === 'high' ? 'bg-orange-100 text-orange-600' :
              'bg-amber-100 text-amber-600'
            }`}>
              {getReasonIcon(followUp.reason)}
            </div>
            <div>
              <h4 className="font-semibold text-sm">{followUp.store_name || 'Store'}</h4>
              <Badge variant="outline" className={`text-xs mt-1 ${getPriorityColor(followUp.priority)}`}>
                {getReasonLabel(followUp.reason)}
              </Badge>
            </div>
          </div>
          <span className="text-xs text-muted-foreground">
            {followUp.scheduled_date}
          </span>
        </div>

        {/* Info */}
        <div className="space-y-2 mb-4">
          {followUp.depletion_date && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertCircle className="h-3.5 w-3.5" />
              <span>Runout: {followUp.depletion_date}</span>
            </div>
          )}
          {followUp.last_sale_amount && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShoppingCart className="h-3.5 w-3.5" />
              <span>Last sale: {followUp.last_sale_amount} units on {followUp.last_sale_date}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <Button 
            size="sm" 
            variant="outline" 
            className="h-7 text-xs gap-1"
            onClick={handleCall}
          >
            <Phone className="h-3.5 w-3.5" />
            Call
          </Button>
          <Button 
            size="sm" 
            variant="outline" 
            className="h-7 text-xs gap-1"
            onClick={handleVisit}
          >
            <MapPin className="h-3.5 w-3.5" />
            Visit
          </Button>
          <Button 
            size="sm" 
            variant="outline" 
            className="h-7 text-xs gap-1"
            onClick={handleWhatsApp}
          >
            <MessageCircle className="h-3.5 w-3.5" />
            WhatsApp
          </Button>
          <Button 
            size="sm" 
            variant="default" 
            className="h-7 text-xs gap-1"
            onClick={handleRecordSale}
          >
            <ShoppingCart className="h-3.5 w-3.5" />
            Record Sale
          </Button>
        </div>

        {/* Secondary Actions */}
        <div className="flex gap-2 mt-3 pt-3 border-t">
          <Button 
            size="sm" 
            variant="ghost" 
            className="h-7 text-xs gap-1 text-green-600 hover:text-green-700"
            onClick={handleMarkDone}
            disabled={loading === 'done'}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Mark Done
          </Button>
          <Button 
            size="sm" 
            variant="ghost" 
            className="h-7 text-xs gap-1"
            onClick={() => handleSnooze(3)}
            disabled={loading === 'snooze'}
          >
            <Clock className="h-3.5 w-3.5" />
            Snooze 3d
          </Button>
          <Button 
            size="sm" 
            variant="ghost" 
            className="h-7 text-xs gap-1"
            onClick={() => handleSnooze(7)}
            disabled={loading === 'snooze'}
          >
            <Clock className="h-3.5 w-3.5" />
            Snooze 7d
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
