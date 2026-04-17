import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ArrowLeftRight, 
  Clock, 
  AlertCircle, 
  CheckCircle2, 
  XCircle, 
  Package,
  DollarSign,
  Calendar,
  User,
  Eye,
  RefreshCw,
  Filter
} from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { format } from "date-fns";
import { ReturnReviewModal } from "./ReturnReviewModal";
import { ReturnDetailView } from "./ReturnDetailView";

interface ReturnRequest {
  id: string;
  display_id: string;
  staff_id: string;
  staff_name: string;
  warehouse_id: string;
  warehouse_name: string;
  status: string;
  return_reason: string;
  requested_items_count: number;
  total_requested_value: number;
  submitted_at: string;
  submitted_hours_ago: number;
}

export function ManagerReturnDashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("pending");
  const [selectedReturn, setSelectedReturn] = useState<ReturnRequest | null>(null);
  const [reviewReturn, setReviewReturn] = useState<ReturnRequest | null>(null);
  const queryClient = useQueryClient();

  const { data: pendingReturns, isLoading: loadingPending } = useQuery({
    queryKey: ["pending-returns"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("stock_transfers", {
        p_warehouse_id: null,
        p_limit: 50,
      });
      if (error) throw error;
      return data as ReturnRequest[];
    },
  });

  const { data: myReviewedReturns, isLoading: loadingReviewed } = useQuery({
    queryKey: ["my-reviewed-returns", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_transfers")
        .select(`
          *,
          staff:auth.users!stock_transfers_staff_id_fkey(id, raw_user_meta_data->>'full_name'),
          warehouse:warehouses(id, name)
        `)
        .eq("reviewed_by", user?.id)
        .order("reviewed_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: activeTab === "reviewed",
  });

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      draft: "bg-gray-100 text-gray-700",
      pending: "bg-amber-100 text-amber-700 animate-pulse",
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
      case "pending": return <Clock className="h-4 w-4" />;
      case "approved":
      case "completed":
        return <CheckCircle2 className="h-4 w-4" />;
      case "rejected":
        return <XCircle className="h-4 w-4" />;
      default:
        return <Package className="h-4 w-4" />;
    }
  };

  const getReasonLabel = (reason: string) => {
    const labels: Record<string, string> = {
      end_of_day: "End of Day",
      route_completed: "Route Completed",
      unsold_stock: "Unsold Stock",
      damaged_goods: "Damaged Goods",
      expired: "Expired",
      wrong_item: "Wrong Item",
      other: "Other",
    };
    return labels[reason] || reason;
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="pending" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Pending ({pendingReturns?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="reviewed" className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            My Decisions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          {loadingPending ? (
            <PendingReturnsSkeleton />
          ) : pendingReturns?.length === 0 ? (
            <Card className="p-8 text-center">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500" />
              <h3 className="text-lg font-medium">No Pending Returns</h3>
              <p className="text-sm text-muted-foreground mt-1">
                All return requests have been processed
              </p>
            </Card>
          ) : (
            <div className="grid gap-4">
              {pendingReturns?.map((returnReq) => (
                <Card 
                  key={returnReq.id}
                  className={`hover:shadow-md transition-shadow cursor-pointer ${
                    returnReq.submitted_hours_ago > 24 ? "border-red-300" : ""
                  }`}
                  onClick={() => setReviewReturn(returnReq)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-amber-100 text-amber-600">
                          {returnReq.staff_name?.charAt(0) || "?"}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-semibold">{returnReq.display_id}</h4>
                          <Badge className={getStatusBadge(returnReq.status)}>
                            {getStatusIcon(returnReq.status)}
                            <span className="ml-1 capitalize">{returnReq.status}</span>
                          </Badge>
                          {returnReq.submitted_hours_ago > 24 && (
                            <Badge variant="destructive">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              {returnReq.submitted_hours_ago}h pending
                            </Badge>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <User className="h-3.5 w-3.5" />
                            {returnReq.staff_name}
                          </span>
                          <span className="flex items-center gap-1">
                            <Package className="h-3.5 w-3.5" />
                            {returnReq.requested_items_count} items
                          </span>
                          <span className="flex items-center gap-1">
                            <DollarSign className="h-3.5 w-3.5" />
                            {formatCurrency(returnReq.total_requested_value)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {format(new Date(returnReq.submitted_at), "MMM d, h:mm a")}
                          </span>
                        </div>

                        <div className="mt-2 flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {getReasonLabel(returnReq.return_reason)}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {returnReq.warehouse_name}
                          </span>
                        </div>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          setReviewReturn(returnReq);
                        }}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        Review
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="reviewed" className="space-y-4">
          {loadingReviewed ? (
            <PendingReturnsSkeleton />
          ) : myReviewedReturns?.length === 0 ? (
            <Card className="p-8 text-center">
              <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
              <h3 className="text-lg font-medium">No Returns Reviewed</h3>
              <p className="text-sm text-muted-foreground mt-1">
                You haven't processed any return requests yet
              </p>
            </Card>
          ) : (
            <div className="grid gap-4">
              {myReviewedReturns?.map((returnReq: any) => (
                <Card 
                  key={returnReq.id}
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => setSelectedReturn(returnReq)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-muted">
                          {returnReq.staff?.raw_user_meta_data?.full_name?.charAt(0) || "?"}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-semibold">{returnReq.display_id}</h4>
                          <Badge className={getStatusBadge(returnReq.status)}>
                            {getStatusIcon(returnReq.status)}
                            <span className="ml-1 capitalize">{returnReq.status}</span>
                          </Badge>
                        </div>

                        <div className="mt-2 text-sm text-muted-foreground">
                          {returnReq.staff?.raw_user_meta_data?.full_name} • {" "}
                          {formatCurrency(returnReq.total_approved_value || 0)} approved • {" "}
                          {returnReq.reviewed_at && format(new Date(returnReq.reviewed_at), "MMM d, h:mm a")}
                        </div>
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedReturn(returnReq);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Review Modal */}
      {reviewReturn && (
        <ReturnReviewModal
          isOpen={!!reviewReturn}
          onClose={() => setReviewReturn(null)}
          returnRequest={reviewReturn}
        />
      )}

      {/* Detail View Modal */}
      {selectedReturn && (
        <ReturnDetailView
          isOpen={!!selectedReturn}
          onClose={() => setSelectedReturn(null)}
          returnId={selectedReturn.id}
        />
      )}
    </div>
  );
}

function PendingReturnsSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(4)].map((_, i) => (
        <Skeleton key={i} className="h-28" />
      ))}
    </div>
  );
}

