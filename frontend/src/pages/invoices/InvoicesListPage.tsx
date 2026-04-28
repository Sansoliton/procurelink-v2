import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Search, Trash2, Edit2 } from 'lucide-react'
import { Badge, EmptyState } from '@/components/ui'
import { formatDate } from '@/lib/utils'
import type { InvoiceStatus } from './InvoiceEditorPage'

interface InvoiceRow {
  id: string
  invoiceNo: string
  quotationNo: string
  poNumber: string
  date: string
  dueDate: string
  customerName: string
  lines: { qty: string; unitPrice: string; amount: string }[]
  vatPct: number
  invoiceStatus: InvoiceStatus
  createdAt: string
}

function calcTotal(doc: InvoiceRow): number {
  const sub = doc.lines.reduce((s, l) => {
    const q = parseFloat(l.qty), p = parseFloat(l.unitPrice)
    return s + ((!isNaN(q) && !isNaN(p)) ? q * p : (parseFloat(l.amount) || 0))
  }, 0)
  return sub + sub * (doc.vatPct / 100)
}

const STATUS_VARIANT: Record<InvoiceStatus, 'amber' | 'green' | 'red'> = {
  pending: 'amber',
  paid:    'green',
  overdue: 'red',
}

export default function InvoicesListPage() {
  const nav = useNavigate()
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    try {
      const raw = localStorage.getItem('pl_invoices')
      if (raw) {
        const parsed = JSON.parse(raw)
        const list: InvoiceRow[] = Array.isArray(parsed) ? parsed : Object.values(parsed)
        setInvoices(list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
      }
    } catch { /* ok */ }
  }, [])

  function handleDelete(id: string) {
    if (!confirm('Delete this invoice?')) return
    try {
      const raw = localStorage.getItem('pl_invoices')
      if (!raw) return
      const list: InvoiceRow[] = JSON.parse(raw)
      const updated = list.filter(i => i.id !== id)
      localStorage.setItem('pl_invoices', JSON.stringify(updated))
      setInvoices(prev => prev.filter(i => i.id !== id))
    } catch { /* ok */ }
  }

  const filtered = invoices.filter(i =>
    i.invoiceNo?.toLowerCase().includes(search.toLowerCase()) ||
    i.customerName?.toLowerCase().includes(search.toLowerCase()) ||
    i.poNumber?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            Invoices
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {invoices.length} invoice{invoices.length !== 1 ? 's' : ''} saved locally
          </p>
        </div>
      </div>

      {/* Summary tiles */}
      {invoices.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          {(['pending', 'paid', 'overdue'] as InvoiceStatus[]).map(s => {
            const count = invoices.filter(i => i.invoiceStatus === s).length
            const total = invoices.filter(i => i.invoiceStatus === s).reduce((sum, i) => sum + calcTotal(i), 0)
            const colors = { pending: 'text-amber-700 bg-amber-50 border-amber-200', paid: 'text-green-700 bg-green-50 border-green-200', overdue: 'text-red-700 bg-red-50 border-red-200' }
            return (
              <div key={s} className={`border rounded-xl p-4 ${colors[s]}`}>
                <p className="text-xs font-semibold uppercase tracking-wide capitalize mb-1">{s}</p>
                <p className="text-2xl font-bold">{count}</p>
                <p className="text-xs mt-0.5 opacity-70">
                  AED {total.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            )
          })}
        </div>
      )}

      {invoices.length > 0 && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input className="input-base pl-9"
            placeholder="Search by invoice no., customer or PO…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      )}

      {invoices.length === 0 && (
        <EmptyState
          title="No invoices yet"
          description="Invoices are generated from quotations once a PO is received."
        />
      )}

      {filtered.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                {['Invoice No.', 'Customer', 'PO No.', 'Date', 'Due Date', 'Amount (AED)', 'Status', ''].map(h => (
                  <th key={h} className={`px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide ${h === 'Amount (AED)' ? 'text-right' : h === 'Status' ? 'text-center' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(inv => (
                <tr key={inv.id}
                  className="border-b border-gray-100 last:border-0 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => nav(`/invoices/${inv.id}`)}>
                  <td className="px-4 py-3 font-mono font-semibold text-blue-700">{inv.invoiceNo}</td>
                  <td className="px-4 py-3 text-gray-800">{inv.customerName || '—'}</td>
                  <td className="px-4 py-3 font-mono text-gray-600 text-xs">{inv.poNumber || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{inv.date ? formatDate(inv.date) : '—'}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {inv.dueDate
                      ? <span className={inv.invoiceStatus === 'overdue' ? 'text-red-600 font-medium' : ''}>{formatDate(inv.dueDate)}</span>
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">
                    {calcTotal(inv).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={STATUS_VARIANT[inv.invoiceStatus] ?? 'gray'}>{inv.invoiceStatus}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end" onClick={e => e.stopPropagation()}>
                      <button onClick={() => nav(`/invoices/${inv.id}`)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(inv.id)}
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

      {invoices.length > 0 && filtered.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">
          No invoices match "<span className="font-medium">{search}</span>"
        </div>
      )}
    </div>
  )
}
