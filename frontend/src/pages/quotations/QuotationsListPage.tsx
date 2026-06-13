import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, FileText, Trash2, Eye, Search, CheckCircle2, Clock,
  DollarSign, Paperclip, AlertTriangle, LayoutGrid, List,
  FileCheck, Receipt, Truck, ChevronRight, Download, Edit2,
} from 'lucide-react'
import { Button, Badge, EmptyState } from '@/components/ui'
import PDFViewerModal from '@/components/PDFViewerModal'
import { formatDate } from '@/lib/utils'
import { readData } from '@/lib/storage'
import { cquotesApi } from '@/api'
import type { CustomerQuotation } from '@/types'
import type { QuotationStatus, QuotationType, QuotationTag } from './QuotationEditorPage'

function openDataUrl(dataUrl: string) {
  try {
    if (dataUrl.startsWith('data:')) {
      const [header, b64] = dataUrl.split(',')
      const mime = header.match(/:(.*?);/)?.[1] ?? 'application/pdf'
      const binary = atob(b64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      window.open(URL.createObjectURL(new Blob([bytes], { type: mime })), '_blank')
    } else {
      window.open(dataUrl, '_blank')
    }
  } catch { /* ignore */ }
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
const TAG_LABEL: Record<QuotationTag, string> = { active: '', dummy_po: 'Dummy PO', rejected: 'Rejected' }

const STATUS_VARIANT: Record<string, 'gray' | 'blue' | 'green' | 'red' | 'amber' | 'purple'> = {
  draft: 'gray', shared: 'blue', acknowledged: 'purple',
  po_received: 'amber', invoiced: 'blue', complete: 'green',
}
const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', shared: 'Shared', acknowledged: 'Acknowledged',
  po_received: 'PO Received', invoiced: 'Invoiced', complete: 'Complete',
}

const WORKFLOW_STEPS: { key: QuotationStatus; label: string }[] = [
  { key: 'draft',       label: 'Draft' },
  { key: 'shared',      label: 'Shared' },
  { key: 'po_received', label: 'PO Received' },
  { key: 'invoiced',    label: 'Invoiced' },
  { key: 'complete',    label: 'Complete' },
]

function stepIndex(status: string): number {
  const idx = WORKFLOW_STEPS.findIndex(s => s.key === status)
  return idx < 0 ? 0 : idx
}

function relativeAge(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

function loadAlertSettings() {
  try {
    const p = JSON.parse(readData('pl_company_profile') ?? '{}')
    return { alertDaysBeforeExpiry: Number(p.alertDaysBeforeExpiry ?? 7), alertStaleDays: Number(p.alertStaleDays ?? 14) }
  } catch { return { alertDaysBeforeExpiry: 7, alertStaleDays: 14 } }
}

type AlertLevel = 'overdue' | 'expiring' | 'stale' | null

function getAlertLevel(q: CustomerQuotation, s: ReturnType<typeof loadAlertSettings>): AlertLevel {
  if (['complete', 'rejected'].includes(q.status)) return null
  const dd = q.doc_data as any
  const docDate = dd?.date ?? q.created_at
  const validDays = dd?.validityDays as number | undefined
  if (validDays && docDate) {
    const daysLeft = Math.ceil((new Date(docDate).getTime() + validDays * 86_400_000 - Date.now()) / 86_400_000)
    if (daysLeft < 0) return 'overdue'
    if (daysLeft <= s.alertDaysBeforeExpiry) return 'expiring'
  }
  const daysSince = Math.floor((Date.now() - new Date(q.created_at).getTime()) / 86_400_000)
  if (['draft', 'shared', 'acknowledged'].includes(q.status) && daysSince >= s.alertStaleDays) return 'stale'
  return null
}

const ALERT_CHIP: Record<NonNullable<AlertLevel>, { label: string; cls: string }> = {
  overdue:  { label: 'Overdue',       cls: 'bg-red-100 text-red-700' },
  expiring: { label: 'Expiring soon', cls: 'bg-amber-100 text-amber-700' },
  stale:    { label: 'No progress',   cls: 'bg-yellow-100 text-yellow-700' },
}

// ── Mini workflow progress bar ─────────────────────────────────────
function MiniProgress({ status }: { status: string }) {
  const cur = stepIndex(status)
  return (
    <div className="flex items-center mt-2 mb-1">
      {WORKFLOW_STEPS.map((step, i) => {
        const done = i < cur
        const active = i === cur
        const last = i === WORKFLOW_STEPS.length - 1
        return (
          <div key={step.key} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
              <div className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${
                done ? 'bg-green-500 border-green-500' :
                active ? 'bg-blue-600 border-blue-600' :
                'bg-white border-gray-300'
              }`} />
              <span className={`text-[8px] font-medium whitespace-nowrap ${
                done ? 'text-green-600' : active ? 'text-blue-600' : 'text-gray-400'
              }`}>{step.label}</span>
            </div>
            {!last && (
              <div className={`h-0.5 flex-1 mx-0.5 mb-3 ${done ? 'bg-green-400' : 'bg-gray-200'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Doc badge pills ────────────────────────────────────────────────
function DocBadge({ icon: Icon, label, onClick, color }: {
  icon: React.ElementType; label: string; onClick?: () => void; color: string
}) {
  const cls = `inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors ${color}`
  if (onClick) return <button onClick={onClick} className={cls + ' hover:opacity-80'}><Icon className="w-2.5 h-2.5" />{label}</button>
  return <span className={cls}><Icon className="w-2.5 h-2.5" />{label}</span>
}

// ── Quotation Gallery Card ─────────────────────────────────────────
function QuotationCard({
  q, alert, onView, onEdit, onDelete, onViewPO, onViewInvoice,
}: {
  q: CustomerQuotation
  alert: AlertLevel
  onView: () => void
  onEdit: () => void
  onDelete: (e: React.MouseEvent) => void
  onViewPO: () => void
  onViewInvoice: () => void
}) {
  const dd = q.doc_data as any
  const hasPOFile = !!dd?.poAttachment
  const hasInvoiceFile = !!dd?.invoiceAttachment
  const invoiceNo = dd?.invoiceNo as string | undefined
  const poNumber = dd?.poNumber as string | undefined
  const qType = dd?.quotationType as QuotationType | undefined
  const tag = dd?.quotationTag as QuotationTag | undefined

  const alertBorder = alert === 'overdue' ? 'border-l-4 border-l-red-400' :
    alert === 'expiring' ? 'border-l-4 border-l-amber-400' :
    alert === 'stale' ? 'border-l-4 border-l-yellow-400' : ''

  return (
    <div
      className={`bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-md hover:border-blue-200 transition-all cursor-pointer group ${alertBorder}`}
      onClick={onView}
    >
      {/* Card header */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-mono font-bold text-blue-700 text-sm">{q.quotation_no}</span>
              {qType && qType !== 'quotation' && (
                <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full">{TYPE_LABEL[qType]}</span>
              )}
              {tag && tag !== 'active' && (
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${TAG_STYLE[tag]}`}>{TAG_LABEL[tag]}</span>
              )}
              {alert && (
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 ${ALERT_CHIP[alert].cls}`}>
                  <AlertTriangle className="w-2.5 h-2.5" />{ALERT_CHIP[alert].label}
                </span>
              )}
            </div>
            <p className="text-sm font-semibold text-gray-800 mt-0.5 truncate">{q.customer_name || '—'}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{q.created_at ? relativeAge(q.created_at) : '—'}</p>
          </div>
          <Badge variant={STATUS_VARIANT[q.status] ?? 'gray'} className="flex-shrink-0 text-[10px]">
            {STATUS_LABEL[q.status] ?? q.status}
          </Badge>
        </div>

        {/* Mini progress */}
        <MiniProgress status={q.status} />
      </div>

      {/* Divider */}
      <div className="border-t border-gray-100 mx-4" />

      {/* Amounts + doc badges */}
      <div className="px-4 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[10px] text-gray-400 font-medium">Quoted</p>
            <p className="text-sm font-bold text-gray-900">
              AED {(q.total_amount ?? 0).toLocaleString('en-AE', { minimumFractionDigits: 2 })}
            </p>
            {dd?.poAgreedAmount && (
              <p className="text-[10px] text-green-700 font-semibold mt-0.5">
                Agreed: AED {Number(dd.poAgreedAmount).toLocaleString('en-AE', { minimumFractionDigits: 2 })}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            {poNumber && (
              <DocBadge
                icon={FileCheck}
                label={`PO: ${poNumber}`}
                color="bg-amber-50 text-amber-700 border border-amber-200"
                onClick={hasPOFile ? (e => { e.stopPropagation(); onViewPO() }) : undefined}
              />
            )}
            {(invoiceNo || hasInvoiceFile) && (
              <DocBadge
                icon={Receipt}
                label={invoiceNo ? `INV: ${invoiceNo}` : 'Invoice'}
                color="bg-blue-50 text-blue-700 border border-blue-200"
                onClick={hasInvoiceFile ? (e => { e.stopPropagation(); onViewInvoice() }) : undefined}
              />
            )}
            {dd?.deliveryNotes?.length > 0 && (
              <DocBadge
                icon={Truck}
                label={`DN (${dd.deliveryNotes.length})`}
                color="bg-green-50 text-green-700 border border-green-200"
              />
            )}
          </div>
        </div>
      </div>

      {/* Actions row */}
      <div className="border-t border-gray-100 px-3 py-2 flex items-center justify-between bg-gray-50/50">
        <p className="text-[10px] text-gray-400">{q.created_at ? formatDate(q.created_at) : '—'}</p>
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <button
            onClick={onView}
            className="flex items-center gap-1 text-[10px] font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-lg transition-colors"
          >
            <Eye className="w-3 h-3" /> View
          </button>
          <button
            onClick={onEdit}
            className="flex items-center gap-1 text-[10px] font-medium text-gray-600 hover:text-gray-900 bg-white hover:bg-gray-100 border border-gray-200 px-2 py-1 rounded-lg transition-colors"
          >
            <ChevronRight className="w-3 h-3" /> Edit
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  )
}


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

function validityChip(createdAt: string, validityDays: number | undefined): { label: string; cls: string } | null {
  if (!validityDays) return null
  const daysLeft = Math.ceil((new Date(createdAt).getTime() + validityDays * 86_400_000 - Date.now()) / 86_400_000)
  if (daysLeft < 0)  return { label: 'Expired ' + Math.abs(daysLeft) + 'd ago', cls: 'bg-red-100 text-red-600' }
  if (daysLeft === 0) return { label: 'Expires today', cls: 'bg-amber-100 text-amber-700' }
  if (daysLeft <= 7)  return { label: daysLeft + 'd left', cls: 'bg-amber-100 text-amber-700' }
  return              { label: 'Valid · ' + daysLeft + 'd', cls: 'bg-green-100 text-green-700' }
}

const ALERT_ROW: Record<NonNullable<AlertLevel>, string> = {
  overdue:  'bg-red-50 border-l-4 border-l-red-400',
  expiring: 'bg-amber-50 border-l-4 border-l-amber-400',
  stale:    'bg-yellow-50 border-l-4 border-l-yellow-300',
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
