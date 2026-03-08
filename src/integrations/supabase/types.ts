export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_name: string | null
          entity_type: string
          id: string
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_name?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_name?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      company_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          created_at: string
          display_id: string
          email: string | null
          gst_number: string | null
          id: string
          is_active: boolean
          kyc_aadhar_back_url: string | null
          kyc_aadhar_front_url: string | null
          kyc_rejection_reason: string | null
          kyc_selfie_url: string | null
          kyc_status: string
          kyc_submitted_at: string | null
          kyc_verified_at: string | null
          kyc_verified_by: string | null
          name: string
          opening_balance: number
          phone: string | null
          photo_url: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          display_id: string
          email?: string | null
          gst_number?: string | null
          id?: string
          is_active?: boolean
          kyc_aadhar_back_url?: string | null
          kyc_aadhar_front_url?: string | null
          kyc_rejection_reason?: string | null
          kyc_selfie_url?: string | null
          kyc_status?: string
          kyc_submitted_at?: string | null
          kyc_verified_at?: string | null
          kyc_verified_by?: string | null
          name: string
          opening_balance?: number
          phone?: string | null
          photo_url?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          display_id?: string
          email?: string | null
          gst_number?: string | null
          id?: string
          is_active?: boolean
          kyc_aadhar_back_url?: string | null
          kyc_aadhar_front_url?: string | null
          kyc_rejection_reason?: string | null
          kyc_selfie_url?: string | null
          kyc_status?: string
          kyc_submitted_at?: string | null
          kyc_verified_at?: string | null
          kyc_verified_by?: string | null
          name?: string
          opening_balance?: number
          phone?: string | null
          photo_url?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      handovers: {
        Row: {
          cash_amount: number
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          handed_to: string | null
          handover_date: string
          id: string
          rejected_at: string | null
          status: string
          updated_at: string
          upi_amount: number
          user_id: string
        }
        Insert: {
          cash_amount?: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          handed_to?: string | null
          handover_date?: string
          id?: string
          rejected_at?: string | null
          status?: string
          updated_at?: string
          upi_amount?: number
          user_id: string
        }
        Update: {
          cash_amount?: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          handed_to?: string | null
          handover_date?: string
          id?: string
          rejected_at?: string | null
          status?: string
          updated_at?: string
          upi_amount?: number
          user_id?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          product_id: string
          quantity: number
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          product_id: string
          quantity?: number
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          product_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string
          customer_id: string
          delivered_at: string | null
          display_id: string
          id: string
          order_type: string
          requirement_note: string | null
          source: string
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by: string
          customer_id: string
          delivered_at?: string | null
          display_id: string
          id?: string
          order_type?: string
          requirement_note?: string | null
          source?: string
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string
          customer_id?: string
          delivered_at?: string | null
          display_id?: string
          id?: string
          order_type?: string
          requirement_note?: string | null
          source?: string
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          base_price: number
          category: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          product_group: string | null
          sku: string
          unit: string
          updated_at: string
        }
        Insert: {
          base_price?: number
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          product_group?: string | null
          sku: string
          unit?: string
          updated_at?: string
        }
        Update: {
          base_price?: number
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          product_group?: string | null
          sku?: string
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      route_sessions: {
        Row: {
          created_at: string
          end_lat: number | null
          end_lng: number | null
          ended_at: string | null
          id: string
          route_id: string
          start_lat: number | null
          start_lng: number | null
          started_at: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          end_lat?: number | null
          end_lng?: number | null
          ended_at?: string | null
          id?: string
          route_id: string
          start_lat?: number | null
          start_lng?: number | null
          started_at?: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          end_lat?: number | null
          end_lng?: number | null
          ended_at?: string | null
          id?: string
          route_id?: string
          start_lat?: number | null
          start_lng?: number | null
          started_at?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_sessions_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      routes: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          store_type_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          store_type_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          store_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "routes_store_type_id_fkey"
            columns: ["store_type_id"]
            isOneToOne: false
            referencedRelation: "store_types"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          created_at: string
          id: string
          product_id: string
          quantity: number
          sale_id: string
          total_price: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          quantity?: number
          sale_id: string
          total_price?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          sale_id?: string
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          assigned_to: string | null
          cash_amount: number
          created_at: string
          customer_id: string
          display_id: string
          id: string
          new_outstanding: number
          notes: string | null
          old_outstanding: number
          outstanding_amount: number
          recorded_by: string
          store_id: string
          total_amount: number
          updated_at: string
          upi_amount: number
        }
        Insert: {
          assigned_to?: string | null
          cash_amount?: number
          created_at?: string
          customer_id: string
          display_id: string
          id?: string
          new_outstanding?: number
          notes?: string | null
          old_outstanding?: number
          outstanding_amount?: number
          recorded_by: string
          store_id: string
          total_amount?: number
          updated_at?: string
          upi_amount?: number
        }
        Update: {
          assigned_to?: string | null
          cash_amount?: number
          created_at?: string
          customer_id?: string
          display_id?: string
          id?: string
          new_outstanding?: number
          notes?: string | null
          old_outstanding?: number
          outstanding_amount?: number
          recorded_by?: string
          store_id?: string
          total_amount?: number
          updated_at?: string
          upi_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_pricing: {
        Row: {
          created_at: string
          id: string
          price: number
          product_id: string
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          price?: number
          product_id: string
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          price?: number
          product_id?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_pricing_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_pricing_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_qr_codes: {
        Row: {
          created_at: string
          id: string
          payee_name: string | null
          raw_data: string
          store_id: string | null
          upi_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          payee_name?: string | null
          raw_data: string
          store_id?: string | null
          upi_id: string
        }
        Update: {
          created_at?: string
          id?: string
          payee_name?: string | null
          raw_data?: string
          store_id?: string | null
          upi_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_qr_codes_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_type_pricing: {
        Row: {
          created_at: string
          id: string
          price: number
          product_id: string
          store_type_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          price?: number
          product_id: string
          store_type_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          price?: number
          product_id?: string
          store_type_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_type_pricing_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_type_pricing_store_type_id_fkey"
            columns: ["store_type_id"]
            isOneToOne: false
            referencedRelation: "store_types"
            referencedColumns: ["id"]
          },
        ]
      }
      store_type_products: {
        Row: {
          created_at: string
          id: string
          product_id: string
          store_type_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          store_type_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          store_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_type_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_type_products_store_type_id_fkey"
            columns: ["store_type_id"]
            isOneToOne: false
            referencedRelation: "store_types"
            referencedColumns: ["id"]
          },
        ]
      }
      store_types: {
        Row: {
          auto_order_enabled: boolean
          created_at: string
          id: string
          is_active: boolean
          name: string
          order_type: string
        }
        Insert: {
          auto_order_enabled?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          order_type?: string
        }
        Update: {
          auto_order_enabled?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          order_type?: string
        }
        Relationships: []
      }
      store_visits: {
        Row: {
          id: string
          lat: number | null
          lng: number | null
          notes: string | null
          session_id: string
          store_id: string
          visited_at: string
        }
        Insert: {
          id?: string
          lat?: number | null
          lng?: number | null
          notes?: string | null
          session_id: string
          store_id: string
          visited_at?: string
        }
        Update: {
          id?: string
          lat?: number | null
          lng?: number | null
          notes?: string | null
          session_id?: string
          store_id?: string
          visited_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_visits_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "route_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_visits_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          address: string | null
          alternate_phone: string | null
          area: string | null
          city: string | null
          created_at: string
          customer_id: string
          display_id: string
          district: string | null
          id: string
          is_active: boolean
          lat: number | null
          lng: number | null
          name: string
          opening_balance: number
          outstanding: number
          phone: string | null
          photo_url: string | null
          pincode: string | null
          route_id: string | null
          state: string | null
          store_type_id: string
          street: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          alternate_phone?: string | null
          area?: string | null
          city?: string | null
          created_at?: string
          customer_id: string
          display_id: string
          district?: string | null
          id?: string
          is_active?: boolean
          lat?: number | null
          lng?: number | null
          name: string
          opening_balance?: number
          outstanding?: number
          phone?: string | null
          photo_url?: string | null
          pincode?: string | null
          route_id?: string | null
          state?: string | null
          store_type_id: string
          street?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          alternate_phone?: string | null
          area?: string | null
          city?: string | null
          created_at?: string
          customer_id?: string
          display_id?: string
          district?: string | null
          id?: string
          is_active?: boolean
          lat?: number | null
          lng?: number | null
          name?: string
          opening_balance?: number
          outstanding?: number
          phone?: string | null
          photo_url?: string | null
          pincode?: string | null
          route_id?: string | null
          state?: string | null
          store_type_id?: string
          street?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stores_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stores_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stores_store_type_id_fkey"
            columns: ["store_type_id"]
            isOneToOne: false
            referencedRelation: "store_types"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          assigned_to: string | null
          cash_amount: number
          created_at: string
          customer_id: string
          display_id: string
          id: string
          new_outstanding: number
          notes: string | null
          old_outstanding: number
          payment_date: string
          recorded_by: string
          store_id: string
          total_amount: number
          updated_at: string
          upi_amount: number
        }
        Insert: {
          assigned_to?: string | null
          cash_amount?: number
          created_at?: string
          customer_id: string
          display_id: string
          id?: string
          new_outstanding?: number
          notes?: string | null
          old_outstanding?: number
          payment_date?: string
          recorded_by: string
          store_id: string
          total_amount?: number
          updated_at?: string
          upi_amount?: number
        }
        Update: {
          assigned_to?: string | null
          cash_amount?: number
          created_at?: string
          customer_id?: string
          display_id?: string
          id?: string
          new_outstanding?: number
          notes?: string | null
          old_outstanding?: number
          payment_date?: string
          recorded_by?: string
          store_id?: string
          total_amount?: number
          updated_at?: string
          upi_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "manager"
        | "agent"
        | "marketer"
        | "pos"
        | "customer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "super_admin",
        "manager",
        "agent",
        "marketer",
        "pos",
        "customer",
      ],
    },
  },
} as const
