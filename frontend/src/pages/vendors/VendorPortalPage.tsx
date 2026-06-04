import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { CheckCircle } from 'lucide-react'
import { rfqsApi } from '@/api'
import { Button } from '@/components/ui'

export default function VendorPortalPage() {
  const { rfqId } = useParams<{ rfqId: string }>()
  const [submitted, setSubmitted] = useState(false)

  // In a real implementation, fetch RFQ details by rfqId (public endpoint)
  // For now, show a demo form

  const [lines, setLines] = useState([
    { line_item_id: 'item-1', description: 'SS Flange DN50 PN16', unit_price: '', lead_days: '' },
    { line_item_id: 'item-2', description: 'Hex bolt M12×60 gr 8.8', unit_price: '', lead_days: '' },
    { line_item_id: 'item-3', description: 'Pipe 2" Sch 40 CS', unit_price: '', lead_days: '' },
  ])

  const submitMut = useMutation({
    mutationFn: () =>
      rfqsApi.respond(
        rfqId!,
        lines
          .filter((l) => l.unit_price && l.lead_days)
          .map((l) => ({
            line_item_id: l.line_item_id,
            unit_price: parseFloat(l.unit_price),
            lead_days: parseInt(l.lead_days),
          })),
      ),
    onSuccess: () => setSubmitted(true),
  })

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Quote submitted</h2>
          <p className="text-sm text-gray-500">Thank you — the procurement team will review your quotation.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-gray-900">
            Quote<span className="text-blue-600">Me</span>
          </h1>
          <p className="text-sm text-gray-500 mt-1">Request for Quotation</p>
        </div>

        <div className="card mb-4">
          <div className="mb-4">
            <p className="text-xs text-gray-400 font-mono mb-1">RFQ-{rfqId?.slice(-6).toUpperCase()}</p>
            <h2 className="text-base font-semibold text-gray-900">Submit your quotation</h2>
            <p className="text-sm text-gray-500 mt-1">
              Please provide unit prices for each item below.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs mb-4">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left pb-2 font-semibold text-gray-400 uppercase tracking-wide">Item</th>
                  <th className="text-right pb-2 font-semibold text-gray-400 uppercase tracking-wide">Unit price ($)</th>
                  <th className="text-right pb-2 font-semibold text-gray-400 uppercase tracking-wide">Lead time (days)</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => (
                  <tr key={line.line_item_id} className="border-b border-gray-100 last:border-0">
                    <td className="py-2 font-medium text-gray-800 pr-2">{line.description}</td>
                    <td className="py-2">
                      <input
                        type="number"
                        step="0.01"
                        className="input-base text-xs py-1.5 text-right w-24 ml-auto block"
                        placeholder="0.00"
                        value={line.unit_price}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((l, j) => j === i ? { ...l, unit_price: e.target.value } : l)
                          )
                        }
                      />
                    </td>
                    <td className="py-2">
                      <input
                        type="number"
                        className="input-base text-xs py-1.5 text-right w-20 ml-auto block"
                        placeholder="14"
                        value={line.lead_days}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((l, j) => j === i ? { ...l, lead_days: e.target.value } : l)
                          )
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700 mb-4">
            All prices in USD. Response deadline shown in the email you received.
          </div>

          <Button
            variant="primary"
            className="w-full justify-center"
            loading={submitMut.isPending}
            disabled={!lines.some((l) => l.unit_price && l.lead_days)}
            onClick={() => submitMut.mutate()}
          >
            Submit quotation
          </Button>
        </div>

        <p className="text-center text-xs text-gray-400">
          Powered by QuoteMe · For questions, reply to the RFQ email you received.
        </p>
      </div>
    </div>
  )
}
