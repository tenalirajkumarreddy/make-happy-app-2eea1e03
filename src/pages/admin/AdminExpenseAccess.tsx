import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Save, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/PageHeader";
import type { AppRole } from "@/types/roles";

interface Category {
  id: string;
  name: string;
  color?: string;
  icon?: string;
}

interface AccessRule {
  id: string;
  user_id?: string;
  role?: AppRole;
  category_id: string;
}

interface User {
  user_id: string;
  full_name: string;
  phone?: string;
  role: AppRole;
}

const ALL_ROLES: AppRole[] = ["agent", "marketer", "operator", "manager"];

export default function AdminExpenseAccess() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"roles">("roles");
  const [savingCells, setSavingCells] = useState<Set<string>>(new Set());
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    document.title = "Expense Access";
  }, []);

  // Fetch all expense categories
  const { data: categories = [], isLoading: loadingCategories } = useQuery({
    queryKey: ["expense-categories-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_categories")
        .select("id, name, color, icon")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as Category[];
    },
  });

  // Fetch all access rules
  const { data: accessRules = [], isLoading: loadingRules } = useQuery({
    queryKey: ["expense-category-access-rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_category_access")
        .select("*");
      if (error) throw error;
      return data as AccessRule[];
    },
  });

  // Fetch users with their roles
  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ["all-users-with-roles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, phone")
        .order("full_name");
      if (error) throw error;

      // Get roles for each user
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role");

      return (data || []).map((user) => {
        const userRole = roles?.find((r) => r.user_id === user.user_id);
        return {
          ...user,
          role: (userRole?.role || "agent") as AppRole,
        };
      });
    },
  });

  // Check if a role has access to a category
  // Rules in table = DENY rules (default is ALLOW all)
  const hasRoleAccess = (role: AppRole, categoryId: string) => {
    // Check for explicit DENY rule
    const denyRule = accessRules.find(
      (r) => r.role === role && r.category_id === categoryId
    );
    // If there's a rule, it means DENY → return false
    // If no rule, default is ALLOW → return true
    return !denyRule;
  };

  // Check if a user has access to a category (user-specific takes precedence)
  const hasUserAccess = (userId: string, categoryId: string) => {
    // First check user-specific DENY rule
    const userDenyRule = accessRules.find(
      (r) => r.user_id === userId && r.category_id === categoryId
    );
    if (userDenyRule) return false; // User-specific deny

    // Get user's role
    const user = users.find((u) => u.user_id === userId);
    if (!user) return true;

    // Check role-based access (DENY rule)
    return hasRoleAccess(user.role, categoryId);
  };

  // Toggle access for a role (DENY model: rule in table = denied)
  const toggleRoleAccess = async (role: AppRole, categoryId: string) => {
    const cellKey = `${role}-${categoryId}`;
    setSavingCells((prev) => new Set(prev).add(cellKey));

    try {
      const existingRule = accessRules.find(
        (r) => r.role === role && r.category_id === categoryId
      );

      if (existingRule) {
        // Remove the rule → ALLOW access
        await supabase
          .from("expense_category_access")
          .delete()
          .eq("id", existingRule.id);
      } else {
        // Add DENY rule → Block access
        const { error } = await supabase
          .from("expense_category_access")
          .insert({
            role: role,
            category_id: categoryId,
          });
        if (error) throw error;
      }

      queryClient.invalidateQueries({ queryKey: ["expense-category-access-rules"] });
      toast.success("Access updated");
    } catch (error: any) {
      toast.error(error.message || "Failed to update access");
    } finally {
      setSavingCells((prev) => {
        const next = new Set(prev);
        next.delete(cellKey);
        return next;
      });
    }
  };

  // Toggle access for a user (user-specific DENY override)
  const toggleUserAccess = async (userId: string, categoryId: string) => {
    const cellKey = `user-${userId}-${categoryId}`;
    setSavingCells((prev) => new Set(prev).add(cellKey));

    try {
      const existingRule = accessRules.find(
        (r) => r.user_id === userId && r.category_id === categoryId
      );

      if (existingRule) {
        // Remove the rule → ALLOW (inherit from role)
        await supabase
          .from("expense_category_access")
          .delete()
          .eq("id", existingRule.id);
      } else {
        // Add DENY rule → Block this user from category
        const { error } = await supabase
          .from("expense_category_access")
          .insert({
            user_id: userId,
            category_id: categoryId,
          });
        if (error) throw error;
      }

      queryClient.invalidateQueries({ queryKey: ["expense-category-access-rules"] });
      toast.success("Access updated");
    } catch (error: any) {
      toast.error(error.message || "Failed to update access");
    } finally {
      setSavingCells((prev) => {
        const next = new Set(prev);
        next.delete(cellKey);
        return next;
      });
    }
  };

  // Reset all access rules to default (allow all)
  const resetAllAccess = async () => {
    if (!confirm("Reset all access rules? This will remove all custom rules.")) {
      return;
    }

    try {
      const { error } = await supabase
        .from("expense_category_access")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000"); // Delete all

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["expense-category-access-rules"] });
      toast.success("All access rules reset");
    } catch (error: any) {
      toast.error(error.message || "Failed to reset access rules");
    }
  };

  const isLoading = loadingCategories || loadingRules || loadingUsers;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader
        title="Expense Category Access"
        subtitle="Control which expense categories users and roles can access"
        actions={[
          {
            label: "Reset All",
            icon: RotateCcw,
            onClick: resetAllAccess,
            variant: "outline",
          },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Role-Based Access Matrix</CardTitle>
          <p className="text-sm text-muted-foreground">
            Check the boxes to allow access. Unchecked means denied. By default, all roles have access to all categories.
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-3 text-left font-medium sticky left-0 bg-muted/50 z-10 min-w-[150px]">
                    Role
                  </th>
                  {categories.map((cat) => (
                    <th key={cat.id} className="p-3 text-center font-medium min-w-[120px]">
                      <div className="flex flex-col items-center gap-1">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: cat.color || "#6366f1" }}
                        />
                        <span className="text-xs">{cat.name}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ALL_ROLES.map((role) => (
                  <tr key={role} className="border-b hover:bg-muted/20">
                    <td className="p-3 sticky left-0 bg-card z-10">
                      <Badge variant="outline" className="capitalize">
                        {role}
                      </Badge>
                    </td>
                    {categories.map((cat) => {
                      const cellKey = `${role}-${cat.id}`;
                      const isSaving = savingCells.has(cellKey);
                      const isAllowed = hasRoleAccess(role, cat.id);

                      return (
                        <td key={cat.id} className="p-3 text-center">
                          <Checkbox
                            checked={isAllowed}
                            onCheckedChange={() => toggleRoleAccess(role, cat.id)}
                            disabled={isSaving}
                            className="mx-auto"
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">User-Specific Overrides</CardTitle>
          <p className="text-sm text-muted-foreground">
            Override access for specific users. User-level rules take precedence over role rules.
          </p>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-3 text-left font-medium sticky left-0 bg-muted/50 z-10 min-w-[200px]">
                    User
                  </th>
                  <th className="p-3 text-left font-medium min-w-[100px]">Role</th>
                  {categories.map((cat) => (
                    <th key={cat.id} className="p-3 text-center font-medium min-w-[80px]">
                      <div className="flex flex-col items-center gap-1">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: cat.color || "#6366f1" }}
                        />
                        <span className="text-xs">{cat.name.substring(0, 8)}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users
                  .filter((u) => u.role !== "customer" && u.role !== "super_admin")
                  .map((user) => (
                    <tr key={user.user_id} className="border-b hover:bg-muted/20">
                      <td className="p-3 sticky left-0 bg-card z-10">
                        <div className="font-medium text-sm">{user.full_name}</div>
                        <div className="text-xs text-muted-foreground">{user.phone || "—"}</div>
                      </td>
                      <td className="p-3">
                        <Badge variant="secondary" className="capitalize text-xs">
                          {user.role}
                        </Badge>
                      </td>
                      {categories.map((cat) => {
                        const cellKey = `user-${user.user_id}-${cat.id}`;
                        const isSaving = savingCells.has(cellKey);
                        const isAllowed = hasUserAccess(user.user_id, cat.id);
                        const hasUserRule = accessRules.some(
                          (r) => r.user_id === user.user_id && r.category_id === cat.id
                        );

                        return (
                          <td key={cat.id} className="p-3 text-center">
                            <div className="relative inline-block">
                              {hasUserRule && (
                                <div className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full" />
                              )}
                              <Checkbox
                                checked={isAllowed}
                                onCheckedChange={() => toggleUserAccess(user.user_id, cat.id)}
                                disabled={isSaving}
                                className="mx-auto"
                              />
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
