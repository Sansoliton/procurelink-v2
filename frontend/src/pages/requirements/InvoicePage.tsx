import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { requirementsApi, quotesApi } from '@/api'
import { useProject } from '@/context/ProjectContext'
import { Card, CardTitle, Badge, Button, StepBar, StatTile, Timeline, Spinner } from '@/components/ui'
import { formatDate, formatCurrency } from '@/lib/utils'
import type { Invoice } from '@/types'

const EXPORT_FORMATS = [
  { fmt: 'json' as const, label: 'JSON', desc: 'ERP / API' },
  { fmt: 'csv' as const, label: 'CSV', desc: 'Spreadsheet' },
  { fmt: 'xml' as const, label: 'XML', desc: 'EDI / SAP' },
]

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const { activeProject } = useProject()
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [exportContent, setExportContent] = useState<string | null>(null)
  const [exportFmt, setExportFmt] = useState('')

  const { data: req, isLoading } = useQuery({
    queryKey: ['requirement', id],
    queryFn: () => requirementsApi.get(activeProject!.id, id!),
    enabled: !!id && !!activeProject,
  })

  const invMut = useMutation({
    mutationFn: () => quotesApi.raiseInvoice((req as any).quotation.purchase_order.id),
    onSuccess: (data) => setInvoice(data),
  })

  const payMut = useMutation({
    mutationFn: () => quotesApi.markPaid(invoice!.id),
    onSuccess: (data) => setInvoice(data),
  })

  const exportMut = useMutation({
    mutationFn: (fmt: 'json' | 'csv' | 'xml') => quotesApi.exportInvoice(invoice!.id, fmt),
    onSuccess: (data) => {
      const content = typeof data.content === 'object'
        ? JSON.stringify(data.content, null, 2)
        : data.content
      setExportContent(content)
      setExportFmt(data.format)
    },
  })

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>
  if (!req) return <p className="text-sm text-gray-400">Not found.</p>

  const quotation = (req as any).quotation

  return (
    <div>
      <StepBar current={4} requirementId={id} />

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg">{req.title}</h1>
        {invoice && (
          <Badge variant={invoice.status === 'paid' ? 'green' : 'amber'}>
            {invoice.status}
          </Badge>
        )}
      </div>

      {/* Invoice details */}
      {invoice && (
        <Card className="mb-4">
          <CardTitle>
            Invoice <Badge variant="purple">{invoice.reference}</Badge>
          </CardTitle>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <StatTile label="Invoice no." value={invoice.reference} />
            <StatTile label="Issued" value={formatDate(invoice.issued_at)} />
            <StatTile label="Due date" value={formatDate(invoice.due_at)} />
            <StatTile label="PO ref" value={(req as any).quotation?.purchase_order?.reference ?? '—'} />
          </div>

          <div className="overflow-x-auto mb-4">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left pb-2 font-semibold text-gray-400 uppercase tracking-wide">Description</th>
                  <th className="text-right pb-2 font-semibold text-gray-400 uppercase tracking-wide">Qty</th>
                  <th className="text-right pb-2 font-semibold text-gray-400 uppercase tracking-wide">Unit</th>
                </tr>
              </thead>
              <tbody>
                {req.line_items.map((item) => (
                  <tr key={item.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-2 font-medium text-gray-800">{item.description}</td>
                    <td className="py-2 text-right">{item.quantity ?? '—'}</td>
                    <td className="py-2 text-right text-gray-400">{item.unit ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-gray-100 pt-3 flex flex-col items-end gap-1">
            <div className="flex gap-10 text-xs">
              <span className="text-gray-400">Subtotal</span>
              <span className="font-medium min-w-[75px] text-right">{formatCurrency(invoice.amount)}</span>
            </div>
            <div className="flex gap-10 text-xs">
              <span className="text-gray-400">Tax (0%)</span>
              <span className="font-medium min-w-[75px] text-right">$0.00</span>
            </div>
            <div className="flex gap-10 text-sm font-bold">
              <span className="text-gray-600">Amount due</span>
              <span className="min-w-[75px] text-right text-blue-600">
                {formatCurrency(invoice.amount + invoice.tax)}
              </span>
            </div>
          </div>
        </Card>
      )}

      {/* Export panel */}
      {invoice && (
        <Card className="mb-4">
          <CardTitle>Export PO data</CardTitle>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {EXPORT_FORMATS.map(({ fmt, label, desc }) => (
              <button
                key={fmt}
                onClick={() => exportMut.mutate(fmt)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-medium
                  transition-all text-left ${
                  exportFmt === fmt
                    ? 'border-blue-400 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50 text-gray-600'
                }`}
              >
                <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">{label}</span>
                {desc}
              </button>
            ))}
          </div>

          {exportContent && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">{exportFmt} preview</span>
                <button
                  onClick={() => { setExportContent(null); setExportFmt('') }}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  ✕ close
                </button>
              </div>
              <pre className="bg-gray-900 text-green-300 font-mono text-xs p-3 rounded-lg
                overflow-x-auto whitespace-pre-wrap break-all leading-relaxed max-h-48">
                {exportContent}
              </pre>
            </div>
          )}
        </Card>
      )}

      {/* Actions */}
      <div className="flex gap-2 justify-end mb-4">
        <Button variant="ghost" onClick={() => nav(`/requirement/${id}/po`)}>← Back to PO</Button>
        {!invoice && (
          <Button variant="primary" loading={invMut.isPending} onClick={() => invMut.mutate()}>
            Raise invoice →
          </Button>
        )}
        {invoice && invoice.status !== 'paid' && (
          <Button variant="primary" loading={payMut.isPending} onClick={() => payMut.mutate()}>
            Mark as paid ✓
          </Button>
        )}
        {invoice?.status === 'paid' && (
          <Button variant="ghost" onClick={() => nav('/')}>← Back to dashboard</Button>
        )}
      </div>

      {/* Full timeline */}
      <Card>
        <CardTitle>Complete order timeline</CardTitle>
        <Timeline items={[
          { label: 'Requirement submitted', done: true, time: formatDate(req.created_at) },
          { label: 'RFQs sent', done: true },
          { label: 'Quote approved', done: true },
          { label: 'PO raised', done: true },
          { label: 'Invoice generated', done: !!invoice, time: invoice ? formatDate(invoice.issued_at) : null },
          { label: 'Payment received', done: invoice?.status === 'paid', time: invoice?.paid_at ? formatDate(invoice.paid_at) : null },
        ]} />
      </Card>
    </div>
  )
}
