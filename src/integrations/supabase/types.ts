// Generated Supabase database types
// This is a minimal set of types to replace 'supabase as any' usage
// In a production environment, these should be generated with: npx supabase gen types typescript --linked

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          user_id: string
          full_name: string
          phone: string | null
          email: string | null
          avatar_url: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          full_name?: string
          phone?: string | null
          email?: string | null
          avatar_url?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          full_name?: string
          phone?: string | null
          email?: string | null
          avatar_url?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedTable: "auth.users"
            referencedColumns: ["id"]
          }
        ]
      }
      user_roles: {
        Row: {
          id: string
          user_id: string
          role: AppRole
        }
        Insert: {
          id?: string
          user_id: string
          role?: AppRole
        }
        Update: {
          id?: string
          user_id?: string
          role?: AppRole
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedTable: "auth.users"
            referencedColumns: ["id"]
          }
        ]
      }
      // Add other commonly used tables as needed
      sales: {
        Row: {
          id: string
          total_amount: number
          cash_amount: number
          upi_amount: number
          created_at: string
          // Add other fields as needed
        }
        Insert: {
          id?: string
          total_amount?: number
          cash_amount?: number
          upi_amount?: number
          created_at?: string
        }
        Update: {
          id?: string
          total_amount?: number
          cash_amount?: number
          upi_amount?: number
          created_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          id: string
          user_id: string | null
          display_id: string
          name: string
          phone: string | null
          email: string | null
          address: string | null
          gst_number: string | null
          photo_url: string | null
          kyc_status: string
          kyc_rejection_reason: string | null
          opening_balance: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          display_id?: string
          name?: string
          phone?: string | null
          email?: string | null
          address?: string | null
          gst_number?: string | null
          photo_url?: string | null
          kyc_status?: string
          kyc_rejection_reason?: string | null
          opening_balance?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          display_id?: string
          name?: string
          phone?: string | null
          email?: string | null
          address?: string | null
          gst_number?: string | null
          photo_url?: string | null
          kyc_status?: string
          kyc_rejection_reason?: string | null
          opening_balance?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      // Add minimal set of other tables that are frequently accessed
      stores: {
        Row: {
          id: string
          display_id: string
          name: string
          customer_id: string
          store_type_id: string
          route_id: string | null
          address: string | null
          lat: number | null
          lng: number | null
          phone: string | null
          alternate_phone: string | null
          photo_url: string | null
          outstanding: number
          opening_balance: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          display_id?: string
          name?: string
          customer_id?: string
          store_type_id?: string
          route_id?: string | null
          address?: string | null
          lat?: number | null
          lng?: number | null
          phone?: string | null
          alternate_phone?: string | null
          photo_url?: string | null
          outstanding?: number
          opening_balance?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          display_id?: string
          name?: string
          customer_id?: string
          store_type_id?: string
          route_id?: string | null
          address?: string | null
          lat?: number | null
          lng?: number | null
          phone?: string | null
          alternate_phone?: string | null
          photo_url?: string | null
          outstanding?: number
          opening_balance?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      // Add other tables as they are encountered in (supabase as any) usage
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      app_role: 'super_admin' | 'manager' | 'agent' | 'marketer' | 'operator' | 'customer'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// Helper types for common operations
export type AppRole = Database['public']['Enums']['app_role']