import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import {
  Banknote, CheckCircle, Clock, AlertCircle, Loader2, Send,
  ArrowDownLeft, ArrowUpRight, XCircle, User, ChevronDown, Users, ShoppingCart
} from "lucide-react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { useState, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, isToday, startOfDay } from "date-fns";

const Handovers = () => {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [toUserId, setToUserId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isAdminOrManager = role === "super_admin" || role === "manager";

  // Fetch all staff profiles for the "hand to" selector
  const { data: staffProfiles } = useQuery({
    queryKey: ["staff-profiles"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .eq("is_active", true);
      return (data || []).filter((p) => p.user_id !== user?.id);
    },
    enabled: !!user,
  });

  // Fetch handovers (RLS handles visibility: own + admin/manager see all)
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

  // Fetch user's sales totals (all time)
  const { data: userSalesTotals } = useQuery({
    queryKey: ["user-sales-totals", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("cash_amount, upi_amount, created_at")
        .eq("recorded_by", user!.id);
      if (error) throw error;
      const todayStart = startOfDay(new Date()).toISOString();
      const all = data || [];
      const todaySales = all.filter((s) => s.created_at >= todayStart);
      const pastSales = all.filter((s) => s.created_at < todayStart);
      return {
        totalCash: all.reduce((s, r) => s + Number(r.cash_amount), 0),
        totalUpi: all.reduce((s, r) => s + Number(r.upi_amount), 0),
        todayCash: todaySales.reduce((s, r) => s + Number(r.cash_amount), 0),
        todayUpi: todaySales.reduce((s, r) => s + Number(r.upi_amount), 0),
        pastCash: pastSales.reduce((s, r) => s + Number(r.cash_amount), 0),
        pastUpi: pastSales.reduce((s, r) => s + Number(r.upi_amount), 0),
      };
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

  // Separate my handovers vs all
  const myHandovers = useMemo(() =>
    (handovers || []).filter((h) => h.user_id === user?.id || h.handed_to === user?.id),
    [handovers, user?.id]
  );

  // Compute balances from my perspective
  const sentConfirmed = myHandovers
    .filter((h) => h.user_id === user?.id && h.status === "confirmed")
    .reduce((s, h) => s + Number(h.cash_amount) + Number(h.upi_amount), 0);
  const sentPending = myHandovers
    .filter((h) => h.user_id === user?.id && h.status === "awaiting_confirmation")
    .reduce((s, h) => s + Number(h.cash_amount) + Number(h.upi_amount), 0);
  const receivedConfirmed = myHandovers
    .filter((h) => h.handed_to === user?.id && h.status === "confirmed")
    .reduce((s, h) => s + Number(h.cash_amount) + Number(h.upi_amount), 0);

  // Today's received confirmed
  const todayStart = startOfDay(new Date()).toISOString();
  const todayReceivedConfirmed = myHandovers
    .filter((h) => h.handed_to === user?.id && h.status === "confirmed" && h.created_at >= todayStart)
    .reduce((s, h) => s + Number(h.cash_amount) + Number(h.upi_amount), 0);
  const pastReceivedConfirmed = receivedConfirmed - todayReceivedConfirmed;

  const salesTotalAll = (userSalesTotals?.totalCash || 0) + (userSalesTotals?.totalUpi || 0);
  const salesToday = (userSalesTotals?.todayCash || 0) + (userSalesTotals?.todayUpi || 0);
  const salesPast = (userSalesTotals?.pastCash || 0) + (userSalesTotals?.pastUpi || 0);

  const notHandedOver = salesTotalAll + receivedConfirmed - sentConfirmed - sentPending;
  const awaitingAmount = sentPending;

  // Breakdown for "Not Handed Over"
  // Sales = today's sales amount
  // Staff = today's received from staff
  // Past = carried forward from before today
  const breakdownSales = salesToday;
  const breakdownStaff = todayReceivedConfirmed;
  const breakdownPast = Math.max(0, notHandedOver - breakdownSales - breakdownStaff);

  // Incoming handovers awaiting my confirmation
  const incoming = myHandovers.filter((h) => h.handed_to === user?.id && h.status === "awaiting_confirmation");

  const handleCreate = async () => {
    if (!toUserId || !amount || Number(amount) <= 0) {
      toast.error("Select a recipient and enter a valid amount");
      return;
    }
    if (Number(amount) > Math.max(0, notHandedOver)) {
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
    else { toast.success("Handover confirmed"); qc.invalidateQueries({ queryKey: ["handovers"] }); }
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

  // Render a single handover card in the flow
  const HandoverCard = ({ item }: { item: typeof myHandovers[0] }) => {
    const isSender = item.user_id === user?.id;
    const isReceiver = item.handed_to === user?.id;
    const amount = Number(item.cash_amount) + Number(item.upi_amount);
    const borderColor = item.status === "confirmed" ? "border-l-success" :
      item.status === "rejected" ? "border-l-destructive" : "border-l-warning";

    return (
      <div className={`rounded-xl border bg-card p-4 border-l-4 ${borderColor}`}>
        <div className="flex items-start gap-3">
          <div className="flex items-center gap-1.5">
            <UserAvatar userId={item.user_id} />
            <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
            <UserAvatar userId={item.handed_to} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold">₹{amount.toLocaleString()}</p>
              <StatusBadge
                status={item.status === "confirmed" ? "active" : item.status === "rejected" ? "inactive" : "pending"}
                label={item.status === "confirmed" ? "Confirmed" : item.status === "rejected" ? "Rejected" : "Awaiting"}
              />
              {isSender && <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">You sent</span>}
              {isReceiver && <span className="text-xs bg-accent text-accent-foreground px-1.5 py-0.5 rounded-full">You received</span>}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              <span className="font-medium text-foreground">{getName(item.user_id)}</span>
              {" → "}
              <span className="font-medium text-foreground">{getName(item.handed_to)}</span>
              {" · "}
              {format(new Date(item.created_at), "dd MMM yyyy, hh:mm a")}
            </p>
            {item.notes && <p className="text-sm mt-1 italic text-muted-foreground">"{item.notes}"</p>}
          </div>
        </div>
      </div>
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Not Handed Over - with breakdown popover */}
        <Popover>
          <PopoverTrigger asChild>
            <div className="stat-card cursor-pointer hover:ring-2 hover:ring-primary/20 transition-all">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Not Handed Over</p>
                  <p className="text-xl font-bold">₹{Math.max(0, notHandedOver).toLocaleString()}</p>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-72" align="start">
            <div className="space-y-3">
              <p className="text-sm font-semibold text-foreground">Balance Breakdown</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <ShoppingCart className="h-3.5 w-3.5 text-primary" />
                    <span className="text-muted-foreground">Today's Sales</span>
                  </div>
                  <span className="font-semibold text-sm">₹{breakdownSales.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="h-3.5 w-3.5 text-primary" />
                    <span className="text-muted-foreground">From Staff (Today)</span>
                  </div>
                  <span className="font-semibold text-sm">₹{breakdownStaff.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-3.5 w-3.5 text-warning" />
                    <span className="text-muted-foreground">Carried Forward</span>
                  </div>
                  <span className="font-semibold text-sm">₹{breakdownPast.toLocaleString()}</span>
                </div>
                <div className="border-t pt-2 flex items-center justify-between">
                  <span className="text-sm font-semibold">Total</span>
                  <span className="font-bold text-primary">₹{Math.max(0, notHandedOver).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>

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
                    <p className="text-sm text-muted-foreground">From: <span className="font-medium text-foreground">{getName(item.user_id)}</span> · {format(new Date(item.created_at), "dd MMM yyyy, hh:mm a")}</p>
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

      {/* Flow tabs: My Handovers | All Handovers (admin/manager only) */}
      <Tabs defaultValue="mine" className="w-full">
        <TabsList>
          <TabsTrigger value="mine" className="gap-1.5"><Banknote className="h-3.5 w-3.5" /> My Handovers</TabsTrigger>
          {isAdminOrManager && (
            <TabsTrigger value="all" className="gap-1.5"><Users className="h-3.5 w-3.5" /> All Handovers</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="mine" className="space-y-3 mt-3">
          {myHandovers.length === 0 ? (
            <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">No handovers yet.</div>
          ) : myHandovers.map((item) => (
            <HandoverCard key={item.id} item={item} />
          ))}
        </TabsContent>

        {isAdminOrManager && (
          <TabsContent value="all" className="space-y-3 mt-3">
            {(handovers || []).length === 0 ? (
              <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">No handovers recorded.</div>
            ) : (handovers || []).map((item) => (
              <HandoverCard key={item.id} item={item} />
            ))}
          </TabsContent>
        )}
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
