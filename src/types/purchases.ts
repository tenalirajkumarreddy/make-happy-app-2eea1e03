/**
 * Purchase Order types - Single source of truth
 * Used by: Purchases page, PurchaseOrderForm, purchase-order-columns
 */

export type PurchaseOrderStatus = 'pending' | 'completed' | 'cancelled';

export interface PurchaseOrderView {
  id: string;
  display_id: string;
  vendor_id: string;
  warehouse_id: string;
  status: PurchaseOrderStatus;
  total_amount: number;
  order_date: string;
  expected_delivery?: string;
  notes?: string;
  vendors: { name: string } | null;
  item_count: number;
}

export interface PurchaseOrderItem {
  id: string;
  purchase_id: string;
  raw_material_id?: string;
  product_id?: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  batch_number?: string;
  expiry_date?: string;
  notes?: string;
  raw_materials?: { name: string } | null;
  products?: { name: string } | null;
}

export interface PurchaseOrderDetail extends PurchaseOrderView {
  items: PurchaseOrderItem[];
  profiles?: { full_name: string } | null;
}

// Form types
export interface PurchaseOrderFormData {
  vendor_id: string;
  raw_material_id: string;
  quantity: number;
  unit_cost: number;
  expected_delivery?: string;
  notes?: string;
}
