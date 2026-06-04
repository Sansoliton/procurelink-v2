import { Fragment, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Edit2, X, ChevronDown, ChevronRight, Trash2, Package } from 'lucide-react'
import { vendorsApi } from '@/api'
import { Button, Spinner, EmptyState, Card } from '@/components/ui'
import { formatCurrency } from '@/lib/utils'
import type { Vendor, VendorCatalogItem } from '@/types'

const ALL_CATEGORIES = [
  'flanges', 'fasteners', 'pipe', 'fittings', 'valves',
  'gaskets', 'structural', 'electrical', 'general',
]

function newItem(): VendorCatalogItem {
  return { id: crypto.randomUUID(), description: '', part_number: '', unit: 'ea', unit_price: 0 }
}

type VendorForm = { name: string; email: string; categories: string[]; rating: number; catalog_items: VendorCatalogItem[] }
const emptyForm = (): VendorForm => ({ name: '', email: '', categories: [], rating: 4.0, catalog_items: [] })

export default function VendorCatalogPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<VendorForm>(emptyForm())
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [saveError, setSaveError] = useState('')

  const { data: vendors = [], isLoading } = useQuery({ queryKey: ['vendors'], queryFn: vendorsApi.list })

  const createMut = useMutation({
    mutationFn: (data: VendorForm) => vendorsApi.create(data as any),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vendors'] }); resetForm() },
    onError: (err: any) => setSaveError(err?.response?.data?.detail ?? 'Failed to save vendor. Please try again.'),
  })

  const updateMut = useMutation({
    mutationFn: (data: VendorForm) => vendorsApi.update(editId!, data as any),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vendors'] }); resetForm() },
    onError: (err: any) => setSaveError(err?.response?.data?.detail ?? 'Failed to save vendor. Please try again.'),
  })

  const resetForm = () => { setForm(emptyForm()); setShowForm(false); setEditId(null); setSaveError('') }

  const startEdit = (v: Vendor) => {
    setForm({
      name: v.name, email: v.email,
      categories: v.categories ?? [],
      rating: v.rating,
      catalog_items: v.catalog_items ?? [],
    })
    setEditId(v.id)
    setShowForm(true)
  }

  const toggleCategory = (cat: string) =>
    setForm((p) => ({
      ...p,
      categories: p.categories.includes(cat)
        ? p.categories.filter((c) => c !== cat)
        : [...p.categories, cat],
    }))

  const addItem = () => setForm((p) => ({ ...p, catalog_items: [...p.catalog_items, newItem()] }))
  const removeItem = (id: string) => setForm((p) => ({ ...p, catalog_items: p.catalog_items.filter((i) => i.id !== id) }))
  const updateItem = (id: string, field: keyof VendorCatalogItem, val: string | number) =>
    setForm((p) => ({
      ...p,
      catalog_items: p.catalog_items.map((i) => i.id === id ? { ...i, [field]: val } : i),
    }))

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <h1>Vendor catalog</h1>
        <Button variant="primary" onClick={() => { resetForm(); setShowForm(true) }}>
          <Plus className="w-4 h-4" />
          Add vendor
        </Button>
      </div>

      {/* ── Add / Edit form ── */}
      {showForm && (
        <Card className="mb-6 border-blue-200">
          <div className="flex items-center justify-between mb-4">
            <h3>{editId ? 'Edit vendor' : 'Add vendor'}</h3>
            <button onClick={resetForm} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Vendor name *</label>
              <input className="input-base" placeholder="Acme Industrial" value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Contact email *</label>
              <input className="input-base" type="email" placeholder="rfq@vendor.com" value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-600 mb-1">Categories</label>
            <div className="flex flex-wrap gap-2">
              {ALL_CATEGORIES.map((cat) => (
                <button key={cat} onClick={() => toggleCategory(cat)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    form.categories.includes(cat)
                      ? 'bg-blue-100 border-blue-300 text-blue-700 font-medium'
                      : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}>
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* ── Catalog items ── */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-600 flex items-center gap-1">
                <Package className="w-3.5 h-3.5" /> Catalog items (price list)
              </label>
              <Button variant="ghost" onClick={addItem}>
                <Plus className="w-3.5 h-3.5" /> Add item
              </Button>
            </div>
            {form.catalog_items.length === 0 && (
              <p className="text-xs text-gray-400 italic">No items yet — click "Add item" to build a price list.</p>
            )}
            {form.catalog_items.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-gray-100">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-500 font-medium">
                    <tr>
                      <th className="text-left px-3 py-2">Description *</th>
                      <th className="text-left px-3 py-2 w-28">Part no.</th>
                      <th className="text-left px-3 py-2 w-20">Unit</th>
                      <th className="text-left px-3 py-2 w-28">Unit price *</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {form.catalog_items.map((item) => (
                      <tr key={item.id}>
                        <td className="px-2 py-1">
                          <input className="input-base text-xs py-1" placeholder="e.g. 6 inch flange class 150"
                            value={item.description}
                            onChange={(e) => updateItem(item.id, 'description', e.target.value)} />
                        </td>
                        <td className="px-2 py-1">
                          <input className="input-base text-xs py-1" placeholder="PN-1234"
                            value={item.part_number ?? ''}
                            onChange={(e) => updateItem(item.id, 'part_number', e.target.value)} />
                        </td>
                        <td className="px-2 py-1">
                          <input className="input-base text-xs py-1" placeholder="ea"
                            value={item.unit ?? ''}
                            onChange={(e) => updateItem(item.id, 'unit', e.target.value)} />
                        </td>
                        <td className="px-2 py-1">
                          <input className="input-base text-xs py-1" type="number" min="0" step="0.01" placeholder="0.00"
                            value={item.unit_price === 0 ? '' : item.unit_price}
                            onChange={(e) => updateItem(item.id, 'unit_price', parseFloat(e.target.value) || 0)} />
                        </td>
                        <td className="px-2 py-1 text-center">
                          <button onClick={() => removeItem(item.id)}
                            className="text-gray-300 hover:text-red-500 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {saveError && (
            <p className="mb-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {saveError}
            </p>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={resetForm}>Cancel</Button>
            <Button
              variant="primary"
              loading={createMut.isPending || updateMut.isPending}
              disabled={!form.name.trim() || !form.email.trim()}
              onClick={() => { setSaveError(''); editId ? updateMut.mutate(form) : createMut.mutate(form) }}
            >
              {editId ? 'Save changes' : 'Add vendor'}
            </Button>
          </div>
        </Card>
      )}

      {isLoading && <div className="flex justify-center py-12"><Spinner size="lg" /></div>}

      {!isLoading && vendors.length === 0 && (
        <EmptyState title="No vendors yet" description="Add vendors to your catalog to start sending RFQs." />
      )}

      {/* ── Vendor table ── */}
      {vendors.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-sm bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs font-semibold uppercase tracking-wide border-b border-gray-100">
              <tr>
                <th className="w-6 px-3 py-3"></th>
                <th className="text-left px-4 py-3">Vendor</th>
                <th className="text-left px-4 py-3">Email</th>
                <th className="text-left px-4 py-3">Categories</th>
                <th className="text-center px-4 py-3 w-20">Rating</th>
                <th className="text-center px-4 py-3 w-20">Items</th>
                <th className="text-center px-4 py-3 w-20">Status</th>
                <th className="w-16 px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {vendors.map((v) => (
                <Fragment key={v.id}>
                  <tr className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-3 text-center">
                      <button onClick={() => setExpandedId(expandedId === v.id ? null : v.id)}
                        className="text-gray-400 hover:text-gray-600">
                        {expandedId === v.id
                          ? <ChevronDown className="w-4 h-4" />
                          : <ChevronRight className="w-4 h-4" />}
                      </button>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{v.name}</td>
                    <td className="px-4 py-3 text-gray-500">{v.email}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(v.categories ?? []).slice(0, 3).map((c) => (
                          <span key={c} className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">{c}</span>
                        ))}
                        {(v.categories ?? []).length > 3 && (
                          <span className="text-xs text-gray-400">+{v.categories.length - 3}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center text-amber-500 font-medium text-xs">★ {v.rating.toFixed(1)}</td>
                    <td className="px-4 py-3 text-center text-gray-500 text-xs">{(v.catalog_items ?? []).length}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        v.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {v.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => startEdit(v)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>

                  {expandedId === v.id && (
                    <tr>
                      <td colSpan={8} className="px-6 py-3 bg-blue-50/40">
                        <p className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">
                          <Package className="w-3.5 h-3.5" /> Catalog items — {v.name}
                        </p>
                        {(!v.catalog_items || v.catalog_items.length === 0) ? (
                          <p className="text-xs text-gray-400 italic mb-2">No catalog items. Click edit to add a price list.</p>
                        ) : (
                          <table className="w-full text-xs mb-2">
                            <thead>
                              <tr className="text-gray-400 font-medium">
                                <th className="text-left py-1 pr-6">Description</th>
                                <th className="text-left py-1 pr-6">Part no.</th>
                                <th className="text-left py-1 pr-6">Unit</th>
                                <th className="text-right py-1">Unit price</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-blue-100">
                              {v.catalog_items.map((item, idx) => (
                                <tr key={item.id ?? idx} className="text-gray-700">
                                  <td className="py-1.5 pr-6">{item.description}</td>
                                  <td className="py-1.5 pr-6 text-gray-400">{item.part_number || '—'}</td>
                                  <td className="py-1.5 pr-6 text-gray-400">{item.unit || '—'}</td>
                                  <td className="py-1.5 text-right font-medium">{formatCurrency(item.unit_price)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                        <Button variant="ghost" onClick={() => startEdit(v)}>
                          <Edit2 className="w-3.5 h-3.5" /> Edit vendor &amp; items
                        </Button>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

