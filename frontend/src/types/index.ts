// Auth
export interface User {
  id: string
  email: string
  full_name?: string
  org_id: string
  org_role: 'super-admin' | 'org-admin' | 'member'
  is_active: boolean
  created_at: string
}

export interface TokenResponse {
  access_token: string
  token_type: string
}

// Org & Projects
export interface Organisation {
  id: string
  name: string
  slug: string
  type: string
  plan: string
  created_at: string
}

export interface ProjectMember {
  id: string
  user_id: string
  project_role: 'buyer' | 'viewer'
  user?: User
}

export interface Project {
  id: string
  org_id: string
  name: string
  description?: string
  status: 'active' | 'archived'
  created_by: string
  created_at: string
  members: ProjectMember[]
}

// Vendors
export interface VendorCatalogItem {
  id: string          // client-generated uuid for keying
  description: string
  part_number?: string
  unit?: string
  unit_price: number
}

export interface Vendor {
  id: string
  org_id: string
  name: string
  email: string
  categories: string[]
  catalog_items: VendorCatalogItem[]
  rating: number
  is_active: boolean
}

// Requirements
export interface LineItem {
  id: string
  description: string
  part_number?: string
  quantity?: number
  unit?: string
  specs?: string
  category?: string
  sort_order: number
}

export interface Requirement {
  id: string
  org_id: string
  project_id: string
  created_by: string
  title: string
  raw_text?: string
  file_path?: string
  status: RequirementStatus
  delivery_date?: string
  created_at: string
  line_items: LineItem[]
  quotation?: Quotation
}

export type RequirementStatus =
  | 'draft' | 'submitted' | 'rfq_sent'
  | 'quotes_received' | 'quote_ready'
  | 'approved' | 'po_raised' | 'invoiced' | 'completed'

// RFQs
export interface QuoteLine {
  id: string
  line_item_id: string
  unit_price?: number
  lead_days?: number
  notes?: string
  channel?: string
  response_notes?: string
}

export interface RFQ {
  id: string
  vendor: Vendor
  status: 'pending' | 'sent' | 'responded' | 'expired'
  deadline?: string
  sent_at?: string
  responded_at?: string
  reminder_count: number
  quote_lines: QuoteLine[]
}

// Quotations
export interface QuotationLineBreakdown {
  line_item_id: string
  description: string
  qty: number
  unit?: string
  vendor_id?: string
  vendor_name: string
  rfq_id?: string
  unit_price?: number
  line_total?: number
}

export interface VendorPO {
  id: string
  vendor_id: string
  vendor_name: string
  reference: string
  status: string
  amount: number
  lines: QuotationLineBreakdown[]
  raised_at: string
}

export interface Quotation {
  id: string
  reference: string
  total_cost?: number
  margin_pct: number
  customer_total?: number
  valid_until?: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  line_breakdown: QuotationLineBreakdown[]
  vendor_pos: VendorPO[]
}

// PO & Invoice
export interface PurchaseOrder {
  id: string
  reference: string
  status: string
  payment_terms: string
  raised_at: string
}

export interface PurchaseOrderDetail extends PurchaseOrder {
  quotation_id: string
  quotation_ref: string
  total_amount: number
  vendor_count: number
  pdf_url?: string
}

export interface Invoice {
  id: string
  reference: string
  amount: number
  tax: number
  status: 'issued' | 'paid' | 'overdue'
  issued_at: string
  due_at?: string
  paid_at?: string
}

// Notifications
export interface Notification {
  id: string
  type: string
  title: string
  body?: string
  entity_type?: string
  entity_id?: string
  is_read: boolean
  created_at: string
}

// Analytics
export interface AnalyticsOverview {
  total_requirements: number
  active_projects: number
  total_po_value: number
  open_rfqs: number
  overdue_invoices: number
  avg_cycle_days: number
}

// Customers
export interface Customer {
  id: string
  org_id: string
  company: string
  contact_name?: string
  email?: string
  phone?: string
  industry?: string
  website?: string
  city?: string
  notes?: string
  logo_image?: string
  logo_url?: string
  status: 'active' | 'inactive'
  created_at: string
}

// Customer Quotations (sales-side)
export interface CustomerQuotation {
  id: string
  org_id: string
  quotation_no: string
  customer_id?: string
  customer_name?: string
  status: string
  total_amount: number
  doc_data: Record<string, unknown>
  pdf_url?: string
  created_at: string
  updated_at: string
}

// Customer Invoices (sales-side)
export interface CustomerInvoice {
  id: string
  org_id: string
  invoice_no: string
  quotation_no?: string
  customer_id?: string
  customer_name?: string
  status: string
  total_amount: number
  doc_data: Record<string, unknown>
  pdf_url?: string
  created_at: string
  updated_at: string
}
