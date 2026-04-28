import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Plus, Trash2, Upload, CheckCircle2, ArrowRight, FolderOpen } from 'lucide-react'
import { requirementsApi, rfqsApi, vendorsApi } from '@/api'
import { useProject } from '@/context/ProjectContext'
import { Card, CardTitle, Button, Badge, StepBar } from '@/components/ui'
import type { LineItem } from '@/types'

type Step = 'form' | 'items' | 'vendors' | 'done'
type EditableItem = Omit<LineItem, 'id'> & { id?: string; _key: string }

const BLANK_FORM = { title: '', rawText: '', deliveryDate: '' }

function resetItems(): EditableItem[] { return [] }

export default function SubmitPage() {
  const nav = useNavigate()
  const { activeProject } = useProject()

  const [step, setStep] = useState<Step>('form')
  const [form, setForm] = useState(BLANK_FORM)
  const [reqId, setReqId] = useState<string | null>(null)
  const [rfqCount, setRfqCount] = useState(0)
  const [items, setItems] = useState<EditableItem[]>([])
  const [vendors, setVendors] = useState<{ id: string; name: string; categories: string[] }[]>([])
  const [selectedVendors, setSelectedVendors] = useState<string[]>([])

  // ── mutations ──────────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: () =>
      requirementsApi.create(activeProject!.id, {
        title: form.title,
        raw_text: form.rawText,
        delivery_date: form.deliveryDate || undefined,
      }),
    onSuccess: (req) => {
      setReqId(req.id)
      setItems(req.line_items.map((i) => ({ ...i, _key: i.id })))
      setStep('items')
    },
  })

  const saveMut = useMutation({
    mutationFn: () => requirementsApi.updateItems(activeProject!.id, reqId!, items),
    onSuccess: async () => {
      const vs = await vendorsApi.list()
      setVendors(vs)
      setStep('vendors')
    },
  })

  const rfqMut = useMutation({
    mutationFn: () => rfqsApi.send(reqId!, selectedVendors),
    onSuccess: (sent) => {
      setRfqCount(Array.isArray(sent) ? sent.length : selectedVendors.length)
      setStep('done')
    },
  })

  // ── item helpers ───────────────────────────────────────────────
  const addItem = () =>
    setItems((prev) => [
      ...prev,
      { _key: Math.random().toString(36).slice(2), description: '', quantity: undefined, unit: '', category: 'general', sort_order: prev.length },
    ])

  const removeItem = (key: string) => setItems((prev) => prev.filter((i) => i._key !== key))

  const updateItem = (key: string, field: string, value: unknown) =>
    setItems((prev) => prev.map((i) => (i._key === key ? { ...i, [field]: value } : i)))

  // ── add another: reset everything except the project ──────────
  function addAnother() {
    setForm(BLANK_FORM)
    setReqId(null)
    setRfqCount(0)
    setItems(resetItems())
    setSelectedVendors([])
    setStep('form')
  }

  // ── no project selected ────────────────────────────────────────
  if (!activeProject) {
    return (
      <div className="text-center py-12 text-gray-400">
        Select a project first from the navigation bar.
      </div>
    )
  }

  // ── project banner ─────────────────────────────────────────────
  const projectBanner = (
    <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mb-4">
      <FolderOpen className="w-3.5 h-3.5 flex-shrink-0" />
      Adding to project: <span className="font-semibold">{activeProject.name}</span>
    </div>
  )

  return (
    <div>
      <StepBar current={1} />

      {/* ── Step: form ─────────────────────────────────────────── */}
      {step === 'form' && (
        <Card>
          <CardTitle>
            New requirement <Badge variant="blue">Auto-parsed</Badge>
          </CardTitle>

          {projectBanner}

          {/* Upload zone */}
          <div
            className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center mb-4
              hover:border-blue-300 hover:bg-blue-50 cursor-pointer transition-colors"
            onClick={() => alert('File picker — wire up S3 upload in production')}
          >
            <Upload className="w-6 h-6 text-gray-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-600">Drop spec sheet or click to browse</p>
            <p className="text-xs text-gray-400 mt-0.5">PDF · Excel · Word · CSV</p>
          </div>

          <div className="text-center text-xs text-gray-400 my-3">— or type your requirement —</div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Requirement title <span className="text-red-400">*</span>
              </label>
              <input
                className="input-base"
                placeholder="e.g. Hydraulic overhaul — flanges & fittings"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Required by</label>
              <input
                type="date"
                className="input-base"
                value={form.deliveryDate}
                onChange={(e) => setForm((f) => ({ ...f, deliveryDate: e.target.value }))}
              />
            </div>
          </div>

          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Requirement details <span className="text-red-400">*</span>
            </label>
            <textarea
              rows={4}
              className="input-base resize-y"
              placeholder={`e.g. 50x stainless steel flanges DN50 PN16\n200x hex bolts M12×60 grade 8.8\n10m carbon steel pipe 2" Sch 40`}
              value={form.rawText}
              onChange={(e) => setForm((f) => ({ ...f, rawText: e.target.value }))}
            />
          </div>

          <div className="flex items-center gap-2 bg-blue-50 border border-dashed border-blue-200 rounded-lg px-3 py-2 mb-4">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse flex-shrink-0" />
            <p className="text-xs text-blue-700">
              Text will be automatically parsed into line items — review before submitting
            </p>
          </div>

          <div className="flex justify-end">
            <Button
              variant="primary"
              loading={createMut.isPending}
              disabled={!form.title.trim() || !form.rawText.trim()}
              onClick={() => createMut.mutate()}
            >
              {createMut.isPending ? 'Parsing…' : 'Parse & continue →'}
            </Button>
          </div>
        </Card>
      )}

      {/* ── Step: items ────────────────────────────────────────── */}
      {step === 'items' && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <CardTitle>
              Parsed line items <Badge variant="green">{items.length} items</Badge>
            </CardTitle>
            <Button variant="ghost" onClick={addItem}>
              <Plus className="w-4 h-4" />
              Add row
            </Button>
          </div>

          {projectBanner}

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left pb-2 font-semibold text-gray-400 uppercase tracking-wide pr-2" style={{ width: '40%' }}>Description</th>
                  <th className="text-left pb-2 font-semibold text-gray-400 uppercase tracking-wide pr-2">Part no.</th>
                  <th className="text-right pb-2 font-semibold text-gray-400 uppercase tracking-wide pr-2">Qty</th>
                  <th className="text-left pb-2 font-semibold text-gray-400 uppercase tracking-wide pr-2">Unit</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item._key} className="border-b border-gray-100 last:border-0">
                    <td className="py-2 pr-2">
                      <input
                        className="input-base text-xs py-1.5"
                        value={item.description}
                        onChange={(e) => updateItem(item._key, 'description', e.target.value)}
                        placeholder="Description"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        className="input-base text-xs py-1.5 font-mono"
                        value={item.part_number ?? ''}
                        onChange={(e) => updateItem(item._key, 'part_number', e.target.value)}
                        placeholder="Optional"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        type="number"
                        className="input-base text-xs py-1.5 text-right w-20"
                        value={item.quantity ?? ''}
                        onChange={(e) => updateItem(item._key, 'quantity', parseFloat(e.target.value) || null)}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <select
                        className="input-base text-xs py-1.5 w-24"
                        value={item.unit ?? ''}
                        onChange={(e) => updateItem(item._key, 'unit', e.target.value)}
                      >
                        <option value="">—</option>
                        {['ea', 'm', 'mm', 'kg', 'l', 'set', 'pair', 'roll'].map((u) => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2">
                      <button
                        onClick={() => removeItem(item._key)}
                        className="p-1 text-gray-300 hover:text-red-500 rounded transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between mt-4">
            <Button variant="ghost" onClick={() => setStep('form')}>← Back</Button>
            <Button
              variant="primary"
              loading={saveMut.isPending}
              disabled={items.filter((i) => i.description.trim()).length === 0}
              onClick={() => saveMut.mutate()}
            >
              Select vendors →
            </Button>
          </div>
        </Card>
      )}

      {/* ── Step: vendors ──────────────────────────────────────── */}
      {step === 'vendors' && (
        <Card>
          <CardTitle>Select vendors to receive RFQs</CardTitle>

          {projectBanner}

          {vendors.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p className="text-sm">No vendors in your catalog yet.</p>
              <p className="text-xs mt-1">Add vendors in the Vendors section first.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 mb-4">
              {vendors.map((v) => (
                <label
                  key={v.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedVendors.includes(v.id)
                      ? 'border-blue-400 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="w-4 h-4 text-blue-600 rounded"
                    checked={selectedVendors.includes(v.id)}
                    onChange={(e) =>
                      setSelectedVendors((prev) =>
                        e.target.checked ? [...prev, v.id] : prev.filter((id) => id !== v.id),
                      )
                    }
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800">{v.name}</p>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {v.categories.map((c) => (
                        <span key={c} className="badge-gray text-xs">{c}</span>
                      ))}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep('items')}>← Back</Button>
            <Button
              variant="primary"
              loading={rfqMut.isPending}
              disabled={selectedVendors.length === 0}
              onClick={() => rfqMut.mutate()}
            >
              Send RFQs to {selectedVendors.length} vendor{selectedVendors.length !== 1 ? 's' : ''} →
            </Button>
          </div>
        </Card>
      )}

      {/* ── Step: done ─────────────────────────────────────────── */}
      {step === 'done' && (
        <Card>
          {/* Success banner */}
          <div className="flex flex-col items-center text-center py-6 mb-6 border-b border-gray-100">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-3">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
            </div>
            <h2 className="text-base font-semibold text-gray-900 mb-1">Requirement submitted!</h2>
            <p className="text-sm text-gray-500">
              <span className="font-medium text-gray-700">"{form.title}"</span> was added to{' '}
              <span className="font-medium text-gray-700">{activeProject.name}</span>
            </p>
            {rfqCount > 0 && (
              <p className="text-xs text-gray-400 mt-1">
                RFQs sent to {rfqCount} vendor{rfqCount !== 1 ? 's' : ''}
              </p>
            )}
          </div>

          {/* Action choices */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={addAnother}
              className="flex flex-col items-center gap-2 p-5 rounded-xl border-2 border-dashed border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-colors group"
            >
              <div className="w-9 h-9 bg-gray-100 group-hover:bg-blue-100 rounded-lg flex items-center justify-center transition-colors">
                <Plus className="w-5 h-5 text-gray-500 group-hover:text-blue-600 transition-colors" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800 group-hover:text-blue-700 transition-colors">
                  Add another requirement
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Same project · {activeProject.name}
                </p>
              </div>
            </button>

            <button
              onClick={() => nav(`/requirement/${reqId}/quote`)}
              className="flex flex-col items-center gap-2 p-5 rounded-xl border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 hover:border-blue-400 transition-colors group"
            >
              <div className="w-9 h-9 bg-blue-100 group-hover:bg-blue-200 rounded-lg flex items-center justify-center transition-colors">
                <ArrowRight className="w-5 h-5 text-blue-600 transition-colors" />
              </div>
              <div>
                <p className="text-sm font-semibold text-blue-700">View quote progress</p>
                <p className="text-xs text-blue-400 mt-0.5">Track vendor responses</p>
              </div>
            </button>
          </div>

          {/* Back to dashboard link */}
          <div className="text-center mt-4">
            <button
              onClick={() => nav('/')}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              ← Back to dashboard
            </button>
          </div>
        </Card>
      )}
    </div>
  )
}
