/**
 * Shared types for Staff Directory and related components.
 * Single source of truth for staff data shapes across the app.
 */

import type { AppRole } from "./roles";
import type { PermissionKey } from "@/lib/permissions";

// ── Base aggregates fetched for each staff member ────────────────────────────
export interface StaffHoldings {
  cash_amount: number;
  upi_amount: number;
  total_amount: number;
}

export interface StaffStock {
  product_id: string;
  product_name: string;
  base_price: number;
  quantity: number;
  image_url: string | null;
}

export interface StaffActivity {
  today_sales_count: number;
  today_sales_amount: number;
  today_collections_count: number;
  today_collections_amount: number;
  last_active_at: string | null;
}

export interface StaffPermissionEntry {
  permission: PermissionKey;
  enabled: boolean;
}

// ── Staff card / directory display item ─────────────────────────────────────
export interface StaffMember {
  id: string;
  user_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: AppRole;
  is_active: boolean;
  warehouse_id: string | null;
  warehouse_name: string | null;
  created_at: string;
  last_active_at: string | null;
  // Aggregates
  holdings: StaffHoldings;
  stock: {
    total_items: number;
    total_units: number;
    total_value: number;
    preview: Array<{ product_name: string; quantity: number; value: number }>;
  };
  activity: StaffActivity;
  // Permissions (top 3-4 for card display)
  key_permissions: PermissionKey[];
}

// ── Pending invitation (pre-onboarding) ─────────────────────────────────────
export interface StaffInvitation {
  id: string;
  phone: string;
  email: string | null;
  full_name: string;
  role: AppRole;
  invited_by: string;
  status: "pending" | "accepted";
  created_at: string;
  warehouse_id: string | null;
  warehouse_name: string | null;
}

// ── Invite form data shape ──────────────────────────────────────────────────
export interface StaffInviteFormData {
  full_name: string;
  phone: string;
  email: string | null;
  role: AppRole;
  warehouse_id: string | null;
}

// ── Filter state ────────────────────────────────────────────────────────────
export interface StaffDirectoryFilters {
  search: string;
  role: AppRole | "all";
  warehouse: "all" | "assigned" | "unassigned";
  status: "all" | "active" | "inactive";
}

// ── Stats for directory header ──────────────────────────────────────────────
export interface StaffDirectoryStats {
  total: number;
  active: number;
  withHoldings: number;
  totalCash: number;
  totalStockValue: number;
  totalStockItems: number;
}

// ── Role metadata derived from permissions + roles modules ──────────────────
export const STAFF_ROLE_OPTIONS: Array<{ value: AppRole | "all"; label: string }> = [
  { value: "all", label: "All Roles" },
  { value: "super_admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "agent", label: "Agent" },
  { value: "marketer", label: "Marketer" },
  { value: "operator", label: "Operator" },
];

export const INVITABLE_ROLES: Array<{ value: AppRole; label: string }> = [
  { value: "manager", label: "Manager" },
  { value: "agent", label: "Agent" },
  { value: "marketer", label: "Marketer" },
  { value: "operator", label: "Operator" },
];
