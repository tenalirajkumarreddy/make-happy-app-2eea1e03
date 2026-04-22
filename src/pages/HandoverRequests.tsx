import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { 
  Banknote, Send, CheckCircle, XCircle, Clock, Loader2, 
  ArrowDownLeft, ArrowRightLeft, FileText, Wallet, User, Trash2
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermission } from "@/hooks/usePermission";
import { toast } from "sonner";
import { format } from "date-fns";

const HandoverRequests = () => {
  const { user, role } = useAuth();
  const qc = useQueryClient();

  const isAgent = role === "agent";
  const isManager = ["manager", "prime_manager", "super_admin"].includes(role || "");
  const isAdminOrManager = isManager || role === "super_admin";

  const { allowed: canSubmitHandover } = usePermission("create_handover");
  const { allowed: canApproveHandover } = usePermission("approve_handover");

  // State
  const [createOpen, setCreateOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [handoverType, setHandoverType] = useState<"cash" | "upi" | "both">("cash");
  const [sendTo, setSendTo] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Review states
  const [reviewRequest, setReviewRequest] = useState<any>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewAmount, setReviewAmount] = useState("");

  // Fetch my cash account
  const { data: myAccount } = useQuery({
    queryKey: ["my-cash-account", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from("staff_cash_accounts")
        .select("*")
        .eq("user_id", user.id)
        .single();
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch my handover requests (for agents)
  const { data: myRequests = [], isLoading: loadingMyRequests } = useQuery({
    queryKey: ["my-handover-requests", user?.id],
    queryFn: async () => {
      if (!user?.id || !isAgent) return [];
      const { data } = await supabase
        .from("handover_requests")
        .select("*, profiles!handover_requests_staff_id_fkey(full_name)")
        .eq("staff_id", user.id)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!user?.id && isAgent,
  });

  // Fetch pending requests (for managers)
  const { data: pendingRequests = [], isLoading: loadingPending } = useQuery({
    queryKey: ["pending-handover-requests", user?.id],
    queryFn: async () => {
      if (!isAdminOrManager) return [];
      const { data } = await supabase
        .from("handover_requests")
        .select("*, profiles!handover_requests_staff_id_fkey(full_name)")
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: isAdminOrManager,
  });

  // Fetch managers to send to (for agents)
  const { data: managers = [] } = useQuery({
    queryKey: ["managers-list", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from("user_roles")
        .select("user_id, role, profiles(id, full_name)")
        .in("role", ["manager", "prime_manager"])
        .limit(20);
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Create handover request mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!amount || parseFloat(amount) <= 0) {
        throw new Error("Enter a valid amount");
      }
      const parsedAmount = parseFloat(amount);
      const available = handoverType === "cash" 
        ? (myAccount?.cash_amount || 0)
        : handoverType === "upi"
          ? (myAccount?.upi_amount || 0)
          : (myAccount?.cash_amount || 0) + (myAccount?.upi_amount || 0);
      
      if (parsedAmount > available) {
        throw new Error(`Insufficient balance. Available: ₹${available}`);
      }

      const { data, error } = await supabase.rpc("create_handover_request", {
        p_staff_id: user?.id,
        p_amount: parsedAmount,
        p_handover_type: handoverType,
        p_notes: notes || null,
        p_receipt_url: null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Handover request sent successfully");
      setCreateOpen(false);
      setAmount("");
      setNotes("");
      qc.invalidateQueries({ queryKey: ["my-handover-requests"] });
      qc.invalidateQueries({ queryKey: ["my-cash-account"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to create request");
    },
  });

  // Accept handover mutation
  const acceptMutation = useMutation({
    mutationFn: async ({ requestId, notes }: { requestId: string; notes?: string }) => {
      const { data, error } = await supabase.rpc("accept_handover_request", {
        p_request_id: requestId,
        p_reviewer_id: user?.id,
        p_notes: notes || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Handover accepted");
      setReviewOpen(false);
      qc.invalidateQueries({ queryKey: ["pending-handover-requests"] });
      qc.invalidateQueries({ queryKey: ["my-cash-account"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to accept");
    },
  });

  // Reject handover mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ requestId, reason }: { requestId: string; reason: string }) => {
      const { data, error } = await supabase.rpc("reject_handover_request", {
        p_request_id: requestId,
        p_reviewer_id: user?.id,
        p_reason: reason,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Handover rejected");
      setReviewOpen(false);
      qc.invalidateQueries({ queryKey: ["pending-handover-requests"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to reject");
    },
  });

  // Cancel my request mutation
  const cancelMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const { data, error } = await supabase.rpc("cancel_handover_request", {
        p_request_id: requestId,
        p_user_id: user?.id,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Request cancelled");
      qc.invalidateQueries({ queryKey: ["my-handover-requests"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to cancel");
    },
  });

  const availableBalance = handoverType === "cash"
    ? myAccount?.cash_amount || 0
    : handoverType === "upi"
      ? myAccount?.upi_amount || 0
      : (myAccount?.cash_amount || 0) + (myAccount?.upi_amount || 0);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700">Pending</Badge>;
      case "accepted":
        return <Badge className="bg-green-100 text-green-700">Accepted</Badge>;
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      case "cancelled":
        return <Badge variant="secondary">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Handover Requests"
        description={isAgent ? "Send your holdings to manager" : "Approve agent handover requests"}
      />

      {/* Balance Cards for Agents */}
      {isAgent && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">Cash Balance</div>
              <div className="text-2xl font-bold">₹{(myAccount?.cash_amount || 0).toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">UPI Balance</div>
              <div className="text-2xl font-bold">₹{(myAccount?.upi_amount || 0).toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">Total Balance</div>
              <div className="text-2xl font-bold">
                ₹{((myAccount?.cash_amount || 0) + (myAccount?.upi_amount || 0)).toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Create Button for Agents */}
      {isAgent && (
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Send className="h-4 w-4" />
          Send Holding to Manager
        </Button>
      )}

      {/* Pending Requests Table for Managers */}
      {isAdminOrManager && pendingRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-600" />
              Pending Approvals ({pendingRequests.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingRequests.map((req: any) => (
                  <TableRow key={req.id}>
                    <TableCell className="font-medium">
                      {req.profiles?.full_name || "Unknown"}
                    </TableCell>
                    <TableCell className="font-bold">
                      ₹{Number(req.amount).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{req.handover_type}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(req.created_at), "dd MMM")}
                    </TableCell>
                    <TableCell>{getStatusBadge(req.status)}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-green-600"
                          onClick={() => {
                            setReviewRequest(req);
                            setReviewAmount(req.amount.toString());
                            setReviewNotes("");
                            setReviewOpen(true);
                          }}
                        >
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-red-600"
                          onClick={() => {
                            setReviewRequest(req);
                            setReviewOpen(true);
                          }}
                        >
                          <XCircle className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* My Requests List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {isAgent ? "My Requests" : "All Requests"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isAgent && myRequests.length === 0 && (
            <p className="text-muted-foreground text-center py-8">
              No handover requests yet.
            </p>
          )}
          {isAdminOrManager && pendingRequests.length === 0 && (
            <p className="text-muted-foreground text-center py-8">
              No pending requests to approve.
            </p>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Amount</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Notes</TableHead>
                {isAgent && <TableHead>Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(isAgent ? myRequests : pendingRequests).map((req: any) => (
                <TableRow key={req.id}>
                  <TableCell className="font-bold">
                    ₹{Number(req.amount).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{req.handover_type}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(req.created_at), "dd MMM yyyy, hh:mm a")}
                  </TableCell>
                  <TableCell>{getStatusBadge(req.status)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                    {req.notes || "—"}
                  </TableCell>
                  {isAgent && req.status === "pending" && (
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-red-600"
                        onClick={() => cancelMutation.mutate(req.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Holding to Manager</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Amount (₹)</Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Available: ₹{availableBalance.toLocaleString()}
              </p>
            </div>
            <div>
              <Label>Transfer Type</Label>
              <Select
                value={handoverType}
                onValueChange={(v: "cash" | "upi" | "both") => setHandoverType(v)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Send To</Label>
              <Select value={sendTo} onValueChange={setSendTo}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select manager" />
                </SelectTrigger>
                <SelectContent>
                  {managers.map((m: any) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.profiles?.full_name} ({m.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add a note for the manager"
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !amount}
            >
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Review Dialog for Managers */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review Handover Request</DialogTitle>
          </DialogHeader>
          {reviewRequest && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="text-2xl font-bold">
                    ₹{Number(reviewRequest.amount).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-muted-foreground">Type</span>
                  <Badge variant="outline">{reviewRequest.handover_type}</Badge>
                </div>
                {reviewRequest.notes && (
                  <div className="mt-2">
                    <span className="text-muted-foreground">Notes:</span>
                    <p className="text-sm">{reviewRequest.notes}</p>
                  </div>
                )}
              </div>
              {reviewAmount && (
                <div>
                  <Label>Confirm Amount</Label>
                  <Input
                    value={reviewAmount}
                    onChange={(e) => setReviewAmount(e.target.value)}
                    className="mt-1"
                  />
                </div>
              )}
              <div>
                <Label>Notes (optional)</Label>
                <Textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Add notes (optional)"
                  className="mt-1"
                />
              </div>
            </div>
          )}
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setReviewOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                rejectMutation.mutate({
                  requestId: reviewRequest.id,
                  reason: reviewNotes || "Rejected by manager",
                });
              }}
              disabled={rejectMutation.isPending}
            >
              <XCircle className="mr-2 h-4 w-4" />
              Reject
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              onClick={() => {
                acceptMutation.mutate({
                  requestId: reviewRequest.id,
                  notes: reviewNotes,
                });
              }}
              disabled={acceptMutation.isPending}
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              Accept
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default HandoverRequests;