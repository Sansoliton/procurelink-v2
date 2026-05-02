import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, FileText, Trash2, Edit2, Search, TrendingUp, CheckCircle2, Clock, DollarSign, Paperclip, Download } from 'lucide-react'
import { Button, Badge, EmptyState } from '@/components/ui'
import { formatDate } from '@/lib/utils'
import { cquotesApi } from '@/api'
import type { CustomerQuotation } from '@/types'
import type { QuotationStatus } from './QuotationEditorPage'

function openPoAttachment(dataUrl: string) {
  try {
    if (dataUrl.startsWith('data:')) {
      const [header, b64] = dataUrl.split(',')
      const mime = header.match(/:(.*?);/)?.[1] ?? 'application/pdf'
      const binary = atob(b64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const blob = new Blob([bytes], { type: mime })
      window.open(URL.createObjectURL(blob), '_blank')
    } else {
      window.open(dataUrl, '_blank')
    }
  } catch {
    alert('Unable to open PO attachment.')
  }
}

const STATUS_VARIANT: Record<string, 'gray' | 'blue' | 'green' | 'red' | 'amber' | 'purple'> = {
  draft:        'gray',
  shared:       'blue',
  acknowledged: 'purple',
  po_received:  'amber',
  invoiced:     'blue',
  complete:     'green',
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
  const qc = useQueryClient()
  const [search, setSearch] = useState('')

  const { data: quotations = [] } = useQuery({
    queryKey: ['cquotes'],
    queryFn: cquotesApi.list,
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => cquotesApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cquotes'] }),
  })

  function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    if (!confirm('Delete this quotation?')) return
    deleteMut.mutate(id)
  }

  const filtered = quotations.filter(q =>
    q.quotation_no?.toLowerCase().includes(search.toLowerCase()) ||
    (q.customer_name ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const totalValue = quotations.reduce((s, q) => s + (q.total_amount ?? 0), 0)
  const poApproved = quotations.filter(q => ['po_received', 'invoiced', 'complete'].includes(q.status))
  const poApprovedValue = poApproved.reduce((s, q) => s + (q.total_amount ?? 0), 0)
  const inProgress = quotations.filter(q => ['draft', 'shared', 'acknowledged', 'final'].includes(q.status))
  const inProgressValue = inProgress.reduce((s, q) => s + (q.total_amount ?? 0), 0)

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
            {quotations.length} quotation{quotations.length !== 1 ? 's' : ''}
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
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">PO</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(q => (
                <tr key={q.id}
                  className="border-b border-gray-100 last:border-0 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => nav(`/quotations/${q.id}`)}>
                  <td className="px-4 py-3 font-mono font-semibold text-blue-700">{q.quotation_no}</td>
                  <td className="px-4 py-3 text-gray-800">{q.customer_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{q.created_at ? formatDate(q.created_at) : '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">
                    {(q.total_amount ?? 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={STATUS_VARIANT[q.status] ?? 'gray'}>
                      {STATUS_LABEL[q.status as QuotationStatus] ?? q.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                    {(q.doc_data as any)?.poNumber ? (
                      (q.doc_data as any)?.poAttachment ? (
                        <button
                          onClick={() => openPoAttachment((q.doc_data as any).poAttachment)}
                          title="Open PO attachment"
                          className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-amber-700
                            hover:text-amber-900 underline underline-offset-2 hover:no-underline
                            bg-amber-50 hover:bg-amber-100 px-2 py-0.5 rounded transition-colors"
                        >
                          <Paperclip className="w-3 h-3 flex-shrink-0" />
                          {(q.doc_data as any).poNumber}
                        </button>
                      ) : (
                        <span className="font-mono text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                          {(q.doc_data as any).poNumber}
                        </span>
                      )
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end" onClick={e => e.stopPropagation()}>
                      {q.pdf_url && (
                        <a href={q.pdf_url} target="_blank" rel="noreferrer"
                          title="Download PDF"
                          className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors">
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button onClick={() => nav(`/quotations/${q.id}`)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={(e) => handleDelete(e, q.id)}
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
