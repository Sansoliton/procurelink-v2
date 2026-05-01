import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FileText, Search, Trash2, Edit2 } from 'lucide-react'
import { Badge, EmptyState } from '@/components/ui'
import { formatDate } from '@/lib/utils'
import { cinvoicesApi } from '@/api'
import type { CustomerInvoice } from '@/types'
import type { InvoiceStatus } from './InvoiceEditorPage'

const STATUS_VARIANT: Record<string, 'amber' | 'green' | 'red'> = {
  pending: 'amber',
  paid:    'green',
  overdue: 'red',
}

export default function InvoicesListPage() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')

  const { data: invoices = [] } = useQuery({
    queryKey: ['cinvoices'],
    queryFn: cinvoicesApi.list,
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => cinvoicesApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cinvoices'] }),
  })

  function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    if (!confirm('Delete this invoice?')) return
    deleteMut.mutate(id)
  }

  const filtered = invoices.filter(i =>
    i.invoice_no?.toLowerCase().includes(search.toLowerCase()) ||
    (i.customer_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (i.quotation_no ?? '').toLowerCase().includes(search.toLowerCase())
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
            {invoices.length} invoice{invoices.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Summary tiles */}
      {invoices.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          {(['pending', 'paid', 'overdue'] as string[]).map(s => {
            const count = invoices.filter(i => i.status === s).length
            const total = invoices.filter(i => i.status === s).reduce((sum, i) => sum + (i.total_amount ?? 0), 0)
            const colors: Record<string, string> = { pending: 'text-amber-700 bg-amber-50 border-amber-200', paid: 'text-green-700 bg-green-50 border-green-200', overdue: 'text-red-700 bg-red-50 border-red-200' }
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
                  <td className="px-4 py-3 font-mono font-semibold text-blue-700">{inv.invoice_no}</td>
                  <td className="px-4 py-3 text-gray-800">{inv.customer_name || '—'}</td>
                  <td className="px-4 py-3 font-mono text-gray-600 text-xs">{(inv.doc_data as any)?.poNumber || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{inv.created_at ? formatDate(inv.created_at) : '—'}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {(inv.doc_data as any)?.dueDate
                      ? <span className={inv.status === 'overdue' ? 'text-red-600 font-medium' : ''}>{formatDate((inv.doc_data as any).dueDate)}</span>
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">
                    {(inv.total_amount ?? 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={STATUS_VARIANT[inv.status] ?? 'gray'}>{inv.status}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end" onClick={e => e.stopPropagation()}>
                      <button onClick={() => nav(`/invoices/${inv.id}`)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={(e) => handleDelete(e, inv.id)}
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
