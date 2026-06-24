import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import {
  Bell, LogOut, Package,
  Building2, Receipt, ClipboardList, ShoppingCart, Users,
} from 'lucide-react'

const FEATURE_INVOICES = import.meta.env.VITE_FEATURE_INVOICES === 'true'
const FEATURE_PO       = import.meta.env.VITE_FEATURE_PO       === 'true'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { ProjectProvider } from '@/context/ProjectContext'
import { notificationsApi } from '@/api'
import { Spinner } from '@/components/ui'
import quoteMeLogo from '@/assets/images/quoteme-logo.svg'

// Pages
import LoginPage from '@/pages/auth/LoginPage'
import RegisterPage from '@/pages/auth/RegisterPage'
import AcceptInvitePage from '@/pages/auth/AcceptInvitePage'
import ProjectsPage from '@/pages/projects/ProjectsPage'
import ProjectDetailPage from '@/pages/projects/ProjectDetailPage'
import SubmitPage from '@/pages/requirements/SubmitPage'
import QuotePage from '@/pages/requirements/QuotePage'
import POPage from '@/pages/requirements/POPage'
import InvoicePage from '@/pages/requirements/InvoicePage'
import VendorPortalPage from '@/pages/vendors/VendorPortalPage'
import VendorCatalogPage from '@/pages/vendors/VendorCatalogPage'
// ...existing code...

import AddCustomerPage from '@/pages/AddCustomerPage'
import ProjectsShowcasePage from '@/pages/ProjectsShowcasePage'
import AnalyticsPage from '@/pages/analytics/AnalyticsPage'
import QuotationsListPage from '@/pages/quotations/QuotationsListPage'
import QuotationEditorPage from '@/pages/quotations/QuotationEditorPage'
import InvoicesListPage from '@/pages/invoices/InvoicesListPage'
import InvoiceEditorPage from '@/pages/invoices/InvoiceEditorPage'
import DashboardPage from '@/pages/projects/DashboardPage'
import PurchaseOrdersListPage from '@/pages/procurement/PurchaseOrdersListPage'
import UsersPage from '@/pages/admin/UsersPage'

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } })

// ── Route guards ─────────────────────────────────────────────────
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return <div className="flex items-center justify-center h-screen"><Spinner size="lg" /></div>
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return <div className="flex items-center justify-center h-screen"><Spinner size="lg" /></div>
  if (!user) return <Navigate to="/login" replace />
  if (user.org_role !== 'org-admin' && user.org_role !== 'super-admin')
    return <Navigate to="/quotations" replace />
  return <>{children}</>
}

// ── Notification bell ────────────────────────────────────────────
function NotifBell() {
  const { data } = useQuery({
    queryKey: ['notif-count'],
    queryFn: notificationsApi.count,
    refetchInterval: 30_000,
  })
  const count = data?.unread ?? 0

  return (
    <button className="relative p-1.5 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700">
      <Bell className="w-5 h-5" />
      {count > 0 && (
        <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </button>
  )
}

// ── Left sidebar nav ─────────────────────────────────────────────
function LeftSidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2.5 text-sm font-medium px-3 py-2 rounded-lg transition-colors ${
      isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
    }`
  const section = 'px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-widest mt-5 mb-1'

  return (
    <aside className="h-screen w-56 bg-white border-r border-gray-200 flex flex-col py-5 px-3 sticky top-0 z-30">
      {/* Logo + bell */}
      <div className="flex items-center justify-between mb-5 px-1">
        <button
          type="button"
          className="cursor-pointer"
          onClick={() => navigate('/')}
          aria-label="Go to dashboard"
        >
          <img src={quoteMeLogo} alt="QuoteMe" className="h-9 w-auto" />
        </button>
        <NotifBell />
      </div>

      <nav className="flex flex-col gap-0.5 mt-4 flex-1 overflow-y-auto">
        <NavLink to="/quotations" className={linkCls}>
          <Receipt className="w-4 h-4 flex-shrink-0" />
          Quotations
        </NavLink>
        {FEATURE_PO && (
          <NavLink to="/purchase-orders" className={linkCls}>
            <ShoppingCart className="w-4 h-4 flex-shrink-0" />
            Purchase Orders
          </NavLink>
        )}
        {FEATURE_INVOICES && (
          <NavLink to="/invoices" className={linkCls}>
            <ClipboardList className="w-4 h-4 flex-shrink-0" />
            Invoices
          </NavLink>
        )}

        <p className={section}>Procurement</p>
        <NavLink to="/vendors" className={linkCls}>
          <Package className="w-4 h-4 flex-shrink-0" />
          Vendors
        </NavLink>
        <NavLink to="/add-customer" className={linkCls}>
          <Building2 className="w-4 h-4 flex-shrink-0" />
          Customers
        </NavLink>

        {(user?.org_role === 'org-admin' || user?.org_role === 'super-admin') && (
          <>
            <p className={section}>Admin</p>
            <NavLink to="/admin/users" className={linkCls}>
              <Users className="w-4 h-4 flex-shrink-0" />
              Users
            </NavLink>
          </>
        )}

      </nav>

      {/* User footer */}
      <div className="border-t border-gray-100 pt-4 mt-2 space-y-1">
        <div className="flex items-center gap-2.5 px-2 py-1">
          <div className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
            {user?.full_name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? 'U'}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-800 truncate">{user?.full_name ?? user?.email}</p>
            {user?.full_name && <p className="text-[10px] text-gray-400 truncate">{user.email}</p>}
          </div>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-2 w-full px-2 py-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="text-xs font-medium">Sign out</span>
        </button>
      </div>
    </aside>
  )
}

// ── Authenticated layout ─────────────────────────────────────────
function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex">
      <LeftSidebar />
      <main className="flex-1 px-8 py-8">{children}</main>
    </div>
  )
}

// ── Root ─────────────────────────────────────────────────────────
export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <ProjectProvider>
          <BrowserRouter>
            <Routes>
              {/* Public */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/accept-invite" element={<AcceptInvitePage />} />
              <Route path="/vendor-portal/:rfqId" element={<VendorPortalPage />} />

              {/* Protected */}
              <Route path="/*" element={
                <PrivateRoute>
                  <AppLayout>
                    <Routes>
                      <Route path="/" element={<Navigate to="/quotations" replace />} />
                      <Route path="/dashboard" element={<DashboardPage />} />
                      <Route path="/projects" element={<ProjectsPage />} />
                      <Route path="/projects/:id" element={<ProjectDetailPage />} />
                      <Route path="/projects-showcase" element={<ProjectsShowcasePage />} />
                      <Route path="/add-customer" element={<AddCustomerPage />} />
                      <Route path="/submit" element={<SubmitPage />} />
                      <Route path="/requirement/:id/quote" element={<QuotePage />} />
                      <Route path="/requirement/:id/po" element={<POPage />} />
                      <Route path="/requirement/:id/invoice" element={<InvoicePage />} />
                      <Route path="/vendors" element={<VendorCatalogPage />} />
                      <Route path="/quotations" element={<QuotationsListPage />} />
                      <Route path="/quotations/new" element={<QuotationEditorPage />} />
                      <Route path="/quotations/:id" element={<QuotationEditorPage />} />
                      {FEATURE_INVOICES && <Route path="/invoices" element={<InvoicesListPage />} />}
                      {FEATURE_INVOICES && <Route path="/invoices/:id" element={<InvoiceEditorPage />} />}
                      {FEATURE_PO && <Route path="/purchase-orders" element={<PurchaseOrdersListPage />} />}
                      <Route path="/admin/users" element={
                        <AdminRoute><UsersPage /></AdminRoute>
                      } />
                    </Routes>
                  </AppLayout>
                </PrivateRoute>
              } />
            </Routes>
          </BrowserRouter>
        </ProjectProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
