import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Mail, MessageSquare, Phone, PhoneCall, ChevronDown, ChevronRight,
  CheckCircle2, Clock, AlertTriangle, Plus,
} from 'lucide-react'
import { requirementsApi, rfqsApi, quotesApi } from '@/api'
import { useProject } from '@/context/ProjectContext'
import { Card, CardTitle, Badge, Button, StepBar, StatusBadge, StatTile, Timeline, Spinner } from '@/components/ui'
import { formatDate, formatCurrency } from '@/lib/utils'
import type { RFQ, LineItem } from '@/types'

// ── Channel config ───────────────────────────────────────────────
const CHANNELS = [
  { id: 'mail',      label: 'Email',     Icon: Mail },
  { id: 'whatsapp',  label: 'WhatsApp',  Icon: MessageSquare },
  { id: 'sms',       label: 'SMS',       Icon: MessageSquare },
  { id: 'call',      label: 'Phone call', Icon: PhoneCall },
] as const

type ChannelId = typeof CHANNELS[number]['id']

// ── Per-RFQ respond form ─────────────────────────────────────────
interface RespondFormProps {
  rfq: RFQ
  lineItems: LineItem[]
  onDone: () => void
}

function RespondForm({ rfq, lineItems, onDone }: RespondFormProps) {
  const qc = useQueryClient()

  // Pre-fill from existing quote_lines if editing a previous response
  const existingByLineItem = Object.fromEntries(
    (rfq.quote_lines ?? []).map((ql) => [ql.line_item_id, ql])
  )
  const existingChannel = (rfq.quote_lines ?? []).find((l) => l.channel)?.channel as ChannelId | undefined
  const existingNotes = (rfq.quote_lines ?? []).find((l) => l.response_notes)?.response_notes ?? ''

  const [channel, setChannel] = useState<ChannelId>(existingChannel ?? 'mail')
  const [notes, setNotes] = useState(existingNotes)
  const [prices, setPrices] = useState<Record<string, { unit_price: string; lead_days: string; notes: string }>>(
    Object.fromEntries(lineItems.map((li) => {
      const ex = existingByLineItem[li.id]
      return [li.id, {
        unit_price: ex?.unit_price != null ? String(ex.unit_price) : '',
        lead_days: ex?.lead_days != null ? String(ex.lead_days) : '7',
        notes: ex?.notes ?? '',
      }]
    }))
  )

  const mut = useMutation({
    mutationFn: () =>
      rfqsApi.respondInternal(
        rfq.id,
        channel,
        notes,
        lineItems
          .filter((li) => prices[li.id]?.unit_price !== '')
          .map((li) => ({
            line_item_id: li.id,
            unit_price: parseFloat(prices[li.id].unit_price),
            lead_days: parseInt(prices[li.id].lead_days) || 7,
            notes: prices[li.id].notes || undefined,
          })),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rfqs'] })
      qc.invalidateQueries({ queryKey: ['requirement'] })
      onDone()
    },
  })

  const allFilled = lineItems.every((li) => prices[li.id]?.unit_price !== '')

  return (
    <div className="mt-3 bg-blue-50/50 border border-blue-100 rounded-xl p-4 space-y-4">
      {/* Channel selector */}
      <div>
        <p className="text-xs font-semibold text-gray-600 mb-2">How was the quote received?</p>
        <div className="flex gap-2 flex-wrap">
          {CHANNELS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setChannel(id)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                channel === id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Response notes */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Response notes <span className="text-gray-400">(when, contact name, reference…)</span>
        </label>
        <input
          className="input-base text-xs"
          placeholder={`e.g. Received via ${channel} on ${new Date().toLocaleDateString()} from John at vendor`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {/* Line item prices */}
      <div>
        <p className="text-xs font-semibold text-gray-600 mb-2">Enter quoted prices</p>
        <div className="overflow-x-auto rounded-lg border border-gray-100 bg-white">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-400 font-medium">
              <tr>
                <th className="text-left px-3 py-2">Item</th>
                <th className="text-left px-3 py-2 w-24">Qty</th>
                <th className="text-left px-3 py-2 w-28">Unit price *</th>
                <th className="text-left px-3 py-2 w-24">Lead days</th>
                <th className="text-left px-3 py-2 w-40">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {lineItems.map((li) => (
                <tr key={li.id} className={!prices[li.id]?.unit_price ? 'bg-amber-50/60' : ''}>
                  <td className="px-3 py-2">
                    <p className="font-medium text-gray-800">{li.description}</p>
                    {li.part_number && <p className="text-gray-400">{li.part_number}</p>}
                  </td>
                  <td className="px-3 py-2 text-gray-500">
                    {li.quantity ?? '—'} {li.unit ?? ''}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number" min="0" step="0.01" placeholder="0.00"
                      className="input-base text-xs py-1 w-24"
                      value={prices[li.id]?.unit_price ?? ''}
                      onChange={(e) => setPrices((p) => ({ ...p, [li.id]: { ...p[li.id], unit_price: e.target.value } }))}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number" min="1" step="1" placeholder="7"
                      className="input-base text-xs py-1 w-20"
                      value={prices[li.id]?.lead_days ?? ''}
                      onChange={(e) => setPrices((p) => ({ ...p, [li.id]: { ...p[li.id], lead_days: e.target.value } }))}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text" placeholder="Optional"
                      className="input-base text-xs py-1 w-36"
                      value={prices[li.id]?.notes ?? ''}
                      onChange={(e) => setPrices((p) => ({ ...p, [li.id]: { ...p[li.id], notes: e.target.value } }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!allFilled && (
          <p className="text-xs text-amber-600 mt-1.5">⚠ Fill in unit prices for all items before submitting.</p>
        )}
      </div>

      <div className="flex gap-2 justify-end">
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button
          variant="primary"
          loading={mut.isPending}
          disabled={!allFilled}
          onClick={() => mut.mutate()}
        >
          Save vendor response
        </Button>
      </div>
    </div>
  )
}

// ── RFQ row with expand + respond form ───────────────────────────
function RFQRow({ rfq, lineItems }: { rfq: RFQ; lineItems: LineItem[] }) {
  const [expanded, setExpanded] = useState(false)
  const [showForm, setShowForm] = useState(false)

  const channelIcon: Record<string, React.ReactNode> = {
    mail:      <Mail className="w-3 h-3" />,
    whatsapp:  <MessageSquare className="w-3 h-3" />,
    sms:       <MessageSquare className="w-3 h-3" />,
    call:      <PhoneCall className="w-3 h-3" />,
  }

  const statusIcon =
    rfq.status === 'responded' ? <CheckCircle2 className="w-4 h-4 text-green-500" />
    : rfq.status === 'expired'  ? <AlertTriangle className="w-4 h-4 text-red-400" />
    : <Clock className="w-4 h-4 text-amber-400 animate-pulse" />

  // unique channels used in this rfq's response
  const channels = [...new Set((rfq.quote_lines ?? []).map((l) => l.channel).filter(Boolean))]

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden mb-3 last:mb-0">
      {/* ── Header row ── */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white hover:bg-gray-50 transition-colors">
        <button onClick={() => setExpanded((v) => !v)} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-gray-900">{rfq.vendor.name}</p>
            {channels.map((ch) => (
              <span key={ch} className="flex items-center gap-1 text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">
                {channelIcon[ch!]} {ch}
              </span>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {rfq.sent_at ? `Sent ${formatDate(rfq.sent_at)}` : 'Pending send'}
            {rfq.responded_at && ` · Replied ${formatDate(rfq.responded_at)}`}
            {rfq.deadline && ` · Due ${formatDate(rfq.deadline)}`}
            {rfq.quote_lines?.length > 0 && ` · ${rfq.quote_lines.length} line${rfq.quote_lines.length > 1 ? 's' : ''} quoted`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {statusIcon}
          <Badge variant={
            rfq.status === 'responded' ? 'green'
            : rfq.status === 'sent' ? 'amber'
            : rfq.status === 'expired' ? 'red'
            : 'gray'
          }>
            {rfq.status}
          </Badge>
          {rfq.status !== 'responded' && (
            <Button variant="primary" onClick={() => { setShowForm((v) => !v); setExpanded(true) }}>
              <Plus className="w-3.5 h-3.5" />
              Enter response
            </Button>
          )}
          {rfq.status === 'responded' && (
            <Button variant="ghost" onClick={() => { setShowForm((v) => !v); setExpanded(true) }}>
              Edit response
            </Button>
          )}
        </div>
      </div>

      {/* ── Expanded: items requested + quoted prices ── */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/40">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Items requested for quotation</p>
          <table className="w-full text-xs mb-2">
            <thead>
              <tr className="text-gray-400 font-medium">
                <th className="text-left py-1 pr-6">Description</th>
                <th className="text-left py-1 pr-4">Part no.</th>
                <th className="text-right py-1 pr-4">Qty</th>
                <th className="text-right py-1 pr-4">Unit price</th>
                <th className="text-right py-1 pr-4">Line total</th>
                <th className="text-right py-1 pr-4">Lead days</th>
                <th className="text-left py-1">Channel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lineItems.map((li) => {
                const quotedLine = (rfq.quote_lines ?? []).find((l) => l.line_item_id === li.id)
                return (
                  <tr key={li.id} className={quotedLine ? '' : 'opacity-50'}>
                    <td className="py-2 pr-6 font-medium text-gray-800">{li.description}</td>
                    <td className="py-2 pr-4 text-gray-400">{li.part_number || '—'}</td>
                    <td className="py-2 pr-4 text-right text-gray-600">{li.quantity ?? '—'} {li.unit ?? ''}</td>
                    <td className="py-2 pr-4 text-right font-medium">
                      {quotedLine?.unit_price != null ? formatCurrency(quotedLine.unit_price) : <span className="text-amber-500">awaiting</span>}
                    </td>
                    <td className="py-2 pr-4 text-right font-semibold text-blue-700">
                      {quotedLine?.unit_price != null && li.quantity != null
                        ? formatCurrency(quotedLine.unit_price * li.quantity)
                        : '—'}
                    </td>
                    <td className="py-2 pr-4 text-right text-gray-500">
                      {quotedLine?.lead_days != null ? `${quotedLine.lead_days}d` : '—'}
                    </td>
                    <td className="py-2">
                      {quotedLine?.channel ? (
                        <span className="flex items-center gap-1 text-gray-500">
                          {channelIcon[quotedLine.channel]} {quotedLine.channel}
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* vendor response notes */}
          {(rfq.quote_lines ?? []).some((l) => l.response_notes) && (
            <p className="text-xs text-gray-400 italic mt-1">
              Note: {(rfq.quote_lines ?? []).find((l) => l.response_notes)?.response_notes}
            </p>
          )}

          {/* Enter/edit response form */}
          {showForm && (
            <RespondForm
              rfq={rfq}
              lineItems={lineItems}
              onDone={() => setShowForm(false)}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────
export default function QuotePage() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const qc = useQueryClient()
  const { activeProject } = useProject()

  const { data: req, isLoading } = useQuery({
    queryKey: ['requirement', id],
    queryFn: () => requirementsApi.get(activeProject!.id, id!),
    enabled: !!id && !!activeProject,
    refetchInterval: (query) =>
      query.state.data?.status === 'rfq_sent' ? 8000 : false,
  })

  const { data: rfqs } = useQuery({
    queryKey: ['rfqs', id],
    queryFn: () => rfqsApi.list(id!),
    enabled: !!id,
    refetchInterval: (query) =>
      query.state.data?.some((r: { status: string }) => r.status === 'sent') ? 8000 : false,
  })

  const buildMut = useMutation({
    mutationFn: () => quotesApi.build(id!, 18),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['requirement', id] }),
  })

  const approveMut = useMutation({
    mutationFn: (quoteId: string) => quotesApi.approve(quoteId),
    onSuccess: () => nav(`/requirement/${id}/po`),
  })

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>
  if (!req) return <p className="text-sm text-gray-400">Requirement not found.</p>

  const responded = rfqs?.filter((r) => r.status === 'responded').length ?? 0
  const total = rfqs?.length ?? 0
  const allResponded = total > 0 && responded === total
  // Allow building even with partial responses — any RFQ with at least one priced line
  const hasAnyQuotes = rfqs?.some((r) => r.quote_lines.some((ql) => ql.unit_price != null)) ?? false

  return (
    <div>
      <StepBar current={2} requirementId={id} />

      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg">{req.title}</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {req.line_items.length} items · {formatDate(req.created_at)}
          </p>
        </div>
        <StatusBadge status={req.status} />
      </div>

      {/* RFQ tracker */}
      {rfqs && rfqs.length > 0 && (
        <Card className="mb-4">
          <div className="flex items-center justify-between mb-4">
            <CardTitle>
              RFQ status{' '}
              <Badge variant={responded === total ? 'green' : 'amber'}>
                {responded} of {total} responded
              </Badge>
            </CardTitle>
            {(req.status === 'quotes_received' || allResponded || hasAnyQuotes) && (
              <Button variant="primary" loading={buildMut.isPending} onClick={() => buildMut.mutate()}>
                {buildMut.isPending ? 'Building quote…' : 'Build customer quote →'}
              </Button>
            )}
          </div>

          {rfqs.map((rfq) => (
            <RFQRow key={rfq.id} rfq={rfq} lineItems={req.line_items} />
          ))}
        </Card>
      )}

      {/* Quotation review */}
      {req.quotation && (
        <Card className="mb-4">
          <CardTitle>
            Customer quotation{' '}
            <Badge variant="purple">{req.quotation.reference}</Badge>
            {req.quotation.status === 'approved' && <Badge variant="green" className="ml-1">Approved</Badge>}
          </CardTitle>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <StatTile label="Total quoted" value={formatCurrency(req.quotation.customer_total)} />
            <StatTile label="Margin" value={`${req.quotation.margin_pct}%`} />
            <StatTile
              label="Valid until"
              value={formatDate(req.quotation.valid_until)}
            />
          </div>

          {/* Per-line breakdown with vendor source */}
          {req.quotation.line_breakdown && req.quotation.line_breakdown.length > 0 && (
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left pb-2 font-semibold text-gray-400 uppercase tracking-wide">Description</th>
                    <th className="text-left pb-2 font-semibold text-gray-400 uppercase tracking-wide">Source vendor</th>
                    <th className="text-right pb-2 font-semibold text-gray-400 uppercase tracking-wide">Qty</th>
                    <th className="text-right pb-2 font-semibold text-gray-400 uppercase tracking-wide">Unit price</th>
                    <th className="text-right pb-2 font-semibold text-gray-400 uppercase tracking-wide">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {req.quotation.line_breakdown.map((line) => (
                    <tr key={line.line_item_id} className="border-b border-gray-100 last:border-0">
                      <td className="py-2 font-medium text-gray-800">{line.description}</td>
                      <td className="py-2">
                        {line.vendor_id
                          ? <Badge variant="blue">{line.vendor_name}</Badge>
                          : <span className="text-gray-400 italic">No quote</span>}
                      </td>
                      <td className="py-2 text-right text-gray-600">{line.qty ?? '—'}</td>
                      <td className="py-2 text-right text-gray-600">
                        {line.unit_price != null ? formatCurrency(line.unit_price) : '—'}
                      </td>
                      <td className="py-2 text-right font-medium">
                        {line.line_total != null ? formatCurrency(line.line_total) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="border-t border-gray-100 pt-3 flex flex-col items-end gap-1">
            <div className="flex gap-10 text-xs">
              <span className="text-gray-400">Subtotal</span>
              <span className="font-medium min-w-[70px] text-right">{formatCurrency(req.quotation.total_cost)}</span>
            </div>
            <div className="flex gap-10 text-xs">
              <span className="text-gray-400">Tax (0%)</span>
              <span className="font-medium min-w-[70px] text-right">$0.00</span>
            </div>
            <div className="flex gap-10 text-sm font-bold">
              <span className="text-gray-600">Total</span>
              <span className="min-w-[70px] text-right text-blue-600">{formatCurrency(req.quotation.customer_total)}</span>
            </div>
          </div>

          {req.quotation.status !== 'approved' && (
            <div className="flex gap-2 justify-end mt-4">
              <Button variant="ghost">Request changes</Button>
              <Button
                variant="primary"
                loading={approveMut.isPending}
                onClick={() => approveMut.mutate(req.quotation!.id)}
              >
                Approve & raise PO →
              </Button>
            </div>
          )}
          {req.quotation.status === 'approved' && (
            <div className="flex gap-2 justify-end mt-4">
              <Button variant="primary" onClick={() => nav(`/requirement/${id}/po`)}>
                View purchase orders →
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* Waiting state — hidden once all vendors have responded */}
      {['rfq_sent', 'submitted', 'draft'].includes(req.status) && !allResponded && (
        <Card className="text-center py-10">
          <Spinner size="lg" />
          <p className="text-sm text-gray-500 mt-3">
            {req.status === 'rfq_sent' ? 'Waiting for vendor responses…' : 'Processing…'}
          </p>
          <p className="text-xs text-gray-400 mt-1">Page refreshes automatically every 8 seconds</p>
        </Card>
      )}

      {/* Timeline */}
      <Card>
        <CardTitle>Order timeline</CardTitle>
        <Timeline items={[
          { label: 'Requirement submitted', done: true, time: formatDate(req.created_at) },
          { label: 'RFQs sent to vendors', done: ['rfq_sent','quotes_received','quote_ready','approved','po_raised','invoiced'].includes(req.status) },
          { label: 'Quotes received', done: ['quotes_received','quote_ready','approved','po_raised','invoiced'].includes(req.status) },
          { label: 'Quotation ready', done: ['quote_ready','approved','po_raised','invoiced'].includes(req.status) },
          { label: 'Awaiting approval', done: false },
        ]} />
      </Card>
    </div>
  )
}
