import { useState } from 'react'
import {
  Building2, Plus, Pencil, Trash2, Search, X,
  Phone, Globe, MapPin, Mail, User, Check,
} from 'lucide-react'
import { Card, CardTitle, Button, Badge, EmptyState } from '@/components/ui'

interface Customer {
  id: string
  company: string
  contactName: string
  email: string
  phone: string
  industry: string
  website: string
  city: string
  notes: string
  status: 'active' | 'inactive'
  createdAt: string
}

const STORAGE_KEY = 'pl_customers'

const INDUSTRIES = [
  'Manufacturing', 'Construction', 'Oil & Gas', 'Automotive',
  'Aerospace', 'Chemical', 'Food & Beverage', 'Mining', 'Utilities', 'Other',
]

const BLANK: Omit<Customer, 'id' | 'createdAt'> = {
  company: '',
  contactName: '',
  email: '',
  phone: '',
  industry: '',
  website: '',
  city: '',
  notes: '',
  status: 'active',
}

function loadCustomers(): Customer[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') } catch { return [] }
}

function persist(list: Customer[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

export default function AddCustomerPage() {
  const [customers, setCustomers] = useState<Customer[]>(loadCustomers)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...BLANK })
  const [search, setSearch] = useState('')
  const [saved, setSaved] = useState(false)

  const filtered = customers.filter(
    (c) =>
      search === '' ||
      c.company.toLowerCase().includes(search.toLowerCase()) ||
      c.contactName.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase()),
  )

  function openAdd() {
    setForm({ ...BLANK })
    setEditingId(null)
    setShowForm(true)
    setSaved(false)
  }

  function openEdit(c: Customer) {
    const { id: _id, createdAt: _ts, ...rest } = c
    setForm(rest)
    setEditingId(c.id)
    setShowForm(true)
    setSaved(false)
  }

  function handleSave() {
    if (!form.company.trim() || !form.email.trim()) return
    let updated: Customer[]
    if (editingId) {
      updated = customers.map((c) => (c.id === editingId ? { ...c, ...form } : c))
    } else {
      updated = [
        { ...form, id: crypto.randomUUID(), createdAt: new Date().toISOString() },
        ...customers,
      ]
    }
    setCustomers(updated)
    persist(updated)
    setSaved(true)
    setTimeout(() => { setShowForm(false); setSaved(false) }, 700)
  }

  function handleDelete(id: string) {
    const updated = customers.filter((c) => c.id !== id)
    setCustomers(updated)
    persist(updated)
  }

  function setField(key: keyof typeof BLANK, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const active = customers.filter((c) => c.status === 'active').length

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-600" />
            Customers
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {customers.length} total · {active} active
          </p>
        </div>
        <Button variant="primary" onClick={openAdd}>
          <Plus className="w-4 h-4" />
          Add customer
        </Button>
      </div>

      {/* Add / Edit form */}
      {showForm && (
        <Card className="mb-6 border-blue-200">
          <div className="flex items-center justify-between mb-5">
            <CardTitle>{editingId ? 'Edit customer' : 'New customer'}</CardTitle>
            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Company name <span className="text-red-400">*</span>
              </label>
              <input
                className="input-base"
                placeholder="e.g. Acme Corporation"
                value={form.company}
                onChange={(e) => setField('company', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Primary contact</label>
              <input
                className="input-base"
                placeholder="e.g. John Smith"
                value={form.contactName}
                onChange={(e) => setField('contactName', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Email <span className="text-red-400">*</span>
              </label>
              <input
                type="email"
                className="input-base"
                placeholder="contact@company.com"
                value={form.email}
                onChange={(e) => setField('email', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
              <input
                className="input-base"
                placeholder="+1 555 000 0000"
                value={form.phone}
                onChange={(e) => setField('phone', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Industry</label>
              <select
                className="input-base"
                value={form.industry}
                onChange={(e) => setField('industry', e.target.value)}
              >
                <option value="">— select —</option>
                {INDUSTRIES.map((i) => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">City / Location</label>
              <input
                className="input-base"
                placeholder="e.g. Houston, TX"
                value={form.city}
                onChange={(e) => setField('city', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Website</label>
              <input
                className="input-base"
                placeholder="https://example.com"
                value={form.website}
                onChange={(e) => setField('website', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
              <select
                className="input-base"
                value={form.status}
                onChange={(e) => setField('status', e.target.value)}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div className="mb-5">
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea
              className="input-base resize-none"
              rows={2}
              placeholder="Internal notes about this customer…"
              value={form.notes}
              onChange={(e) => setField('notes', e.target.value)}
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!form.company.trim() || !form.email.trim()}
              onClick={handleSave}
            >
              {saved
                ? <><Check className="w-4 h-4" /> Saved!</>
                : editingId ? 'Update customer' : 'Add customer'}
            </Button>
          </div>
        </Card>
      )}

      {/* Search */}
      {customers.length > 0 && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            className="input-base pl-9"
            placeholder="Search by company, contact, or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {/* Customer list */}
      {customers.length === 0 ? (
        <EmptyState
          title="No customers yet"
          description="Add your first customer to associate them with projects and orders."
          action={
            <Button variant="primary" onClick={openAdd}>
              <Plus className="w-4 h-4" />
              Add customer
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <Card className="text-center py-8">
          <p className="text-sm text-gray-400">No customers match "{search}"</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map((c) => (
            <Card
              key={c.id}
              className="hover:border-blue-200 transition-all hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-700 text-sm font-bold flex items-center justify-center flex-shrink-0 border border-blue-100">
                    {c.company[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <p className="text-sm font-semibold text-gray-900">{c.company}</p>
                      <Badge variant={c.status === 'active' ? 'green' : 'gray'}>{c.status}</Badge>
                      {c.industry && <Badge variant="blue">{c.industry}</Badge>}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {c.contactName && (
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <User className="w-3 h-3" />{c.contactName}
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-xs text-gray-500">
                        <Mail className="w-3 h-3" />{c.email}
                      </span>
                      {c.phone && (
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <Phone className="w-3 h-3" />{c.phone}
                        </span>
                      )}
                      {c.city && (
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <MapPin className="w-3 h-3" />{c.city}
                        </span>
                      )}
                      {c.website && (
                        <a
                          href={c.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-blue-500 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Globe className="w-3 h-3" />
                          {c.website.replace(/^https?:\/\//, '')}
                        </a>
                      )}
                    </div>
                    {c.notes && (
                      <p className="text-xs text-gray-400 mt-1 italic truncate max-w-xl">{c.notes}</p>
                    )}
                  </div>
                </div>
                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => openEdit(c)}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
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
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
