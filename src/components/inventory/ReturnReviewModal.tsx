import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowLeftRight,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Package,
  DollarSign,
  User,
  Calendar,
  AlertTriangle,
  Loader2,
  Clock,
  ThumbsUp,
  ThumbsDown,
  ShieldAlert
} from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { format } from "date-fns";

interface ReturnReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  returnRequest: {
    id: string;
    display_id: string;
    staff_id: string;
    staff_name: string;
    warehouse_id: string;
    warehouse_name: string;
    status: string;
    return_reason: string;
    custom_reason?: string;
    requested_items_count: number;
    total_requested_value: number;
    submitted_at: string;
  };
}

interface ReturnItem {
  id: string;
  product_id: string;
  product: {
    id: string;
    name: string;
    sku: string;
    base_price: number;
  };
  requested_quantity: number;
  unit_price: number;
  requested_value: number;
  staff_notes?: string;
}

interface ItemDecision {
  item_id: string;
  decision: "approved" | "partial" | "damaged" | "rejected";
  approved_quantity: number;
  damaged_quantity: number;
  notes: string;
}

export function ReturnReviewModal({
  isOpen,
  onClose,
  returnRequest,
}: ReturnReviewModalProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("items");
  const [overallNotes, setOverallNotes] = useState("");
  const [itemDecisions, setItemDecisions] = useState<Record<string, ItemDecision>>({});
  const [error, setError] = useState("");
  const [showConfirm, setShowConfirm] = useState<"approve" | "reject" | null>(null);

  const { data: items, isLoading } = useQuery({
    queryKey: ["return-items", returnRequest.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_return_items")
        .select("*, product:products(id, name, sku, base_price)")
        .eq("return_request_id", returnRequest.id);
      if (error) throw error;
      return data as unknown as ReturnItem[];
    },
    enabled: isOpen,
  });

  // Initialize decisions when items load
  useMemo(() => {
    if (items) {
      const initial: Record<string, ItemDecision> = {};
      items.forEach((item) => {
        initial[item.id] = {
          item_id: item.id,
          decision: "approved",
          approved_quantity: item.requested_quantity,
          damaged_quantity: 0,
          notes: "",
        };
      });
      setItemDecisions(initial);
    }
  }, [items]);

  const reviewMutation = useMutation({
    mutationFn: async (action: "approve" | "reject") => {
      if (!user?.id) throw new Error("Not authenticated");

      const decisions = Object.values(itemDecisions).map((d) => ({
        item_id: d.item_id,
        decision: d.decision,
        approved_quantity: d.approved_quantity,
        damaged_quantity: d.damaged_quantity,
        notes: d.notes,
      }));

      const { data, error } = await supabase.rpc("review_stock_return", {
        p_return_id: returnRequest.id,
        p_reviewer_id: user.id,
        p_action: action,
        p_item_decisions: decisions,
        p_overall_notes: overallNotes,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Return ${returnRequest.display_id} ${data.new_status}`);
        queryClient.invalidateQueries({ queryKey: ["pending-returns"] });
        queryClient.invalidateQueries({ queryKey: ["my-reviewed-returns"] });
        onClose();
      } else {
        setError(data.error || "Review failed");
      }
    },
    onError: (error: any) => {
      setError(error.message || "Failed to process return");
    },
  });

  const updateDecision = (
    itemId: string,
    updates: Partial<ItemDecision>
  ) => {
    setItemDecisions((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], ...updates },
    }));
  };

  const calculateTotals = () => {
    const approved = Object.values(itemDecisions).filter(
      (d) => d.decision === "approved"
    ).length;
    const rejected = Object.values(itemDecisions).filter(
      (d) => d.decision === "rejected"
    ).length;
    const damaged = Object.values(itemDecisions).filter(
      (d) => d.decision === "damaged" || d.damaged_quantity > 0
    ).length;

    const approvedValue = Object.values(itemDecisions).reduce((sum, d) => {
      const item = items?.find((i) => i.id === d.item_id);
      return sum + (d.approved_quantity * (item?.unit_price || 0));
    }, 0);

    return { approved, rejected, damaged, approvedValue };
  };

  const totals = calculateTotals();
  const allDecided = items?.every((item) => itemDecisions[item.id]);

  const handleSubmit = (action: "approve" | "reject") => {
    setError("");
    if (action === "approve" && !allDecided) {
      setError("Please make decisions for all items");
      return;
    }
    reviewMutation.mutate(action);
  };

  const getDecisionColor = (decision: string) => {
    switch (decision) {
      case "approved":
        return "text-green-600";
      case "rejected":
        return "text-red-600";
      case "damaged":
        return "text-amber-600";
      default:
        return "text-muted-foreground";
    }
  };

  if (isLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[600px]">
          <div className="space-y-4 py-4">
            <div className="h-8 w-1/3 bg-muted animate-pulse rounded" />
            <div className="h-32 bg-muted animate-pulse rounded" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5 text-amber-600" />
            <DialogTitle>Review Return Request</DialogTitle>
          </div>
          <DialogDescription>
            {returnRequest.display_id} from {returnRequest.staff_name}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="items">Items to Review</TabsTrigger>
            <TabsTrigger value="summary">Decision Summary</TabsTrigger>
          </TabsList>

          <TabsContent value="items" className="space-y-4">
            {/* Request Info */}
            <div className="bg-muted/50 p-3 rounded-lg">
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                <span className="flex items-center gap-1">
                  <User className="h-4 w-4 text-muted-foreground" />
                  {returnRequest.staff_name}
                </span>
                <span className="flex items-center gap-1">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  {returnRequest.requested_items_count} items
                </span>
                <span className="flex items-center gap-1">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  {formatCurrency(returnRequest.total_requested_value)}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  {format(new Date(returnRequest.submitted_at), "MMM d, h:mm a")}
                </span>
              </div>
              <div className="mt-2">
                <Badge variant="outline">
                  Reason: {returnRequest.return_reason}
                </Badge>
                {returnRequest.custom_reason && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {returnRequest.custom_reason}
                  </p>
                )}
              </div>
            </div>

            {/* Items */}
            <ScrollArea className="h-[300px]">
              <div className="space-y-3 pr-4">
                {items?.map((item) => {
                  const decision = itemDecisions[item.id];
                  if (!decision) return null;

                  return (
                    <div
                      key={item.id}
                      className="border rounded-lg p-4 space-y-3"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-medium">{item.product?.name}</h4>
                          <p className="text-sm text-muted-foreground">
                            SKU: {item.product?.sku} • {formatCurrency(item.unit_price)}/unit
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">{item.requested_quantity} units</p>
                          <p className="text-sm text-muted-foreground">
                            {formatCurrency(item.requested_value)}
                          </p>
                        </div>
                      </div>

                      {item.staff_notes && (
                        <div className="bg-muted/30 p-2 rounded text-sm">
                          <span className="text-muted-foreground">Staff note:</span>{" "}
                          {item.staff_notes}
                        </div>
                      )}

                      <RadioGroup
                        value={decision.decision}
                        onValueChange={(v: any) =>
                          updateDecision(item.id, { decision: v })
                        }
                        className="flex flex-wrap gap-2"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="approved" id={`approve-${item.id}`} />
                          <Label
                            htmlFor={`approve-${item.id}`}
                            className="flex items-center gap-1 cursor-pointer"
                          >
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                            Accept
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="damaged" id={`damage-${item.id}`} />
                          <Label
                            htmlFor={`damage-${item.id}`}
                            className="flex items-center gap-1 cursor-pointer"
                          >
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                            Damaged
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="rejected" id={`reject-${item.id}`} />
                          <Label
                            htmlFor={`reject-${item.id}`}
                            className="flex items-center gap-1 cursor-pointer"
                          >
                            <XCircle className="h-4 w-4 text-red-500" />
                            Reject
                          </Label>
                        </div>
                      </RadioGroup>

                      {(decision.decision === "approved" ||
                        decision.decision === "damaged") && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Label className="text-sm shrink-0">Accept:</Label>
                            <Input
                              type="number"
                              min="0"
                              max={item.requested_quantity}
                              value={decision.approved_quantity}
                              onChange={(e) =>
                                updateDecision(item.id, {
                                  approved_quantity:
                                    parseInt(e.target.value) || 0,
                                })
                              }
                              className="w-20"
                            />
                            <span className="text-sm text-muted-foreground">
                              of {item.requested_quantity}
                            </span>
                          </div>

                          {decision.decision === "damaged" && (
                            <div className="flex items-center gap-2">
                              <Label className="text-sm shrink-0 text-amber-600">
                                Damaged:
                              </Label>
                              <Input
                                type="number"
                                min="0"
                                max={item.requested_quantity}
                                value={decision.damaged_quantity}
                                onChange={(e) =>
                                  updateDecision(item.id, {
                                    damaged_quantity:
                                      parseInt(e.target.value) || 0,
                                  })
                                }
                                className="w-20"
                              />
                            </div>
                          )}
                        </div>
                      )}

                      <Textarea
                        placeholder="Reviewer notes (optional)"
                        value={decision.notes}
                        onChange={(e) =>
                          updateDecision(item.id, { notes: e.target.value })
                        }
                        className="text-sm"
                        rows={2}
                      />
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="summary" className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <span>Approved Items</span>
                </div>
                <span className="font-semibold text-green-600">{totals.approved}</span>
              </div>

              <div className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  <span>Damaged Items</span>
                </div>
                <span className="font-semibold text-amber-600">{totals.damaged}</span>
              </div>

              <div className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                <div className="flex items-center gap-2">
                  <XCircle className="h-5 w-5 text-red-600" />
                  <span>Rejected Items</span>
                </div>
                <span className="font-semibold text-red-600">{totals.rejected}</span>
              </div>

              <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-blue-600" />
                  <span>Total Approved Value</span>
                </div>
                <span className="font-semibold text-blue-600">
                  {formatCurrency(totals.approvedValue)}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="overallNotes">Overall Notes</Label>
              <Textarea
                id="overallNotes"
                value={overallNotes}
                onChange={(e) => setOverallNotes(e.target.value)}
                placeholder="Add any overall comments about this return..."
                rows={4}
              />
            </div>
          </TabsContent>
        </Tabs>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter className="flex flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => handleSubmit("reject")}
            disabled={reviewMutation.isPending}
            className="w-full sm:w-auto"
          >
            {reviewMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            <XCircle className="mr-2 h-4 w-4" />
            Reject All
          </Button>
          <Button
            onClick={() => handleSubmit("approve")}
            disabled={reviewMutation.isPending || !allDecided}
            className="w-full sm:w-auto"
          >
            {reviewMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Process Decisions
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
