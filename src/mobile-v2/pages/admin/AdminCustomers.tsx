import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  Users, 
  Search, 
  Filter,
  UserPlus,
  Mail,
  Phone,
  Shield,
  MoreVertical
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Section, Card, Badge, Loading, EmptyState } from "../../components/ui";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function AdminCustomers() {
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const { data: users, isLoading } = useQuery({
    queryKey: ["mobile-v2-admin-users", roleFilter],
    queryFn: async () => {
      let query = supabase
        .from("profiles")
        .select(`
          id,
          full_name,
          email,
          phone,
          role,
          is_active,
          created_at,
          user_roles:user_roles(role)
        `)
        .order("created_at", { ascending: false })
        .limit(50);

      if (roleFilter !== "all") {
        query = query.eq("role", roleFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const filteredUsers = users?.filter(user => {
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (
      user.full_name?.toLowerCase().includes(search) ||
      user.email?.toLowerCase().includes(search) ||
      user.phone?.toLowerCase().includes(search)
    );
  });

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "super_admin": return "danger";
      case "manager": return "warning";
      case "agent": return "info";
      case "marketer": return "success";
      case "pos": return "default";
      case "customer": return "secondary";
      default: return "default";
    }
  };

  if (isLoading) {
    return (
      <div className="mv2-page">
        <Loading.Skeleton className="h-12 mb-4" />
        <Loading.Skeleton className="h-12 mb-4" />
        {[1, 2, 3, 4].map(i => (
          <Loading.Skeleton key={i} className="h-20 mb-3" />
        ))}
      </div>
    );
  }

  // Role counts
  const roleCounts = users?.reduce((acc, u) => {
    const role = u.role || "unknown";
    acc[role] = (acc[role] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  return (
    <div className="mv2-page">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">Users</h1>
          <p className="text-sm text-muted-foreground">Manage all users</p>
        </div>
        <Button size="sm" className="mv2-btn-primary">
          <UserPlus className="w-4 h-4 mr-1" />
          Add
        </Button>
      </div>

      {/* Search & Filters */}
      <div className="space-y-3 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 mv2-input"
          />
        </div>

        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="mv2-input">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Filter by role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="super_admin">Super Admin</SelectItem>
            <SelectItem value="manager">Manager</SelectItem>
            <SelectItem value="agent">Agent</SelectItem>
            <SelectItem value="marketer">Marketer</SelectItem>
            <SelectItem value="pos">POS</SelectItem>
            <SelectItem value="customer">Customer</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Role Stats */}
      <div className="grid grid-cols-3 gap-2 mb-6">
        <Card className="p-3 text-center">
          <p className="text-lg font-bold text-primary">
            {(roleCounts["super_admin"] || 0) + (roleCounts["manager"] || 0)}
          </p>
          <p className="text-xs text-muted-foreground">Admins</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-lg font-bold text-blue-600">
            {(roleCounts["agent"] || 0) + (roleCounts["marketer"] || 0) + (roleCounts["pos"] || 0)}
          </p>
          <p className="text-xs text-muted-foreground">Staff</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-lg font-bold text-green-600">
            {roleCounts["customer"] || 0}
          </p>
          <p className="text-xs text-muted-foreground">Customers</p>
        </Card>
      </div>

      {/* Users List */}
      <Section title="All Users">
        {filteredUsers && filteredUsers.length > 0 ? (
          <div className="space-y-3">
            {filteredUsers.map((user) => (
              <Card key={user.id} variant="outline" className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Users className="w-6 h-6 text-primary" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-foreground truncate">
                        {user.full_name || "User"}
                      </p>
                      {!user.is_active && (
                        <Badge variant="danger" className="text-xs">Inactive</Badge>
                      )}
                    </div>

                    {user.email && (
                      <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground">
                        <Mail className="w-3 h-3" />
                        <span className="truncate">{user.email}</span>
                      </div>
                    )}

                    {user.phone && (
                      <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground">
                        <Phone className="w-3 h-3" />
                        <span>{user.phone}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant={getRoleBadgeVariant(user.role || "customer")}>
                        <Shield className="w-3 h-3 mr-1" />
                        {user.role || "customer"}
                      </Badge>
                    </div>
                  </div>

                  <Button variant="ghost" size="icon">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Users}
            title="No users found"
            description="Users will appear here"
          />
        )}
      </Section>
    </div>
  );
}
