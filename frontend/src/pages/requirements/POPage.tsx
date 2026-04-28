import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { requirementsApi, quotesApi } from '@/api'
import { useProject } from '@/context/ProjectContext'
import { Card, CardTitle, Badge, Button, StepBar, StatTile, Timeline, Spinner } from '@/components/ui'
import { formatDate, formatCurrency } from '@/lib/utils'
import type { VendorPO } from '@/types'

export default function POPage() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const qc = useQueryClient()
  const { activeProject } = useProject()

  const { data: req, isLoading } = useQuery({
    queryKey: ['requirement', id],
    queryFn: () => requirementsApi.get(activeProject!.id, id!),
    enabled: !!id && !!activeProject,
  })

  const quotationId = req?.quotation?.id

  const { data: vendorPos = [] } = useQuery<VendorPO[]>({
    queryKey: ['vendor-pos', quotationId],
    queryFn: () => quotesApi.vendorPos(quotationId!),
    enabled: !!quotationId && req?.status === 'po_raised',
  })

  const poMut = useMutation({
    mutationFn: () => quotesApi.raisePO(quotationId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['requirement', id] })
      qc.invalidateQueries({ queryKey: ['vendor-pos', quotationId] })
    },
  })

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>
  if (!req) return <p className="text-sm text-gray-400">Not found.</p>

  const quotation = req.quotation
  const posRaised = req.status === 'po_raised' || vendorPos.length > 0

  return (
    <div>
      <StepBar current={3} requirementId={id} />

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg">{req.title}</h1>
        {posRaised && <Badge variant="green">POs raised</Badge>}
      </div>

      {/* Quotation summary */}
      {quotation && (
        <Card className="mb-4">
          <CardTitle>
            Approved quotation <Badge variant="purple">{quotation.reference}</Badge>
          </CardTitle>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <StatTile label="Total" value={formatCurrency(quotation.customer_total)} />
            <StatTile label="Margin" value={`${quotation.margin_pct}%`} />
            <StatTile label="Lines" value={String(quotation.line_breakdown?.length ?? 0)} />
          </div>

          {/* Line breakdown */}
          {quotation.line_breakdown && quotation.line_breakdown.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left pb-2 font-semibold text-gray-400 uppercase tracking-wide">Item</th>
                    <th className="text-left pb-2 font-semibold text-gray-400 uppercase tracking-wide">Vendor</th>
                    <th className="text-right pb-2 font-semibold text-gray-400 uppercase tracking-wide">Qty</th>
                    <th className="text-right pb-2 font-semibold text-gray-400 uppercase tracking-wide">Unit price</th>
                    <th className="text-right pb-2 font-semibold text-gray-400 uppercase tracking-wide">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {quotation.line_breakdown.map((line) => (
                    <tr key={line.line_item_id} className="border-b border-gray-100 last:border-0">
                      <td className="py-2 font-medium text-gray-800">{line.description}</td>
                      <td className="py-2">
                        {line.vendor_id
                          ? <Badge variant="blue">{line.vendor_name}</Badge>
                          : <span className="text-gray-400 italic">No quote</span>}
                      </td>
                      <td className="py-2 text-right">{line.qty ?? '—'}</td>
                      <td className="py-2 text-right">{line.unit_price != null ? formatCurrency(line.unit_price) : '—'}</td>
                      <td className="py-2 text-right font-medium">{line.line_total != null ? formatCurrency(line.line_total) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Per-vendor POs */}
      {vendorPos.length > 0 && (
        <div className="mb-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Purchase orders by vendor</h2>
          {vendorPos.map((vpo) => (
            <Card key={vpo.id}>
              <div className="flex items-center justify-between mb-3">
                <CardTitle>
                  <Badge variant="blue" className="mr-2">{vpo.vendor_name}</Badge>
                  {vpo.reference}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="green">{vpo.status}</Badge>
                  <span className="text-sm font-bold text-blue-600">{formatCurrency(vpo.amount)}</span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left pb-1 font-semibold text-gray-400 uppercase tracking-wide">Item</th>
                      <th className="text-right pb-1 font-semibold text-gray-400 uppercase tracking-wide">Qty</th>
                      <th className="text-right pb-1 font-semibold text-gray-400 uppercase tracking-wide">Unit price</th>
                      <th className="text-right pb-1 font-semibold text-gray-400 uppercase tracking-wide">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vpo.lines.map((line) => (
                      <tr key={line.line_item_id} className="border-b border-gray-100 last:border-0">
                        <td className="py-1.5 text-gray-800">{line.description}</td>
                        <td className="py-1.5 text-right text-gray-600">{line.qty}</td>
                        <td className="py-1.5 text-right text-gray-600">{line.unit_price != null ? formatCurrency(line.unit_price) : '—'}</td>
                        <td className="py-1.5 text-right font-medium">{line.line_total != null ? formatCurrency(line.line_total) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-400 mt-2">Raised {formatDate(vpo.raised_at)}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 justify-end mb-4">
        <Button variant="ghost" onClick={() => nav(`/requirement/${id}/quote`)}>← Back to quote</Button>
        {!posRaised ? (
          <Button variant="primary" loading={poMut.isPending} onClick={() => poMut.mutate()}>
            {poMut.isPending ? 'Raising POs…' : 'Raise purchase orders →'}
          </Button>
        ) : (
          <Button variant="primary" onClick={() => nav(`/requirement/${id}/invoice`)}>
            Raise invoice →
          </Button>
        )}
      </div>

      {/* Timeline */}
      <Card>
        <CardTitle>Order timeline</CardTitle>
        <Timeline items={[
          { label: 'Requirement submitted', done: true, time: formatDate(req.created_at) },
          { label: 'Quote approved', done: true },
          { label: `${vendorPos.length || '—'} vendor POs raised`, done: posRaised },
          { label: 'Awaiting delivery', done: false },
        ]} />
      </Card>
    </div>
  )
}
