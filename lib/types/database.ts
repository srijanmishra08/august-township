export type PlotStatus = 'available' | 'reserved' | 'sold' | 'blocked'
export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'site_visit_scheduled'
  | 'site_visit_done'
  | 'negotiating'
  | 'booked'
  | 'lost'

export interface Plot {
  id: string
  project_slug: string
  plot_number: string
  geometry_ref: string | null
  area_sqft: number | null
  type: string
  facing: string | null
  status: PlotStatus
  price: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Lead {
  id: string
  project_slug: string
  plot_id: string | null
  name: string
  phone: string
  email: string | null
  message: string | null
  status: LeadStatus
  created_at: string
  updated_at: string
}

export interface LeadNote {
  id: string
  lead_id: string
  author_id: string
  body: string
  created_at: string
}

export interface AuditLog {
  id: string
  entity_type: 'plot' | 'lead'
  entity_id: string
  field: string
  old_value: string | null
  new_value: string | null
  changed_by: string | null
  changed_at: string
}

export type Database = {
  public: {
    Tables: {
      plots: {
        Row: Plot
        Insert: Omit<Plot, 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<Plot, 'id'>>
      }
      leads: {
        Row: Lead
        Insert: Omit<Lead, 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<Lead, 'id'>>
      }
      lead_notes: {
        Row: LeadNote
        Insert: Omit<LeadNote, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Omit<LeadNote, 'id'>>
      }
      audit_log: {
        Row: AuditLog
        Insert: Omit<AuditLog, 'id' | 'changed_at'> & {
          id?: string
          changed_at?: string
        }
        Update: never
      }
    }
  }
}
