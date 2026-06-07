import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, FileText, Trash2, Edit2, Search, CheckCircle2, Clock, DollarSign, Paperclip, Download, AlertTriangle } from 'lucide-react'
import { Button, Badge, EmptyState } from '@/components/ui'
import PDFViewerModal from '@/components/PDFViewerModal'
import { formatDate } from '@/lib/utils'
import { readData } from '@/lib/storage'
import { cquotesApi } from '@/api'
import type { CustomerQuotation } from '@/types'
import type { QuotationStatus, QuotationType, QuotationTag } from './QuotationEditorPage'

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

const TYPE_LABEL: Record<QuotationType, string> = {
  quotation: 'Quotation',
  proforma:  'Proforma',
  service:   'Service Q.',
  dummy:     'Dummy',
}

const TAG_STYLE: Record<QuotationTag, string> = {
  active:   '',
  dummy_po: 'bg-amber-100 text-amber-700',
  rejected: 'bg-red-100 text-red-700',
}

const TAG_LABEL: Record<QuotationTag, string> = {
  active:   '',
  dummy_po: 'Dummy PO',
  rejected: 'Rejected',
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

function relativeAge(dateStr: string): string {
  const d = new Date(dateStr)
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7)  return `${days} days ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

function validityChip(createdAt: string, validityDays: number | undefined): { label: string; cls: string } | null {
  if (!validityDays) return null
  const daysLeft = Math.ceil((new Date(createdAt).getTime() + validityDays * 86_400_000 - Date.now()) / 86_400_000)
  if (daysLeft < 0)  return { label: `Expired ${Math.abs(daysLeft)}d ago`, cls: 'bg-red-100 text-red-600' }
  if (daysLeft === 0) return { label: 'Expires today',                       cls: 'bg-amber-100 text-amber-700' }
  if (daysLeft <= 7)  return { label: `${daysLeft}d left`,                   cls: 'bg-amber-100 text-amber-700' }
  return              { label: `Valid · ${daysLeft}d`,                        cls: 'bg-green-100 text-green-700' }
}

function loadAlertSettings() {
  try {
    const p = JSON.parse(readData('pl_company_profile') ?? '{}')
    return {
      alertDaysBeforeExpiry: Number(p.alertDaysBeforeExpiry ?? 7),
      alertStaleDays:        Number(p.alertStaleDays ?? 14),
    }
  } catch { return { alertDaysBeforeExpiry: 7, alertStaleDays: 14 } }
}

type AlertLevel = 'overdue' | 'expiring' | 'stale' | null

function getAlertLevel(q: CustomerQuotation, settings: ReturnType<typeof loadAlertSettings>): AlertLevel {
  const dd = q.doc_data as any
  const terminal = ['complete', 'rejected'].includes(q.status)
  if (terminal) return null

  // Expiry-based alert
  const docDate    = dd?.date ?? q.created_at
  const validDays  = dd?.validityDays as number | undefined
  if (validDays && docDate) {
    const daysLeft = Math.ceil((new Date(docDate).getTime() + validDays * 86_400_000 - Date.now()) / 86_400_000)
    if (daysLeft < 0)                             return 'overdue'
    if (daysLeft <= settings.alertDaysBeforeExpiry) return 'expiring'
  }

  // Stale-stage alert (not progressed for N days)
  const createdMs  = q.created_at ? new Date(q.created_at).getTime() : 0
  const daysSince  = Math.floor((Date.now() - createdMs) / 86_400_000)
  const activeStages = ['draft', 'shared', 'acknowledged']
  if (activeStages.includes(q.status) && daysSince >= settings.alertStaleDays) return 'stale'

  return null
}

const ALERT_ROW: Record<NonNullable<AlertLevel>, string> = {
  overdue:  'bg-red-50 border-l-4 border-l-red-400',
  expiring: 'bg-amber-50 border-l-4 border-l-amber-400',
  stale:    'bg-yellow-50 border-l-4 border-l-yellow-300',
}

const ALERT_CHIP: Record<NonNullable<AlertLevel>, { label: string; cls: string }> = {
  overdue:  { label: 'Overdue',      cls: 'bg-red-100 text-red-700' },
  expiring: { label: 'Expiring soon', cls: 'bg-amber-100 text-amber-700' },
  stale:    { label: 'No progress',  cls: 'bg-yellow-100 text-yellow-700' },
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
  const [filterTab, setFilterTab] = useState<'all' | 'attention'>('all')
  const [viewer, setViewer] = useState<{ title: string; url: string } | null>(null)
  const alertSettings = useMemo(() => loadAlertSettings(), [])

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

  const alertMap = useMemo(() =>
    Object.fromEntries(quotations.map(q => [q.id, getAlertLevel(q, alertSettings)])),
    [quotations, alertSettings],
  )
  const needsAttention = quotations.filter(q => alertMap[q.id])

  const filtered = quotations
    .filter(q => filterTab === 'attention' ? !!alertMap[q.id] : true)
    .filter(q =>
      q.quotation_no?.toLowerCase().includes(search.toLowerCase()) ||
      (q.customer_name ?? '').toLowerCase().includes(search.toLowerCase())
    )

  const totalValue = quotations.reduce((s, q) => s + (q.total_amount ?? 0), 0)
  const poApproved = quotations.filter(q => ['po_received', 'invoiced', 'complete'].includes(q.status))
  const poApprovedValue = poApproved.reduce((s, q) => s + ((q.doc_data as any)?.poAgreedAmount ?? q.total_amount ?? 0), 0)
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
              <p className="text-xs text-gray-400 mt-0.5">{poApproved.length} quotation{poApproved.length !== 1 ? 's' : ''} · Agreed value</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Alert banner ── */}
      {needsAttention.length > 0 && (
        <div className="flex items-center gap-3 mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800">
              {needsAttention.length} quotation{needsAttention.length !== 1 ? 's' : ''} need attention
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              {needsAttention.filter(q => alertMap[q.id] === 'overdue').length > 0 &&
                `${needsAttention.filter(q => alertMap[q.id] === 'overdue').length} overdue · `}
              {needsAttention.filter(q => alertMap[q.id] === 'expiring').length > 0 &&
                `${needsAttention.filter(q => alertMap[q.id] === 'expiring').length} expiring soon · `}
              {needsAttention.filter(q => alertMap[q.id] === 'stale').length > 0 &&
                `${needsAttention.filter(q => alertMap[q.id] === 'stale').length} stale`}
            </p>
          </div>
          <button
            onClick={() => setFilterTab('attention')}
            className="text-xs font-semibold text-amber-700 hover:text-amber-900 underline flex-shrink-0"
          >
            View all
          </button>
        </div>
      )}

      {quotations.length > 0 && (
        <div className="flex items-center gap-3 mb-4">
          {/* Filter tabs */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setFilterTab('all')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${filterTab === 'all' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
            >
              All ({quotations.length})
            </button>
            <button
              onClick={() => setFilterTab('attention')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1 ${filterTab === 'attention' ? 'bg-amber-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
            >
              <AlertTriangle className="w-3 h-3" />
              Needs Attention {needsAttention.length > 0 && `(${needsAttention.length})`}
            </button>
          </div>
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input className="input-base pl-9"
              placeholder="Search by quotation no. or customer…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
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
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Customer</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Date</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Quoted (AED)</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Agreed (AED)</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Stage</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">PO</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(q => {
                const alert = alertMap[q.id]
                return (
                <tr key={q.id}
                  className={`border-b border-gray-100 last:border-0 cursor-pointer transition-colors ${alert ? ALERT_ROW[alert] : 'hover:bg-gray-50'}`}
                  onClick={() => nav(`/quotations/${q.id}`)}>
                  <td className="px-4 py-3 font-mono font-semibold text-blue-700">
                    <div className="flex items-center gap-1.5">
                      {alert && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
                      {q.quotation_no}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      {(() => {
                        const qType = (q.doc_data as any)?.quotationType as QuotationType | undefined
                        const tag   = (q.doc_data as any)?.quotationTag  as QuotationTag  | undefined
                        const showType = qType && qType !== 'quotation'
                        const showTag  = tag && tag !== 'active'
                        if (!showType && !showTag) return <span className="text-gray-300">—</span>
                        return (
                          <>
                            {showType && (
                              <span className="text-xs text-gray-600 font-medium">{TYPE_LABEL[qType!]}</span>
                            )}
                            {showTag && (
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full self-start ${TAG_STYLE[tag!]}`}>
                                {TAG_LABEL[tag!]}
                              </span>
                            )}
                          </>
                        )
                      })()}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-800">{q.customer_name || '—'}</td>
                  <td className="px-4 py-3">
                    {q.created_at ? (
                      <div className="flex flex-col gap-1">
                        <span className="text-gray-500 text-xs">{formatDate(q.created_at)}</span>
                        <span className="text-[10px] text-gray-400">{relativeAge(q.created_at)}</span>
                        {(() => {
                          const chip = validityChip(
                            (q.doc_data as any)?.date ?? q.created_at,
                            (q.doc_data as any)?.validityDays,
                          )
                          if (!chip) return null
                          return (
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full self-start ${chip.cls}`}>
                              {chip.label}
                            </span>
                          )
                        })()}
                      </div>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">
                    {(q.total_amount ?? 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {(() => {
                      const agreed = (q.doc_data as any)?.poAgreedAmount as number | undefined
                      if (!agreed) return <span className="text-gray-300">—</span>
                      const diff = agreed - (q.total_amount ?? 0)
                      const pct  = q.total_amount ? (diff / q.total_amount) * 100 : 0
                      return (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="font-semibold text-green-700">
                            {agreed.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          {diff !== 0 && (
                            <span className={`text-[10px] font-medium ${diff < 0 ? 'text-red-500' : 'text-green-500'}`}>
                              {diff < 0 ? '▼' : '▲'} {Math.abs(pct).toFixed(1)}%
                            </span>
                          )}
                        </div>
                      )
                    })()}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <Badge variant={STATUS_VARIANT[q.status] ?? 'gray'}>
                        {STATUS_LABEL[q.status as QuotationStatus] ?? q.status}
                      </Badge>
                      {alert && (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${ALERT_CHIP[alert].cls}`}>
                          {ALERT_CHIP[alert].label}
                        </span>
                      )}
                    </div>
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
                        <button
                          onClick={() => setViewer({ title: `Quotation ${q.quotation_no}`, url: q.pdf_url! })}
                          title="View PDF"
                          className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors">
                          <Download className="w-3.5 h-3.5" />
                        </button>
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
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {quotations.length > 0 && filtered.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">
          No quotations match "<span className="font-medium">{search}</span>"
        </div>
      )}

      {viewer && (
        <PDFViewerModal
          title={viewer.title}
          url={viewer.url}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  )
}
