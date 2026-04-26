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

  // Fetch staff with enriched data
  const { data: staff, isLoading } = useQuery({
    queryKey: ["staff-directory-enriched", roleFilter, warehouseFilter, statusFilter],
    queryFn: async () => {
      // Get all staff users
      let query = supabase
.from("user_roles")
      .select(`
        user_id,
        role,
        warehouse_id,
        warehouses(name)
      `)
        .in("role", ["super_admin", "manager", "agent", "marketer", "operator"]);

      if (roleFilter !== "all") {
        query = query.eq("role", roleFilter);
      }

      if (warehouseFilter === "assigned") {
        query = query.not("warehouse_id", "is", null);
      } else if (warehouseFilter === "unassigned") {
        query = query.is("warehouse_id", null);
      }

      const { data: userRoles, error: rolesError } = await query;
      if (rolesError) throw rolesError;

      // Get user profiles
      const userIds = userRoles?.map((ur) => ur.user_id) || [];
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, full_name, email, phone, avatar_url, is_active, created_at")
        .in("user_id", userIds)
        .eq("is_active", statusFilter === "active" ? true : statusFilter === "inactive" ? false : true);

      if (profilesError) throw profilesError;

      // Get cash holdings
      const { data: cashAccounts, error: cashError } = await supabase
        .from("staff_cash_accounts")
        .select("user_id, cash_amount, upi_amount")
        .in("user_id", userIds);

      if (cashError) throw cashError;

      // Get stock counts
      const { data: stockData, error: stockError } = await supabase
        .from("staff_stock")
        .select("user_id, quantity")
        .in("user_id", userIds);

      if (stockError) throw stockError;

      // Get today's activity
      const today = new Date();
      const { data: todaySales, error: salesError } = await supabase
        .from("sales")
        .select("recorded_by, id")
        .gte("created_at", startOfDay(today).toISOString())
        .lte("created_at", endOfDay(today).toISOString())
        .in("recorded_by", userIds);

      if (salesError) throw salesError;

      const { data: todayTx, error: txError } = await supabase
        .from("transactions")
        .select("recorded_by, id, total_amount")
        .gte("created_at", startOfDay(today).toISOString())
        .lte("created_at", endOfDay(today).toISOString())
        .in("recorded_by", userIds);

      if (txError) throw txError;

      // Aggregate data
      const cashMap = new Map();
      cashAccounts?.forEach((c) => {
        cashMap.set(c.user_id, {
          cash_amount: c.cash_amount || 0,
          upi_amount: c.upi_amount || 0,
        });
      });

      const stockMap = new Map();
      stockData?.forEach((s) => {
        const current = stockMap.get(s.user_id) || 0;
        stockMap.set(s.user_id, current + (s.quantity || 0));
      });

      const salesCountMap = new Map();
      todaySales?.forEach((s) => {
        const current = salesCountMap.get(s.recorded_by) || 0;
        salesCountMap.set(s.recorded_by, current + 1);
      });

      const collectionsMap = new Map();
      todayTx?.forEach((t) => {
        const current = collectionsMap.get(t.recorded_by) || 0;
        collectionsMap.set(t.recorded_by, current + (t.total_amount || 0));
      });

      // Merge data
      const enrichedStaff = userRoles
        ?.map((ur) => {
          const profile = profiles?.find((p) => p.user_id === ur.user_id);
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
        .filter(Boolean);

      return enrichedStaff || [];
    },
  });

  // Filter by search
  const filteredStaff = staff?.filter((s) => {
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
    active: staff?.filter((s) => s.is_active).length || 0,
    withHoldings: staff?.filter((s) => (s.cash_amount || 0) + (s.upi_amount || 0) > 0).length || 0,
    totalCash: staff?.reduce((sum, s) => sum + (s.cash_amount || 0) + (s.upi_amount || 0), 0) || 0,
  };

  const handleToggleActive = async (userId: string, active: boolean) => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ is_active: active })
        .eq("user_id", userId);

      if (error) throw error;

      toast.success(`Staff ${active ? "activated" : "deactivated"}`);
      queryClient.invalidateQueries({ queryKey: ["staff-directory-enriched"] });
    } catch (error) {
      toast.error("Failed to update status");
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
              {ROLES.map((r) => (
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
        <Button onClick={() => navigate("/staff/invite")}>
          <UserPlus className="h-4 w-4 mr-2" />
          Invite Staff
        </Button>
      </div>

      {/* Staff Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredStaff?.map((s) => (
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
    </div>
  );
}

export default StaffDirectory;
