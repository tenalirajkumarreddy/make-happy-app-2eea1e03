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
      agent_routes: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          route_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          route_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          route_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_routes_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_store_types: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          store_type_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          store_type_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          store_type_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_store_types_store_type_id_fkey"
            columns: ["store_type_id"]
            isOneToOne: false
            referencedRelation: "store_types"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_entries: {
        Row: {
          adjustment_amount: number | null
          adjustment_reason: string | null
          amount_earned: number | null
          attendance_id: string
          check_in_time: string | null
          check_out_time: string | null
          created_at: string | null
          deleted_at: string | null
          deleted_by: string | null
          hourly_rate: number
          hours_worked: number | null
          id: string
          is_on_leave: boolean | null
          is_present: boolean | null
          notes: string | null
          updated_at: string | null
          user_id: string | null
          warehouse_id: string | null
          worker_id: string | null
        }
        Insert: {
          adjustment_amount?: number | null
          adjustment_reason?: string | null
          amount_earned?: number | null
          attendance_id: string
          check_in_time?: string | null
          check_out_time?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          hourly_rate?: number
          hours_worked?: number | null
          id?: string
          is_on_leave?: boolean | null
          is_present?: boolean | null
          notes?: string | null
          updated_at?: string | null
          user_id?: string | null
          warehouse_id?: string | null
          worker_id?: string | null
        }
        Update: {
          adjustment_amount?: number | null
          adjustment_reason?: string | null
          amount_earned?: number | null
          attendance_id?: string
          check_in_time?: string | null
          check_out_time?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          hourly_rate?: number
          hours_worked?: number | null
          id?: string
          is_on_leave?: boolean | null
          is_present?: boolean | null
          notes?: string | null
          updated_at?: string | null
          user_id?: string | null
          warehouse_id?: string | null
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_entries_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "attendance_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_entries_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_entries_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          attendance_date: string
          batch_numbers: string | null
          created_at: string | null
          deleted_at: string | null
          deleted_by: string | null
          display_id: string
          factory_end_time: string
          factory_start_time: string
          id: string
          is_finalized: boolean | null
          is_working_day: boolean | null
          manual_override: boolean | null
          notes: string | null
          override_by: string | null
          override_reason: string | null
          recorded_by: string | null
          updated_at: string | null
        }
        Insert: {
          attendance_date: string
          batch_numbers?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          display_id: string
          factory_end_time?: string
          factory_start_time?: string
          id?: string
          is_finalized?: boolean | null
          is_working_day?: boolean | null
          manual_override?: boolean | null
          notes?: string | null
          override_by?: string | null
          override_reason?: string | null
          recorded_by?: string | null
          updated_at?: string | null
        }
        Update: {
          attendance_date?: string
          batch_numbers?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          display_id?: string
          factory_end_time?: string
          factory_start_time?: string
          id?: string
          is_finalized?: boolean | null
          is_working_day?: boolean | null
          manual_override?: boolean | null
          notes?: string | null
          override_by?: string | null
          override_reason?: string | null
          recorded_by?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_override_by_fkey"
            columns: ["override_by"]
            isOneToOne: false
            referencedRelation: "active_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "attendance_records_override_by_fkey"
            columns: ["override_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          app_version: string | null
          changed_fields: string[] | null
          device_type: string | null
          id: string
          ip_address: unknown
          new_values: Json | null
          old_values: Json | null
          performed_at: string | null
          performed_by: string | null
          record_id: string
          request_id: string | null
          session_id: string | null
          table_name: string
          user_agent: string | null
        }
        Insert: {
          action: string
          app_version?: string | null
          changed_fields?: string[] | null
          device_type?: string | null
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          performed_at?: string | null
          performed_by?: string | null
          record_id: string
          request_id?: string | null
          session_id?: string | null
          table_name: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          app_version?: string | null
          changed_fields?: string[] | null
          device_type?: string | null
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          performed_at?: string | null
          performed_by?: string | null
          record_id?: string
          request_id?: string | null
          session_id?: string | null
          table_name?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      balance_adjustments: {
        Row: {
          adjusted_by: string
          adjustment_amount: number
          created_at: string
          customer_id: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          new_outstanding: number
          old_outstanding: number
          reason: string | null
          store_id: string
          warehouse_id: string | null
        }
        Insert: {
          adjusted_by: string
          adjustment_amount?: number
          created_at?: string
          customer_id: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          new_outstanding?: number
          old_outstanding?: number
          reason?: string | null
          store_id: string
          warehouse_id?: string | null
        }
        Update: {
          adjusted_by?: string
          adjustment_amount?: number
          created_at?: string
          customer_id?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          new_outstanding?: number
          old_outstanding?: number
          reason?: string | null
          store_id?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "balance_adjustments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "active_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "balance_adjustments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balance_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "balance_adjustments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_outstanding_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "balance_adjustments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "balance_adjustments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "recently_deleted_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "balance_adjustments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "active_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "balance_adjustments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "recently_deleted_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "balance_adjustments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "store_outstanding_summary"
            referencedColumns: ["store_id"]
          },
          {
            foreignKeyName: "balance_adjustments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "balance_adjustments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores_for_map"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "balance_adjustments_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      balance_corrections: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          correction_amount: number
          correction_type: string
          created_at: string | null
          customer_id: string | null
          description: string
          display_id: string
          id: string
          new_outstanding: number
          previous_outstanding: number
          reason: string
          recorded_by: string
          status: string
          store_id: string
          supporting_documents: Json | null
          updated_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          correction_amount: number
          correction_type: string
          created_at?: string | null
          customer_id?: string | null
          description: string
          display_id: string
          id?: string
          new_outstanding: number
          previous_outstanding: number
          reason: string
          recorded_by: string
          status?: string
          store_id: string
          supporting_documents?: Json | null
          updated_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          correction_amount?: number
          correction_type?: string
          created_at?: string | null
          customer_id?: string | null
          description?: string
          display_id?: string
          id?: string
          new_outstanding?: number
          previous_outstanding?: number
          reason?: string
          recorded_by?: string
          status?: string
          store_id?: string
          supporting_documents?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "balance_corrections_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "active_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "balance_corrections_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balance_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "balance_corrections_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_outstanding_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "balance_corrections_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "balance_corrections_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "recently_deleted_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "balance_corrections_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "active_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "balance_corrections_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "recently_deleted_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "balance_corrections_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "store_outstanding_summary"
            referencedColumns: ["store_id"]
          },
          {
            foreignKeyName: "balance_corrections_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "balance_corrections_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores_for_map"
            referencedColumns: ["id"]
          },
        ]
      }
      banner_store_types: {
        Row: {
          banner_id: string
          store_type_id: string
        }
        Insert: {
          banner_id: string
          store_type_id: string
        }
        Update: {
          banner_id?: string
          store_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "banner_store_types_banner_id_fkey"
            columns: ["banner_id"]
            isOneToOne: false
            referencedRelation: "active_banners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "banner_store_types_banner_id_fkey"
            columns: ["banner_id"]
            isOneToOne: false
            referencedRelation: "promotional_banners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "banner_store_types_store_type_id_fkey"
            columns: ["store_type_id"]
            isOneToOne: false
            referencedRelation: "store_types"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_of_materials: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          deleted_by: string | null
          finished_product_id: string
          id: string
          is_active: boolean | null
          notes: string | null
          quantity: number
          quantity_unit: string
          raw_material_category_id: string | null
          raw_material_id: string | null
          updated_at: string | null
          version: number | null
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          finished_product_id: string
          id?: string
          is_active?: boolean | null
          notes?: string | null
          quantity?: number
          quantity_unit?: string
          raw_material_category_id?: string | null
          raw_material_id?: string | null
          updated_at?: string | null
          version?: number | null
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          finished_product_id?: string
          id?: string
          is_active?: boolean | null
          notes?: string | null
          quantity?: number
          quantity_unit?: string
          raw_material_category_id?: string | null
          raw_material_id?: string | null
          updated_at?: string | null
          version?: number | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bill_of_materials_finished_product_id_fkey"
            columns: ["finished_product_id"]
            isOneToOne: false
            referencedRelation: "active_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_of_materials_finished_product_id_fkey"
            columns: ["finished_product_id"]
            isOneToOne: false
            referencedRelation: "product_profit_summary"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "bill_of_materials_finished_product_id_fkey"
            columns: ["finished_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_of_materials_raw_material_category_id_fkey"
            columns: ["raw_material_category_id"]
            isOneToOne: false
            referencedRelation: "raw_material_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_of_materials_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_info: {
        Row: {
          address: string | null
          bank_account: string | null
          bank_ifsc: string | null
          bank_name: string | null
          created_at: string | null
          gstin: string | null
          id: string
          pan: string | null
          state: string | null
          state_code: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          bank_account?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          created_at?: string | null
          gstin?: string | null
          id?: string
          pan?: string | null
          state?: string | null
          state_code?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          bank_account?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          created_at?: string | null
          gstin?: string | null
          id?: string
          pan?: string | null
          state?: string | null
          state_code?: string | null
          updated_at?: string | null
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
          created_by: string | null
          credit_limit_override: number | null
          deleted_at: string | null
          deleted_by: string | null
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
          phone: string
          photo_url: string | null
          updated_at: string
          updated_by: string | null
          user_id: string | null
          warehouse_id: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          credit_limit_override?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
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
          phone: string
          photo_url?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
          warehouse_id?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          credit_limit_override?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
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
          phone?: string
          photo_url?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "active_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "customers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "customers_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "active_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "customers_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "customers_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_receivables_snapshots: {
        Row: {
          bucket_31_60: number
          bucket_61_90: number
          bucket_90_plus: number
          bucket_current: number
          closing_outstanding: number
          created_at: string | null
          customer_id: string | null
          id: string
          snapshot_date: string
          store_id: string | null
          warehouse_id: string | null
        }
        Insert: {
          bucket_31_60?: number
          bucket_61_90?: number
          bucket_90_plus?: number
          bucket_current?: number
          closing_outstanding?: number
          created_at?: string | null
          customer_id?: string | null
          id?: string
          snapshot_date: string
          store_id?: string | null
          warehouse_id?: string | null
        }
        Update: {
          bucket_31_60?: number
          bucket_61_90?: number
          bucket_90_plus?: number
          bucket_current?: number
          closing_outstanding?: number
          created_at?: string | null
          customer_id?: string | null
          id?: string
          snapshot_date?: string
          store_id?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_receivables_snapshots_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "active_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_receivables_snapshots_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balance_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "daily_receivables_snapshots_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_outstanding_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "daily_receivables_snapshots_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_receivables_snapshots_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "recently_deleted_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_receivables_snapshots_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "active_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_receivables_snapshots_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "recently_deleted_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_receivables_snapshots_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "store_outstanding_summary"
            referencedColumns: ["store_id"]
          },
          {
            foreignKeyName: "daily_receivables_snapshots_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_receivables_snapshots_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores_for_map"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_receivables_snapshots_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_store_snapshots: {
        Row: {
          closing_outstanding: number
          collections_amount: number
          created_at: string | null
          credit_given: number
          id: string
          new_outstanding: number
          route_id: string | null
          route_order: number | null
          sales_amount: number
          sales_count: number
          snapshot_date: string
          store_id: string | null
          visited: boolean | null
          visited_at: string | null
          warehouse_id: string | null
        }
        Insert: {
          closing_outstanding?: number
          collections_amount?: number
          created_at?: string | null
          credit_given?: number
          id?: string
          new_outstanding?: number
          route_id?: string | null
          route_order?: number | null
          sales_amount?: number
          sales_count?: number
          snapshot_date: string
          store_id?: string | null
          visited?: boolean | null
          visited_at?: string | null
          warehouse_id?: string | null
        }
        Update: {
          closing_outstanding?: number
          collections_amount?: number
          created_at?: string | null
          credit_given?: number
          id?: string
          new_outstanding?: number
          route_id?: string | null
          route_order?: number | null
          sales_amount?: number
          sales_count?: number
          snapshot_date?: string
          store_id?: string | null
          visited?: boolean | null
          visited_at?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_store_snapshots_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_store_snapshots_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "active_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_store_snapshots_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "recently_deleted_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_store_snapshots_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "store_outstanding_summary"
            referencedColumns: ["store_id"]
          },
          {
            foreignKeyName: "daily_store_snapshots_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_store_snapshots_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores_for_map"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_store_snapshots_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_user_snapshots: {
        Row: {
          cash_collected: number
          collections_amount: number
          collections_count: number
          created_at: string | null
          expenses_approved: number
          id: string
          routes_covered: number
          sales_amount: number
          sales_count: number
          snapshot_date: string
          upi_collected: number
          user_id: string | null
          visits_count: number
          warehouse_id: string | null
        }
        Insert: {
          cash_collected?: number
          collections_amount?: number
          collections_count?: number
          created_at?: string | null
          expenses_approved?: number
          id?: string
          routes_covered?: number
          sales_amount?: number
          sales_count?: number
          snapshot_date: string
          upi_collected?: number
          user_id?: string | null
          visits_count?: number
          warehouse_id?: string | null
        }
        Update: {
          cash_collected?: number
          collections_amount?: number
          collections_count?: number
          created_at?: string | null
          expenses_approved?: number
          id?: string
          routes_covered?: number
          sales_amount?: number
          sales_count?: number
          snapshot_date?: string
          upi_collected?: number
          user_id?: string | null
          visits_count?: number
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_user_snapshots_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      data_quality_issues: {
        Row: {
          checked_at: string
          created_at: string
          details: string
          display_id: string | null
          id: string
          issue_type: string
          notes: string | null
          record_id: string
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          table_name: string
        }
        Insert: {
          checked_at?: string
          created_at?: string
          details: string
          display_id?: string | null
          id?: string
          issue_type: string
          notes?: string | null
          record_id: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          severity: string
          table_name: string
        }
        Update: {
          checked_at?: string
          created_at?: string
          details?: string
          display_id?: string | null
          id?: string
          issue_type?: string
          notes?: string | null
          record_id?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          table_name?: string
        }
        Relationships: []
      }
      delivery_trips: {
        Row: {
          created_at: string
          driver_id: string | null
          end_time: string | null
          id: string
          start_time: string | null
          status: string
          total_cost: number | null
          total_distance_km: number | null
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          driver_id?: string | null
          end_time?: string | null
          id?: string
          start_time?: string | null
          status?: string
          total_cost?: number | null
          total_distance_km?: number | null
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          driver_id?: string | null
          end_time?: string | null
          id?: string
          start_time?: string | null
          status?: string
          total_cost?: number | null
          total_distance_km?: number | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_trips_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_trips_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          color: string | null
          created_at: string | null
          description: string | null
          display_id: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          is_manufacturing_overhead: boolean | null
          is_system: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          display_id?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_manufacturing_overhead?: boolean | null
          is_system?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          display_id?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_manufacturing_overhead?: boolean | null
          is_system?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      expense_category_access: {
        Row: {
          category_id: string | null
          created_at: string | null
          created_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"] | null
          user_id: string | null
          warehouse_id: string | null
        }
        Insert: {
          category_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"] | null
          user_id?: string | null
          warehouse_id?: string | null
        }
        Update: {
          category_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"] | null
          user_id?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_category_access_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_category_access_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_summary_by_category"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "expense_category_access_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "active_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "expense_category_access_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "expense_category_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "active_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "expense_category_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "expense_category_access_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_claims: {
        Row: {
          amount: number
          approved_amount: number | null
          approved_at: string | null
          attachment_count: number | null
          bill_urls: string[] | null
          category_id: string | null
          created_at: string
          deleted_at: string | null
          description: string
          display_id: string
          expense_date: string
          holding_amount_locked: number | null
          id: string
          is_adhoc: boolean | null
          is_request: boolean | null
          original_category_id: string | null
          receipt_url: string | null
          rejection_reason: string | null
          requester_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_notes: string | null
          revocation_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          source_store_id: string | null
          status: string
          updated_at: string
          user_id: string
          warehouse_id: string | null
        }
        Insert: {
          amount: number
          approved_amount?: number | null
          approved_at?: string | null
          attachment_count?: number | null
          bill_urls?: string[] | null
          category_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description: string
          display_id: string
          expense_date?: string
          holding_amount_locked?: number | null
          id?: string
          is_adhoc?: boolean | null
          is_request?: boolean | null
          original_category_id?: string | null
          receipt_url?: string | null
          rejection_reason?: string | null
          requester_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          revocation_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          source_store_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
          warehouse_id?: string | null
        }
        Update: {
          amount?: number
          approved_amount?: number | null
          approved_at?: string | null
          attachment_count?: number | null
          bill_urls?: string[] | null
          category_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string
          display_id?: string
          expense_date?: string
          holding_amount_locked?: number | null
          id?: string
          is_adhoc?: boolean | null
          is_request?: boolean | null
          original_category_id?: string | null
          receipt_url?: string | null
          rejection_reason?: string | null
          requester_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          revocation_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          source_store_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_claims_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_claims_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_summary_by_category"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "expense_claims_original_category_id_fkey"
            columns: ["original_category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_claims_original_category_id_fkey"
            columns: ["original_category_id"]
            isOneToOne: false
            referencedRelation: "expense_summary_by_category"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "expense_claims_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "active_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "expense_claims_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "expense_claims_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_claims_history: {
        Row: {
          action: string
          changed_by: string
          claim_id: string
          created_at: string
          id: string
          new_amount: number | null
          new_category_id: string | null
          new_status: string | null
          notes: string | null
          old_amount: number | null
          old_category_id: string | null
          old_status: string | null
          warehouse_id: string | null
        }
        Insert: {
          action: string
          changed_by: string
          claim_id: string
          created_at?: string
          id?: string
          new_amount?: number | null
          new_category_id?: string | null
          new_status?: string | null
          notes?: string | null
          old_amount?: number | null
          old_category_id?: string | null
          old_status?: string | null
          warehouse_id?: string | null
        }
        Update: {
          action?: string
          changed_by?: string
          claim_id?: string
          created_at?: string
          id?: string
          new_amount?: number | null
          new_category_id?: string | null
          new_status?: string | null
          notes?: string | null
          old_amount?: number | null
          old_category_id?: string | null
          old_status?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_claims_history_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "expense_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_claims_history_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string | null
          category_id: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          description: string | null
          display_id: string
          expense_date: string
          id: string
          notes: string | null
          payment_method: string | null
          payment_reference: string | null
          receipt_image_url: string | null
          receipt_url: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_id: string | null
          source_type: string | null
          status: string | null
          updated_at: string | null
          updated_by: string | null
          vendor_id: string | null
          warehouse_id: string | null
        }
        Insert: {
          amount: number
          category?: string | null
          category_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          display_id: string
          expense_date?: string
          id?: string
          notes?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          receipt_image_url?: string | null
          receipt_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string | null
          updated_at?: string | null
          updated_by?: string | null
          vendor_id?: string | null
          warehouse_id?: string | null
        }
        Update: {
          amount?: number
          category?: string | null
          category_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          display_id?: string
          expense_date?: string
          id?: string
          notes?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          receipt_image_url?: string | null
          receipt_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string | null
          updated_at?: string | null
          updated_by?: string | null
          vendor_id?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_summary_by_category"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "expenses_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "active_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "expenses_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "expenses_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "active_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "expenses_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "expenses_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_balance_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      fcm_tokens: {
        Row: {
          created_at: string | null
          id: string
          platform: string | null
          token: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          platform?: string | null
          token: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          platform?: string | null
          token?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fcm_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "active_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fcm_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      fixed_cost_payments: {
        Row: {
          amount: number
          created_at: string | null
          created_by: string | null
          display_id: string
          expense_id: string | null
          fixed_cost_id: string
          id: string
          notes: string | null
          payment_date: string
          payment_method: string | null
          payment_reference: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          created_by?: string | null
          display_id: string
          expense_id?: string | null
          fixed_cost_id: string
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
          payment_reference?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          created_by?: string | null
          display_id?: string
          expense_id?: string | null
          fixed_cost_id?: string
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
          payment_reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fixed_cost_payments_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_cost_payments_fixed_cost_id_fkey"
            columns: ["fixed_cost_id"]
            isOneToOne: false
            referencedRelation: "fixed_costs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_cost_payments_fixed_cost_id_fkey"
            columns: ["fixed_cost_id"]
            isOneToOne: false
            referencedRelation: "fixed_costs_due_soon"
            referencedColumns: ["id"]
          },
        ]
      }
      fixed_costs: {
        Row: {
          amount: number
          created_at: string | null
          created_by: string | null
          description: string | null
          display_id: string
          due_day: number | null
          frequency: string
          id: string
          is_active: boolean | null
          last_paid_date: string | null
          last_reminder_sent: string | null
          name: string
          next_due_date: string
          reminder_days_before: number | null
          reminder_sent: boolean | null
          updated_at: string | null
          vendor_id: string | null
          vendor_name: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          display_id: string
          due_day?: number | null
          frequency?: string
          id?: string
          is_active?: boolean | null
          last_paid_date?: string | null
          last_reminder_sent?: string | null
          name: string
          next_due_date: string
          reminder_days_before?: number | null
          reminder_sent?: boolean | null
          updated_at?: string | null
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          display_id?: string
          due_day?: number | null
          frequency?: string
          id?: string
          is_active?: boolean | null
          last_paid_date?: string | null
          last_reminder_sent?: string | null
          name?: string
          next_due_date?: string
          reminder_days_before?: number | null
          reminder_sent?: boolean | null
          updated_at?: string | null
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fixed_costs_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_balance_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_costs_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      handover_requests: {
        Row: {
          amount: number
          created_at: string | null
          created_by: string | null
          handover_type: string
          id: string
          notes: string | null
          receipt_url: string | null
          requested_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          staff_id: string
          status: string | null
          updated_at: string | null
          updated_by: string | null
          warehouse_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          created_by?: string | null
          handover_type: string
          id?: string
          notes?: string | null
          receipt_url?: string | null
          requested_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_id: string
          status?: string | null
          updated_at?: string | null
          updated_by?: string | null
          warehouse_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          created_by?: string | null
          handover_type?: string
          id?: string
          notes?: string | null
          receipt_url?: string | null
          requested_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_id?: string
          status?: string | null
          updated_at?: string | null
          updated_by?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "handover_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "active_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "handover_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "handover_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "active_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "handover_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "handover_requests_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "active_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "handover_requests_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "handover_requests_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "active_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "handover_requests_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "handover_requests_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      handover_snapshots: {
        Row: {
          balance_amount: number
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          snapshot_date: string
          user_id: string
          warehouse_id: string | null
        }
        Insert: {
          balance_amount?: number
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          snapshot_date?: string
          user_id: string
          warehouse_id?: string | null
        }
        Update: {
          balance_amount?: number
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          snapshot_date?: string
          user_id?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "handover_snapshots_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      handovers: {
        Row: {
          action_taken_at: string | null
          action_taken_by: string | null
          cash_amount: number
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          handed_to: string | null
          handover_date: string
          handover_request_id: string | null
          handover_type: string | null
          id: string
          notes: string | null
          receipt_url: string | null
          rejected_at: string | null
          status: string
          updated_at: string
          upi_amount: number
          user_id: string
          warehouse_id: string | null
        }
        Insert: {
          action_taken_at?: string | null
          action_taken_by?: string | null
          cash_amount?: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          handed_to?: string | null
          handover_date?: string
          handover_request_id?: string | null
          handover_type?: string | null
          id?: string
          notes?: string | null
          receipt_url?: string | null
          rejected_at?: string | null
          status?: string
          updated_at?: string
          upi_amount?: number
          user_id: string
          warehouse_id?: string | null
        }
        Update: {
          action_taken_at?: string | null
          action_taken_by?: string | null
          cash_amount?: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          handed_to?: string | null
          handover_date?: string
          handover_request_id?: string | null
          handover_type?: string | null
          id?: string
          notes?: string | null
          receipt_url?: string | null
          rejected_at?: string | null
          status?: string
          updated_at?: string
          upi_amount?: number
          user_id?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "handovers_handover_request_id_fkey"
            columns: ["handover_request_id"]
            isOneToOne: false
            referencedRelation: "handover_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handovers_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      holding_amount_log: {
        Row: {
          action: string
          amount: number
          created_at: string | null
          created_by: string | null
          expense_claim_id: string | null
          id: string
          new_holding: number
          previous_holding: number
          reference_type: string | null
          user_id: string
        }
        Insert: {
          action: string
          amount: number
          created_at?: string | null
          created_by?: string | null
          expense_claim_id?: string | null
          id?: string
          new_holding: number
          previous_holding: number
          reference_type?: string | null
          user_id: string
        }
        Update: {
          action?: string
          amount?: number
          created_at?: string | null
          created_by?: string | null
          expense_claim_id?: string | null
          id?: string
          new_holding?: number
          previous_holding?: number
          reference_type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      income: {
        Row: {
          amount: number
          category: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          deprecated_at: string | null
          description: string | null
          id: string
          income_date: string
          payment_mode: string | null
          reference_number: string | null
          source: string | null
          source_id: string | null
          updated_at: string | null
          updated_by: string | null
          warehouse_id: string | null
        }
        Insert: {
          amount: number
          category: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deprecated_at?: string | null
          description?: string | null
          id?: string
          income_date?: string
          payment_mode?: string | null
          reference_number?: string | null
          source?: string | null
          source_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
          warehouse_id?: string | null
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deprecated_at?: string | null
          description?: string | null
          id?: string
          income_date?: string
          payment_mode?: string | null
          reference_number?: string | null
          source?: string | null
          source_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "income_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "active_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "income_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "income_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "active_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "income_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "income_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      income_entries: {
        Row: {
          cash_amount: number | null
          category: string | null
          created_at: string | null
          entry_type: string
          id: string
          notes: string | null
          receipt_url: string | null
          recorded_by: string
          source_id: string | null
          source_type: string | null
          subcategory: string | null
          total_amount: number | null
          upi_amount: number | null
          warehouse_id: string | null
        }
        Insert: {
          cash_amount?: number | null
          category?: string | null
          created_at?: string | null
          entry_type: string
          id?: string
          notes?: string | null
          receipt_url?: string | null
          recorded_by: string
          source_id?: string | null
          source_type?: string | null
          subcategory?: string | null
          total_amount?: number | null
          upi_amount?: number | null
          warehouse_id?: string | null
        }
        Update: {
          cash_amount?: number | null
          category?: string | null
          created_at?: string | null
          entry_type?: string
          id?: string
          notes?: string | null
          receipt_url?: string | null
          recorded_by?: string
          source_id?: string | null
          source_type?: string | null
          subcategory?: string | null
          total_amount?: number | null
          upi_amount?: number | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "income_entries_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "active_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "income_entries_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "income_entries_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          cgst_amount: number | null
          created_at: string | null
          deleted_at: string | null
          deleted_by: string | null
          discount_amount: number | null
          gst_rate: number | null
          hsn_code: string | null
          id: string
          igst_amount: number | null
          invoice_id: string
          product_id: string | null
          product_name: string
          quantity: number
          sale_item_id: string | null
          sgst_amount: number | null
          tax_amount: number | null
          tax_rate: number | null
          taxable_amount: number | null
          total_amount: number
          unit_price: number
          warehouse_id: string | null
        }
        Insert: {
          cgst_amount?: number | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          discount_amount?: number | null
          gst_rate?: number | null
          hsn_code?: string | null
          id?: string
          igst_amount?: number | null
          invoice_id: string
          product_id?: string | null
          product_name: string
          quantity: number
          sale_item_id?: string | null
          sgst_amount?: number | null
          tax_amount?: number | null
          tax_rate?: number | null
          taxable_amount?: number | null
          total_amount: number
          unit_price: number
          warehouse_id?: string | null
        }
        Update: {
          cgst_amount?: number | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          discount_amount?: number | null
          gst_rate?: number | null
          hsn_code?: string | null
          id?: string
          igst_amount?: number | null
          invoice_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          sale_item_id?: string | null
          sgst_amount?: number | null
          tax_amount?: number | null
          tax_rate?: number | null
          taxable_amount?: number | null
          total_amount?: number
          unit_price?: number
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "active_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_profit_summary"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_sales: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          invoice_id: string
          sale_id: string
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          invoice_id: string
          sale_id: string
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          invoice_id?: string
          sale_id?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_sales_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_sales_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "order_fulfillment_status"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "invoice_sales_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_sales_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_settings: {
        Row: {
          created_at: string | null
          current_number: number | null
          id: string
          include_year: boolean | null
          min_digits: number | null
          prefix: string | null
          separator: string | null
          suffix: string | null
          updated_at: string | null
          year_format: string | null
        }
        Insert: {
          created_at?: string | null
          current_number?: number | null
          id?: string
          include_year?: boolean | null
          min_digits?: number | null
          prefix?: string | null
          separator?: string | null
          suffix?: string | null
          updated_at?: string | null
          year_format?: string | null
        }
        Update: {
          created_at?: string | null
          current_number?: number | null
          id?: string
          include_year?: boolean | null
          min_digits?: number | null
          prefix?: string | null
          separator?: string | null
          suffix?: string | null
          updated_at?: string | null
          year_format?: string | null
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount_in_words: string | null
          buyer_gstin: string | null
          buyer_state: string | null
          buyer_state_code: string | null
          cancelled_at: string | null
          cancelled_reason: string | null
          cgst_amount: number | null
          cgst_rate: number | null
          created_at: string | null
          created_by: string | null
          customer_address: string | null
          customer_gstin: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          deleted_at: string | null
          discount_amount: number
          dispatch_address: string | null
          dispatch_warehouse_id: string | null
          id: string
          igst_amount: number | null
          igst_rate: number | null
          invoice_date: string
          invoice_number: string
          invoice_type: string | null
          is_inter_state: boolean | null
          notes: string | null
          order_ref: string | null
          sale_ref: string | null
          sgst_amount: number | null
          sgst_rate: number | null
          status: string
          store_id: string | null
          subtotal: number
          tax_amount: number
          taxable_amount: number | null
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          amount_in_words?: string | null
          buyer_gstin?: string | null
          buyer_state?: string | null
          buyer_state_code?: string | null
          cancelled_at?: string | null
          cancelled_reason?: string | null
          cgst_amount?: number | null
          cgst_rate?: number | null
          created_at?: string | null
          created_by?: string | null
          customer_address?: string | null
          customer_gstin?: string | null
          customer_id?: string | null
          customer_name: string
          customer_phone?: string | null
          deleted_at?: string | null
          discount_amount?: number
          dispatch_address?: string | null
          dispatch_warehouse_id?: string | null
          id?: string
          igst_amount?: number | null
          igst_rate?: number | null
          invoice_date?: string
          invoice_number: string
          invoice_type?: string | null
          is_inter_state?: boolean | null
          notes?: string | null
          order_ref?: string | null
          sale_ref?: string | null
          sgst_amount?: number | null
          sgst_rate?: number | null
          status?: string
          store_id?: string | null
          subtotal?: number
          tax_amount?: number
          taxable_amount?: number | null
          total_amount?: number
          updated_at?: string | null
        }
        Update: {
          amount_in_words?: string | null
          buyer_gstin?: string | null
          buyer_state?: string | null
          buyer_state_code?: string | null
          cancelled_at?: string | null
          cancelled_reason?: string | null
          cgst_amount?: number | null
          cgst_rate?: number | null
          created_at?: string | null
          created_by?: string | null
          customer_address?: string | null
          customer_gstin?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          deleted_at?: string | null
          discount_amount?: number
          dispatch_address?: string | null
          dispatch_warehouse_id?: string | null
          id?: string
          igst_amount?: number | null
          igst_rate?: number | null
          invoice_date?: string
          invoice_number?: string
          invoice_type?: string | null
          is_inter_state?: boolean | null
          notes?: string | null
          order_ref?: string | null
          sale_ref?: string | null
          sgst_amount?: number | null
          sgst_rate?: number | null
          status?: string
          store_id?: string | null
          subtotal?: number
          tax_amount?: number
          taxable_amount?: number | null
          total_amount?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "active_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balance_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_outstanding_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "recently_deleted_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_dispatch_warehouse_id_fkey"
            columns: ["dispatch_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_order_ref_fkey"
            columns: ["order_ref"]
            isOneToOne: false
            referencedRelation: "order_fulfillment_status"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "invoices_order_ref_fkey"
            columns: ["order_ref"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_sale_ref_fkey"
            columns: ["sale_ref"]
            isOneToOne: false
            referencedRelation: "order_fulfillment_status"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "invoices_sale_ref_fkey"
            columns: ["sale_ref"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "active_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "recently_deleted_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "store_outstanding_summary"
            referencedColumns: ["store_id"]
          },
          {
            foreignKeyName: "invoices_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores_for_map"
            referencedColumns: ["id"]
          },
        ]
      }
      location_pings: {
        Row: {
          id: string
          lat: number
          lng: number
          recorded_at: string
          session_id: string
          user_id: string
        }
        Insert: {
          id?: string
          lat: number
          lng: number
          recorded_at?: string
          session_id: string
          user_id: string
        }
        Update: {
          id?: string
          lat?: number
          lng?: number
          recorded_at?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_pings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "route_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          is_read: boolean
          message: string
          title: string
          type: string
          user_id: string
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean
          message: string
          title: string
          type?: string
          user_id: string
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean
          message?: string
          title?: string
          type?: string
          user_id?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          order_id: string
          product_id: string
          quantity: number
          unit_price: number
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          order_id: string
          product_id: string
          quantity?: number
          unit_price?: number
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          order_id?: string
          product_id?: string
          quantity?: number
          unit_price?: number
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_fulfillment_status"
            referencedColumns: ["order_id"]
          },
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
            referencedRelation: "active_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_profit_summary"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          assigned_to: string | null
          assigned_to_old: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string
          customer_id: string
          deleted_at: string | null
          delivered_at: string | null
          display_id: string
          fulfilled_by: string | null
          fulfilled_by_sale_id: string | null
          id: string
          order_type: string
          requirement_note: string | null
          source: string
          status: string
          store_id: string
          updated_at: string
          updated_by: string | null
          warehouse_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          assigned_to_old?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by: string
          customer_id: string
          deleted_at?: string | null
          delivered_at?: string | null
          display_id: string
          fulfilled_by?: string | null
          fulfilled_by_sale_id?: string | null
          id?: string
          order_type?: string
          requirement_note?: string | null
          source?: string
          status?: string
          store_id: string
          updated_at?: string
          updated_by?: string | null
          warehouse_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          assigned_to_old?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string
          customer_id?: string
          deleted_at?: string | null
          delivered_at?: string | null
          display_id?: string
          fulfilled_by?: string | null
          fulfilled_by_sale_id?: string | null
          id?: string
          order_type?: string
          requirement_note?: string | null
          source?: string
          status?: string
          store_id?: string
          updated_at?: string
          updated_by?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "active_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balance_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_outstanding_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "recently_deleted_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_fulfilled_by_sale_id_fkey"
            columns: ["fulfilled_by_sale_id"]
            isOneToOne: false
            referencedRelation: "order_fulfillment_status"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "orders_fulfilled_by_sale_id_fkey"
            columns: ["fulfilled_by_sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "active_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "recently_deleted_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "store_outstanding_summary"
            referencedColumns: ["store_id"]
          },
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores_for_map"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "active_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "orders_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "orders_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      otp_rate_limits: {
        Row: {
          id: string
          ip_address: string | null
          phone: string
          requested_at: string
        }
        Insert: {
          id?: string
          ip_address?: string | null
          phone: string
          requested_at?: string
        }
        Update: {
          id?: string
          ip_address?: string | null
          phone?: string
          requested_at?: string
        }
        Relationships: []
      }
      otp_sessions: {
        Row: {
          attempts: number
          created_at: string
          expires_at: string
          id: string
          max_attempts: number
          otp_code: string
          phone_number: string
          session_token: string
          verified: boolean
          verified_at: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          expires_at?: string
          id?: string
          max_attempts?: number
          otp_code: string
          phone_number: string
          session_token: string
          verified?: boolean
          verified_at?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          expires_at?: string
          id?: string
          max_attempts?: number
          otp_code?: string
          phone_number?: string
          session_token?: string
          verified?: boolean
          verified_at?: string | null
        }
        Relationships: []
      }
      payment_returns: {
        Row: {
          created_at: string | null
          customer_id: string | null
          display_id: string
          id: string
          logged_by: string | null
          notes: string | null
          original_transaction_id: string
          reason: string
          recorded_by: string
          return_amount: number
          return_type: string
          status: string
          store_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          customer_id?: string | null
          display_id: string
          id?: string
          logged_by?: string | null
          notes?: string | null
          original_transaction_id: string
          reason: string
          recorded_by: string
          return_amount: number
          return_type: string
          status?: string
          store_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          customer_id?: string | null
          display_id?: string
          id?: string
          logged_by?: string | null
          notes?: string | null
          original_transaction_id?: string
          reason?: string
          recorded_by?: string
          return_amount?: number
          return_type?: string
          status?: string
          store_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_returns_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "active_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_returns_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balance_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "payment_returns_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_outstanding_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "payment_returns_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_returns_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "recently_deleted_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_returns_original_transaction_id_fkey"
            columns: ["original_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_returns_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "active_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_returns_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "recently_deleted_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_returns_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "store_outstanding_summary"
            referencedColumns: ["store_id"]
          },
          {
            foreignKeyName: "payment_returns_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_returns_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores_for_map"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_items: {
        Row: {
          amount: number | null
          created_at: string | null
          daily_rate: number | null
          days_worked: number | null
          id: string
          notes: string | null
          payroll_id: string | null
          updated_at: string | null
          worker_id: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          daily_rate?: number | null
          days_worked?: number | null
          id?: string
          notes?: string | null
          payroll_id?: string | null
          updated_at?: string | null
          worker_id?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          daily_rate?: number | null
          days_worked?: number | null
          id?: string
          notes?: string | null
          payroll_id?: string | null
          updated_at?: string | null
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_items_payroll_id_fkey"
            columns: ["payroll_id"]
            isOneToOne: false
            referencedRelation: "payrolls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_items_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      payrolls: {
        Row: {
          created_at: string | null
          created_by: string | null
          daily_rate: number | null
          days_worked: number | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          notes: string | null
          payment_date: string | null
          payment_mode: string | null
          period_end: string
          period_start: string
          status: string | null
          total_amount: number | null
          total_days: number | null
          updated_at: string | null
          warehouse_id: string | null
          worker_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          daily_rate?: number | null
          days_worked?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          notes?: string | null
          payment_date?: string | null
          payment_mode?: string | null
          period_end: string
          period_start: string
          status?: string | null
          total_amount?: number | null
          total_days?: number | null
          updated_at?: string | null
          warehouse_id?: string | null
          worker_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          daily_rate?: number | null
          days_worked?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          notes?: string | null
          payment_date?: string | null
          payment_mode?: string | null
          period_end?: string
          period_start?: string
          status?: string | null
          total_amount?: number | null
          total_days?: number | null
          updated_at?: string | null
          warehouse_id?: string | null
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payrolls_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "active_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payrolls_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payrolls_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payrolls_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      price_change_history: {
        Row: {
          changed_at: string
          changed_by: string
          changed_by_old: string | null
          id: string
          new_gst_rate: number | null
          new_mrp: number | null
          old_gst_rate: number | null
          old_mrp: number | null
          product_id: string
          reason: string | null
        }
        Insert: {
          changed_at?: string
          changed_by: string
          changed_by_old?: string | null
          id?: string
          new_gst_rate?: number | null
          new_mrp?: number | null
          old_gst_rate?: number | null
          old_mrp?: number | null
          product_id: string
          reason?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string
          changed_by_old?: string | null
          id?: string
          new_gst_rate?: number | null
          new_mrp?: number | null
          old_gst_rate?: number | null
          old_mrp?: number | null
          product_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_change_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "active_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_change_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_profit_summary"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "price_change_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      product_stock: {
        Row: {
          deleted_at: string | null
          id: string
          product_id: string
          quantity: number
          updated_at: string | null
          warehouse_id: string
        }
        Insert: {
          deleted_at?: string | null
          id?: string
          product_id: string
          quantity?: number
          updated_at?: string | null
          warehouse_id: string
        }
        Update: {
          deleted_at?: string | null
          id?: string
          product_id?: string
          quantity?: number
          updated_at?: string | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "active_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_profit_summary"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_stock_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      production_log: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          product_id: string
          production_date: string
          quantity_produced: number
          warehouse_id: string
          wastage_cost: number | null
          wastage_quantity: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          product_id: string
          production_date?: string
          quantity_produced: number
          warehouse_id: string
          wastage_cost?: number | null
          wastage_quantity?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          product_id?: string
          production_date?: string
          quantity_produced?: number
          warehouse_id?: string
          wastage_cost?: number | null
          wastage_quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_log_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "active_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_log_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_profit_summary"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "production_log_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_log_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          base_price: number
          category: string | null
          cost_price: number | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          enable_low_stock_alert: boolean | null
          gst_rate: number | null
          hsn_code: string | null
          id: string
          image_url: string | null
          is_active: boolean
          is_gst_inclusive: boolean | null
          min_stock_level: number | null
          minimum_stock: number | null
          name: string
          product_group: string | null
          sku: string
          unit: string
          updated_at: string
          updated_by: string | null
          warehouse_id: string | null
        }
        Insert: {
          base_price?: number
          category?: string | null
          cost_price?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          enable_low_stock_alert?: boolean | null
          gst_rate?: number | null
          hsn_code?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_gst_inclusive?: boolean | null
          min_stock_level?: number | null
          minimum_stock?: number | null
          name: string
          product_group?: string | null
          sku: string
          unit?: string
          updated_at?: string
          updated_by?: string | null
          warehouse_id?: string | null
        }
        Update: {
          base_price?: number
          category?: string | null
          cost_price?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          enable_low_stock_alert?: boolean | null
          gst_rate?: number | null
          hsn_code?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_gst_inclusive?: boolean | null
          min_stock_level?: number | null
          minimum_stock?: number | null
          name?: string
          product_group?: string | null
          sku?: string
          unit?: string
          updated_at?: string
          updated_by?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "active_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "products_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "products_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "active_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "products_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "products_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          daily_wage: number | null
          deleted_at: string | null
          deleted_by: string | null
          display_name: string | null
          email: string | null
          full_name: string
          google_linked: boolean
          holding_balance: number | null
          holding_balance_updated_at: string | null
          id: string
          is_active: boolean
          monthly_salary: number | null
          onboarding_complete: boolean
          paid_leaves_allowed: number | null
          phone: string | null
          phone_verified: boolean
          updated_at: string
          user_id: string
          wage_type: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          daily_wage?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          display_name?: string | null
          email?: string | null
          full_name?: string
          google_linked?: boolean
          holding_balance?: number | null
          holding_balance_updated_at?: string | null
          id?: string
          is_active?: boolean
          monthly_salary?: number | null
          onboarding_complete?: boolean
          paid_leaves_allowed?: number | null
          phone?: string | null
          phone_verified?: boolean
          updated_at?: string
          user_id: string
          wage_type?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          daily_wage?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          display_name?: string | null
          email?: string | null
          full_name?: string
          google_linked?: boolean
          holding_balance?: number | null
          holding_balance_updated_at?: string | null
          id?: string
          is_active?: boolean
          monthly_salary?: number | null
          onboarding_complete?: boolean
          paid_leaves_allowed?: number | null
          phone?: string | null
          phone_verified?: boolean
          updated_at?: string
          user_id?: string
          wage_type?: string | null
        }
        Relationships: []
      }
      proforma_invoices: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string | null
          deleted_at: string | null
          display_id: string
          id: string
          items: Json | null
          order_id: string
          status: string
          store_id: string | null
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          display_id: string
          id?: string
          items?: Json | null
          order_id: string
          status?: string
          store_id?: string | null
          total_amount?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          display_id?: string
          id?: string
          items?: Json | null
          order_id?: string
          status?: string
          store_id?: string | null
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proforma_invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "active_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proforma_invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balance_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "proforma_invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_outstanding_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "proforma_invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proforma_invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "recently_deleted_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proforma_invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_fulfillment_status"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "proforma_invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proforma_invoices_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "active_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proforma_invoices_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "recently_deleted_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proforma_invoices_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "store_outstanding_summary"
            referencedColumns: ["store_id"]
          },
          {
            foreignKeyName: "proforma_invoices_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proforma_invoices_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores_for_map"
            referencedColumns: ["id"]
          },
        ]
      }
      promotional_banners: {
        Row: {
          created_at: string
          created_by: string
          crop_data: Json | null
          description: string | null
          end_date: string | null
          ends_at: string | null
          id: string
          image_url: string
          is_active: boolean
          link_url: string | null
          priority: number | null
          sort_order: number
          start_date: string | null
          starts_at: string | null
          store_type_id: string | null
          target_customer_ids: string[] | null
          target_store_type_ids: string[] | null
          title: string
        }
        Insert: {
          created_at?: string
          created_by: string
          crop_data?: Json | null
          description?: string | null
          end_date?: string | null
          ends_at?: string | null
          id?: string
          image_url: string
          is_active?: boolean
          link_url?: string | null
          priority?: number | null
          sort_order?: number
          start_date?: string | null
          starts_at?: string | null
          store_type_id?: string | null
          target_customer_ids?: string[] | null
          target_store_type_ids?: string[] | null
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string
          crop_data?: Json | null
          description?: string | null
          end_date?: string | null
          ends_at?: string | null
          id?: string
          image_url?: string
          is_active?: boolean
          link_url?: string | null
          priority?: number | null
          sort_order?: number
          start_date?: string | null
          starts_at?: string | null
          store_type_id?: string | null
          target_customer_ids?: string[] | null
          target_store_type_ids?: string[] | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotional_banners_store_type_id_fkey"
            columns: ["store_type_id"]
            isOneToOne: false
            referencedRelation: "store_types"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_items: {
        Row: {
          batch_number: string | null
          created_at: string | null
          deleted_at: string | null
          deleted_by: string | null
          expiry_date: string | null
          id: string
          notes: string | null
          product_id: string | null
          purchase_id: string | null
          purchase_order_id: string | null
          quantity: number
          raw_material_id: string | null
          total_cost: number | null
          unit_cost: number
        }
        Insert: {
          batch_number?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          expiry_date?: string | null
          id?: string
          notes?: string | null
          product_id?: string | null
          purchase_id?: string | null
          purchase_order_id?: string | null
          quantity: number
          raw_material_id?: string | null
          total_cost?: number | null
          unit_cost: number
        }
        Update: {
          batch_number?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          expiry_date?: string | null
          id?: string
          notes?: string | null
          product_id?: string | null
          purchase_id?: string | null
          purchase_order_id?: string | null
          quantity?: number
          raw_material_id?: string | null
          total_cost?: number | null
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "active_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_profit_summary"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "purchase_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_raw_material_id_fkey"
            columns: ["raw_material_id"]
            isOneToOne: false
            referencedRelation: "raw_materials"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          display_id: string | null
          expected_delivery: string | null
          id: string
          notes: string | null
          order_date: string
          status: string | null
          total_amount: number | null
          updated_at: string | null
          vendor_id: string | null
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          display_id?: string | null
          expected_delivery?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          status?: string | null
          total_amount?: number | null
          updated_at?: string | null
          vendor_id?: string | null
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          display_id?: string | null
          expected_delivery?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          status?: string | null
          total_amount?: number | null
          updated_at?: string | null
          vendor_id?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "active_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "purchase_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_balance_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_return_items: {
        Row: {
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          item_id: string | null
          item_type: string
          purchase_item_id: string | null
          quantity: number
          return_id: string
          total: number
          unit_price: number
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          item_id?: string | null
          item_type?: string
          purchase_item_id?: string | null
          quantity?: number
          return_id: string
          total?: number
          unit_price?: number
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          item_id?: string | null
          item_type?: string
          purchase_item_id?: string | null
          quantity?: number
          return_id?: string
          total?: number
          unit_price?: number
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_return_items_purchase_item_id_fkey"
            columns: ["purchase_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "purchase_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_return_items_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_returns: {
        Row: {
          approved_at: string | null
          approved_by: string
          approved_by_old: string | null
          created_at: string
          created_by: string
          created_by_old: string | null
          deleted_at: string | null
          display_id: string
          id: string
          notes: string | null
          purchase_id: string | null
          reason: string | null
          return_date: string
          status: string
          total_amount: number
          updated_at: string
          vendor_id: string | null
          warehouse_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by: string
          approved_by_old?: string | null
          created_at?: string
          created_by: string
          created_by_old?: string | null
          deleted_at?: string | null
          display_id: string
          id?: string
          notes?: string | null
          purchase_id?: string | null
          reason?: string | null
          return_date?: string
          status?: string
          total_amount?: number
          updated_at?: string
          vendor_id?: string | null
          warehouse_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string
          approved_by_old?: string | null
          created_at?: string
          created_by?: string
          created_by_old?: string | null
          deleted_at?: string | null
          display_id?: string
          id?: string
          notes?: string | null
          purchase_id?: string | null
          reason?: string | null
          return_date?: string
          status?: string
          total_amount?: number
          updated_at?: string
          vendor_id?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_returns_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_returns_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_balance_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_returns_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_returns_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          bill_amount: number
          bill_number: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          discount_amount: number | null
          display_id: string
          id: string
          notes: string | null
          purchase_date: string
          status: string | null
          tax_amount: number | null
          total_amount: number | null
          updated_at: string | null
          vendor_id: string
          warehouse_id: string | null
        }
        Insert: {
          bill_amount: number
          bill_number?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          discount_amount?: number | null
          display_id: string
          id?: string
          notes?: string | null
          purchase_date?: string
          status?: string | null
          tax_amount?: number | null
          total_amount?: number | null
          updated_at?: string | null
          vendor_id: string
          warehouse_id?: string | null
        }
        Update: {
          bill_amount?: number
          bill_number?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          discount_amount?: number | null
          display_id?: string
          id?: string
          notes?: string | null
          purchase_date?: string
          status?: string | null
          tax_amount?: number | null
          total_amount?: number | null
          updated_at?: string | null
          vendor_id?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchases_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_balance_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
      raw_material_adjustments: {
        Row: {
          adjusted_by: string
          adjustment_type: string
          created_at: string
          display_id: string
          id: string
          performed_by: string | null
          quantity_after: number
          quantity_before: number
          quantity_change: number
          raw_material_id: string
          reason: string | null
          reference_id: string | null
          warehouse_id: string
        }
        Insert: {
          adjusted_by: string
          adjustment_type: string
          created_at?: string
          display_id: string
          id?: string
          performed_by?: string | null
          quantity_after: number
          quantity_before: number
          quantity_change: number
          raw_material_id: string
          reason?: string | null
          reference_id?: string | null
          warehouse_id: string
        }
        Update: {
          adjusted_by?: string
          adjustment_type?: string
          created_at?: string
          display_id?: string
          id?: string
          performed_by?: string | null
          quantity_after?: number
          quantity_before?: number
          quantity_change?: number
          raw_material_id?: string
          reason?: string | null
          reference_id?: string | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "raw_material_adjustments_raw_material_id_fkey"
            columns: ["raw_material_id"]
            isOneToOne: false
            referencedRelation: "raw_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_material_adjustments_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_material_categories: {
        Row: {
          base_unit: string
          created_at: string
          description: string | null
          id: string
          name: string
          warehouse_id: string | null
        }
        Insert: {
          base_unit?: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          warehouse_id?: string | null
        }
        Update: {
          base_unit?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "raw_material_categories_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_material_stock: {
        Row: {
          created_at: string
          id: string
          quantity: number
          raw_material_id: string
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          quantity?: number
          raw_material_id: string
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          created_at?: string
          id?: string
          quantity?: number
          raw_material_id?: string
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "raw_material_stock_raw_material_id_fkey"
            columns: ["raw_material_id"]
            isOneToOne: false
            referencedRelation: "raw_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_material_stock_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_materials: {
        Row: {
          category: string | null
          category_id: string | null
          created_at: string | null
          created_by: string | null
          current_stock: number | null
          deleted_at: string | null
          description: string | null
          display_id: string
          enable_low_stock_alert: boolean | null
          hsn_code: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          min_stock_level: number | null
          minimum_stock: number | null
          name: string
          piece_weight_grams: number | null
          pieces_per_case: number | null
          unit: string
          unit_cost: number | null
          updated_at: string | null
          updated_by: string | null
          vendor_id: string | null
          warehouse_id: string | null
        }
        Insert: {
          category?: string | null
          category_id?: string | null
          created_at?: string | null
          created_by?: string | null
          current_stock?: number | null
          deleted_at?: string | null
          description?: string | null
          display_id: string
          enable_low_stock_alert?: boolean | null
          hsn_code?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          min_stock_level?: number | null
          minimum_stock?: number | null
          name: string
          piece_weight_grams?: number | null
          pieces_per_case?: number | null
          unit?: string
          unit_cost?: number | null
          updated_at?: string | null
          updated_by?: string | null
          vendor_id?: string | null
          warehouse_id?: string | null
        }
        Update: {
          category?: string | null
          category_id?: string | null
          created_at?: string | null
          created_by?: string | null
          current_stock?: number | null
          deleted_at?: string | null
          description?: string | null
          display_id?: string
          enable_low_stock_alert?: boolean | null
          hsn_code?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          min_stock_level?: number | null
          minimum_stock?: number | null
          name?: string
          piece_weight_grams?: number | null
          pieces_per_case?: number | null
          unit?: string
          unit_cost?: number | null
          updated_at?: string | null
          updated_by?: string | null
          vendor_id?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "raw_materials_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "raw_material_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_materials_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "active_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "raw_materials_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "raw_materials_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_balance_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_materials_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_materials_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_issues: {
        Row: {
          calculated_outstanding: number | null
          created_at: string | null
          current_outstanding: number | null
          difference: number | null
          id: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          run_id: string | null
          severity: string | null
          status: string | null
          store_id: string | null
        }
        Insert: {
          calculated_outstanding?: number | null
          created_at?: string | null
          current_outstanding?: number | null
          difference?: number | null
          id?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          run_id?: string | null
          severity?: string | null
          status?: string | null
          store_id?: string | null
        }
        Update: {
          calculated_outstanding?: number | null
          created_at?: string | null
          current_outstanding?: number | null
          difference?: number | null
          id?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          run_id?: string | null
          severity?: string | null
          status?: string | null
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_issues_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "reconciliation_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_issues_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "reconciliation_status"
            referencedColumns: ["run_id"]
          },
          {
            foreignKeyName: "reconciliation_issues_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "active_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_issues_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "recently_deleted_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_issues_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "store_outstanding_summary"
            referencedColumns: ["store_id"]
          },
          {
            foreignKeyName: "reconciliation_issues_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_issues_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores_for_map"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_runs: {
        Row: {
          auto_resolved: number | null
          completed_at: string | null
          critical_issues: number | null
          duration_seconds: number | null
          high_issues: number | null
          id: string
          medium_issues: number | null
          mismatched_stores: number | null
          notes: string | null
          run_at: string | null
          run_by: string | null
          status: string | null
          total_stores: number | null
        }
        Insert: {
          auto_resolved?: number | null
          completed_at?: string | null
          critical_issues?: number | null
          duration_seconds?: number | null
          high_issues?: number | null
          id?: string
          medium_issues?: number | null
          mismatched_stores?: number | null
          notes?: string | null
          run_at?: string | null
          run_by?: string | null
          status?: string | null
          total_stores?: number | null
        }
        Update: {
          auto_resolved?: number | null
          completed_at?: string | null
          critical_issues?: number | null
          duration_seconds?: number | null
          high_issues?: number | null
          id?: string
          medium_issues?: number | null
          mismatched_stores?: number | null
          notes?: string | null
          run_at?: string | null
          run_by?: string | null
          status?: string | null
          total_stores?: number | null
        }
        Relationships: []
      }
      route_sessions: {
        Row: {
          created_at: string
          current_lat: number | null
          current_lng: number | null
          end_lat: number | null
          end_lng: number | null
          ended_at: string | null
          id: string
          location_updated_at: string | null
          route_id: string
          start_lat: number | null
          start_lng: number | null
          started_at: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_lat?: number | null
          current_lng?: number | null
          end_lat?: number | null
          end_lng?: number | null
          ended_at?: string | null
          id?: string
          location_updated_at?: string | null
          route_id: string
          start_lat?: number | null
          start_lng?: number | null
          started_at?: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_lat?: number | null
          current_lng?: number | null
          end_lat?: number | null
          end_lng?: number | null
          ended_at?: string | null
          id?: string
          location_updated_at?: string | null
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
          auto_sort_by_proximity: boolean | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          factory_lat: number | null
          factory_lng: number | null
          id: string
          is_active: boolean
          name: string
          start_latitude: number | null
          start_longitude: number | null
          store_type_id: string
          updated_by: string | null
          warehouse_id: string | null
        }
        Insert: {
          auto_sort_by_proximity?: boolean | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          factory_lat?: number | null
          factory_lng?: number | null
          id?: string
          is_active?: boolean
          name: string
          start_latitude?: number | null
          start_longitude?: number | null
          store_type_id: string
          updated_by?: string | null
          warehouse_id?: string | null
        }
        Update: {
          auto_sort_by_proximity?: boolean | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          factory_lat?: number | null
          factory_lng?: number | null
          id?: string
          is_active?: boolean
          name?: string
          start_latitude?: number | null
          start_longitude?: number | null
          store_type_id?: string
          updated_by?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "routes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "active_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "routes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "routes_store_type_id_fkey"
            columns: ["store_type_id"]
            isOneToOne: false
            referencedRelation: "store_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "active_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "routes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "routes_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          cost_price: number | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          product_id: string
          profit: number | null
          quantity: number
          sale_id: string
          total_price: number
          unit_price: number
          warehouse_id: string | null
        }
        Insert: {
          cost_price?: number | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          product_id: string
          profit?: number | null
          quantity?: number
          sale_id: string
          total_price?: number
          unit_price?: number
          warehouse_id?: string | null
        }
        Update: {
          cost_price?: number | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          product_id?: string
          profit?: number | null
          quantity?: number
          sale_id?: string
          total_price?: number
          unit_price?: number
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "active_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_profit_summary"
            referencedColumns: ["product_id"]
          },
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
            referencedRelation: "order_fulfillment_status"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_return_items: {
        Row: {
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          product_id: string | null
          quantity: number
          return_id: string
          sale_item_id: string | null
          total: number
          unit_price: number
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          product_id?: string | null
          quantity?: number
          return_id: string
          sale_item_id?: string | null
          total?: number
          unit_price?: number
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          product_id?: string | null
          quantity?: number
          return_id?: string
          sale_item_id?: string | null
          total?: number
          unit_price?: number
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "active_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_profit_summary"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "sale_return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "sale_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "sale_returns_detail"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_return_items_sale_item_id_fkey"
            columns: ["sale_item_id"]
            isOneToOne: false
            referencedRelation: "sale_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_return_items_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_returns: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          approved_by_old: string | null
          cash_refund: number | null
          created_at: string
          created_by: string
          created_by_old: string | null
          customer_id: string | null
          deleted_at: string | null
          display_id: string
          id: string
          is_damaged: boolean | null
          notes: string | null
          outstanding_adjustment: number | null
          processed_at: string | null
          processed_by: string | null
          reason: string | null
          rejection_reason: string | null
          return_date: string
          return_items: Json | null
          return_type: string | null
          sale_id: string | null
          status: string
          store_id: string | null
          total_amount: number
          updated_at: string
          upi_refund: number | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          approved_by_old?: string | null
          cash_refund?: number | null
          created_at?: string
          created_by: string
          created_by_old?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          display_id: string
          id?: string
          is_damaged?: boolean | null
          notes?: string | null
          outstanding_adjustment?: number | null
          processed_at?: string | null
          processed_by?: string | null
          reason?: string | null
          rejection_reason?: string | null
          return_date?: string
          return_items?: Json | null
          return_type?: string | null
          sale_id?: string | null
          status?: string
          store_id?: string | null
          total_amount?: number
          updated_at?: string
          upi_refund?: number | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          approved_by_old?: string | null
          cash_refund?: number | null
          created_at?: string
          created_by?: string
          created_by_old?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          display_id?: string
          id?: string
          is_damaged?: boolean | null
          notes?: string | null
          outstanding_adjustment?: number | null
          processed_at?: string | null
          processed_by?: string | null
          reason?: string | null
          rejection_reason?: string | null
          return_date?: string
          return_items?: Json | null
          return_type?: string | null
          sale_id?: string | null
          status?: string
          store_id?: string | null
          total_amount?: number
          updated_at?: string
          upi_refund?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_returns_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "active_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "sale_returns_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "sale_returns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "active_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "sale_returns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "sale_returns_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "active_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_returns_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balance_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "sale_returns_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_outstanding_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "sale_returns_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_returns_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "recently_deleted_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_returns_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "order_fulfillment_status"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "sale_returns_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_returns_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "active_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_returns_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "recently_deleted_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_returns_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "store_outstanding_summary"
            referencedColumns: ["store_id"]
          },
          {
            foreignKeyName: "sale_returns_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_returns_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores_for_map"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          assigned_to: string | null
          cash_amount: number
          created_at: string
          created_by: string | null
          customer_id: string
          deleted_at: string | null
          display_id: string
          fulfilled_order_id: string | null
          has_invoice: boolean | null
          id: string
          logged_by: string | null
          new_outstanding: number
          notes: string | null
          old_outstanding: number
          order_id: string | null
          outstanding_amount: number
          recorded_by: string
          store_id: string
          total_amount: number
          updated_at: string
          updated_by: string | null
          upi_amount: number
          warehouse_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          cash_amount?: number
          created_at?: string
          created_by?: string | null
          customer_id: string
          deleted_at?: string | null
          display_id: string
          fulfilled_order_id?: string | null
          has_invoice?: boolean | null
          id?: string
          logged_by?: string | null
          new_outstanding?: number
          notes?: string | null
          old_outstanding?: number
          order_id?: string | null
          outstanding_amount?: number
          recorded_by: string
          store_id: string
          total_amount?: number
          updated_at?: string
          updated_by?: string | null
          upi_amount?: number
          warehouse_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          cash_amount?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string
          deleted_at?: string | null
          display_id?: string
          fulfilled_order_id?: string | null
          has_invoice?: boolean | null
          id?: string
          logged_by?: string | null
          new_outstanding?: number
          notes?: string | null
          old_outstanding?: number
          order_id?: string | null
          outstanding_amount?: number
          recorded_by?: string
          store_id?: string
          total_amount?: number
          updated_at?: string
          updated_by?: string | null
          upi_amount?: number
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "active_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "sales_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "active_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balance_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_outstanding_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "recently_deleted_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_fulfilled_order_id_fkey"
            columns: ["fulfilled_order_id"]
            isOneToOne: false
            referencedRelation: "order_fulfillment_status"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "sales_fulfilled_order_id_fkey"
            columns: ["fulfilled_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_fulfillment_status"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "sales_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "active_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "recently_deleted_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "store_outstanding_summary"
            referencedColumns: ["store_id"]
          },
          {
            foreignKeyName: "sales_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores_for_map"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "active_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "sales_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "sales_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      schema_audit: {
        Row: {
          changes_made: Json
          created_by: string | null
          id: string
          migration_date: string
          notes: string | null
          rule_applied: string
          tables_affected: string[]
        }
        Insert: {
          changes_made: Json
          created_by?: string | null
          id?: string
          migration_date?: string
          notes?: string | null
          rule_applied: string
          tables_affected: string[]
        }
        Update: {
          changes_made?: Json
          created_by?: string | null
          id?: string
          migration_date?: string
          notes?: string | null
          rule_applied?: string
          tables_affected?: string[]
        }
        Relationships: []
      }
      shift_rates: {
        Row: {
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          display_id: string
          duration_hours: number
          end_time: string | null
          id: string
          is_active: boolean | null
          rate_amount: number
          shift_name: string
          start_time: string | null
          updated_at: string | null
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          display_id: string
          duration_hours: number
          end_time?: string | null
          id?: string
          is_active?: boolean | null
          rate_amount: number
          shift_name: string
          start_time?: string | null
          updated_at?: string | null
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          display_id?: string
          duration_hours?: number
          end_time?: string | null
          id?: string
          is_active?: boolean | null
          rate_amount?: number
          shift_name?: string
          start_time?: string | null
          updated_at?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shift_rates_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_jobs: {
        Row: {
          body: string | null
          created_at: string
          delivered_at: string | null
          error: string | null
          id: string
          sent_at: string | null
          status: string
          template_name: string | null
          template_vars: Json | null
          to_phone: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          delivered_at?: string | null
          error?: string | null
          id?: string
          sent_at?: string | null
          status?: string
          template_name?: string | null
          template_vars?: Json | null
          to_phone: string
        }
        Update: {
          body?: string | null
          created_at?: string
          delivered_at?: string | null
          error?: string | null
          id?: string
          sent_at?: string | null
          status?: string
          template_name?: string | null
          template_vars?: Json | null
          to_phone?: string
        }
        Relationships: []
      }
      staff_cash_accounts: {
        Row: {
          account_type: string | null
          cash_amount: number | null
          cash_balance: number | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          last_reset_at: string | null
          reset_amount: number | null
          updated_at: string | null
          updated_by: string | null
          upi_amount: number | null
          user_id: string
          warehouse_id: string | null
        }
        Insert: {
          account_type?: string | null
          cash_amount?: number | null
          cash_balance?: number | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          last_reset_at?: string | null
          reset_amount?: number | null
          updated_at?: string | null
          updated_by?: string | null
          upi_amount?: number | null
          user_id: string
          warehouse_id?: string | null
        }
        Update: {
          account_type?: string | null
          cash_amount?: number | null
          cash_balance?: number | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          last_reset_at?: string | null
          reset_amount?: number | null
          updated_at?: string | null
          updated_by?: string | null
          upi_amount?: number | null
          user_id?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_cash_accounts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "active_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "staff_cash_accounts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "staff_cash_accounts_staff_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "active_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "staff_cash_accounts_staff_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "staff_cash_accounts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "active_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "staff_cash_accounts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "staff_cash_accounts_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_directory: {
        Row: {
          avatar_url: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          updated_by: string | null
          user_id: string | null
          warehouse_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          phone?: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
          warehouse_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_directory_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "active_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "staff_directory_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "staff_directory_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "active_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "staff_directory_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "staff_directory_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          email: string
          full_name: string
          id: string
          invited_by: string
          notes: string | null
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: string
          warehouse_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          email: string
          full_name: string
          id?: string
          invited_by: string
          notes?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          warehouse_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string
          full_name?: string
          id?: string
          invited_by?: string
          notes?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_invitations_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_performance_logs: {
        Row: {
          actual_quantity: number | null
          created_at: string
          created_by: string | null
          difference: number | null
          expected_quantity: number | null
          id: string
          log_type: string
          notes: string | null
          product_id: string | null
          reference_id: string | null
          user_id: string
          warehouse_id: string | null
        }
        Insert: {
          actual_quantity?: number | null
          created_at?: string
          created_by?: string | null
          difference?: number | null
          expected_quantity?: number | null
          id?: string
          log_type: string
          notes?: string | null
          product_id?: string | null
          reference_id?: string | null
          user_id: string
          warehouse_id?: string | null
        }
        Update: {
          actual_quantity?: number | null
          created_at?: string
          created_by?: string | null
          difference?: number | null
          expected_quantity?: number | null
          id?: string
          log_type?: string
          notes?: string | null
          product_id?: string | null
          reference_id?: string | null
          user_id?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_performance_logs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "active_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_performance_logs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_profit_summary"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "staff_performance_logs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_performance_logs_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_stock: {
        Row: {
          amount_value: number | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          is_negative: boolean
          last_received_at: string | null
          last_sale_at: string | null
          product_id: string
          quantity: number
          transfer_count: number | null
          updated_at: string
          user_id: string
          warehouse_id: string
        }
        Insert: {
          amount_value?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_negative?: boolean
          last_received_at?: string | null
          last_sale_at?: string | null
          product_id: string
          quantity?: number
          transfer_count?: number | null
          updated_at?: string
          user_id: string
          warehouse_id: string
        }
        Update: {
          amount_value?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_negative?: boolean
          last_received_at?: string | null
          last_sale_at?: string | null
          product_id?: string
          quantity?: number
          transfer_count?: number | null
          updated_at?: string
          user_id?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "active_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_profit_summary"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "staff_stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_stock_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "active_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "staff_stock_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "staff_stock_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          agent_id: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          from_location: string | null
          from_user_id: string | null
          id: string
          product_id: string
          quantity: number
          raw_material_id: string | null
          reason: string | null
          reference_id: string | null
          to_location: string | null
          to_user_id: string | null
          total_value: number | null
          transfer_id: string | null
          type: string
          unit_price: number | null
          updated_at: string | null
          warehouse_id: string
        }
        Insert: {
          agent_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          from_location?: string | null
          from_user_id?: string | null
          id?: string
          product_id: string
          quantity: number
          raw_material_id?: string | null
          reason?: string | null
          reference_id?: string | null
          to_location?: string | null
          to_user_id?: string | null
          total_value?: number | null
          transfer_id?: string | null
          type: string
          unit_price?: number | null
          updated_at?: string | null
          warehouse_id: string
        }
        Update: {
          agent_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          from_location?: string | null
          from_user_id?: string | null
          id?: string
          product_id?: string
          quantity?: number
          raw_material_id?: string | null
          reason?: string | null
          reference_id?: string | null
          to_location?: string | null
          to_user_id?: string | null
          total_value?: number | null
          transfer_id?: string | null
          type?: string
          unit_price?: number | null
          updated_at?: string | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "active_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "stock_movements_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "active_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_profit_summary"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_raw_material_id_fkey"
            columns: ["raw_material_id"]
            isOneToOne: false
            referencedRelation: "raw_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "stock_transfers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          display_id: string | null
          from_user_id: string | null
          from_warehouse_id: string | null
          id: string
          product_id: string
          quantity: number
          rejected_at: string | null
          rejected_by: string | null
          request_notes: string | null
          request_type: string
          requested_at: string
          requested_by: string
          response_notes: string | null
          status: string
          to_user_id: string | null
          to_warehouse_id: string | null
          transfer_id: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          display_id?: string | null
          from_user_id?: string | null
          from_warehouse_id?: string | null
          id?: string
          product_id: string
          quantity: number
          rejected_at?: string | null
          rejected_by?: string | null
          request_notes?: string | null
          request_type: string
          requested_at?: string
          requested_by: string
          response_notes?: string | null
          status?: string
          to_user_id?: string | null
          to_warehouse_id?: string | null
          transfer_id?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          display_id?: string | null
          from_user_id?: string | null
          from_warehouse_id?: string | null
          id?: string
          product_id?: string
          quantity?: number
          rejected_at?: string | null
          rejected_by?: string | null
          request_notes?: string | null
          request_type?: string
          requested_at?: string
          requested_by?: string
          response_notes?: string | null
          status?: string
          to_user_id?: string | null
          to_warehouse_id?: string | null
          transfer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_requests_from_warehouse_id_fkey"
            columns: ["from_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_requests_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "active_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_requests_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_profit_summary"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "stock_requests_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_requests_to_warehouse_id_fkey"
            columns: ["to_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_requests_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "stock_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfers: {
        Row: {
          action_taken: string | null
          actual_quantity: number | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          difference: number | null
          display_id: string
          error_message: string | null
          from_user_id: string | null
          from_warehouse_id: string | null
          id: string
          is_approved: boolean | null
          product_id: string
          quantity: number
          reference_id: string | null
          rejection_reason: string | null
          requested_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
          to_user_id: string | null
          to_warehouse_id: string | null
          transfer_type: string
          updated_at: string | null
        }
        Insert: {
          action_taken?: string | null
          actual_quantity?: number | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          difference?: number | null
          display_id?: string
          error_message?: string | null
          from_user_id?: string | null
          from_warehouse_id?: string | null
          id?: string
          is_approved?: boolean | null
          product_id: string
          quantity: number
          reference_id?: string | null
          rejection_reason?: string | null
          requested_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          to_user_id?: string | null
          to_warehouse_id?: string | null
          transfer_type: string
          updated_at?: string | null
        }
        Update: {
          action_taken?: string | null
          actual_quantity?: number | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          difference?: number | null
          display_id?: string
          error_message?: string | null
          from_user_id?: string | null
          from_warehouse_id?: string | null
          id?: string
          is_approved?: boolean | null
          product_id?: string
          quantity?: number
          reference_id?: string | null
          rejection_reason?: string | null
          requested_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          to_user_id?: string | null
          to_warehouse_id?: string | null
          transfer_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfers_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "active_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "stock_transfers_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "stock_transfers_from_user_id_profiles_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "active_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "stock_transfers_from_user_id_profiles_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "stock_transfers_from_warehouse_id_fkey"
            columns: ["from_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "active_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_profit_summary"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "stock_transfers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_to_user_id_profiles_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "active_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "stock_transfers_to_user_id_profiles_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "stock_transfers_to_warehouse_id_fkey"
            columns: ["to_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      store_pricing: {
        Row: {
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          price: number
          product_id: string
          store_id: string
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          price?: number
          product_id: string
          store_id: string
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          price?: number
          product_id?: string
          store_id?: string
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_pricing_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "active_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_pricing_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_profit_summary"
            referencedColumns: ["product_id"]
          },
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
            referencedRelation: "active_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_pricing_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "recently_deleted_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_pricing_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "store_outstanding_summary"
            referencedColumns: ["store_id"]
          },
          {
            foreignKeyName: "store_pricing_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_pricing_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores_for_map"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_pricing_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
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
            referencedRelation: "active_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_qr_codes_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "recently_deleted_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_qr_codes_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "store_outstanding_summary"
            referencedColumns: ["store_id"]
          },
          {
            foreignKeyName: "store_qr_codes_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_qr_codes_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores_for_map"
            referencedColumns: ["id"]
          },
        ]
      }
      store_type_pricing: {
        Row: {
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          price: number
          product_id: string
          store_type_id: string
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          price?: number
          product_id: string
          store_type_id: string
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          price?: number
          product_id?: string
          store_type_id?: string
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_type_pricing_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "active_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_type_pricing_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_profit_summary"
            referencedColumns: ["product_id"]
          },
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
          {
            foreignKeyName: "store_type_pricing_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      store_type_products: {
        Row: {
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          product_id: string
          store_type_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          product_id: string
          store_type_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          product_id?: string
          store_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_type_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "active_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_type_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_profit_summary"
            referencedColumns: ["product_id"]
          },
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
          credit_limit_kyc: number
          credit_limit_no_kyc: number
          id: string
          is_active: boolean
          name: string
          order_type: string
        }
        Insert: {
          auto_order_enabled?: boolean
          created_at?: string
          credit_limit_kyc?: number
          credit_limit_no_kyc?: number
          id?: string
          is_active?: boolean
          name: string
          order_type?: string
        }
        Update: {
          auto_order_enabled?: boolean
          created_at?: string
          credit_limit_kyc?: number
          credit_limit_no_kyc?: number
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
            referencedRelation: "active_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_visits_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "recently_deleted_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_visits_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "store_outstanding_summary"
            referencedColumns: ["store_id"]
          },
          {
            foreignKeyName: "store_visits_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_visits_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores_for_map"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          address: string | null
          alternate_phone: string | null
          area: string | null
          bypass_geofence_on_qr: boolean | null
          city: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          days_since_visit: number | null
          deleted_at: string | null
          deleted_by: string | null
          display_id: string
          district: string | null
          flag_for_visit: boolean | null
          id: string
          is_active: boolean
          is_default_shop: boolean | null
          lat: number | null
          latitude: number | null
          lng: number | null
          location_pinpointed_at: string | null
          longitude: number | null
          name: string
          opening_balance: number
          outstanding: number
          phone: string | null
          photo_url: string | null
          pincode: string | null
          route_id: string | null
          state: string | null
          store_order: number | null
          store_type_id: string
          street: string | null
          updated_at: string
          updated_by: string | null
          warehouse_id: string | null
        }
        Insert: {
          address?: string | null
          alternate_phone?: string | null
          area?: string | null
          bypass_geofence_on_qr?: boolean | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          days_since_visit?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          display_id: string
          district?: string | null
          flag_for_visit?: boolean | null
          id?: string
          is_active?: boolean
          is_default_shop?: boolean | null
          lat?: number | null
          latitude?: number | null
          lng?: number | null
          location_pinpointed_at?: string | null
          longitude?: number | null
          name: string
          opening_balance?: number
          outstanding?: number
          phone?: string | null
          photo_url?: string | null
          pincode?: string | null
          route_id?: string | null
          state?: string | null
          store_order?: number | null
          store_type_id: string
          street?: string | null
          updated_at?: string
          updated_by?: string | null
          warehouse_id?: string | null
        }
        Update: {
          address?: string | null
          alternate_phone?: string | null
          area?: string | null
          bypass_geofence_on_qr?: boolean | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          days_since_visit?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          display_id?: string
          district?: string | null
          flag_for_visit?: boolean | null
          id?: string
          is_active?: boolean
          is_default_shop?: boolean | null
          lat?: number | null
          latitude?: number | null
          lng?: number | null
          location_pinpointed_at?: string | null
          longitude?: number | null
          name?: string
          opening_balance?: number
          outstanding?: number
          phone?: string | null
          photo_url?: string | null
          pincode?: string | null
          route_id?: string | null
          state?: string | null
          store_order?: number | null
          store_type_id?: string
          street?: string | null
          updated_at?: string
          updated_by?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stores_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "active_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "stores_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "stores_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "active_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stores_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balance_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "stores_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_outstanding_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "stores_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stores_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "recently_deleted_customers"
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
          {
            foreignKeyName: "stores_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "active_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "stores_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "stores_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          assigned_to: string | null
          cash_amount: number
          created_at: string
          created_by: string | null
          customer_id: string
          deleted_at: string | null
          display_id: string
          id: string
          logged_by: string | null
          new_outstanding: number
          notes: string | null
          old_outstanding: number
          payment_date: string
          recorded_by: string
          store_id: string
          total_amount: number
          updated_at: string
          updated_by: string | null
          upi_amount: number
          warehouse_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          cash_amount?: number
          created_at?: string
          created_by?: string | null
          customer_id: string
          deleted_at?: string | null
          display_id: string
          id?: string
          logged_by?: string | null
          new_outstanding?: number
          notes?: string | null
          old_outstanding?: number
          payment_date?: string
          recorded_by: string
          store_id: string
          total_amount?: number
          updated_at?: string
          updated_by?: string | null
          upi_amount?: number
          warehouse_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          cash_amount?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string
          deleted_at?: string | null
          display_id?: string
          id?: string
          logged_by?: string | null
          new_outstanding?: number
          notes?: string | null
          old_outstanding?: number
          payment_date?: string
          recorded_by?: string
          store_id?: string
          total_amount?: number
          updated_at?: string
          updated_by?: string | null
          upi_amount?: number
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "active_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "active_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balance_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_outstanding_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "recently_deleted_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "active_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "recently_deleted_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "store_outstanding_summary"
            referencedColumns: ["store_id"]
          },
          {
            foreignKeyName: "transactions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores_for_map"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "active_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "transactions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "transactions_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_conversions: {
        Row: {
          conversion_rate: number
          created_at: string
          from_unit: string
          id: string
          raw_material_id: string | null
          to_unit: string
          warehouse_id: string | null
        }
        Insert: {
          conversion_rate: number
          created_at?: string
          from_unit: string
          id?: string
          raw_material_id?: string | null
          to_unit: string
          warehouse_id?: string | null
        }
        Update: {
          conversion_rate?: number
          created_at?: string
          from_unit?: string
          id?: string
          raw_material_id?: string | null
          to_unit?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "unit_conversions_raw_material_id_fkey"
            columns: ["raw_material_id"]
            isOneToOne: false
            referencedRelation: "raw_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_conversions_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      user_order_access: {
        Row: {
          access_level: string
          created_at: string | null
          route_ids: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_level?: string
          created_at?: string | null
          route_ids?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_level?: string
          created_at?: string | null
          route_ids?: Json | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_order_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "active_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_order_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          permission: string
          updated_at: string
          user_id: string
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          permission: string
          updated_at?: string
          user_id: string
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          permission?: string
          updated_at?: string
          user_id?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
          warehouse_id: string | null
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
          warehouse_id?: string | null
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          capacity_kg: number
          capacity_volume: number | null
          created_at: string
          driver_id: string | null
          id: string
          mileage_kmpl: number | null
          plate_number: string
          status: string
          warehouse_id: string | null
        }
        Insert: {
          capacity_kg: number
          capacity_volume?: number | null
          created_at?: string
          driver_id?: string | null
          id?: string
          mileage_kmpl?: number | null
          plate_number: string
          status?: string
          warehouse_id?: string | null
        }
        Update: {
          capacity_kg?: number
          capacity_volume?: number | null
          created_at?: string
          driver_id?: string | null
          id?: string
          mileage_kmpl?: number | null
          plate_number?: string
          status?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "staff_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_payments: {
        Row: {
          amount: number
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          display_id: string
          id: string
          notes: string | null
          payment_date: string
          payment_method: string | null
          payment_reference: string | null
          status: string | null
          updated_at: string | null
          vendor_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          display_id: string
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
          payment_reference?: string | null
          status?: string | null
          updated_at?: string | null
          vendor_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          display_id?: string
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
          payment_reference?: string | null
          status?: string | null
          updated_at?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_payments_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_balance_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_payments_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_raw_materials: {
        Row: {
          created_at: string | null
          id: string
          is_preferred: boolean | null
          lead_time_days: number | null
          notes: string | null
          raw_material_id: string
          unit_price: number | null
          vendor_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_preferred?: boolean | null
          lead_time_days?: number | null
          notes?: string | null
          raw_material_id: string
          unit_price?: number | null
          vendor_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_preferred?: boolean | null
          lead_time_days?: number | null
          notes?: string | null
          raw_material_id?: string
          unit_price?: number | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_raw_materials_raw_material_id_fkey"
            columns: ["raw_material_id"]
            isOneToOne: false
            referencedRelation: "raw_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_raw_materials_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_balance_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_raw_materials_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_transactions: {
        Row: {
          amount: number
          balance_after: number
          balance_before: number
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          display_id: string | null
          id: string
          notes: string | null
          reference_id: string | null
          reference_type: string | null
          transaction_type: string
          vendor_id: string | null
        }
        Insert: {
          amount?: number
          balance_after?: number
          balance_before?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          display_id?: string | null
          id?: string
          notes?: string | null
          reference_id?: string | null
          reference_type?: string | null
          transaction_type: string
          vendor_id?: string | null
        }
        Update: {
          amount?: number
          balance_after?: number
          balance_before?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          display_id?: string | null
          id?: string
          notes?: string | null
          reference_id?: string | null
          reference_type?: string | null
          transaction_type?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_transactions_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_balance_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_transactions_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          address: string | null
          contact_person: string | null
          created_at: string | null
          created_by: string | null
          credit_limit: number | null
          deleted_at: string | null
          deleted_by: string | null
          display_id: string
          email: string | null
          gstin: string | null
          id: string
          is_active: boolean | null
          name: string
          notes: string | null
          outstanding: number | null
          pan: string | null
          payment_terms: string | null
          phone: string | null
          total_credit: number | null
          total_debit: number | null
          updated_at: string | null
          warehouse_id: string | null
        }
        Insert: {
          address?: string | null
          contact_person?: string | null
          created_at?: string | null
          created_by?: string | null
          credit_limit?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          display_id: string
          email?: string | null
          gstin?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          notes?: string | null
          outstanding?: number | null
          pan?: string | null
          payment_terms?: string | null
          phone?: string | null
          total_credit?: number | null
          total_debit?: number | null
          updated_at?: string | null
          warehouse_id?: string | null
        }
        Update: {
          address?: string | null
          contact_person?: string | null
          created_at?: string | null
          created_by?: string | null
          credit_limit?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          display_id?: string
          email?: string | null
          gstin?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          notes?: string | null
          outstanding?: number | null
          pan?: string | null
          payment_terms?: string | null
          phone?: string | null
          total_credit?: number | null
          total_debit?: number | null
          updated_at?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendors_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      wac_cost_history: {
        Row: {
          created_at: string
          id: string
          new_cost: number
          old_cost: number
          raw_material_id: string | null
          reason: string | null
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          new_cost: number
          old_cost: number
          raw_material_id?: string | null
          reason?: string | null
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          new_cost?: number
          old_cost?: number
          raw_material_id?: string | null
          reason?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wac_cost_history_raw_material_id_fkey"
            columns: ["raw_material_id"]
            isOneToOne: false
            referencedRelation: "raw_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wac_cost_history_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          address: string | null
          city: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          enable_geofencing: boolean | null
          geofence_radius_meters: number | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          latitude: number | null
          location: string | null
          longitude: number | null
          name: string
          phone: string | null
          pincode: string | null
          state: string | null
          type: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          enable_geofencing?: boolean | null
          geofence_radius_meters?: number | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          name: string
          phone?: string | null
          pincode?: string | null
          state?: string | null
          type?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          enable_geofencing?: boolean | null
          geofence_radius_meters?: number | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          name?: string
          phone?: string | null
          pincode?: string | null
          state?: string | null
          type?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "active_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "warehouses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "warehouses_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "active_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "warehouses_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      worker_balances: {
        Row: {
          deleted_at: string | null
          deleted_by: string | null
          id: string
          outstanding_balance: number | null
          total_earned: number | null
          total_paid: number | null
          updated_at: string | null
          user_id: string | null
          warehouse_id: string | null
          worker_id: string | null
        }
        Insert: {
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          outstanding_balance?: number | null
          total_earned?: number | null
          total_paid?: number | null
          updated_at?: string | null
          user_id?: string | null
          warehouse_id?: string | null
          worker_id?: string | null
        }
        Update: {
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          outstanding_balance?: number | null
          total_earned?: number | null
          total_paid?: number | null
          updated_at?: string | null
          user_id?: string | null
          warehouse_id?: string | null
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "worker_balances_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_balances_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: true
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_payments: {
        Row: {
          amount: number
          created_at: string | null
          created_by: string | null
          deduction_from_payout: boolean | null
          deleted_at: string | null
          deleted_by: string | null
          display_id: string
          id: string
          is_advance: boolean | null
          notes: string | null
          payment_date: string
          payment_method: string | null
          reference_number: string | null
          user_id: string | null
          warehouse_id: string | null
          worker_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          created_by?: string | null
          deduction_from_payout?: boolean | null
          deleted_at?: string | null
          deleted_by?: string | null
          display_id: string
          id?: string
          is_advance?: boolean | null
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
          reference_number?: string | null
          user_id?: string | null
          warehouse_id?: string | null
          worker_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          created_by?: string | null
          deduction_from_payout?: boolean | null
          deleted_at?: string | null
          deleted_by?: string | null
          display_id?: string
          id?: string
          is_advance?: boolean | null
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
          reference_number?: string | null
          user_id?: string | null
          warehouse_id?: string | null
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "worker_payments_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_payments_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_roles: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "worker_roles_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      workers: {
        Row: {
          address: string | null
          attendance_required: boolean | null
          created_at: string | null
          created_by: string | null
          daily_rate: number | null
          daily_wage: number | null
          deleted_at: string | null
          display_id: string
          email: string | null
          id: string
          is_active: boolean | null
          monthly_salary: number | null
          name: string
          paid_leaves_allowed: number | null
          phone: string | null
          updated_at: string | null
          updated_by: string | null
          wage_type: string | null
          warehouse_id: string | null
        }
        Insert: {
          address?: string | null
          attendance_required?: boolean | null
          created_at?: string | null
          created_by?: string | null
          daily_rate?: number | null
          daily_wage?: number | null
          deleted_at?: string | null
          display_id: string
          email?: string | null
          id?: string
          is_active?: boolean | null
          monthly_salary?: number | null
          name: string
          paid_leaves_allowed?: number | null
          phone?: string | null
          updated_at?: string | null
          updated_by?: string | null
          wage_type?: string | null
          warehouse_id?: string | null
        }
        Update: {
          address?: string | null
          attendance_required?: boolean | null
          created_at?: string | null
          created_by?: string | null
          daily_rate?: number | null
          daily_wage?: number | null
          deleted_at?: string | null
          display_id?: string
          email?: string | null
          id?: string
          is_active?: boolean | null
          monthly_salary?: number | null
          name?: string
          paid_leaves_allowed?: number | null
          phone?: string | null
          updated_at?: string | null
          updated_by?: string | null
          wage_type?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "active_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "workers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "workers_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "active_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "workers_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "workers_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      active_banners: {
        Row: {
          created_at: string | null
          created_by: string | null
          crop_data: Json | null
          description: string | null
          end_date: string | null
          ends_at: string | null
          id: string | null
          image_url: string | null
          is_active: boolean | null
          link_url: string | null
          priority: number | null
          sort_order: number | null
          start_date: string | null
          starts_at: string | null
          store_type_id: string | null
          target_customer_ids: string[] | null
          target_store_type_ids: string[] | null
          title: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          crop_data?: Json | null
          description?: string | null
          end_date?: string | null
          ends_at?: string | null
          id?: string | null
          image_url?: string | null
          is_active?: boolean | null
          link_url?: string | null
          priority?: number | null
          sort_order?: number | null
          start_date?: string | null
          starts_at?: string | null
          store_type_id?: string | null
          target_customer_ids?: string[] | null
          target_store_type_ids?: string[] | null
          title?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          crop_data?: Json | null
          description?: string | null
          end_date?: string | null
          ends_at?: string | null
          id?: string | null
          image_url?: string | null
          is_active?: boolean | null
          link_url?: string | null
          priority?: number | null
          sort_order?: number | null
          start_date?: string | null
          starts_at?: string | null
          store_type_id?: string | null
          target_customer_ids?: string[] | null
          target_store_type_ids?: string[] | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promotional_banners_store_type_id_fkey"
            columns: ["store_type_id"]
            isOneToOne: false
            referencedRelation: "store_types"
            referencedColumns: ["id"]
          },
        ]
      }
      active_customers: {
        Row: {
          address: string | null
          created_at: string | null
          credit_limit_override: number | null
          deleted_at: string | null
          deleted_by: string | null
          display_id: string | null
          email: string | null
          gst_number: string | null
          id: string | null
          is_active: boolean | null
          kyc_aadhar_back_url: string | null
          kyc_aadhar_front_url: string | null
          kyc_rejection_reason: string | null
          kyc_selfie_url: string | null
          kyc_status: string | null
          kyc_submitted_at: string | null
          kyc_verified_at: string | null
          kyc_verified_by: string | null
          name: string | null
          opening_balance: number | null
          phone: string | null
          photo_url: string | null
          updated_at: string | null
          user_id: string | null
          warehouse_id: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          credit_limit_override?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          display_id?: string | null
          email?: string | null
          gst_number?: string | null
          id?: string | null
          is_active?: boolean | null
          kyc_aadhar_back_url?: string | null
          kyc_aadhar_front_url?: string | null
          kyc_rejection_reason?: string | null
          kyc_selfie_url?: string | null
          kyc_status?: string | null
          kyc_submitted_at?: string | null
          kyc_verified_at?: string | null
          kyc_verified_by?: string | null
          name?: string | null
          opening_balance?: number | null
          phone?: string | null
          photo_url?: string | null
          updated_at?: string | null
          user_id?: string | null
          warehouse_id?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string | null
          credit_limit_override?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          display_id?: string | null
          email?: string | null
          gst_number?: string | null
          id?: string | null
          is_active?: boolean | null
          kyc_aadhar_back_url?: string | null
          kyc_aadhar_front_url?: string | null
          kyc_rejection_reason?: string | null
          kyc_selfie_url?: string | null
          kyc_status?: string | null
          kyc_submitted_at?: string | null
          kyc_verified_at?: string | null
          kyc_verified_by?: string | null
          name?: string | null
          opening_balance?: number | null
          phone?: string | null
          photo_url?: string | null
          updated_at?: string | null
          user_id?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      active_products: {
        Row: {
          base_price: number | null
          category: string | null
          created_at: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          gst_rate: number | null
          hsn_code: string | null
          id: string | null
          image_url: string | null
          is_active: boolean | null
          is_gst_inclusive: boolean | null
          name: string | null
          product_group: string | null
          sku: string | null
          unit: string | null
          updated_at: string | null
        }
        Insert: {
          base_price?: number | null
          category?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          gst_rate?: number | null
          hsn_code?: string | null
          id?: string | null
          image_url?: string | null
          is_active?: boolean | null
          is_gst_inclusive?: boolean | null
          name?: string | null
          product_group?: string | null
          sku?: string | null
          unit?: string | null
          updated_at?: string | null
        }
        Update: {
          base_price?: number | null
          category?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          gst_rate?: number | null
          hsn_code?: string | null
          id?: string | null
          image_url?: string | null
          is_active?: boolean | null
          is_gst_inclusive?: boolean | null
          name?: string | null
          product_group?: string | null
          sku?: string | null
          unit?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      active_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          deleted_at: string | null
          deleted_by: string | null
          display_name: string | null
          email: string | null
          full_name: string | null
          google_linked: boolean | null
          id: string | null
          is_active: boolean | null
          onboarding_complete: boolean | null
          phone: string | null
          phone_verified: boolean | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          display_name?: string | null
          email?: string | null
          full_name?: string | null
          google_linked?: boolean | null
          id?: string | null
          is_active?: boolean | null
          onboarding_complete?: boolean | null
          phone?: string | null
          phone_verified?: boolean | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          display_name?: string | null
          email?: string | null
          full_name?: string | null
          google_linked?: boolean | null
          id?: string | null
          is_active?: boolean | null
          onboarding_complete?: boolean | null
          phone?: string | null
          phone_verified?: boolean | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      active_stores: {
        Row: {
          address: string | null
          alternate_phone: string | null
          area: string | null
          city: string | null
          created_at: string | null
          customer_id: string | null
          deleted_at: string | null
          deleted_by: string | null
          display_id: string | null
          district: string | null
          id: string | null
          is_active: boolean | null
          lat: number | null
          lng: number | null
          name: string | null
          opening_balance: number | null
          outstanding: number | null
          phone: string | null
          photo_url: string | null
          pincode: string | null
          route_id: string | null
          state: string | null
          store_order: number | null
          store_type_id: string | null
          street: string | null
          updated_at: string | null
          warehouse_id: string | null
        }
        Insert: {
          address?: string | null
          alternate_phone?: string | null
          area?: string | null
          city?: string | null
          created_at?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          display_id?: string | null
          district?: string | null
          id?: string | null
          is_active?: boolean | null
          lat?: number | null
          lng?: number | null
          name?: string | null
          opening_balance?: number | null
          outstanding?: number | null
          phone?: string | null
          photo_url?: string | null
          pincode?: string | null
          route_id?: string | null
          state?: string | null
          store_order?: number | null
          store_type_id?: string | null
          street?: string | null
          updated_at?: string | null
          warehouse_id?: string | null
        }
        Update: {
          address?: string | null
          alternate_phone?: string | null
          area?: string | null
          city?: string | null
          created_at?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          display_id?: string | null
          district?: string | null
          id?: string | null
          is_active?: boolean | null
          lat?: number | null
          lng?: number | null
          name?: string | null
          opening_balance?: number | null
          outstanding?: number | null
          phone?: string | null
          photo_url?: string | null
          pincode?: string | null
          route_id?: string | null
          state?: string | null
          store_order?: number | null
          store_type_id?: string | null
          street?: string | null
          updated_at?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stores_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "active_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stores_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balance_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "stores_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_outstanding_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "stores_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stores_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "recently_deleted_customers"
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
          {
            foreignKeyName: "stores_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_summary: {
        Row: {
          action: string | null
          app_version: string | null
          changed_fields: string[] | null
          device_type: string | null
          id: string | null
          ip_address: unknown
          new_values: Json | null
          old_values: Json | null
          performed_at: string | null
          performed_by: string | null
          performed_by_name: string | null
          record_display: string | null
          record_id: string | null
          request_id: string | null
          session_id: string | null
          table_name: string | null
          user_agent: string | null
        }
        Relationships: []
      }
      customer_balance_summary: {
        Row: {
          credit_limit: number | null
          customer_email: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          days_since_last_sale: number | null
          kyc_status: string | null
          last_payment_date: string | null
          total_lifetime_payments: number | null
          total_lifetime_sales: number | null
          total_outstanding: number | null
          total_returns: number | null
          total_stores: number | null
        }
        Relationships: []
      }
      customer_ledger: {
        Row: {
          approved_by: string | null
          balance_impact: number | null
          closing_balance: number | null
          credit: number | null
          customer_email: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          debit: number | null
          display_id: string | null
          notes: string | null
          opening_balance: number | null
          record_id: string | null
          recorded_by: string | null
          recorded_by_name: string | null
          reference: string | null
          running_balance: number | null
          store_id: string | null
          store_name: string | null
          transaction_date: string | null
          transaction_type: string | null
        }
        Relationships: []
      }
      customer_outstanding_summary: {
        Row: {
          customer_id: string | null
          customer_name: string | null
          outstanding: number | null
          phone: string | null
          warehouse_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_claims_by_user: {
        Row: {
          approved_amount: number | null
          approved_count: number | null
          pending_amount: number | null
          pending_count: number | null
          rejected_count: number | null
          user_id: string | null
        }
        Relationships: []
      }
      expense_summary_by_category: {
        Row: {
          category_id: string | null
          category_name: string | null
          color: string | null
          expense_count: number | null
          icon: string | null
          period_start: string | null
          total_amount: number | null
        }
        Relationships: []
      }
      fixed_costs_due_soon: {
        Row: {
          amount: number | null
          created_at: string | null
          created_by: string | null
          days_until_due: number | null
          description: string | null
          display_id: string | null
          due_day: number | null
          frequency: string | null
          id: string | null
          is_active: boolean | null
          last_paid_date: string | null
          name: string | null
          next_due_date: string | null
          reminder_days_before: number | null
          status: string | null
          updated_at: string | null
          vendor_id: string | null
          vendor_name: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          created_by?: string | null
          days_until_due?: never
          description?: string | null
          display_id?: string | null
          due_day?: number | null
          frequency?: string | null
          id?: string | null
          is_active?: boolean | null
          last_paid_date?: string | null
          name?: string | null
          next_due_date?: string | null
          reminder_days_before?: number | null
          status?: never
          updated_at?: string | null
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          created_by?: string | null
          days_until_due?: never
          description?: string | null
          display_id?: string | null
          due_day?: number | null
          frequency?: string | null
          id?: string | null
          is_active?: boolean | null
          last_paid_date?: string | null
          name?: string | null
          next_due_date?: string | null
          reminder_days_before?: number | null
          status?: never
          updated_at?: string | null
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fixed_costs_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_balance_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_costs_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      low_stock_alerts: {
        Row: {
          current_stock: number | null
          id: string | null
          item_type: string | null
          minimum_stock: number | null
          name: string | null
          warehouse_id: string | null
        }
        Relationships: []
      }
      monthly_expense_trend: {
        Row: {
          expense_count: number | null
          month: string | null
          total_amount: number | null
        }
        Relationships: []
      }
      order_fulfillment_status: {
        Row: {
          cancelled_at: string | null
          cash_amount: number | null
          customer_id: string | null
          delivered_at: string | null
          fulfillment_status: string | null
          order_created_at: string | null
          order_display_id: string | null
          order_id: string | null
          order_status: string | null
          outstanding_amount: number | null
          sale_amount: number | null
          sale_created_at: string | null
          sale_display_id: string | null
          sale_id: string | null
          store_id: string | null
          upi_amount: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "active_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balance_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_outstanding_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "recently_deleted_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "active_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "recently_deleted_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "store_outstanding_summary"
            referencedColumns: ["store_id"]
          },
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores_for_map"
            referencedColumns: ["id"]
          },
        ]
      }
      product_profit_summary: {
        Row: {
          actual_margin_percent_90d: number | null
          base_margin_percent: number | null
          base_price: number | null
          cost_price: number | null
          is_active: boolean | null
          product_id: string | null
          product_name: string | null
          profit_90d: number | null
          quantity_sold_90d: number | null
          revenue_90d: number | null
          sales_count_90d: number | null
          sku: string | null
        }
        Relationships: []
      }
      recently_deleted_customers: {
        Row: {
          address: string | null
          created_at: string | null
          credit_limit_override: number | null
          deleted_at: string | null
          deleted_by: string | null
          deleted_by_name: string | null
          display_id: string | null
          email: string | null
          gst_number: string | null
          id: string | null
          is_active: boolean | null
          kyc_aadhar_back_url: string | null
          kyc_aadhar_front_url: string | null
          kyc_rejection_reason: string | null
          kyc_selfie_url: string | null
          kyc_status: string | null
          kyc_submitted_at: string | null
          kyc_verified_at: string | null
          kyc_verified_by: string | null
          name: string | null
          opening_balance: number | null
          phone: string | null
          photo_url: string | null
          updated_at: string | null
          user_id: string | null
          warehouse_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      recently_deleted_stores: {
        Row: {
          address: string | null
          alternate_phone: string | null
          area: string | null
          city: string | null
          created_at: string | null
          customer_id: string | null
          customer_name: string | null
          deleted_at: string | null
          deleted_by: string | null
          deleted_by_name: string | null
          display_id: string | null
          district: string | null
          id: string | null
          is_active: boolean | null
          lat: number | null
          lng: number | null
          name: string | null
          opening_balance: number | null
          outstanding: number | null
          phone: string | null
          photo_url: string | null
          pincode: string | null
          route_id: string | null
          state: string | null
          store_order: number | null
          store_type_id: string | null
          street: string | null
          updated_at: string | null
          warehouse_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stores_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "active_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stores_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balance_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "stores_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_outstanding_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "stores_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stores_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "recently_deleted_customers"
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
          {
            foreignKeyName: "stores_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_status: {
        Row: {
          auto_resolved: number | null
          critical_issues: number | null
          duration_seconds: number | null
          high_issues: number | null
          investigating_issues: number | null
          medium_issues: number | null
          mismatched_stores: number | null
          open_issues: number | null
          run_at: string | null
          run_id: string | null
          status: string | null
          total_stores: number | null
        }
        Relationships: []
      }
      sale_returns_detail: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          approved_by_name: string | null
          cash_refund: number | null
          created_at: string | null
          created_by: string | null
          customer_id: string | null
          customer_name: string | null
          display_id: string | null
          id: string | null
          notes: string | null
          original_sale_amount: number | null
          original_sale_display_id: string | null
          outstanding_adjustment: number | null
          processed_at: string | null
          processed_by: string | null
          processed_by_name: string | null
          reason: string | null
          rejection_reason: string | null
          requested_by_name: string | null
          return_date: string | null
          return_items: Json | null
          return_type: string | null
          sale_id: string | null
          status: string | null
          store_id: string | null
          store_name: string | null
          total_amount: number | null
          updated_at: string | null
          upi_refund: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_returns_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "active_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_returns_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balance_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "sale_returns_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_outstanding_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "sale_returns_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_returns_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "recently_deleted_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_returns_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "order_fulfillment_status"
            referencedColumns: ["sale_id"]
          },
          {
            foreignKeyName: "sale_returns_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_returns_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "active_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_returns_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "recently_deleted_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_returns_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "store_outstanding_summary"
            referencedColumns: ["store_id"]
          },
          {
            foreignKeyName: "sale_returns_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_returns_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores_for_map"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_inventory_summary: {
        Row: {
          avatar_url: string | null
          email: string | null
          full_name: string | null
          last_received: string | null
          last_sale: string | null
          negative_products: number | null
          negative_value: number | null
          total_products: number | null
          total_quantity: number | null
          total_transfers: number | null
          total_value: number | null
          user_id: string | null
          user_role: Database["public"]["Enums"]["app_role"] | null
          warehouse_id: string | null
          warehouse_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_stock_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "active_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "staff_stock_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "staff_stock_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements_summary: {
        Row: {
          created_at: string | null
          created_by: string | null
          created_by_avatar_url: string | null
          created_by_name: string | null
          id: string | null
          product_base_price: number | null
          product_id: string | null
          product_image_url: string | null
          product_name: string | null
          product_sku: string | null
          product_unit: string | null
          quantity: number | null
          reason: string | null
          reference_id: string | null
          type: string | null
          warehouse_id: string | null
          warehouse_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "active_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_profit_summary"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements_with_creator: {
        Row: {
          created_at: string | null
          created_by: string | null
          creator_avatar: string | null
          creator_name: string | null
          id: string | null
          product_id: string | null
          product_name: string | null
          product_sku: string | null
          product_unit: string | null
          quantity: number | null
          reason: string | null
          type: string | null
          warehouse_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "active_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_profit_summary"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      store_outstanding_summary: {
        Row: {
          customer_id: string | null
          customer_name: string | null
          opening_balance: number | null
          outstanding: number | null
          store_id: string | null
          store_name: string | null
          warehouse_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stores_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "active_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stores_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_balance_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "stores_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_outstanding_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "stores_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stores_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "recently_deleted_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stores_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      stores_for_map: {
        Row: {
          address: string | null
          customer_name: string | null
          display_id: string | null
          id: string | null
          is_active: boolean | null
          lat: number | null
          lng: number | null
          name: string | null
          outstanding: number | null
          phone: string | null
          route_id: string | null
          route_name: string | null
          store_type_id: string | null
          store_type_name: string | null
          warehouse_id: string | null
        }
        Relationships: [
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
          {
            foreignKeyName: "stores_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_balance_summary: {
        Row: {
          address: string | null
          contact_person: string | null
          created_at: string | null
          credit_limit: number | null
          current_balance: number | null
          email: string | null
          id: string | null
          is_active: boolean | null
          last_payment_at: string | null
          last_purchase_at: string | null
          name: string | null
          payment_terms: string | null
          phone: string | null
          total_payments: number | null
          total_purchases: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_handover_request: {
        Args: { p_notes?: string; p_request_id: string; p_reviewer_id: string }
        Returns: {
          message: string
          request_id: string
          success: boolean
        }[]
      }
      accept_stock_transfer: {
        Args: { p_accepted_by: string; p_transfer_id: string }
        Returns: undefined
      }
      adjust_holding_balance: {
        Args: { p_amount: number; p_reason: string; p_user_id: string }
        Returns: undefined
      }
      adjust_raw_material_stock: {
        Args: {
          p_adjustment_type: string
          p_performed_by?: string
          p_quantity: number
          p_raw_material_id: string
          p_reason?: string
          p_warehouse_id: string
        }
        Returns: {
          error: string
          new_quantity: number
          previous_quantity: number
          success: boolean
        }[]
      }
      adjust_staff_stock: {
        Args: {
          p_created_by?: string
          p_quantity: number
          p_reason?: string
          p_staff_stock_id: string
        }
        Returns: Json
      }
      adjust_stock: {
        Args: {
          p_adjustment_type: string
          p_created_by?: string
          p_product_id: string
          p_quantity_change: number
          p_reason?: string
          p_warehouse_id: string
        }
        Returns: Json
      }
      adjust_store_balance:
        | {
            Args: {
              p_correction_amount: number
              p_correction_type: string
              p_customer_id: string
              p_description: string
              p_display_id: string
              p_reason: string
              p_recorded_by: string
              p_store_id: string
              p_supporting_documents?: Json
            }
            Returns: {
              correction_display_id: string
              correction_id: string
              new_outstanding: number
              previous_outstanding: number
            }[]
          }
        | {
            Args: {
              p_adjusted_by?: string
              p_customer_id: string
              p_new_outstanding: number
              p_reason?: string
              p_store_id: string
            }
            Returns: {
              adjustment_amount: number
              error: string
              new_outstanding: number
              old_outstanding: number
              success: boolean
            }[]
          }
      admin_adjust_holding: {
        Args: {
          p_admin_user_id: string
          p_new_balance: number
          p_reason: string
          p_user_id: string
        }
        Returns: {
          new_balance: number
          old_balance: number
          user_id: string
        }[]
      }
      admin_cash_transfer: {
        Args: {
          p_admin_user_id: string
          p_amount: number
          p_from_user_id: string
          p_reason: string
          p_to_user_id: string
        }
        Returns: {
          id: string
          status: string
        }[]
      }
      admin_transfer_between_staff: {
        Args: {
          p_admin_id?: string
          p_amount: number
          p_from_user_id: string
          p_reason?: string
          p_to_user_id: string
        }
        Returns: {
          cash_amount: number
          display_id: string
          id: string
          upi_amount: number
        }[]
      }
      approve_expense_claim:
        | {
            Args: {
              p_approved: boolean
              p_approved_amount: number
              p_claim_id: string
              p_rejection_reason?: string
              p_reviewer_id: string
              p_reviewer_notes?: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_approved_amount: number
              p_category_id: string
              p_claim_id: string
              p_reviewer_id: string
              p_reviewer_notes: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_approved_amount: number
              p_claim_id: string
              p_notes?: string
              p_reviewer_id: string
            }
            Returns: {
              claim_id: string
              message: string
              success: boolean
            }[]
          }
      approve_sale_return: {
        Args: {
          p_approved: boolean
          p_rejection_reason?: string
          p_return_id: string
        }
        Returns: boolean
      }
      approve_stock_return: {
        Args: {
          p_actual_quantity: number
          p_notes?: string
          p_transfer_id: string
        }
        Returns: Json
      }
      approve_stock_transfer: {
        Args: {
          p_approved_by: string
          p_rejection_reason?: string
          p_transfer_id: string
        }
        Returns: Json
      }
      batch_stock_transfer: {
        Args: { p_created_by?: string; p_transfers: Json }
        Returns: Json
      }
      bulk_update_customers: {
        Args: { p_updates: Json }
        Returns: {
          customer_id: string
          error_message: string
          success: boolean
        }[]
      }
      bulk_update_stores: {
        Args: { p_updates: Json }
        Returns: {
          error_message: string
          store_id: string
          success: boolean
        }[]
      }
      calculate_bom_cost: {
        Args: { p_product_id: string; p_warehouse_id?: string }
        Returns: number
      }
      calculate_holding_balance: {
        Args: { p_user_id: string }
        Returns: number
      }
      calculate_overhead_per_unit: {
        Args: { p_warehouse_id: string }
        Returns: number
      }
      calculate_production_cost: {
        Args: { p_production_log_id: string }
        Returns: {
          bom_cost: number
          cost_per_unit: number
          overhead_cost: number
          total_cost: number
          wastage_cost: number
        }[]
      }
      calculate_total_product_cost: {
        Args: { p_product_id: string; p_warehouse_id?: string }
        Returns: {
          bom_cost: number
          overhead_cost: number
          total_cost: number
        }[]
      }
      cancel_expense_claim: {
        Args: { p_claim_id: string; p_user_id: string }
        Returns: {
          claim_id: string
          message: string
          success: boolean
        }[]
      }
      cancel_handover_request: {
        Args: { p_request_id: string; p_user_id: string }
        Returns: undefined
      }
      cancel_stock_transfer: {
        Args: { p_cancelled_by?: string; p_transfer_id: string }
        Returns: Json
      }
      check_duplicate_customer_phone: {
        Args: { p_exclude_id?: string; p_phone: string }
        Returns: {
          display_id: string
          id: string
          is_active: boolean
          name: string
        }[]
      }
      check_existing_customer_by_phone: {
        Args: { phone_number: string }
        Returns: {
          id: string
          name: string
          phone: string
          stores: Json
          user_id: string
        }[]
      }
      check_stock_availability: {
        Args: { p_items: Json; p_recorded_for: string; p_user_id: string }
        Returns: {
          out_available: boolean
          out_available_qty: number
          out_product_id: string
          out_product_name: string
          out_requested_qty: number
        }[]
      }
      check_store_credit_limit: {
        Args: { p_order_amount?: number; p_store_id: string }
        Returns: {
          available_credit: number
          can_create: boolean
          credit_limit: number
          current_outstanding: number
          message: string
        }[]
      }
      check_store_proximity:
        | {
            Args: { p_lat: number; p_lng: number; p_radius_m?: number }
            Returns: {
              display_id: string
              distance_meters: number
              id: string
              name: string
            }[]
          }
        | {
            Args: { p_lat: number; p_lng: number; p_radius_m: number }
            Returns: {
              display_id: string
              distance_meters: number
              id: string
              name: string
              phone: string
            }[]
          }
      cleanup_otp_rate_limits: { Args: never; Returns: undefined }
      complete_purchase_order: {
        Args: { p_po_id: string; p_user_id?: string }
        Returns: string
      }
      compute_daily_store_snapshot: {
        Args: { p_date?: string }
        Returns: {
          closing_outstanding: number
          collections_amount: number
          credit_given: number
          new_outstanding: number
          route_id: string
          route_order: number
          sales_amount: number
          sales_count: number
          store_id: string
          visited: boolean
          visited_at: string
          warehouse_id: string
        }[]
      }
      compute_daily_user_snapshot: {
        Args: { p_date?: string }
        Returns: {
          cash_collected: number
          collections_amount: number
          collections_count: number
          expenses_approved: number
          routes_covered: number
          sales_amount: number
          sales_count: number
          upi_collected: number
          user_id: string
          visits_count: number
          warehouse_id: string
        }[]
      }
      compute_receivables_aging: {
        Args: { p_date?: string }
        Returns: {
          bucket_31_60: number
          bucket_61_90: number
          bucket_90_plus: number
          bucket_current: number
          closing_outstanding: number
          customer_id: string
          store_id: string
          warehouse_id: string
        }[]
      }
      compute_store_outstanding: {
        Args: { p_store_id: string }
        Returns: number
      }
      confirm_handover: {
        Args: { p_confirmed_by?: string; p_handover_id: string }
        Returns: {
          id: string
          status: string
        }[]
      }
      confirm_handover_v2: {
        Args: { p_confirmed_by: string; p_handover_id: string }
        Returns: {
          confirmed_at: string
          id: string
          income_entry_created: boolean
          status: string
        }[]
      }
      create_adhoc_expense: {
        Args: {
          p_amount: number
          p_bill_urls: string[]
          p_category_id: string
          p_created_by: string
          p_description: string
          p_expense_date: string
          p_source_store_id: string
          p_user_id: string
        }
        Returns: string
      }
      create_handover: {
        Args: { p_handed_to: string; p_notes?: string; p_user_id: string }
        Returns: {
          cash_amount: number
          handover_date: string
          handover_id: string
          total_amount: number
          upi_amount: number
        }[]
      }
      create_handover_request: {
        Args: {
          p_amount: number
          p_handover_type: string
          p_notes?: string
          p_receipt_url?: string
          p_staff_id: string
        }
        Returns: {
          message: string
          request_id: string
          success: boolean
        }[]
      }
      create_handover_v2: {
        Args: {
          p_cash_amount?: number
          p_handed_to: string
          p_notes?: string
          p_upi_amount?: number
          p_user_id: string
        }
        Returns: {
          action_taken_at: string | null
          action_taken_by: string | null
          cash_amount: number
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          handed_to: string | null
          handover_date: string
          handover_request_id: string | null
          handover_type: string | null
          id: string
          notes: string | null
          receipt_url: string | null
          rejected_at: string | null
          status: string
          updated_at: string
          upi_amount: number
          user_id: string
          warehouse_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "handovers"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      create_handover_with_type: {
        Args: {
          p_cash_amount?: number
          p_handed_to: string
          p_handover_type?: string
          p_notes?: string
          p_upi_amount?: number
          p_user_id: string
        }
        Returns: {
          cash_amount: number
          handed_to: string
          handover_type: string
          id: string
          status: string
          upi_amount: number
          user_id: string
        }[]
      }
      create_store_with_display_id: {
        Args: {
          p_address?: string
          p_customer_id: string
          p_lat?: number
          p_lng?: number
          p_name: string
          p_phone?: string
          p_route_id?: string
          p_store_type_id: string
          p_warehouse_id?: string
        }
        Returns: {
          address: string
          created_at: string
          customer_id: string
          display_id: string
          id: string
          lat: number
          lng: number
          name: string
          phone: string
          route_id: string
          store_type_id: string
          warehouse_id: string
        }[]
      }
      deduct_expense_from_holding: {
        Args: { p_amount: number; p_user_id: string }
        Returns: undefined
      }
      edit_handover: {
        Args: {
          p_admin_id?: string
          p_handover_id: string
          p_new_amount?: number
          p_new_status?: string
          p_notes?: string
        }
        Returns: {
          cash_amount: number
          id: string
          status: string
          upi_amount: number
        }[]
      }
      execute_stock_transfer: {
        Args: { p_transfer_id: string }
        Returns: undefined
      }
      finalizer_daily_reset: {
        Args: { p_admin_id?: string; p_finalizer_id: string }
        Returns: {
          income_entry_id: string
          reset_amount: number
          success: boolean
        }[]
      }
      find_customer_by_phone: {
        Args: { p_phone_digits: string }
        Returns: {
          id: string
          phone: string
          user_id: string
        }[]
      }
      find_handover_mismatches: {
        Args: never
        Returns: {
          cash_amount: number
          expected_amount: number
          handover_date: string
          id: string
          upi_amount: number
          user_id: string
        }[]
      }
      find_miscalculated_sales: {
        Args: never
        Returns: {
          cash_amount: number
          display_id: string
          expected_outstanding: number
          id: string
          outstanding_amount: number
          total_amount: number
          upi_amount: number
        }[]
      }
      find_orphaned_order_items: {
        Args: never
        Returns: {
          id: string
          order_id: string
          product_id: string
          quantity: number
        }[]
      }
      find_orphaned_sale_items: {
        Args: never
        Returns: {
          id: string
          product_id: string
          quantity: number
          sale_id: string
        }[]
      }
      find_staff_by_phone: {
        Args: { p_phone_digits: string }
        Returns: {
          avatar_url: string
          full_name: string
          id: string
          is_active: boolean
          phone: string
          role: string
          source: string
          user_id: string
        }[]
      }
      find_staff_invitation_by_phone: {
        Args: { p_phone_digits: string }
        Returns: {
          accepted_at: string
          email: string
          full_name: string
          id: string
          phone: string
          role: string
          status: string
        }[]
      }
      find_store_customer_mismatches: {
        Args: never
        Returns: {
          actual_customer_id: string
          store_customer_id: string
          store_display_id: string
          store_id: string
        }[]
      }
      generate_customer_statement: {
        Args: {
          p_customer_id: string
          p_from_date?: string
          p_to_date?: string
        }
        Returns: {
          closing_balance: number
          customer_id: string
          customer_name: string
          customer_phone: string
          entries: Json
          opening_balance: number
          statement_date: string
          total_payments: number
          total_returns: number
          total_sales: number
        }[]
      }
      generate_display_id: {
        Args: { prefix: string; seq_name: string }
        Returns: string
      }
      generate_invoice_number: { Args: never; Returns: string }
      generate_purchase_return_display_id: { Args: never; Returns: string }
      generate_random_display_id: {
        Args: { p_column_name?: string; p_prefix: string; p_table_name: string }
        Returns: string
      }
      generate_sale_return_display_id: { Args: never; Returns: string }
      get_accessible_customers: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_user_id: string
          p_warehouse_id?: string
        }
        Returns: {
          created_at: string
          display_id: string
          email: string
          id: string
          is_active: boolean
          kyc_status: string
          name: string
          phone: string
          store_count: number
          total_outstanding: number
        }[]
      }
      get_active_agent_locations: {
        Args: { p_warehouse_id?: string }
        Returns: {
          agent_name: string
          current_lat: number
          current_lng: number
          location_updated_at: string
          route_name: string
          session_id: string
          started_at: string
          user_id: string
        }[]
      }
      get_agent_cash_holding: {
        Args: { p_user_id: string }
        Returns: {
          confirmed_handovers_cash: number
          confirmed_handovers_upi: number
          materialized_balance: number
          net_holding: number
          pending_handovers_amount: number
          sales_cash: number
          sales_upi: number
          total_collected: number
          total_handed_over: number
          transactions_cash: number
          transactions_upi: number
        }[]
      }
      get_agent_performance: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: {
          avg_sale_value: number
          collections_count: number
          full_name: string
          orders_created: number
          sales_count: number
          stores_visited: number
          total_collections: number
          total_sales: number
          user_id: string
        }[]
      }
      get_all_staff_balances: {
        Args: never
        Returns: {
          full_name: string
          holding_balance: number
          prev_pending: number
          role: string
          today_payments: number
          today_received: number
          today_sales: number
          today_sent_confirmed: number
          total_holding: number
          user_id: string
        }[]
      }
      get_credit_limit_warnings: {
        Args: { p_threshold_percent?: number }
        Returns: {
          credit_limit: number
          current_outstanding: number
          customer_name: string
          store_id: string
          store_name: string
          utilization_percent: number
          warning_level: string
        }[]
      }
      get_customer_detail: {
        Args: { p_customer_id: string }
        Returns: {
          address: string
          created_at: string
          display_id: string
          email: string
          gst_number: string
          id: string
          is_active: boolean
          kyc_aadhar_back_url: string
          kyc_aadhar_front_url: string
          kyc_rejection_reason: string
          kyc_selfie_url: string
          kyc_status: string
          kyc_submitted_at: string
          kyc_verified_at: string
          kyc_verified_by: string
          name: string
          phone: string
          photo_url: string
          warehouse_id: string
        }[]
      }
      get_customer_risk_report: {
        Args: never
        Returns: {
          calculated_credit_limit: number
          customer_id: string
          customer_name: string
          days_since_last_order: number
          phone: string
          risk_category: string
          total_outstanding: number
        }[]
      }
      get_customers_for_list: {
        Args: { p_limit?: number; p_offset?: number; p_warehouse_id?: string }
        Returns: {
          address: string
          created_at: string
          display_id: string
          email: string
          id: string
          is_active: boolean
          kyc_status: string
          name: string
          phone: string
          store_count: number
          total_outstanding: number
        }[]
      }
      get_daily_handover_aggregates: {
        Args: { p_snapshot_date: string }
        Returns: {
          balance: number
          received_confirmed_total: number
          sales_total: number
          sent_confirmed_total: number
          sent_pending_total: number
          user_id: string
        }[]
      }
      get_daily_metrics: { Args: { p_date?: string }; Returns: Json }
      get_metrics_time_series: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: {
          collections_count: number
          collections_total: number
          metric_date: string
          new_customers: number
          new_stores: number
          orders_created: number
          orders_delivered: number
          sales_count: number
          sales_total: number
        }[]
      }
      get_my_warehouse_id: { Args: never; Returns: string }
      get_next_invoice_number: { Args: never; Returns: string }
      get_outstanding_aging: {
        Args: never
        Returns: {
          current_outstanding: number
          customer_name: string
          days_0_30: number
          days_31_60: number
          days_61_90: number
          days_90_plus: number
          store_id: string
          store_name: string
        }[]
      }
      get_pending_order_stores: {
        Args: { p_warehouse_id?: string }
        Returns: {
          store_id: string
        }[]
      }
      get_pieces_per_kg: {
        Args: { p_piece_weight_grams: number }
        Returns: number
      }
      get_product_price: {
        Args: {
          p_product_id: string
          p_store_id?: string
          p_store_type_id?: string
        }
        Returns: number
      }
      get_profit_by_period: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: {
          cost: number
          margin_percent: number
          product_id: string
          product_name: string
          profit: number
          quantity_sold: number
          revenue: number
          sku: string
        }[]
      }
      get_sales_for_list: {
        Args: {
          p_from_date?: string
          p_limit?: number
          p_offset?: number
          p_payment_type?: string
          p_recorded_by?: string
          p_route_id?: string
          p_store_id?: string
          p_store_type_id?: string
          p_to_date?: string
          p_warehouse_id?: string
        }
        Returns: {
          cash_amount: number
          created_at: string
          customer_id: string
          customer_name: string
          display_id: string
          fulfilled_order_id: string
          id: string
          outstanding_amount: number
          recorded_by: string
          store_display_id: string
          store_id: string
          store_name: string
          store_route_id: string
          store_type_id: string
          total_amount: number
          upi_amount: number
        }[]
      }
      get_stock_movements_with_creator: {
        Args: { p_limit?: number; p_offset?: number; p_warehouse_id: string }
        Returns: {
          created_at: string
          created_by: string
          creator_avatar: string
          creator_name: string
          id: string
          product_id: string
          product_name: string
          product_sku: string
          product_unit: string
          quantity: number
          reason: string
          type: string
          warehouse_id: string
        }[]
      }
      get_store_detail: {
        Args: { p_store_id: string; p_warehouse_id?: string }
        Returns: {
          address: string
          alternate_phone: string
          area: string
          city: string
          created_at: string
          customer: Json
          customer_id: string
          display_id: string
          district: string
          id: string
          is_active: boolean
          lat: number
          lng: number
          name: string
          opening_balance: number
          outstanding: number
          phone: string
          photo_url: string
          pincode: string
          route: Json
          route_id: string
          state: string
          store_type: Json
          store_type_id: string
          street: string
          warehouse_id: string
        }[]
      }
      get_store_performance: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          current_outstanding: number
          customer_name: string
          days_since_last_order: number
          days_since_last_sale: number
          last_order_date: string
          last_sale_date: string
          route_name: string
          store_id: string
          store_name: string
          store_type: string
          total_collections: number
          total_sales: number
        }[]
      }
      get_stores_for_list: {
        Args: {
          p_customer_id?: string
          p_limit?: number
          p_offset?: number
          p_route_id?: string
          p_search?: string
          p_status?: string
          p_store_type_id?: string
          p_warehouse_id?: string
        }
        Returns: {
          address: string
          created_at: string
          customer_id: string
          customer_name: string
          display_id: string
          id: string
          is_active: boolean
          lat: number
          lng: number
          name: string
          outstanding: number
          phone: string
          route_id: string
          route_name: string
          store_type_id: string
          store_type_name: string
          warehouse_id: string
        }[]
      }
      get_stores_for_map: {
        Args: {
          p_limit?: number
          p_route_id?: string
          p_store_type_id?: string
          p_warehouse_id?: string
        }
        Returns: {
          address: string
          customer_name: string
          display_id: string
          id: string
          is_active: boolean
          lat: number
          lng: number
          name: string
          outstanding: number
          phone: string
          route_id: string
          route_name: string
          store_type_id: string
          store_type_name: string
        }[]
      }
      get_today_handoverable: {
        Args: { p_user_id: string }
        Returns: {
          pending_total: number
          today_cash: number
          today_confirmed: number
          today_handoverable: number
          today_total: number
          today_upi: number
        }[]
      }
      get_user_daily_balance: {
        Args: { p_user_id: string }
        Returns: {
          prev_pending: number
          today_payments: number
          today_received: number
          today_sales: number
          today_sent_confirmed: number
          today_sent_pending: number
          total_holding: number
        }[]
      }
      get_user_holding_amount: {
        Args: { p_user_id: string }
        Returns: {
          approved_claims: number
          net_holding: number
          pending_claims: number
          rejected_claims: number
          total_locked: number
        }[]
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_visited_store_count: {
        Args: { p_session_ids: string[] }
        Returns: number
      }
      has_role:
        | {
            Args: {
              _role: Database["public"]["Enums"]["app_role"]
              _user_id: string
            }
            Returns: boolean
          }
        | { Args: { role_to_check: string; uid: string }; Returns: boolean }
      is_synthetic_phone_email: { Args: { p_email: string }; Returns: boolean }
      link_user_to_customer: {
        Args: { customer_id: string }
        Returns: undefined
      }
      log_wac_cost_change: {
        Args: {
          p_new_cost: number
          p_old_cost: number
          p_raw_material_id: string
          p_reason: string
        }
        Returns: undefined
      }
      normalize_phone: { Args: { phone: string }; Returns: string }
      process_completed_sale_return: {
        Args: { p_return_id: string }
        Returns: {
          message: string
          return_id: string
          success: boolean
        }[]
      }
      process_production_log: {
        Args: {
          p_created_by?: string
          p_notes?: string
          p_product_id: string
          p_production_date?: string
          p_quantity_produced: number
          p_warehouse_id: string
          p_wastage_quantity?: number
        }
        Returns: Json
      }
      process_sale_return: {
        Args: {
          p_cash_refund?: number
          p_display_id: string
          p_notes?: string
          p_reason: string
          p_return_amount: number
          p_return_items?: Json
          p_return_type?: string
          p_sale_id: string
          p_upi_refund?: number
        }
        Returns: {
          new_outstanding: number
          return_display_id: string
          return_id: string
          status: string
        }[]
      }
      process_stock_return: {
        Args: {
          p_action: string
          p_actual_quantity: number
          p_approved: boolean
          p_difference: number
          p_notes: string
          p_reviewed_by: string
          p_transfer_id: string
        }
        Returns: Json
      }
      recalc_running_balances: {
        Args: { p_store_id: string }
        Returns: undefined
      }
      recalculate_handover: {
        Args: { p_handover_id: string }
        Returns: boolean
      }
      reconcile_outstanding: {
        Args: {
          p_auto_resolve_minor?: boolean
          p_critical_threshold?: number
          p_high_threshold?: number
          p_medium_threshold?: number
        }
        Returns: string
      }
      record_payment_return: {
        Args: {
          p_customer_id: string
          p_display_id: string
          p_logged_by: string
          p_notes?: string
          p_original_transaction_id: string
          p_reason: string
          p_recorded_by: string
          p_return_amount: number
          p_return_type: string
          p_store_id: string
        }
        Returns: {
          new_store_outstanding: number
          return_display_id: string
          return_id: string
        }[]
      }
      record_production: {
        Args: {
          p_created_by?: string
          p_notes?: string
          p_product_id: string
          p_production_date?: string
          p_quantity_produced: number
          p_warehouse_id: string
          p_wastage_quantity?: number
        }
        Returns: {
          error: string
          production_log_id: string
          success: boolean
        }[]
      }
      record_sale: {
        Args: {
          p_cash_amount: number
          p_created_at?: string
          p_customer_id: string
          p_display_id: string
          p_logged_by: string
          p_outstanding_amount: number
          p_recorded_by: string
          p_sale_items: Json
          p_store_id: string
          p_total_amount: number
          p_upi_amount: number
        }
        Returns: {
          new_outstanding: number
          sale_display_id: string
          sale_id: string
          stock_reserved: boolean
        }[]
      }
      record_stock_movement: {
        Args: {
          p_product_id: string
          p_quantity: number
          p_reason?: string
          p_type: string
          p_user_id?: string
          p_warehouse_id: string
        }
        Returns: Json
      }
      record_stock_transfer: {
        Args: {
          p_description?: string
          p_from_user_id?: string
          p_from_warehouse_id?: string
          p_product_id?: string
          p_quantity?: number
          p_to_user_id?: string
          p_to_warehouse_id?: string
          p_transfer_type: string
        }
        Returns: Json
      }
      record_stock_transfers: {
        Args: {
          p_description?: string
          p_from_user_id?: string
          p_from_warehouse_id?: string
          p_items?: Json
          p_to_user_id?: string
          p_to_warehouse_id?: string
          p_transfer_type: string
        }
        Returns: Json
      }
      record_transaction: {
        Args: {
          p_cash_amount?: number
          p_created_at?: string
          p_customer_id: string
          p_display_id: string
          p_logged_by?: string
          p_notes?: string
          p_recorded_by: string
          p_store_id: string
          p_upi_amount?: number
        }
        Returns: {
          new_outstanding: number
          txn_display_id: string
          txn_id: string
        }[]
      }
      record_vendor_payment: {
        Args: {
          p_amount: number
          p_notes?: string
          p_payment_method?: string
          p_reference_number?: string
          p_user_id?: string
          p_vendor_id: string
        }
        Returns: string
      }
      record_vendor_purchase: {
        Args: {
          p_invoice_date?: string
          p_invoice_number?: string
          p_items?: Json
          p_notes?: string
          p_total_amount?: number
          p_user_id?: string
          p_vendor_id: string
          p_warehouse_id?: string
        }
        Returns: string
      }
      reject_expense_claim:
        | {
            Args: {
              p_claim_id: string
              p_rejection_reason: string
              p_reviewer_id: string
            }
            Returns: {
              claim_id: string
              message: string
              success: boolean
            }[]
          }
        | {
            Args: {
              p_claim_id: string
              p_reviewer_id: string
              p_reviewer_notes: string
            }
            Returns: undefined
          }
      reject_handover_request: {
        Args: { p_reason: string; p_request_id: string; p_reviewer_id: string }
        Returns: {
          message: string
          request_id: string
          success: boolean
        }[]
      }
      reject_stock_return: {
        Args: { p_notes?: string; p_transfer_id: string }
        Returns: Json
      }
      reject_stock_transfer: {
        Args: {
          p_reason?: string
          p_rejected_by: string
          p_transfer_id: string
        }
        Returns: undefined
      }
      request_stock_transfer: {
        Args: { p_created_by: string; p_transfers: Json }
        Returns: Json
      }
      resolve_reconciliation_issue: {
        Args: { p_action: string; p_issue_id: string; p_notes?: string }
        Returns: boolean
      }
      resolve_user_identity: {
        Args: { p_user_id: string }
        Returns: {
          has_customer: boolean
          is_staff: boolean
          onboarding_required: boolean
          reason_code: string
          redirect_target: string
          role: string
        }[]
      }
      respond_stock_request: {
        Args: { p_action: string; p_notes?: string; p_request_id: string }
        Returns: Json
      }
      restore_deleted_record: {
        Args: { p_record_id: string; p_table_name: string }
        Returns: boolean
      }
      sync_holding_balance: { Args: { p_user_id: string }; Returns: undefined }
      test_operator_rls: {
        Args: never
        Returns: {
          result: string
        }[]
      }
      update_raw_material_wac: {
        Args: {
          p_new_quantity: number
          p_new_unit_cost: number
          p_raw_material_id: string
        }
        Returns: number
      }
      upsert_bom: {
        Args: {
          p_finished_product_id: string
          p_items: Json
          p_warehouse_id: string
        }
        Returns: undefined
      }
      verify_handover_amounts: {
        Args: { p_handover_id: string }
        Returns: {
          actual_cash: number
          actual_upi: number
          difference: number
          expected_cash: number
          expected_upi: number
          is_valid: boolean
          message: string
        }[]
      }
      verify_otp_with_test_bypass: {
        Args: { p_otp: string; p_phone: string }
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
        | "operator"
      invoice_type: "proforma" | "tax" | "credit_note"
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
        "operator",
      ],
      invoice_type: ["proforma", "tax", "credit_note"],
    },
  },
} as const

