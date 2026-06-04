import axios from 'axios'
import type {
  TokenResponse, User, Project, ProjectMember, Vendor,
  Requirement, LineItem, RFQ, Quotation, VendorPO, PurchaseOrder, PurchaseOrderDetail,
  Invoice, Notification, AnalyticsOverview,
  Customer, CustomerQuotation, CustomerInvoice, DeliveryNote,
} from '@/types'

const api = axios.create({
  // In production the React build is served separately from the backend.
  // Set VITE_API_URL=https://procurelink-backend.onrender.com at build time.
  // Falls back to '/api' for local Docker Compose (Nginx proxies /api/ → backend).
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
})

// Attach JWT on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('pl_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// On 401 → clear token and redirect to login
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('pl_token')
      localStorage.removeItem('pl_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// ── Auth ────────────────────────────────────────────────────────
export const authApi = {
  register: (data: { org_name: string; email: string; password: string; full_name?: string }) =>
    api.post<TokenResponse>('/auth/register', data).then((r) => r.data),
  login: (email: string, password: string) =>
    api.post<TokenResponse>('/auth/login', { email, password }).then((r) => r.data),
  me: () => api.get<User>('/auth/me').then((r) => r.data),
  refresh: () => api.post<TokenResponse>('/auth/refresh').then((r) => r.data),
  invite: (email: string, org_role: string) =>
    api.post<{ token: string; expires_at: string }>('/auth/invite', { email, org_role }).then((r) => r.data),
  acceptInvite: (token: string, password: string, full_name?: string) =>
    api.post<TokenResponse>('/auth/accept-invite', { token, password, full_name }).then((r) => r.data),
  changePassword: (current_password: string, new_password: string) =>
    api.post('/auth/change-password', { current_password, new_password }).then((r) => r.data),
  forgotPassword: (email: string) =>
    api.post('/auth/forgot-password', { email }).then((r) => r.data),
  resetPassword: (token: string, new_password: string) =>
    api.post('/auth/reset-password', { token, new_password }).then((r) => r.data),
}

// ── Projects ────────────────────────────────────────────────────
export const projectsApi = {
  list: () => api.get<Project[]>('/projects/').then((r) => r.data),
  get: (id: string) => api.get<Project>(`/projects/${id}`).then((r) => r.data),
  create: (data: { name: string; description?: string }) =>
    api.post<Project>('/projects/', data).then((r) => r.data),
  update: (id: string, data: Partial<Project>) =>
    api.put<Project>(`/projects/${id}`, data).then((r) => r.data),
  addMember: (projectId: string, userId: string, role = 'viewer') =>
    api.post(`/projects/${projectId}/members`, null, {
      params: { user_id: userId, project_role: role },
    }).then((r) => r.data),
  removeMember: (projectId: string, userId: string) =>
    api.delete(`/projects/${projectId}/members/${userId}`).then((r) => r.data),
}

// ── Vendors ─────────────────────────────────────────────────────
export const vendorsApi = {
  list: () => api.get<Vendor[]>('/vendors/').then((r) => r.data),
  create: (data: Omit<Vendor, 'id' | 'org_id'>) =>
    api.post<Vendor>('/vendors/', data).then((r) => r.data),
  update: (id: string, data: Partial<Vendor>) =>
    api.put<Vendor>(`/vendors/${id}`, data).then((r) => r.data),
}

// ── Requirements ────────────────────────────────────────────────
export const requirementsApi = {
  list: (projectId: string) =>
    api.get<Requirement[]>(`/projects/${projectId}/requirements/`).then((r) => r.data),
  get: (projectId: string, id: string) =>
    api.get<Requirement>(`/projects/${projectId}/requirements/${id}`).then((r) => r.data),
  create: (projectId: string, data: { title: string; raw_text?: string; delivery_date?: string }) =>
    api.post<Requirement>(`/projects/${projectId}/requirements/`, data).then((r) => r.data),
  updateItems: (projectId: string, id: string, items: Partial<LineItem>[]) =>
    api.put<Requirement>(`/projects/${projectId}/requirements/${id}/items`, items).then((r) => r.data),
  submit: (projectId: string, id: string) =>
    api.post<Requirement>(`/projects/${projectId}/requirements/${id}/submit`).then((r) => r.data),
  uploadFile: (projectId: string, id: string, file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post<{ file_path: string; url: string }>(
      `/projects/${projectId}/requirements/${id}/upload`, fd,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    ).then((r) => r.data)
  },
}

// ── RFQs ────────────────────────────────────────────────────────
export const rfqsApi = {
  send: (reqId: string, vendorIds: string[]) =>
    api.post<RFQ[]>(`/rfqs/send/${reqId}`, vendorIds).then((r) => r.data),
  list: (reqId: string) =>
    api.get<RFQ[]>(`/rfqs/requirement/${reqId}`).then((r) => r.data),
  respond: (rfqId: string, lines: { line_item_id: string; unit_price: number; lead_days: number; notes?: string }[]) =>
    api.post(`/rfqs/${rfqId}/respond`, { lines }).then((r) => r.data),
  respondInternal: (
    rfqId: string,
    channel: string,
    response_notes: string,
    lines: { line_item_id: string; unit_price: number; lead_days: number; notes?: string }[],
  ) =>
    api.post(`/rfqs/${rfqId}/respond-internal`, { channel, response_notes, lines }).then((r) => r.data),
}

// ── Quotes ──────────────────────────────────────────────────────
export const quotesApi = {
  build: (reqId: string, marginPct = 18) =>
    api.post<Quotation>(`/quotes/build/${reqId}`, null, { params: { margin_pct: marginPct } }).then((r) => r.data),
  approve: (quoteId: string) =>
    api.post<Quotation>(`/quotes/${quoteId}/approve`).then((r) => r.data),
  raisePO: (quoteId: string) =>
    api.post<PurchaseOrder>(`/quotes/${quoteId}/po`).then((r) => r.data),
  getPoForQuote: (quoteId: string) =>
    api.get<PurchaseOrderDetail>(`/quotes/${quoteId}/po`).then((r) => r.data),
  vendorPos: (quoteId: string) =>
    api.get<VendorPO[]>(`/quotes/${quoteId}/vendor-pos`).then((r) => r.data),
  raiseInvoice: (poId: string) =>
    api.post<Invoice>(`/quotes/po/${poId}/invoice`).then((r) => r.data),
  markPaid: (invoiceId: string) =>
    api.post<Invoice>(`/quotes/invoice/${invoiceId}/pay`).then((r) => r.data),
  exportInvoice: (invoiceId: string, fmt: 'json' | 'csv' | 'xml') =>
    api.get(`/quotes/invoice/${invoiceId}/export`, { params: { fmt } }).then((r) => r.data),
}

// ── Notifications ────────────────────────────────────────────────
export const notificationsApi = {
  list: (unreadOnly = false) =>
    api.get<Notification[]>('/notifications/', { params: { unread_only: unreadOnly } }).then((r) => r.data),
  count: () => api.get<{ unread: number }>('/notifications/count').then((r) => r.data),
  markRead: (id: string) => api.put(`/notifications/${id}/read`).then((r) => r.data),
  markAllRead: () => api.put('/notifications/read-all').then((r) => r.data),
}

// ── Analytics ────────────────────────────────────────────────────
export const analyticsApi = {
  overview: () => api.get<AnalyticsOverview>('/analytics/overview').then((r) => r.data),
}

// ── Purchase Orders ──────────────────────────────────────────────
export const purchaseOrdersApi = {
  list: () => api.get<PurchaseOrderDetail[]>('/quotes/pos').then((r) => r.data),
}

// ── Customers ────────────────────────────────────────────────────
export const customersApi = {
  list: () => api.get<Customer[]>('/customers/').then((r) => r.data),
  get: (id: string) => api.get<Customer>(`/customers/${id}`).then((r) => r.data),
  create: (data: Omit<Customer, 'id' | 'org_id' | 'created_at'>) =>
    api.post<Customer>('/customers/', data).then((r) => r.data),
  update: (id: string, data: Partial<Customer>) =>
    api.put<Customer>(`/customers/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/customers/${id}`).then((r) => r.data),
  uploadLogo: (id: string, file: File) => {
    const fd = new FormData(); fd.append('file', file)
    return api.post<{ url: string }>(`/customers/${id}/logo`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data.url)
  },
}

// ── Logo upload (generic — for company/issuer logos) ────────────
export const logosApi = {
  upload: (file: File): Promise<string> => {
    const fd = new FormData(); fd.append('file', file)
    return api.post<{ url: string }>('/logos/upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data.url)
  },
}

// ── Org settings ─────────────────────────────────────────────────
export const orgApi = {
  getSettings: (): Promise<Record<string, unknown>> =>
    api.get<Record<string, unknown>>('/org/settings').then((r) => r.data),
  patchSettings: (data: Record<string, unknown>): Promise<Record<string, unknown>> =>
    api.patch<Record<string, unknown>>('/org/settings', data).then((r) => r.data),
}

// ── Customer Quotations (sales-side) ────────────────────────────
export const cquotesApi = {
  list: () => api.get<CustomerQuotation[]>('/cquotes/').then((r) => r.data),
  get: (id: string) => api.get<CustomerQuotation>(`/cquotes/${id}`).then((r) => r.data),
  create: (data: Omit<CustomerQuotation, 'id' | 'org_id' | 'created_at' | 'updated_at'>) =>
    api.post<CustomerQuotation>('/cquotes/', data).then((r) => r.data),
  update: (id: string, data: Partial<CustomerQuotation>) =>
    api.put<CustomerQuotation>(`/cquotes/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/cquotes/${id}`).then((r) => r.data),
  getPdf: (id: string) => api.get<{ pdf_url: string }>(`/cquotes/${id}/pdf`).then((r) => r.data),
  getRelated: (id: string) =>
    api.get<{ invoices: CustomerInvoice[]; pos: unknown[] }>(`/cquotes/${id}/related`).then((r) => r.data),
  uploadFile: (id: string, file: File): Promise<{ url: string; filename: string; content_type: string; file_id: string }> => {
    const fd = new FormData(); fd.append('file', file)
    return api.post(`/cquotes/${id}/upload`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data)
  },
}

// -- Customer Invoices (sales-side) --
export const cinvoicesApi = {
  list: () => api.get<CustomerInvoice[]>('/cinvoices/').then((r) => r.data),
  get: (id: string) => api.get<CustomerInvoice>(`/cinvoices/${id}`).then((r) => r.data),
  create: (data: Omit<CustomerInvoice, 'id' | 'org_id' | 'created_at' | 'updated_at'>) =>
    api.post<CustomerInvoice>('/cinvoices/', data).then((r) => r.data),
  update: (id: string, data: Partial<CustomerInvoice>) =>
    api.put<CustomerInvoice>(`/cinvoices/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/cinvoices/${id}`).then((r) => r.data),
  getPdf: (id: string) => api.get<{ pdf_url: string }>(`/cinvoices/${id}/pdf`).then((r) => r.data),
}

// ── Delivery Notes ────────────────────────────────────────────────
export const deliveryNotesApi = {
  list: (params?: { quotation_id?: string; quotation_no?: string }) =>
    api.get<DeliveryNote[]>('/delivery-notes/', { params }).then((r) => r.data),
  get: (id: string) => api.get<DeliveryNote>(`/delivery-notes/${id}`).then((r) => r.data),
  create: (data: Omit<DeliveryNote, 'id' | 'org_id' | 'created_at' | 'updated_at'>) =>
    api.post<DeliveryNote>('/delivery-notes/', data).then((r) => r.data),
  update: (id: string, data: Partial<Omit<DeliveryNote, 'id' | 'org_id' | 'created_at' | 'updated_at'>>) =>
    api.put<DeliveryNote>(`/delivery-notes/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/delivery-notes/${id}`).then((r) => r.data),
  getPdf: (id: string): Promise<string> =>
    api.get(`/delivery-notes/${id}/pdf`, { responseType: 'blob' })
      .then((r) => URL.createObjectURL(r.data)),
}

export default api

