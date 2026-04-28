import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, FileText, Trash2, Edit2, Search, TrendingUp, CheckCircle2, Clock, DollarSign } from 'lucide-react'
import { Button, Badge, EmptyState } from '@/components/ui'
import { formatDate } from '@/lib/utils'
import type { QuotationStatus } from './QuotationEditorPage'

interface QuotationRow {
  id: string
  quotationNo: string
  date: string
  customerName: string
  lines: { qty: string; unitPrice: string; amount: string }[]
  vatPct: number
  status: string
  invoiceId?: string
  poNumber?: string
  createdAt: string
}

function calcTotal(doc: QuotationRow): number {
  const sub = doc.lines.reduce((s, l) => {
    const q = parseFloat(l.qty), p = parseFloat(l.unitPrice)
    return s + ((!isNaN(q) && !isNaN(p)) ? q * p : (parseFloat(l.amount) || 0))
  }, 0)
  return sub + sub * (doc.vatPct / 100)
}

const STATUS_VARIANT: Record<string, 'gray' | 'blue' | 'green' | 'red' | 'amber' | 'purple'> = {
  draft:        'gray',
  shared:       'blue',
  acknowledged: 'purple',
  po_received:  'amber',
  invoiced:     'blue',
  complete:     'green',
  // legacy
  final:        'blue',
  sent:         'blue',
  approved:     'green',
  rejected:     'red',
}

const STATUS_LABEL: Record<string, string> = {
  draft:        'Draft',
  shared:       'Shared',
  acknowledged: 'Acknowledged',
  po_received:  'PO Received',
  invoiced:     'Invoiced',
  complete:     'Complete',
}

export default function QuotationsListPage() {
  const nav = useNavigate()
  const [quotations, setQuotations] = useState<QuotationRow[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    try {
      const raw = localStorage.getItem('pl_quotations')
      if (raw) {
        const parsed = JSON.parse(raw)
        const list: QuotationRow[] = Array.isArray(parsed) ? parsed : Object.values(parsed)
        setQuotations(list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
      }
    } catch { /* ok */ }
  }, [])

  function handleDelete(id: string) {
    if (!confirm('Delete this quotation?')) return
    try {
      const raw = localStorage.getItem('pl_quotations')
      if (!raw) return
      const list: QuotationRow[] = JSON.parse(raw)
      const updated = Array.isArray(list)
        ? list.filter(q => q.id !== id)
        : Object.values(list as Record<string, QuotationRow>).filter(q => q.id !== id)
      localStorage.setItem('pl_quotations', JSON.stringify(updated))
      setQuotations(prev => prev.filter(q => q.id !== id))
    } catch { /* ok */ }
  }

  const filtered = quotations.filter(q =>
    q.quotationNo?.toLowerCase().includes(search.toLowerCase()) ||
    q.customerName?.toLowerCase().includes(search.toLowerCase())
  )

  const totalValue = quotations.reduce((s, q) => s + calcTotal(q), 0)
  const poApproved = quotations.filter(q => q.status === 'po_received' || q.status === 'invoiced' || q.status === 'complete')
  const poApprovedValue = poApproved.reduce((s, q) => s + calcTotal(q), 0)
  const inProgress = quotations.filter(q => q.status === 'draft' || q.status === 'shared' || q.status === 'acknowledged' || q.status === 'final')
  const inProgressValue = inProgress.reduce((s, q) => s + calcTotal(q), 0)

  const fmt = (n: number) => n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            Quotations
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {quotations.length} quotation{quotations.length !== 1 ? 's' : ''} saved locally
          </p>
        </div>
        <Button variant="primary" onClick={() => nav('/quotations/new')}>
          <Plus className="w-4 h-4" />
          New quotation
        </Button>
      </div>

      {quotations.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
              <DollarSign className="w-4 h-4 text-blue-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Total Pipeline</p>
              <p className="text-lg font-bold text-gray-900 mt-0.5">AED {fmt(totalValue)}</p>
              <p className="text-xs text-gray-400 mt-0.5">{quotations.length} quotation{quotations.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
              <Clock className="w-4 h-4 text-amber-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">In Progress</p>
              <p className="text-lg font-bold text-gray-900 mt-0.5">AED {fmt(inProgressValue)}</p>
              <p className="text-xs text-gray-400 mt-0.5">{inProgress.length} quotation{inProgress.length !== 1 ? 's' : ''} · Draft / Shared / Acknowledged</p>
            </div>
          </div>
          <div className="bg-white border border-green-200 rounded-xl p-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">PO Received / Won</p>
              <p className="text-lg font-bold text-green-700 mt-0.5">AED {fmt(poApprovedValue)}</p>
              <p className="text-xs text-gray-400 mt-0.5">{poApproved.length} quotation{poApproved.length !== 1 ? 's' : ''} · PO Received / Invoiced / Complete</p>
            </div>
          </div>
        </div>
      )}

      {quotations.length > 0 && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input className="input-base pl-9"
            placeholder="Search by quotation no. or customer…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      )}

      {quotations.length === 0 && (
        <EmptyState
          title="No quotations yet"
          description="Create your first quotation to generate professional PDF quotes for customers."
          action={
            <Button variant="primary" onClick={() => nav('/quotations/new')}>
              <Plus className="w-4 h-4" /> Create first quotation
            </Button>
          }
        />
      )}

      {filtered.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Quotation No.</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Customer</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Date</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Amount (AED)</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Stage</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(q => (
                <tr key={q.id}
                  className="border-b border-gray-100 last:border-0 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => nav(`/quotations/${q.id}`)}>
                  <td className="px-4 py-3 font-mono font-semibold text-blue-700">{q.quotationNo}</td>
                  <td className="px-4 py-3 text-gray-800">{q.customerName || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{q.date ? formatDate(q.date) : '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">
                    {calcTotal(q).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={STATUS_VARIANT[q.status] ?? 'gray'}>
                      {STATUS_LABEL[q.status as QuotationStatus] ?? q.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end" onClick={e => e.stopPropagation()}>
                      {q.invoiceId && (
                        <button
                          onClick={() => nav(`/invoices/${q.invoiceId}`)}
                          className="text-xs text-blue-600 hover:underline px-2 py-1"
                        >
                          Invoice →
                        </button>
                      )}
                      <button onClick={() => nav(`/quotations/${q.id}`)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(q.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {quotations.length > 0 && filtered.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">
          No quotations match "<span className="font-medium">{search}</span>"
        </div>
      )}
    </div>
  )
}
