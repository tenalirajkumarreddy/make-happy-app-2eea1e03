export interface StaffHolding {
  user_id: string;
  full_name: string;
  role: string;
  quantity: number;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
  unit: string;
  category_id: string | null;
  description: string | null;
  image_url: string | null;
  hsn_code: string | null;
  gst_rate: number;
  is_active: boolean;
  created_at: string;
  warehouse_id: string;
  warehouse_quantity: number;
  staff_holdings: StaffHolding[] | null;
}

export interface StockTransfer {
  id: string;
  created_at: string;
  from_user_id: string;
  to_warehouse_id: string;
  product_id: string;
  quantity: number;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  description: string | null;
  product: {
    name: string;
    unit: string;
  } | null;
  staff: {
    full_name: string;
    avatar_url?: string;
  } | null;
}
