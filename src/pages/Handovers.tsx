import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import {
  Banknote, CheckCircle, Clock, AlertCircle, Loader2, Send,
  ArrowDownLeft, XCircle, User, ChevronDown, Users, ShoppingCart, Wallet, Eye
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermission } from "@/hooks/usePermission";
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
import { format, startOfDay } from "date-fns";

const Handovers = () => {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [toUserId, setToUserId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isAdminOrManager = role === "super_admin" || role === "manager";
  const { allowed: isFinalizer } = usePermission("finalizer");
  const { allowed: canSeeBalances } = usePermission("see_handover_balance");

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
      return {
        totalCash: all.reduce((s, r) => s + Number(r.cash_amount), 0),
        totalUpi: all.reduce((s, r) => s + Number(r.upi_amount), 0),
        todayCash: todaySales.reduce((s, r) => s + Number(r.cash_amount), 0),
        todayUpi: todaySales.reduce((s, r) => s + Number(r.upi_amount), 0),
      };
    },
    enabled: !!user,
  });

  const { data: profileMap } = useQuery({
    queryKey: ["profile-map"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name, avatar_url");
      const map: Record<string, { name: string; avatar: string | null }> = {};
      (data || []).forEach((p) => { map[p.user_id] = { name: p.full_name, avatar: p.avatar_url }; });
      return map;
    },
  });

  // For "See Balances" tab: fetch all staff sales and compute balances
  const { data: allStaffBalances } = useQuery({
    queryKey: ["all-staff-balances"],
    queryFn: async () => {
      // Get all staff user IDs
      const { data: roles } = await supabase.from("user_roles").select("user_id, role").neq("role", "customer");
      const staffIds = (roles || []).map((r) => r.user_id);

      // Get all sales
      const { data: allSales } = await supabase.from("sales").select("recorded_by, cash_amount, upi_amount");

      // Get all handovers
      const { data: allHandovers } = await supabase.from("handovers").select("user_id, handed_to, cash_amount, upi_amount, status");

      const balances: Record<string, { sales: number; received: number; sentConfirmed: number; sentPending: number; total: number }> = {};

      for (const uid of staffIds) {
        const sales = (allSales || []).filter((s) => s.recorded_by === uid)
          .reduce((s, r) => s + Number(r.cash_amount) + Number(r.upi_amount), 0);
        const received = (allHandovers || []).filter((h) => h.handed_to === uid && h.status === "confirmed")
          .reduce((s, h) => s + Number(h.cash_amount) + Number(h.upi_amount), 0);
        const sentConfirmed = (allHandovers || []).filter((h) => h.user_id === uid && h.status === "confirmed")
          .reduce((s, h) => s + Number(h.cash_amount) + Number(h.upi_amount), 0);
        const sentPending = (allHandovers || []).filter((h) => h.user_id === uid && h.status === "awaiting_confirmation")
          .reduce((s, h) => s + Number(h.cash_amount) + Number(h.upi_amount), 0);
        const total = sales + received - sentConfirmed - sentPending;
        balances[uid] = { sales, received, sentConfirmed, sentPending, total };
      }
      return balances;
    },
    enabled: canSeeBalances,
  });

  const myHandovers = useMemo(() =>
    (handovers || []).filter((h) => h.user_id === user?.id || h.handed_to === user?.id),
    [handovers, user?.id]
  );

  const sentConfirmed = myHandovers
    .filter((h) => h.user_id === user?.id && h.status === "confirmed")
    .reduce((s, h) => s + Number(h.cash_amount) + Number(h.upi_amount), 0);
  const sentPending = myHandovers
    .filter((h) => h.user_id === user?.id && h.status === "awaiting_confirmation")
    .reduce((s, h) => s + Number(h.cash_amount) + Number(h.upi_amount), 0);
  const receivedConfirmed = myHandovers
    .filter((h) => h.handed_to === user?.id && h.status === "confirmed")
    .reduce((s, h) => s + Number(h.cash_amount) + Number(h.upi_amount), 0);

  const todayStart = startOfDay(new Date()).toISOString();
  const todayReceivedConfirmed = myHandovers
    .filter((h) => h.handed_to === user?.id && h.status === "confirmed" && h.created_at >= todayStart)
    .reduce((s, h) => s + Number(h.cash_amount) + Number(h.upi_amount), 0);

  const salesTotalAll = (userSalesTotals?.totalCash || 0) + (userSalesTotals?.totalUpi || 0);
  const salesToday = (userSalesTotals?.todayCash || 0) + (userSalesTotals?.todayUpi || 0);

  const notHandedOver = salesTotalAll + receivedConfirmed - sentConfirmed - sentPending;
  const awaitingAmount = sentPending;

  const breakdownSales = salesToday;
  const breakdownStaff = todayReceivedConfirmed;
  const breakdownPast = Math.max(0, notHandedOver - breakdownSales - breakdownStaff);

  const incoming = myHandovers.filter((h) => h.handed_to === user?.id && h.status === "awaiting_confirmation");

  const handleCreate = async () => {
    if (!toUserId || !amount || Number(amount) <= 0) {
      toast.error("Select a recipient and enter a valid amount");
      return;
    }
    if (!isFinalizer && Number(amount) > Math.max(0, notHandedOver)) {
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
    else { toast.success("Handover rejected"); qc.invalidateQueries({ queryKey: ["handovers"] }); }
  };

  const getProfile = (userId: string | null) => profileMap?.[userId || ""] || { name: "Unknown", avatar: null };
  const getName = (userId: string | null) => getProfile(userId).name;
  const getInitials = (name: string) => name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  const UserAvatar = ({ userId, size = "sm" }: { userId: string | null; size?: "sm" | "md" | "lg" }) => {
    const p = getProfile(userId);
    const cls = size === "lg" ? "h-10 w-10" : size === "md" ? "h-9 w-9" : "h-7 w-7";
    const textCls = size === "lg" ? "text-sm" : size === "md" ? "text-xs" : "text-[10px]";
    return (
      <Avatar className={`${cls} ring-2 ring-background`}>
        <AvatarImage src={p.avatar || undefined} alt={p.name} />
        <AvatarFallback className={`bg-primary/10 text-primary font-semibold ${textCls}`}>
          {getInitials(p.name) || <User className="h-3 w-3" />}
        </AvatarFallback>
      </Avatar>
    );
  };

  const HandoverCard = ({ item, showActions = false }: { item: typeof myHandovers[0]; showActions?: boolean }) => {
    const isSender = item.user_id === user?.id;
    const isReceiver = item.handed_to === user?.id;
    const total = Number(item.cash_amount) + Number(item.upi_amount);
    const statusLabel = item.status === "confirmed" ? "Confirmed" : item.status === "rejected" ? "Rejected" : "Pending";

    return (
      <div className="group flex items-center gap-4 rounded-lg border bg-card px-4 py-3 hover:shadow-sm transition-shadow">
        <div className="flex items-center -space-x-2.5 shrink-0">
          <UserAvatar userId={item.user_id} size="lg" />
          <UserAvatar userId={item.handed_to} size="lg" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-bold tabular-nums">₹{total.toLocaleString()}</span>
            <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${
              item.status === "confirmed" ? "bg-success/10 text-success" :
              item.status === "rejected" ? "bg-destructive/10 text-destructive" :
              "bg-warning/10 text-warning"
            }`}>{statusLabel}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {getName(item.user_id)} → {getName(item.handed_to)}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[11px] text-muted-foreground">
              {format(new Date(item.created_at), "dd MMM, hh:mm a")}
            </span>
            {isSender && (
              <span className="text-[10px] font-medium bg-primary/8 text-primary px-1.5 py-px rounded">Sent</span>
            )}
            {isReceiver && (
              <span className="text-[10px] font-medium bg-accent text-accent-foreground px-1.5 py-px rounded">Received</span>
            )}
          </div>
          {item.notes && (
            <p className="text-[11px] text-muted-foreground/70 italic mt-1 truncate">"{item.notes}"</p>
          )}
        </div>

        {showActions && (
          <div className="flex flex-col gap-1.5 shrink-0">
            <Button size="sm" className="h-7 text-xs gap-1 px-2.5" onClick={() => handleConfirm(item.id)}>
              <CheckCircle className="h-3 w-3" /> Accept
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 px-2.5 text-destructive hover:text-destructive" onClick={() => handleReject(item.id)}>
              <XCircle className="h-3 w-3" /> Reject
            </Button>
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const balanceLabel = isFinalizer ? "Total Income" : "Not Handed Over";
  const balanceColor = isFinalizer ? "text-success" : "text-destructive";

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader
        title="Handovers"
        subtitle="Track money flow between team members"
        primaryAction={!isFinalizer ? { label: "Create Handover", icon: Send, onClick: () => setCreateOpen(true) } : undefined}
      />

      {/* Balance Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Popover>
          <PopoverTrigger asChild>
            <button className="stat-card text-left w-full cursor-pointer hover:ring-2 hover:ring-primary/20 transition-all group">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-muted-foreground">{balanceLabel}</span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <p className={`text-xl font-bold ${balanceColor}`}>₹{Math.max(0, notHandedOver).toLocaleString()}</p>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" align="start">
            <p className="text-xs font-semibold text-foreground mb-2.5">Balance Breakdown</p>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ShoppingCart className="h-3 w-3" /> Sales (Today)
                </span>
                <span className="text-xs font-semibold">₹{breakdownSales.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users className="h-3 w-3" /> Staff (Today)
                </span>
                <span className="text-xs font-semibold">₹{breakdownStaff.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" /> Carried Forward
                </span>
                <span className="text-xs font-semibold">₹{breakdownPast.toLocaleString()}</span>
              </div>
              <div className="border-t pt-1.5 flex items-center justify-between">
                <span className="text-xs font-bold">Total</span>
                <span className="text-xs font-bold text-primary">₹{Math.max(0, notHandedOver).toLocaleString()}</span>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <div className="stat-card">
          <div className="mb-1">
            <span className="text-xs font-medium text-muted-foreground">Awaiting Confirmation</span>
          </div>
          <p className="text-xl font-bold text-warning">₹{awaitingAmount.toLocaleString()}</p>
        </div>
      </div>

      {/* Incoming requiring action */}
      {incoming.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-warning flex items-center gap-1.5 uppercase tracking-wide">
            <ArrowDownLeft className="h-3.5 w-3.5" /> Action Required ({incoming.length})
          </h3>
          <div className="space-y-2">
            {incoming.map((item) => (
              <HandoverCard key={item.id} item={item} showActions />
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="mine" className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="mine" className="flex-1 gap-1.5 text-xs">
            <Banknote className="h-3.5 w-3.5" /> My Handovers
          </TabsTrigger>
          {isAdminOrManager && (
            <TabsTrigger value="all" className="flex-1 gap-1.5 text-xs">
              <Users className="h-3.5 w-3.5" /> All Handovers
            </TabsTrigger>
          )}
          {canSeeBalances && (
            <TabsTrigger value="balances" className="flex-1 gap-1.5 text-xs">
              <Eye className="h-3.5 w-3.5" /> Balances
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="mine" className="space-y-2 mt-3">
          {myHandovers.filter(h => !(h.handed_to === user?.id && h.status === "awaiting_confirmation")).length === 0 ? (
            <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">No handovers yet.</div>
          ) : myHandovers
            .filter(h => !(h.handed_to === user?.id && h.status === "awaiting_confirmation"))
            .map((item) => <HandoverCard key={item.id} item={item} />)}
        </TabsContent>

        {isAdminOrManager && (
          <TabsContent value="all" className="space-y-2 mt-3">
            {(handovers || []).length === 0 ? (
              <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">No handovers recorded.</div>
            ) : (handovers || []).map((item) => <HandoverCard key={item.id} item={item} />)}
          </TabsContent>
        )}

        {canSeeBalances && (
          <TabsContent value="balances" className="space-y-2 mt-3">
            {!allStaffBalances || Object.keys(allStaffBalances).length === 0 ? (
              <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">No staff balances to show.</div>
            ) : (
              <div className="space-y-2">
                {Object.entries(allStaffBalances)
                  .sort(([, a], [, b]) => b.total - a.total)
                  .map(([uid, bal]) => {
                    const withUser = bal.total + bal.sentPending; // awaiting is still "with" the user
                    return (
                      <div key={uid} className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
                        <UserAvatar userId={uid} size="lg" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{getName(uid)}</p>
                          <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                            <span>Sales: ₹{bal.sales.toLocaleString()}</span>
                            <span>Received: ₹{bal.received.toLocaleString()}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-base font-bold tabular-nums ${withUser > 0 ? "text-destructive" : "text-success"}`}>
                            ₹{Math.max(0, withUser).toLocaleString()}
                          </p>
                          {bal.sentPending > 0 && (
                            <p className="text-[10px] text-warning">₹{bal.sentPending.toLocaleString()} awaiting</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
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
            <div className="rounded-lg bg-primary/5 p-3 text-center">
              <p className="text-xs text-muted-foreground">Available Balance</p>
              <p className="text-2xl font-bold text-primary">₹{Math.max(0, notHandedOver).toLocaleString()}</p>
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
