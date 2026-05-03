import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ShoppingCart, ExternalLink, Download } from 'lucide-react'
import { purchaseOrdersApi } from '@/api'
import { formatDate, formatCurrency } from '@/lib/utils'
import { Badge, Spinner } from '@/components/ui'
import type { PurchaseOrderDetail } from '@/types'

const statusVariant = (status: string): 'blue' | 'green' | 'orange' | 'gray' => {
  if (status === 'raised') return 'blue'
  if (status === 'delivered') return 'green'
  if (status === 'partial') return 'orange'
  return 'gray'
}

export default function PurchaseOrdersListPage() {
  const navigate = useNavigate()
  const { data: pos = [], isLoading } = useQuery<PurchaseOrderDetail[]>({
    queryKey: ['purchase-orders'],
    queryFn: purchaseOrdersApi.list,
  })

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
          <ShoppingCart className="w-4 h-4 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Purchase Orders</h1>
          <p className="text-xs text-gray-400">{pos.length} order{pos.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/80">
              <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">PO Reference</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Quotation</th>
              <th className="text-right px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Total</th>
              <th className="text-center px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Vendors</th>
              <th className="text-center px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Status</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Payment Terms</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Raised</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={8} className="text-center py-16">
                  <Spinner size="md" />
                </td>
              </tr>
            )}

            {!isLoading && pos.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-16 text-gray-400 text-sm">
                  No purchase orders yet. Raise a PO from a requirement's quotation step.
                </td>
              </tr>
            )}

            {pos.map((po: PurchaseOrderDetail) => (
              <tr
                key={po.id}
                className="border-b border-gray-50 last:border-0 hover:bg-blue-50/30 transition-colors group"
              >
                {/* PO ref */}
                <td className="px-5 py-3">
                  <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                    {po.reference}
                  </span>
                </td>

                {/* Quotation ref */}
                <td className="px-5 py-3">
                  <span className="font-mono text-xs text-gray-600">{po.quotation_ref}</span>
                </td>

                {/* Total */}
                <td className="px-5 py-3 text-right font-semibold text-gray-900">
                  {formatCurrency(po.total_amount)}
                </td>

                {/* Vendor count */}
                <td className="px-5 py-3 text-center">
                  <span className="text-gray-600 text-xs font-medium">{po.vendor_count}</span>
                </td>

                {/* Status */}
                <td className="px-5 py-3 text-center">
                  <Badge variant={statusVariant(po.status)}>{po.status}</Badge>
                </td>

                {/* Payment terms */}
                <td className="px-5 py-3 text-gray-600 text-xs">{po.payment_terms}</td>

                {/* Raised date */}
                <td className="px-5 py-3 text-gray-400 text-xs">{formatDate(po.raised_at)}</td>

                {/* View action */}
                <td className="px-5 py-3 text-right">
                  <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                    {po.pdf_url && (
                      <a href={po.pdf_url} target="_blank" rel="noreferrer"
                        title="Download PO PDF"
                        className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                        onClick={e => e.stopPropagation()}
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <button
                      onClick={() => navigate(`/requirement-po/${po.quotation_id}`)}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium p-1.5 hover:bg-blue-50 rounded-lg"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      View
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
