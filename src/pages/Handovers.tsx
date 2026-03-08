import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Banknote, Smartphone, CheckCircle, Clock, AlertCircle, Loader2, Send, ArrowDownLeft, ArrowUpRight, XCircle, User } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const Handovers = () => {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [toUserId, setToUserId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Fetch all staff profiles for the "hand to" selector
  const { data: staffProfiles } = useQuery({
    queryKey: ["staff-profiles"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .eq("is_active", true);
      // Filter out current user
      return (data || []).filter((p) => p.user_id !== user?.id);
    },
    enabled: !!user,
  });

  // Fetch handovers involving current user (sent or received)
  const { data: handovers, isLoading } = useQuery({
    queryKey: ["handovers", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("handovers")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Fetch today's sales for the current user to compute balance from sales
  const { data: userSalesTotals } = useQuery({
    queryKey: ["user-sales-totals", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("cash_amount, upi_amount")
        .eq("recorded_by", user!.id);
      if (error) throw error;
      return (data || []).reduce(
        (acc, s) => ({ cash: acc.cash + Number(s.cash_amount), upi: acc.upi + Number(s.upi_amount) }),
        { cash: 0, upi: 0 }
      );
    },
    enabled: !!user,
  });

  // Fetch profile names for display
  const { data: profileMap } = useQuery({
    queryKey: ["profile-map"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name, avatar_url");
      const map: Record<string, { name: string; avatar: string | null }> = {};
      (data || []).forEach((p) => { map[p.user_id] = { name: p.full_name, avatar: p.avatar_url }; });
      return map;
    },
  });

  // Compute balances
  const myHandovers = handovers || [];
  const sentConfirmed = myHandovers
    .filter((h) => h.user_id === user?.id && h.status === "confirmed")
    .reduce((s, h) => s + Number(h.cash_amount) + Number(h.upi_amount), 0);
  const sentPending = myHandovers
    .filter((h) => h.user_id === user?.id && h.status === "awaiting_confirmation")
    .reduce((s, h) => s + Number(h.cash_amount) + Number(h.upi_amount), 0);
  const receivedConfirmed = myHandovers
    .filter((h) => h.handed_to === user?.id && h.status === "confirmed")
    .reduce((s, h) => s + Number(h.cash_amount) + Number(h.upi_amount), 0);

  const salesTotal = (userSalesTotals?.cash || 0) + (userSalesTotals?.upi || 0);
  const notHandedOver = salesTotal + receivedConfirmed - sentConfirmed - sentPending;
  const awaitingAmount = sentPending;

  // Incoming handovers awaiting my confirmation
  const incoming = myHandovers.filter((h) => h.handed_to === user?.id && h.status === "awaiting_confirmation");
  // Outgoing handovers I created
  const outgoing = myHandovers.filter((h) => h.user_id === user?.id);
  // Received handovers
  const received = myHandovers.filter((h) => h.handed_to === user?.id);

  const handleCreate = async () => {
    if (!toUserId || !amount || Number(amount) <= 0) {
      toast.error("Select a recipient and enter a valid amount");
      return;
    }
    if (Number(amount) > notHandedOver) {
      toast.error("Amount exceeds your available balance");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("handovers").insert({
      user_id: user!.id,
      handed_to: toUserId,
      cash_amount: Number(amount),
      upi_amount: 0,
      status: "awaiting_confirmation",
      notes: notes || null,
    });
    setSubmitting(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Handover sent for confirmation");
      setCreateOpen(false);
      setAmount("");
      setNotes("");
      setToUserId("");
      qc.invalidateQueries({ queryKey: ["handovers"] });
    }
  };

  const handleConfirm = async (id: string) => {
    const { error } = await supabase.from("handovers").update({
      status: "confirmed",
      confirmed_by: user!.id,
      confirmed_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Handover confirmed — amount added to your balance"); qc.invalidateQueries({ queryKey: ["handovers"] }); }
  };

  const handleReject = async (id: string) => {
    const { error } = await supabase.from("handovers").update({
      status: "rejected",
      rejected_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Handover rejected — amount returned to sender"); qc.invalidateQueries({ queryKey: ["handovers"] }); }
  };

  const getProfile = (userId: string | null) => profileMap?.[userId || ""] || { name: "Unknown", avatar: null };
  const getName = (userId: string | null) => getProfile(userId).name;

  const UserAvatar = ({ userId, size = "sm" }: { userId: string | null; size?: "sm" | "md" }) => {
    const p = getProfile(userId);
    const cls = size === "md" ? "h-10 w-10" : "h-8 w-8";
    return (
      <Avatar className={cls}>
        <AvatarImage src={p.avatar || undefined} alt={p.name} />
        <AvatarFallback className="bg-primary/10 text-primary text-xs">
          {p.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || <User className="h-3.5 w-3.5" />}
        </AvatarFallback>
      </Avatar>
    );
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Handovers"
        subtitle="Track money flow between team members"
        primaryAction={{ label: "Create Handover", icon: Send, onClick: () => setCreateOpen(true) }}
      />

      {/* Balance Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
              <AlertCircle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Not Handed Over</p>
              <p className="text-xl font-bold">₹{Math.max(0, notHandedOver).toLocaleString()}</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
              <Clock className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Awaiting Confirmation</p>
              <p className="text-xl font-bold">₹{awaitingAmount.toLocaleString()}</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
              <Banknote className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">From Sales</p>
              <p className="text-xl font-bold">₹{salesTotal.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Incoming requiring action */}
      {incoming.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <ArrowDownLeft className="h-4 w-4" /> Incoming — Needs Your Confirmation
          </h3>
          {incoming.map((item) => (
            <div key={item.id} className="rounded-xl border bg-card p-4 border-l-4 border-l-warning">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-start gap-3">
                  <UserAvatar userId={item.user_id} size="md" />
                  <div>
                    <p className="font-semibold">₹{(Number(item.cash_amount) + Number(item.upi_amount)).toLocaleString()}</p>
                    <p className="text-sm text-muted-foreground">From: <span className="font-medium text-foreground">{getName(item.user_id)}</span> · {new Date(item.created_at).toLocaleDateString()}</p>
                    {item.notes && <p className="text-sm mt-1 italic text-muted-foreground">"{item.notes}"</p>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => handleConfirm(item.id)} className="gap-1">
                    <CheckCircle className="h-3.5 w-3.5" /> Accept
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleReject(item.id)} className="gap-1">
                    <XCircle className="h-3.5 w-3.5" /> Reject
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs for sent/received history */}
      <Tabs defaultValue="sent" className="w-full">
        <TabsList>
          <TabsTrigger value="sent" className="gap-1.5"><ArrowUpRight className="h-3.5 w-3.5" /> Sent</TabsTrigger>
          <TabsTrigger value="received" className="gap-1.5"><ArrowDownLeft className="h-3.5 w-3.5" /> Received</TabsTrigger>
        </TabsList>

        <TabsContent value="sent" className="space-y-3 mt-3">
          {outgoing.length === 0 ? (
            <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">No handovers sent yet.</div>
          ) : outgoing.map((item) => (
            <div key={item.id} className={`rounded-xl border bg-card p-4 border-l-4 ${
              item.status === "confirmed" ? "border-l-success" :
              item.status === "rejected" ? "border-l-destructive" : "border-l-warning"
            }`}>
              <div className="flex items-start gap-3">
                <UserAvatar userId={item.handed_to} />
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">₹{(Number(item.cash_amount) + Number(item.upi_amount)).toLocaleString()}</p>
                    <StatusBadge
                      status={item.status === "confirmed" ? "active" : item.status === "rejected" ? "inactive" : "pending"}
                      label={item.status === "confirmed" ? "Confirmed" : item.status === "rejected" ? "Rejected" : "Awaiting"}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">To: <span className="font-medium text-foreground">{getName(item.handed_to)}</span> · {new Date(item.created_at).toLocaleDateString()}</p>
                  {item.notes && <p className="text-sm mt-1 italic text-muted-foreground">"{item.notes}"</p>}
                </div>
              </div>
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="received" className="space-y-3 mt-3">
          {received.length === 0 ? (
            <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">No handovers received yet.</div>
          ) : received.map((item) => (
            <div key={item.id} className={`rounded-xl border bg-card p-4 border-l-4 ${
              item.status === "confirmed" ? "border-l-success" :
              item.status === "rejected" ? "border-l-destructive" : "border-l-warning"
            }`}>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">₹{(Number(item.cash_amount) + Number(item.upi_amount)).toLocaleString()}</p>
                    <StatusBadge
                      status={item.status === "confirmed" ? "active" : item.status === "rejected" ? "inactive" : "pending"}
                      label={item.status === "confirmed" ? "Confirmed" : item.status === "rejected" ? "Rejected" : "Pending"}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">From: {getName(item.user_id)} · {new Date(item.created_at).toLocaleDateString()}</p>
                  {item.notes && <p className="text-sm mt-1 italic text-muted-foreground">"{item.notes}"</p>}
                </div>
              </div>
            </div>
          ))}
        </TabsContent>
      </Tabs>

      {/* Create Handover Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Handover</DialogTitle>
            <DialogDescription>Send money to another team member for confirmation.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Available Balance</Label>
              <p className="text-lg font-bold text-primary">₹{Math.max(0, notHandedOver).toLocaleString()}</p>
            </div>
            <div className="space-y-2">
              <Label>Send To</Label>
              <Select value={toUserId} onValueChange={setToUserId}>
                <SelectTrigger><SelectValue placeholder="Select staff member" /></SelectTrigger>
                <SelectContent>
                  {(staffProfiles || []).map((p) => (
                    <SelectItem key={p.user_id} value={p.user_id}>{p.full_name} ({p.email})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Amount (₹)</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Enter amount" min="1" />
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add any notes..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              Send Handover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Handovers;
