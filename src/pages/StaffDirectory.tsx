/**
 * StaffDirectory - Card-based staff listing
 * Replaces table view with modern card layout
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/shared/PageHeader";
import { StaffCard } from "@/components/staff/StaffCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Users,
  Search,
  Filter,
  UserPlus,
  Building2,
  Wallet,
  Loader2,
  Grid3X3,
  List,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { startOfDay, endOfDay, format } from "date-fns";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

const ROLES = [
  { value: "all", label: "All Roles" },
  { value: "super_admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "agent", label: "Agent" },
  { value: "marketer", label: "Marketer" },
  { value: "operator", label: "Operator" },
];

const WAREHOUSE_FILTER = [
  { value: "all", label: "All Warehouses" },
  { value: "assigned", label: "Assigned Only" },
  { value: "unassigned", label: "Unassigned" },
];

export function StaffDirectory() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("active");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [disablingId, setDisablingId] = useState<string | null>(null);

  // Invite dialog state (phone is primary, email is optional)
  const [showInvite, setShowInvite] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [invitePhone, setInvitePhone] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("agent");
  const [inviteWarehouseId, setInviteWarehouseId] = useState("");
  const [inviteSaving, setInviteSaving] = useState(false);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteName.trim()) {
      toast.error("Full name is required");
      return;
    }
    if (!invitePhone.trim()) {
      toast.error("Phone number is required");
      return;
    }
    let normalizedPhone = invitePhone.trim();
    if (!normalizedPhone.startsWith('+')) {
      normalizedPhone = normalizedPhone.length === 10 ? `+91${normalizedPhone}` : normalizedPhone;
    }
    const digits = normalizedPhone.replace(/\D/g, '');
    if (digits.length < 10) {
      toast.error("Phone number must have at least 10 digits");
      return;
    }
    setInviteSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-staff", {
        body: {
          phone: normalizedPhone,
          email: inviteEmail.trim() || undefined,
          full_name: inviteName.trim(),
          role: inviteRole,
          warehouse_id: inviteWarehouseId || undefined,
        },
      });
      if (error || data?.error) {
        toast.error(data?.error || error?.message || "Failed to invite staff");
        return;
      }
      toast.success(`Pre-registered ${inviteName.trim()} as ${inviteRole}. They'll get their role when they sign in with this phone.`);
      setShowInvite(false);
      setInviteName("");
      setInvitePhone("");
      setInviteEmail("");
      setInviteRole("agent");
      setInviteWarehouseId("");
      queryClient.invalidateQueries({ queryKey: ["staff-directory-enriched"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to invite staff");
    } finally {
      setInviteSaving(false);
    }
  };

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const { data } = await supabase.from("warehouses").select("id, name");
      return data || [];
    },
  });

  // Fetch staff with enriched data
  const { data: staff, isLoading } = useQuery({
    queryKey: ["staff-directory-enriched", roleFilter, warehouseFilter, statusFilter],
    queryFn: async () => {
      // Get all staff users
      let query: any = (supabase
        .from("user_roles")
        .select(`
          user_id,
          role,
          warehouse_id,
          warehouses(name)
        ` as any) as any)
        .in("role", ["super_admin", "manager", "agent", "marketer", "operator"] as any);

      if (roleFilter !== "all") {
        query = query.eq("role", roleFilter as any);
      }

      if (warehouseFilter === "assigned") {
        query = query.not("warehouse_id", "is", null);
      } else if (warehouseFilter === "unassigned") {
        query = query.is("warehouse_id", null as any);
      }

      const { data: userRoles, error: rolesError } = await query;
      if (rolesError) throw rolesError;

      // Get user profiles
      const userIds = (userRoles ?? []).map((ur: any) => ur.user_id);
      const { data: profiles, error: profilesError } = await ((supabase as any)
        .from("profiles")
        .select("user_id, full_name, email, phone, avatar_url, is_active, created_at")
        .in("user_id", userIds)
        .eq("is_active", (statusFilter === "active" ? true : statusFilter === "inactive" ? false : true))) as any;

      if (profilesError) throw profilesError;

      // Get cash holdings
      const { data: cashAccounts, error: cashError } = await (supabase as any)
        .from("staff_cash_accounts")
        .select("user_id, cash_amount, upi_amount")
        .in("user_id", userIds);

      if (cashError) throw cashError;

      // Get stock counts
      const { data: stockData, error: stockError } = await (supabase as any)
        .from("staff_stock")
        .select("user_id, quantity")
        .in("user_id", userIds);

      if (stockError) throw stockError;

      // Get today's activity
      const today = new Date();
      const { data: todaySales, error: salesError } = await (supabase as any)
        .from("sales")
        .select("recorded_by, id")
        .gte("created_at", startOfDay(today).toISOString())
        .lte("created_at", endOfDay(today).toISOString())
        .in("recorded_by", userIds);

      if (salesError) throw salesError;

      const { data: todayTx, error: txError } = await (supabase as any)
        .from("transactions")
        .select("recorded_by, id, total_amount")
        .gte("created_at", startOfDay(today).toISOString())
        .lte("created_at", endOfDay(today).toISOString())
        .in("recorded_by", userIds);

      if (txError) throw txError;

      // Aggregate data
      const cashMap = new Map();
      (cashAccounts ?? []).forEach((c: any) => {
        cashMap.set(c.user_id, {
          cash_amount: c.cash_amount || 0,
          upi_amount: c.upi_amount || 0,
        });
      });

      const stockMap = new Map();
      (stockData ?? []).forEach((s: any) => {
        const current = stockMap.get(s.user_id) || 0;
        stockMap.set(s.user_id, current + (s.quantity || 0));
      });

      const salesCountMap = new Map();
      (todaySales ?? []).forEach((s: any) => {
        const current = salesCountMap.get(s.recorded_by) || 0;
        salesCountMap.set(s.recorded_by, current + 1);
      });

      const collectionsMap = new Map();
      (todayTx ?? []).forEach((t: any) => {
        const current = collectionsMap.get(t.recorded_by) || 0;
        collectionsMap.set(t.recorded_by, current + (t.total_amount || 0));
      });

      // Merge data
      const enrichedStaff = (userRoles ?? [])
        .map((ur: any) => {
          const profile = (profiles ?? []).find((p: any) => p.user_id === ur.user_id);
          if (!profile) return null;

          const cash = cashMap.get(ur.user_id) || { cash_amount: 0, upi_amount: 0 };

          return {
            id: ur.user_id,
            user_id: ur.user_id,
            full_name: profile.full_name || "Unknown",
            email: profile.email,
            phone: profile.phone,
            avatar_url: profile.avatar_url,
            role: ur.role,
            is_active: profile.is_active ?? true,
            warehouse_id: ur.warehouse_id,
            warehouses: ur.warehouses,
            created_at: profile.created_at,
            cash_amount: cash.cash_amount,
            upi_amount: cash.upi_amount,
            stock_count: stockMap.get(ur.user_id) || 0,
            today_sales: salesCountMap.get(ur.user_id) || 0,
            today_collections: collectionsMap.get(ur.user_id) || 0,
          };
        })
        .filter((x: any): x is NonNullable<typeof x> => !!x);

      return enrichedStaff || [];
    },
  });

  // Filter by search
  const filteredStaff = (staff ?? []).filter((s: any) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      s.full_name?.toLowerCase().includes(query) ||
      s.email?.toLowerCase().includes(query) ||
      s.phone?.toLowerCase().includes(query)
    );
  });

  // Stats
  const stats = {
    total: staff?.length || 0,
    active: (staff ?? []).filter((s: any) => s.is_active).length || 0,
    withHoldings: (staff ?? []).filter((s: any) => (s.cash_amount || 0) + (s.upi_amount || 0) > 0).length || 0,
    totalCash: (staff ?? []).reduce((sum: any, s: any) => sum + (s.cash_amount || 0) + (s.upi_amount || 0), 0) || 0,
  };

  const handleToggleActive = async (userId: string, currentActive: boolean) => {
    setDisablingId(userId);
    try {
      // 1. Kill/allow Supabase auth sessions
      const { error: banError } = await supabase.functions.invoke("toggle-user-ban", {
        body: { user_id: userId, ban: !currentActive },
      });
      if (banError) throw banError;

      // 2. Update staff_directory
      const { error: dirError } = await supabase
        .from("staff_directory" as any)
        .update({ is_active: !currentActive })
        .eq("user_id", userId);
      if (dirError) throw dirError;

      // 3. Update profiles (idempotent — toggle-user-ban already did this)
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ is_active: !currentActive })
        .eq("user_id", userId);
      if (profileError) throw profileError;

      toast.success(`Staff ${!currentActive ? "activated" : "deactivated"}`);
      queryClient.invalidateQueries({ queryKey: ["staff-directory-enriched"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to update status");
    } finally {
      setDisablingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Staff Directory"
          subtitle="Manage team members and their permissions"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[280px] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff Directory"
        subtitle={`${stats.total} team members • ₹${stats.totalCash.toLocaleString("en-IN")} total holdings`}
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Users className="h-4 w-4" />
            <span className="text-sm font-medium">Total Staff</span>
          </div>
          <p className="text-2xl font-bold">{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 text-green-600 mb-1">
            <UserPlus className="h-4 w-4" />
            <span className="text-sm font-medium">Active</span>
          </div>
          <p className="text-2xl font-bold">{stats.active}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 text-amber-600 mb-1">
            <Wallet className="h-4 w-4" />
            <span className="text-sm font-medium">With Holdings</span>
          </div>
          <p className="text-2xl font-bold">{stats.withHoldings}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 text-blue-600 mb-1">
            <Building2 className="h-4 w-4" />
            <span className="text-sm font-medium">Total Cash</span>
          </div>
          <p className="text-2xl font-bold">₹{stats.totalCash.toLocaleString("en-IN")}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 bg-white rounded-xl border p-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-[140px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r: any) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex border rounded-lg overflow-hidden">
            <Button
              variant={viewMode === "grid" ? "default" : "ghost"}
              size="icon"
              className="rounded-none"
              onClick={() => setViewMode("grid")}
            >
              <Grid3X3 className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "default" : "ghost"}
              size="icon"
              className="rounded-none"
              onClick={() => setViewMode("list")}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Results Count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {filteredStaff?.length || 0} of {staff?.length || 0} staff members
        </p>
        <Button onClick={() => setShowInvite(true)}>
          <UserPlus className="h-4 w-4 mr-2" />
          Invite Staff
        </Button>
      </div>

      {/* Staff Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {(filteredStaff ?? []).map((s: any) => (
          <StaffCard
            key={s.user_id}
            staff={s}
            onToggleActive={handleToggleActive}
          />
        ))}
      </div>

      {/* Empty State */}
      {filteredStaff?.length === 0 && (
        <div className="text-center py-12">
          <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No staff found</h3>
          <p className="text-muted-foreground">
            {searchQuery
              ? "Try adjusting your search or filters"
              : "Invite your first team member"}
          </p>
        </div>
      )}

      {/* Invite Staff Dialog — phone is primary, email is optional */}
      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent>
          <DialogHeader><DialogTitle>Pre-register Staff</DialogTitle></DialogHeader>
          <form onSubmit={handleInvite} className="space-y-4">
            <div>
              <Label htmlFor="invite-name">Full Name *</Label>
              <Input
                id="invite-name"
                placeholder="John Doe"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                required
                disabled={inviteSaving}
              />
            </div>
            <div>
              <Label htmlFor="invite-phone">Phone Number *</Label>
              <Input
                id="invite-phone"
                placeholder="9876543210 or +919876543210"
                value={invitePhone}
                onChange={(e) => setInvitePhone(e.target.value)}
                required
                disabled={inviteSaving}
              />
              <p className="text-xs text-muted-foreground mt-1">Staff will sign in with this phone number via OTP</p>
            </div>
            <div>
              <Label htmlFor="invite-email">Email <span className="text-xs text-muted-foreground">(optional)</span></Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="staff@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                disabled={inviteSaving}
              />
            </div>
            <div>
              <Label htmlFor="invite-role">Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole} disabled={inviteSaving}>
                <SelectTrigger id="invite-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="agent">Agent</SelectItem>
                  <SelectItem value="marketer">Marketer</SelectItem>
                  <SelectItem value="operator">Operator</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="invite-warehouse">Warehouse</Label>
              <Select value={inviteWarehouseId} onValueChange={setInviteWarehouseId} disabled={inviteSaving}>
                <SelectTrigger id="invite-warehouse">
                  <SelectValue placeholder="No warehouse" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No warehouse</SelectItem>
                  {warehouses.map((w: any) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Staff will get their assigned role when they sign in via phone OTP. Email is optional — used for password reset if provided.
            </p>
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowInvite(false)} disabled={inviteSaving} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" disabled={inviteSaving} className="flex-1">
                {inviteSaving ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Registering...</>
                ) : (
                  "Register Staff"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default StaffDirectory;
