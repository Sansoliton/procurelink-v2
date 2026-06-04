import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Building2, Plus, Pencil, Trash2, Search, X,
  Phone, Globe, MapPin, Mail, User, Check, Upload,
  ChevronUp, ChevronDown, FileText,
} from 'lucide-react'
import { Button, Badge } from '@/components/ui'
import { customersApi } from '@/api'
import type { Customer } from '@/types'

// ── Constants ────────────────────────────────────────────────────────
const INDUSTRIES = [
  'Manufacturing', 'Construction', 'Oil & Gas', 'Automotive',
  'Aerospace', 'Chemical', 'Food & Beverage', 'Mining', 'Utilities', 'Other',
]

type SortKey = 'company' | 'contact_name' | 'city' | 'industry' | 'status' | 'created_at'

const BLANK: Omit<Customer, 'id' | 'org_id' | 'created_at'> = {
  company: '', contact_name: '', email: '', phone: '',
  industry: '', website: '', city: '', notes: '', trn: '', status: 'active',
}

// ── Helpers ───────────────────────────────────────────────────────────
function logoSrc(c: Customer) { return c.logo_url || c.logo_image || '' }

function CustomerAvatar({ c, size = 'md' }: { c: Customer; size?: 'sm' | 'md' }) {
  const [failed, setFailed] = useState(false)
  const dim = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm'
  const src = logoSrc(c)
  return (
    <div className={`${dim} rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0 overflow-hidden`}>
      {src && !failed
        ? <img src={src} alt={c.company} className="w-full h-full object-contain p-0.5" onError={() => setFailed(true)} />
        : <span className="font-bold text-blue-700">{c.company[0]?.toUpperCase()}</span>
      }
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────
export default function AddCustomerPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm]       = useState(false)
  const [editingId, setEditingId]     = useState<string | null>(null)
  const [form, setForm]               = useState({ ...BLANK })
  const [logoFile, setLogoFile]       = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState('')
  const [search, setSearch]           = useState('')
  const [sortKey, setSortKey]         = useState<SortKey>('company')
  const [sortAsc, setSortAsc]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [saved, setSaved]             = useState(false)
  const [saveError, setSaveError]     = useState('')
  const logoInputRef = useRef<HTMLInputElement>(null)

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: customersApi.list,
  })

  const createMut = useMutation({
    mutationFn: async (data: typeof BLANK) => {
      const customer = await customersApi.create(data)
      if (logoFile) {
        try { await customersApi.uploadLogo(customer.id, logoFile) } catch { /* silent */ }
      }
      return customer
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); finishSave() },
    onError: (err: any) => setSaveError(err?.response?.data?.detail ?? 'Failed to save. Please try again.'),
    onSettled: () => setSaving(false),
  })

  const updateMut = useMutation({
    mutationFn: async (data: typeof BLANK) => {
      const customer = await customersApi.update(editingId!, data)
      if (logoFile) {
        try { await customersApi.uploadLogo(editingId!, logoFile) } catch { /* silent */ }
      }
      return customer
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); finishSave() },
    onError: (err: any) => setSaveError(err?.response?.data?.detail ?? 'Failed to save. Please try again.'),
    onSettled: () => setSaving(false),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => customersApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  })

  function finishSave() {
    setSaved(true)
    setTimeout(() => { setShowForm(false); setSaved(false) }, 700)
  }

  function openAdd() {
    setForm({ ...BLANK })
    setLogoFile(null); setLogoPreview('')
    setEditingId(null); setShowForm(true); setSaved(false); setSaveError('')
  }

  function openEdit(c: Customer) {
    const { id: _id, org_id: _o, created_at: _ts, ...rest } = c
    setForm({ ...BLANK, ...rest })
    setLogoFile(null)
    setLogoPreview(logoSrc(c))
    setEditingId(c.id); setShowForm(true); setSaved(false); setSaveError('')
  }

  function handleSave() {
    if (!form.company.trim()) return
    setSaving(true)
    if (editingId) updateMut.mutate(form)
    else createMut.mutate(form)
  }

  function handleDelete(id: string) {
    if (!confirm('Delete this customer?')) return
    deleteMut.mutate(id)
  }

  function setField<K extends keyof typeof BLANK>(key: K, value: string) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setLogoFile(file)
    const reader = new FileReader()
    reader.onload = () => setLogoPreview(reader.result as string)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(a => !a)
    else { setSortKey(key); setSortAsc(true) }
  }

  // Filter + sort
  const filtered = customers
    .filter(c =>
      search === '' ||
      c.company.toLowerCase().includes(search.toLowerCase()) ||
      (c.contact_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (c.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (c.city ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (c.trn ?? '').toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      const av = (a[sortKey] ?? '') as string
      const bv = (b[sortKey] ?? '') as string
      return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av)
    })

  const active   = customers.filter(c => c.status === 'active').length
  const inactive = customers.filter(c => c.status === 'inactive').length

  function SortBtn({ col }: { col: SortKey }) {
    const active = sortKey === col
    return (
      <button onClick={() => toggleSort(col)} className="inline-flex items-center gap-0.5 hover:text-blue-600">
        {active
          ? sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
          : <span className="w-3 h-3 opacity-30">↕</span>
        }
      </button>
    )
  }

  return (
    <div>
      {/* ── Page header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-600" />
            Customers
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {customers.length} total · {active} active · {inactive} inactive
          </p>
        </div>
        <Button variant="primary" onClick={openAdd}>
          <Plus className="w-4 h-4" />
          Add customer
        </Button>
      </div>

      {/* ── Create / Edit form ── */}
      {showForm && (
        <div className="mb-6 bg-white border border-blue-200 rounded-xl shadow-sm overflow-hidden">
          {/* Form header */}
          <div className="flex items-center justify-between px-5 py-3 bg-blue-50 border-b border-blue-200">
            <h3 className="text-sm font-semibold text-blue-900">
              {editingId ? 'Edit Customer' : 'New Customer'}
            </h3>
            <button onClick={() => setShowForm(false)} className="text-blue-400 hover:text-blue-700">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5">
            <div className="flex gap-5">
              {/* Logo upload — left column */}
              <div className="flex flex-col items-center gap-2 flex-shrink-0">
                <div
                  className="w-24 h-24 border-2 border-dashed border-gray-200 rounded-xl
                    flex items-center justify-center cursor-pointer hover:border-blue-400
                    hover:bg-blue-50 transition-colors overflow-hidden bg-gray-50"
                  onClick={() => logoInputRef.current?.click()}
                  title="Click to upload logo"
                >
                  {logoPreview
                    ? <img src={logoPreview} alt="logo" className="w-full h-full object-contain p-1.5" />
                    : <div className="flex flex-col items-center gap-1 text-gray-300">
                        <Upload className="w-6 h-6" />
                        <span className="text-[9px] font-medium">Logo</span>
                      </div>
                  }
                </div>
                <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoFile} />
                {logoPreview && (
                  <button
                    type="button"
                    onClick={() => { setLogoFile(null); setLogoPreview('') }}
                    className="text-[10px] text-red-400 hover:text-red-600"
                  >
                    Remove
                  </button>
                )}
                <p className="text-[10px] text-gray-400 text-center leading-tight">
                  {logoPreview ? 'Click to change' : 'Click to upload'}
                </p>
              </div>

              {/* Fields — right area */}
              <div className="flex-1 grid grid-cols-3 gap-3">
                {/* Row 1 */}
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Company Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    className="input-base"
                    placeholder="Acme Corporation"
                    value={form.company}
                    onChange={e => setField('company', e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                  <select className="input-base" value={form.status} onChange={e => setField('status', e.target.value)}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>

                {/* Row 2 */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Contact Person</label>
                  <input className="input-base" placeholder="John Smith" value={form.contact_name ?? ''}
                    onChange={e => setField('contact_name', e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                  <input type="email" className="input-base" placeholder="contact@company.com" value={form.email ?? ''}
                    onChange={e => setField('email', e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                  <input className="input-base" placeholder="+971 50 000 0000" value={form.phone ?? ''}
                    onChange={e => setField('phone', e.target.value)} />
                </div>

                {/* Row 3 */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Industry</label>
                  <select className="input-base" value={form.industry ?? ''} onChange={e => setField('industry', e.target.value)}>
                    <option value="">— select —</option>
                    {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">City / Location</label>
                  <input className="input-base" placeholder="Dubai, UAE" value={form.city ?? ''}
                    onChange={e => setField('city', e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">TRN</label>
                  <input className="input-base font-mono" placeholder="100123456700003" value={form.trn ?? ''}
                    onChange={e => setField('trn', e.target.value)} />
                </div>

                {/* Row 4 */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Website</label>
                  <input className="input-base" placeholder="https://example.com" value={form.website ?? ''}
                    onChange={e => setField('website', e.target.value)} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                  <input className="input-base" placeholder="Internal notes…" value={form.notes ?? ''}
                    onChange={e => setField('notes', e.target.value)} />
                </div>
              </div>
            </div>

            {/* Form actions */}
            {saveError && (
              <p className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {saveError}
              </p>
            )}
            <div className="flex gap-2 justify-end mt-4 pt-4 border-t border-gray-100">
              <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button
                variant="primary"
                disabled={!form.company.trim() || saving}
                onClick={handleSave}
              >
                {saved
                  ? <><Check className="w-4 h-4" /> Saved!</>
                  : saving ? 'Saving…'
                  : editingId ? 'Update customer' : 'Add customer'
                }
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Search ── */}
      {customers.length > 0 && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            className="input-base pl-9"
            placeholder="Search by company, contact, email, city, or TRN…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* ── Table ── */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : customers.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-gray-200 rounded-xl">
          <Building2 className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-500 mb-1">No customers yet</p>
          <p className="text-xs text-gray-400 mb-4">Add your first customer to get started.</p>
          <Button variant="primary" onClick={openAdd}>
            <Plus className="w-4 h-4" /> Add customer
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-sm text-gray-400">No customers match "{search}"</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left w-10" />
                  <th className="px-4 py-3 text-left">
                    <span className="flex items-center gap-1">Company <SortBtn col="company" /></span>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <span className="flex items-center gap-1">Contact <SortBtn col="contact_name" /></span>
                  </th>
                  <th className="px-4 py-3 text-left hidden md:table-cell">Email / Phone</th>
                  <th className="px-4 py-3 text-left hidden lg:table-cell">
                    <span className="flex items-center gap-1">City <SortBtn col="city" /></span>
                  </th>
                  <th className="px-4 py-3 text-left hidden lg:table-cell">
                    <span className="flex items-center gap-1">Industry <SortBtn col="industry" /></span>
                  </th>
                  <th className="px-4 py-3 text-left hidden xl:table-cell">TRN</th>
                  <th className="px-4 py-3 text-left">
                    <span className="flex items-center gap-1">Status <SortBtn col="status" /></span>
                  </th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(c => (
                  <tr key={c.id} className="hover:bg-blue-50/30 transition-colors group">
                    {/* Logo */}
                    <td className="px-4 py-3">
                      <CustomerAvatar c={c} size="sm" />
                    </td>

                    {/* Company */}
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{c.company}</p>
                      {c.website && (
                        <a href={c.website} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-blue-500 hover:underline mt-0.5"
                          onClick={e => e.stopPropagation()}>
                          <Globe className="w-3 h-3" />
                          {c.website.replace(/^https?:\/\//, '')}
                        </a>
                      )}
                    </td>

                    {/* Contact */}
                    <td className="px-4 py-3">
                      {c.contact_name && (
                        <span className="flex items-center gap-1.5 text-gray-700">
                          <User className="w-3 h-3 text-gray-400 flex-shrink-0" />
                          {c.contact_name}
                        </span>
                      )}
                    </td>

                    {/* Email / Phone */}
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="space-y-0.5">
                        {c.email && (
                          <a href={`mailto:${c.email}`}
                            className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-blue-600"
                            onClick={e => e.stopPropagation()}>
                            <Mail className="w-3 h-3 text-gray-400 flex-shrink-0" />
                            {c.email}
                          </a>
                        )}
                        {c.phone && (
                          <a href={`tel:${c.phone}`}
                            className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-blue-600"
                            onClick={e => e.stopPropagation()}>
                            <Phone className="w-3 h-3 text-gray-400 flex-shrink-0" />
                            {c.phone}
                          </a>
                        )}
                      </div>
                    </td>

                    {/* City */}
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {c.city && (
                        <span className="flex items-center gap-1.5 text-xs text-gray-600">
                          <MapPin className="w-3 h-3 text-gray-400 flex-shrink-0" />
                          {c.city}
                        </span>
                      )}
                    </td>

                    {/* Industry */}
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {c.industry && <Badge variant="blue">{c.industry}</Badge>}
                    </td>

                    {/* TRN */}
                    <td className="px-4 py-3 hidden xl:table-cell">
                      {c.trn && (
                        <span className="flex items-center gap-1.5 text-xs text-gray-600">
                          <FileText className="w-3 h-3 text-gray-400 flex-shrink-0" />
                          <span className="font-mono">{c.trn}</span>
                        </span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <Badge variant={c.status === 'active' ? 'green' : 'gray'}>
                        {c.status}
                      </Badge>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEdit(c)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(c.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Table footer */}
          <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 text-xs text-gray-400">
            {filtered.length} of {customers.length} customer{customers.length !== 1 ? 's' : ''}
            {search && ` · filtered by "${search}"`}
          </div>
        </div>
      )}
    </div>
  )
}
