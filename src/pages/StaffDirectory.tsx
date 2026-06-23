/**
 * StaffDirectory - Refactored page for managing team members.
 * Enables admin/manager to invite staff, view cards with holdings/permissions/activity,
 * and navigate to detailed profiles.
 */

import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStaffDirectory } from "@/hooks/useStaffDirectory";
import { PageHeader } from "@/components/shared/PageHeader";
import { StaffCard } from "@/components/staff/StaffCard";
import { InvitationCard } from "@/components/staff/InvitationCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
  ChevronLeft,
  ChevronRight,
  Clock,
} from "lucide-react";
import { STAFF_ROLE_OPTIONS, INVITABLE_ROLES } from "@/types/staff";
import type { AppRole } from "@/types/roles";
import { cn } from "@/lib/utils";

export function StaffDirectory() {
  const {
    staff,
    allStaff,
    pendingInvitations,
    pendingCount,
    isLoading,
    invitesLoading,
    stats,
    filters,
    setFilters,
    page,
    totalPages,
    setPage,
    PAGE_SIZE,
    inviteStaff,
    toggleActive,
  } = useStaffDirectory();

  // Invite dialog state
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    role: "agent" as AppRole,
    warehouse_id: "none" as string,
  });
  const [inviteSaving, setInviteSaving] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Fetch warehouses for invite form
  // (In production, use a proper hook; here inline for self-containment)
  const [warehouses, setWarehouses] = useState<Array<{ id: string; name: string }>>([]);
  const [warehousesLoading, setWarehousesLoading] = useState(false);

  const loadWarehouses = async () => {
    if (warehouses.length > 0 || warehousesLoading) return;
    setWarehousesLoading(true);
    try {
      const { data } = await (supabase as any).from("warehouses").select("id, name");
      setWarehouses(data || []);
    } finally {
      setWarehousesLoading(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteForm.full_name.trim()) {
      toast.error("Full name is required");
      return;
    }
    if (!inviteForm.phone.trim()) {
      toast.error("Phone number is required");
      return;
    }

    setInviteSaving(true);
    try {
      await inviteStaff({
        full_name: inviteForm.full_name.trim(),
        phone: inviteForm.phone.trim(),
        email: inviteForm.email.trim() || null,
        role: inviteForm.role,
        warehouse_id: inviteForm.warehouse_id === "none" ? null : inviteForm.warehouse_id,
      });

      toast.success(`Pre-registered ${inviteForm.full_name.trim()} as ${inviteForm.role}. They'll get their role when they sign in with this phone.`);
      setShowInvite(false);
      setInviteForm({ full_name: "", phone: "", email: "", role: "agent", warehouse_id: "none" });
    } catch (err: any) {
      toast.error(err.message || "Failed to invite staff");
    } finally {
      setInviteSaving(false);
    }
  };

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Staff Directory" subtitle="Manage team members and their permissions" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <div className={cn("grid gap-4", viewMode === "grid" ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "grid-cols-1")}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[340px] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Page Header ───────────────────────────────────────────────── */}
      <PageHeader
        title="Staff Directory"
        subtitle={`${stats.total} team members • ₹${stats.totalCash.toLocaleString("en-IN")} cash • ₹${stats.totalStockValue.toLocaleString("en-IN")} stock`}
      />

      {/* ── Stats Cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <StatCard icon={<Users className="h-4 w-4" />} label="Total Staff" value={stats.total} color="text-foreground" />
        <StatCard icon={<UserPlus className="h-4 w-4" />} label="Active" value={stats.active} color="text-green-600" />
        <StatCard icon={<Clock className="h-4 w-4" />} label="Pending" value={pendingCount} color="text-amber-600" />
        <StatCard icon={<Wallet className="h-4 w-4" />} label="With Holdings" value={stats.withHoldings} color="text-amber-600" />
        <StatCard icon={<Building2 className="h-4 w-4" />} label="Total Cash" value={`₹${stats.totalCash.toLocaleString("en-IN")}`} color="text-blue-600" />
      </div>

      {/* ── Filters Bar ────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 bg-white rounded-xl border p-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, phone..."
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={filters.role} onValueChange={(v) => setFilters((f) => ({ ...f, role: v as any }))}>
            <SelectTrigger className="w-[140px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STAFF_ROLE_OPTIONS.map((r) => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.status} onValueChange={(v) => setFilters((f) => ({ ...f, status: v as any }))}>
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
            <Button variant={viewMode === "grid" ? "default" : "ghost"} size="icon" className="rounded-none" onClick={() => setViewMode("grid")}>
              <Grid3X3 className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === "list" ? "default" : "ghost"} size="icon" className="rounded-none" onClick={() => setViewMode("list")}>
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* ── Results + Invite Button ──────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {allStaff.length} staff{allStaff.length !== 1 ? "" : ""}
          {pendingInvitations.length > 0 && ` + ${pendingInvitations.length} pending`}
          {filters.search && ` matching "${filters.search}"`}
        </p>
        <Button onClick={() => { setShowInvite(true); loadWarehouses(); }}>
          <UserPlus className="h-4 w-4 mr-2" />
          Invite Staff
        </Button>
      </div>

      {/* ── Pending Invitations Section ──────────────────────────────── */}
      {!invitesLoading && pendingInvitations.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Pending Invitations ({pendingInvitations.length})
          </h4>
          <div className={cn(
            "gap-4",
            viewMode === "grid"
              ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
              : "flex flex-col"
          )}>
            {pendingInvitations.map((inv) => (
              <InvitationCard key={inv.id} invitation={inv} />
            ))}
          </div>
        </div>
      )}

      {/* ── Staff Grid / List ────────────────────────────────────────── */}
      {staff.length > 0 && (
        <div>
          {pendingInvitations.length > 0 && (
            <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <Users className="h-4 w-4" />
              Active Staff ({allStaff.length})
            </h4>
          )}
          <div className={cn(
            "gap-4",
            viewMode === "grid"
              ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
              : "flex flex-col"
          )}>
            {staff.map((s) => (
              <StaffCard key={s.user_id} staff={s} onToggleActive={toggleActive} />
            ))}
          </div>
        </div>
      )}

      {/* ── Empty State ────────────────────────────────────────────────── */}
      {allStaff.length === 0 && pendingInvitations.length === 0 && (
        <div className="text-center py-12">
          <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No staff found</h3>
          <p className="text-muted-foreground">
            {filters.search ? "Try adjusting your search or filters" : "Invite your first team member"}
          </p>
        </div>
      )}

      {/* ── Pagination ─────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Invite Dialog ──────────────────────────────────────────────── */}
      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Pre-register Staff</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleInvite} className="space-y-4">
            <div>
              <Label htmlFor="invite-name">Full Name *</Label>
              <Input
                id="invite-name"
                placeholder="John Doe"
                value={inviteForm.full_name}
                onChange={(e) => setInviteForm((f) => ({ ...f, full_name: e.target.value }))}
                required
                disabled={inviteSaving}
              />
            </div>
            <div>
              <Label htmlFor="invite-phone">Phone Number *</Label>
              <Input
                id="invite-phone"
                placeholder="9876543210 or +919876543210"
                value={inviteForm.phone}
                onChange={(e) => setInviteForm((f) => ({ ...f, phone: e.target.value }))}
                required
                disabled={inviteSaving}
                type="tel"
              />
              <p className="text-xs text-muted-foreground mt-1">Staff will sign in with this phone number via OTP</p>
            </div>
            <div>
              <Label htmlFor="invite-email">Email <span className="text-xs text-muted-foreground">(optional)</span></Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="staff@example.com"
                value={inviteForm.email}
                onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
                disabled={inviteSaving}
              />
            </div>
            <div>
              <Label htmlFor="invite-role">Role</Label>
              <Select value={inviteForm.role} onValueChange={(v) => setInviteForm((f) => ({ ...f, role: v as AppRole }))} disabled={inviteSaving}>
                <SelectTrigger id="invite-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INVITABLE_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="invite-warehouse">Warehouse</Label>
              <Select value={inviteForm.warehouse_id} onValueChange={(v) => setInviteForm((f) => ({ ...f, warehouse_id: v }))} disabled={inviteSaving}>
                <SelectTrigger id="invite-warehouse">
                  <SelectValue placeholder="No warehouse" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No warehouse</SelectItem>
                  {warehouses.map((w) => (
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

// ── Helper: Stat Card ──────────────────────────────────────────────────────
function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl border p-4">
      <div className={cn("flex items-center gap-2 mb-1", color)}>
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

export default StaffDirectory;
