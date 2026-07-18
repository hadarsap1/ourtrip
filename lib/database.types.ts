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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      bookings: {
        Row: {
          confirmation_code: string | null
          cost: number | null
          currency: string | null
          details: Json
          end_date: string | null
          file_path: string | null
          id: string
          link_url: string | null
          notes: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["booking_status"]
          title: string
          trip_id: string
          type: Database["public"]["Enums"]["booking_type"]
          updated_at: string
        }
        Insert: {
          confirmation_code?: string | null
          cost?: number | null
          currency?: string | null
          details?: Json
          end_date?: string | null
          file_path?: string | null
          id?: string
          link_url?: string | null
          notes?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          title: string
          trip_id: string
          type: Database["public"]["Enums"]["booking_type"]
          updated_at?: string
        }
        Update: {
          confirmation_code?: string | null
          cost?: number | null
          currency?: string | null
          details?: Json
          end_date?: string | null
          file_path?: string | null
          id?: string
          link_url?: string | null
          notes?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          title?: string
          trip_id?: string
          type?: Database["public"]["Enums"]["booking_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_categories: {
        Row: {
          id: string
          key: string
          label_he: string
          planned_amount: number
          trip_id: string
          updated_at: string
        }
        Insert: {
          id?: string
          key: string
          label_he: string
          planned_amount?: number
          trip_id: string
          updated_at?: string
        }
        Update: {
          id?: string
          key?: string
          label_he?: string
          planned_amount?: number
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_categories_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_items: {
        Row: {
          assigned_to: string | null
          checked: boolean
          checklist_id: string
          id: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          checked?: boolean
          checklist_id: string
          id?: string
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          checked?: boolean
          checklist_id?: string
          id?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_items_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_items_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      checklists: {
        Row: {
          id: string
          is_template: boolean
          source_template_id: string | null
          title: string
          trip_id: string
          updated_at: string
        }
        Insert: {
          id?: string
          is_template?: boolean
          source_template_id?: string | null
          title: string
          trip_id: string
          updated_at?: string
        }
        Update: {
          id?: string
          is_template?: boolean
          source_template_id?: string | null
          title?: string
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklists_source_template_id_fkey"
            columns: ["source_template_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklists_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          file_path: string
          id: string
          notes: string | null
          shared_with_kids: boolean
          tag: string
          title: string
          trip_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          file_path: string
          id?: string
          notes?: string | null
          shared_with_kids?: boolean
          tag: string
          title: string
          trip_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          file_path?: string
          id?: string
          notes?: string | null
          shared_with_kids?: boolean
          tag?: string
          title?: string
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      emergency_info: {
        Row: {
          content: Json
          country_code: string
          trip_id: string
          updated_at: string
        }
        Insert: {
          content?: Json
          country_code: string
          trip_id: string
          updated_at?: string
        }
        Update: {
          content?: Json
          country_code?: string
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "emergency_info_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          amount_ils: number
          booking_id: string | null
          category_id: string
          created_at: string
          created_by: string
          currency: string
          description: string | null
          id: string
          spent_on: string
          trip_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          amount_ils: number
          booking_id?: string | null
          category_id: string
          created_at?: string
          created_by: string
          currency: string
          description?: string | null
          id?: string
          spent_on?: string
          trip_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          amount_ils?: number
          booking_id?: string | null
          category_id?: string
          created_at?: string
          created_by?: string
          currency?: string
          description?: string | null
          id?: string
          spent_on?: string
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "budget_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      fx_rates: {
        Row: {
          currency: string
          day: string
          rate_to_ils: number
        }
        Insert: {
          currency: string
          day: string
          rate_to_ils: number
        }
        Update: {
          currency?: string
          day?: string
          rate_to_ils?: number
        }
        Relationships: []
      }
      guests_allowlist: {
        Row: {
          created_at: string
          email: string
          invited_by: string
          revoked_at: string | null
          trip_id: string
        }
        Insert: {
          created_at?: string
          email: string
          invited_by: string
          revoked_at?: string | null
          trip_id: string
        }
        Update: {
          created_at?: string
          email?: string
          invited_by?: string
          revoked_at?: string | null
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guests_allowlist_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guests_allowlist_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      itinerary_days: {
        Row: {
          country_code: string | null
          date: string
          id: string
          lat: number | null
          lng: number | null
          location_name: string | null
          notes: string | null
          trip_id: string
          updated_at: string
        }
        Insert: {
          country_code?: string | null
          date: string
          id?: string
          lat?: number | null
          lng?: number | null
          location_name?: string | null
          notes?: string | null
          trip_id: string
          updated_at?: string
        }
        Update: {
          country_code?: string | null
          date?: string
          id?: string
          lat?: number | null
          lng?: number | null
          location_name?: string | null
          notes?: string | null
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "itinerary_days_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      itinerary_items: {
        Row: {
          booking_id: string | null
          day_id: string
          end_time: string | null
          id: string
          is_outdoor: boolean
          lat: number | null
          lng: number | null
          location_name: string | null
          notes: string | null
          place_id: string | null
          shared_with_guests: boolean
          sort_order: number
          start_time: string | null
          status: Database["public"]["Enums"]["item_status"]
          title: string
          updated_at: string
        }
        Insert: {
          booking_id?: string | null
          day_id: string
          end_time?: string | null
          id?: string
          is_outdoor?: boolean
          lat?: number | null
          lng?: number | null
          location_name?: string | null
          notes?: string | null
          place_id?: string | null
          shared_with_guests?: boolean
          sort_order?: number
          start_time?: string | null
          status?: Database["public"]["Enums"]["item_status"]
          title: string
          updated_at?: string
        }
        Update: {
          booking_id?: string | null
          day_id?: string
          end_time?: string | null
          id?: string
          is_outdoor?: boolean
          lat?: number | null
          lng?: number | null
          location_name?: string | null
          notes?: string | null
          place_id?: string | null
          shared_with_guests?: boolean
          sort_order?: number
          start_time?: string | null
          status?: Database["public"]["Enums"]["item_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "itinerary_items_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itinerary_items_day_id_fkey"
            columns: ["day_id"]
            isOneToOne: false
            referencedRelation: "itinerary_days"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          author_id: string
          body: string
          created_at: string
          entry_date: string
          id: string
          location_name: string | null
          mood: string | null
          shared_with_guests: boolean
          trip_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          entry_date?: string
          id?: string
          location_name?: string | null
          mood?: string | null
          shared_with_guests?: boolean
          trip_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          entry_date?: string
          id?: string
          location_name?: string | null
          mood?: string | null
          shared_with_guests?: boolean
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      kid_device_registrations: {
        Row: {
          code_hash: string
          created_at: string
          created_by: string
          expires_at: string
          id: string
          member_id: string
          pin_hash: string
          used_at: string | null
        }
        Insert: {
          code_hash: string
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          member_id: string
          pin_hash: string
          used_at?: string | null
        }
        Update: {
          code_hash?: string
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          member_id?: string
          pin_hash?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kid_device_registrations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kid_device_registrations_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      kid_devices: {
        Row: {
          approved_by: string
          created_at: string
          device_token_hash: string
          failed_attempts: number
          id: string
          locked_until: string | null
          member_id: string
          pin_hash: string
          revoked_at: string | null
        }
        Insert: {
          approved_by: string
          created_at?: string
          device_token_hash: string
          failed_attempts?: number
          id?: string
          locked_until?: string | null
          member_id: string
          pin_hash: string
          revoked_at?: string | null
        }
        Update: {
          approved_by?: string
          created_at?: string
          device_token_hash?: string
          failed_attempts?: number
          id?: string
          locked_until?: string | null
          member_id?: string
          pin_hash?: string
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kid_devices_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kid_devices_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      map_pins: {
        Row: {
          created_at: string
          created_by: string
          id: string
          kind: string
          label: string
          lat: number
          lng: number
          photo_path: string | null
          trip_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          kind?: string
          label: string
          lat: number
          lng: number
          photo_path?: string | null
          trip_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          kind?: string
          label?: string
          lat?: number
          lng?: number
          photo_path?: string | null
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "map_pins_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_pins_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          auth_user_id: string | null
          created_at: string
          display_name: string
          email: string | null
          id: string
          role: Database["public"]["Enums"]["member_role"]
          trip_id: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          display_name: string
          email?: string | null
          id?: string
          role: Database["public"]["Enums"]["member_role"]
          trip_id: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          display_name?: string
          email?: string | null
          id?: string
          role?: Database["public"]["Enums"]["member_role"]
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "members_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reads: {
        Row: {
          member_id: string
          message_id: string
          read_at: string
        }
        Insert: {
          member_id: string
          message_id: string
          read_at?: string
        }
        Update: {
          member_id?: string
          message_id?: string
          read_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reads_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reads_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          created_at: string
          id: string
          sender_id: string
          trip_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          sender_id: string
          trip_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          sender_id?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      photos: {
        Row: {
          approved_by: string | null
          caption: string | null
          created_at: string
          file_path: string
          id: string
          journal_entry_id: string | null
          shared_with_guests: boolean
          status: Database["public"]["Enums"]["photo_status"]
          taken_on: string
          trip_id: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          approved_by?: string | null
          caption?: string | null
          created_at?: string
          file_path: string
          id?: string
          journal_entry_id?: string | null
          shared_with_guests?: boolean
          status?: Database["public"]["Enums"]["photo_status"]
          taken_on?: string
          trip_id: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          approved_by?: string | null
          caption?: string | null
          created_at?: string
          file_path?: string
          id?: string
          journal_entry_id?: string | null
          shared_with_guests?: boolean
          status?: Database["public"]["Enums"]["photo_status"]
          taken_on?: string
          trip_id?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "photos_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      phrasebook_entries: {
        Row: {
          category: string
          country_code: string | null
          id: string
          language: string
          phonetic_he: string | null
          phrase_he: string
          phrase_local: string
          trip_id: string
        }
        Insert: {
          category: string
          country_code?: string | null
          id?: string
          language: string
          phonetic_he?: string | null
          phrase_he: string
          phrase_local: string
          trip_id: string
        }
        Update: {
          category?: string
          country_code?: string | null
          id?: string
          language?: string
          phonetic_he?: string | null
          phrase_he?: string
          phrase_local?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "phrasebook_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      pocket_expenses: {
        Row: {
          amount: number
          description: string | null
          id: string
          kid_id: string
          spent_on: string
          trip_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          description?: string | null
          id?: string
          kid_id: string
          spent_on?: string
          trip_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          description?: string | null
          id?: string
          kid_id?: string
          spent_on?: string
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pocket_expenses_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pocket_expenses_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      pocket_money: {
        Row: {
          allowance: number
          currency: string
          id: string
          kid_id: string
          trip_id: string
          updated_at: string
        }
        Insert: {
          allowance: number
          currency?: string
          id?: string
          kid_id: string
          trip_id: string
          updated_at?: string
        }
        Update: {
          allowance?: number
          currency?: string
          id?: string
          kid_id?: string
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pocket_money_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pocket_money_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
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
          member_id: string
          p256dh: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          member_id: string
          p256dh: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          member_id?: string
          p256dh?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      routes: {
        Row: {
          color: string | null
          created_at: string
          created_by: string
          day_id: string | null
          id: string
          name: string
          path: Json
          trip_id: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by: string
          day_id?: string | null
          id?: string
          name: string
          path?: Json
          trip_id: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string
          day_id?: string | null
          id?: string
          name?: string
          path?: Json
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "routes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_day_id_fkey"
            columns: ["day_id"]
            isOneToOne: false
            referencedRelation: "itinerary_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_links: {
        Row: {
          area: string | null
          country: string | null
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          title: string
          trip_id: string
          updated_at: string
          url: string
        }
        Insert: {
          area?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          title: string
          trip_id: string
          updated_at?: string
          url: string
        }
        Update: {
          area?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          title?: string
          trip_id?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_links_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_recommendations: {
        Row: {
          category: string | null
          country_code: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          lat: number | null
          lng: number | null
          location_name: string | null
          maps_url: string | null
          place_id: string | null
          title: string
          trip_id: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          location_name?: string | null
          maps_url?: string | null
          place_id?: string | null
          title: string
          trip_id: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          location_name?: string | null
          maps_url?: string | null
          place_id?: string | null
          title?: string
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_recommendations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_recommendations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          base_currency: string
          created_at: string
          end_date: string | null
          id: string
          is_active: boolean
          name: string
          start_date: string | null
        }
        Insert: {
          base_currency?: string
          created_at?: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          name: string
          start_date?: string | null
        }
        Update: {
          base_currency?: string
          created_at?: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          name?: string
          start_date?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_member_id: { Args: never; Returns: string }
      current_member_role: {
        Args: never
        Returns: Database["public"]["Enums"]["member_role"]
      }
      day_has_guest_visible_item: {
        Args: { p_day_id: string }
        Returns: boolean
      }
      day_trip_id: { Args: { p_day_id: string }; Returns: string }
      is_active_guest_of: { Args: { p_trip_id: string }; Returns: boolean }
      is_kid_of: { Args: { p_trip_id: string }; Returns: boolean }
      is_owner_of: { Args: { p_trip_id: string }; Returns: boolean }
      link_member_to_auth_user: {
        Args: never
        Returns: Database["public"]["Enums"]["member_role"]
      }
    }
    Enums: {
      booking_status: "booked" | "paid" | "cancelled"
      booking_type:
        | "flight"
        | "hotel"
        | "train"
        | "attraction"
        | "car_rental"
        | "other"
      item_status: "planned" | "done" | "cancelled"
      member_role: "owner" | "kid" | "guest"
      photo_status: "pending" | "approved" | "rejected"
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
      booking_status: ["booked", "paid", "cancelled"],
      booking_type: [
        "flight",
        "hotel",
        "train",
        "attraction",
        "car_rental",
        "other",
      ],
      item_status: ["planned", "done", "cancelled"],
      member_role: ["owner", "kid", "guest"],
      photo_status: ["pending", "approved", "rejected"],
    },
  },
} as const
