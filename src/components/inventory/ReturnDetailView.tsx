import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Package,
  DollarSign,
  User,
  Calendar,
  ArrowRightLeft,
  RotateCcw,
} from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { format } from "date-fns";

interface ReturnDetailViewProps {
  isOpen: boolean;
  onClose: () => void;
  returnId: string;
}

export function ReturnDetailView({
  isOpen,
  onClose,
  returnId,
}: ReturnDetailViewProps) {
  const { data: returnDetails, isLoading } = useQuery({
    queryKey: ["return-detail", returnId],
    queryFn: async () => {
      const { data: request, error: reqError } = await supabase
        .from("stock_return_requests")
        .select(`
          *,
          staff:auth.users!stock_return_requests_staff_id_fkey(id, raw_user_meta_data->>'full_name'),
          reviewer:auth.users!stock_return_requests_reviewed_by_fkey(id, raw_user_meta_data->>'full_name'),
          warehouse:warehouses(id, name)
        `)
        .eq("id", returnId)
        .single();

      if (reqError) throw reqError;

      const { data: items, error: itemsError } = await supabase
        .from("stock_return_items")
        .select("*, product:products(id, name, sku)")
        .eq("return_request_id", returnId);

      if (itemsError) throw itemsError;

      const { data: approvals, error: appError } = await supabase
        .from("stock_return_approvals")
        .select("*")
        .eq("return_request_id", returnId)
        .order("created_at", { ascending: true });

      if (appError) throw appError;

      return {
        request,
        items: items || [],
        approvals: approvals || [],
      };
    },
    enabled: isOpen,
  });

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      draft: "bg-gray-100 text-gray-700",
      pending: "bg-amber-100 text-amber-700",
      review: "bg-blue-100 text-blue-700",
      approved: "bg-green-100 text-green-700",
      partial: "bg-orange-100 text-orange-700",
      damaged: "bg-red-100 text-red-700",
      rejected: "bg-red-200 text-red-800",
      cancelled: "bg-gray-200 text-gray-600",
      completed: "bg-green-200 text-green-800",
    };
    return variants[status] || "bg-gray-100 text-gray-700";
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending":
        return <Clock className="h-4 w-4" />;
      case "approved":
      case "completed":
        return <CheckCircle2 className="h-4 w-4" />;
      case "rejected":
        return <XCircle className="h-4 w-4" />;
      default:
        return <Package className="h-4 w-4" />;
    }
  };

  if (isLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[600px]">
          <div className="space-y-4">
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-32" />
            <Skeleton className="h-48" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const { request, items, approvals } = returnDetails || {};

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-amber-600" />
            Return Request Details
          </DialogTitle>
          <DialogDescription>
            {request?.display_id} • {request?.status}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status */}
          <div className="flex items-center gap-2">
            <Badge className={getStatusBadge(request?.status)}>
              {getStatusIcon(request?.status)}
              <span className="ml-1 capitalize">{request?.status}</span>
            </Badge>
          </div>

          {/* Request Info */}
          <div className="bg-muted/50 p-4 rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                Staff: {request?.staff?.raw_user_meta_data?.full_name || "Unknown"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                Warehouse: {request?.warehouse?.name || "Unknown"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                Submitted: {request?.submitted_at && format(new Date(request.submitted_at), "PPp")}
              </span>
            </div>
            {request?.reviewed_at && (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  Reviewed: {format(new Date(request.reviewed_at), "PPp")}
                </span>
              </div>
            )}
          </div>

          {/* Items */}
          <div>
            <h4 className="font-medium mb-2">Return Items</h4>
            <ScrollArea className="h-[200px]">
              <div className="space-y-2 pr-4">
                {items?.map((item: any) => (
                  <div
                    key={item.id}
                    className="border rounded-lg p-3 flex items-center justify-between"
                  >
                    <div>
                      <p className="font-medium">{item.product?.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Requested: {item.requested_quantity} units
                      </p>
                      {item.approved_quantity !== item.requested_quantity && (
                        <p className="text-sm text-green-600">
                          Approved: {item.approved_quantity} units
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-medium">
                        {formatCurrency(item.requested_value)}
                      </p>
                      <Badge variant="outline" className="mt-1">
                        {item.item_status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Totals */}
          <div className="bg-muted/50 p-4 rounded-lg">
            <div className="flex justify-between">
              <span>Total Requested:</span>
              <span className="font-medium">
                {formatCurrency(request?.total_requested_value || 0)}
              </span>
            </div>
            {request?.total_approved_value > 0 && (
              <div className="flex justify-between mt-1">
                <span>Total Approved:</span>
                <span className="font-medium text-green-600">
                  {formatCurrency(request.total_approved_value)}
                </span>
              </div>
            )}
          </div>

          {/* Reviewer Notes */}
          {request?.reviewer_notes && (
            <div className="bg-muted/50 p-4 rounded-lg">
              <h4 className="font-medium mb-2">Reviewer Notes</h4>
              <p className="text-sm text-muted-foreground">
                {request.reviewer_notes}
              </p>
            </div>
          )}

          {/* Approval History */}
          {approvals?.length > 0 && (
            <div>
              <h4 className="font-medium mb-2">Approval History</h4>
              <div className="space-y-2">
                {approvals.map((approval: any) => (
                  <div
                    key={approval.id}
                    className="text-sm border-l-2 border-muted pl-3 py-1"
                  >
                    <p className="font-medium">
                      {approval.approval_action} • {format(new Date(approval.created_at), "PP p")}
                    </p>
                    {approval.notes && (
                      <p className="text-muted-foreground">{approval.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-4">
          <Button onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
