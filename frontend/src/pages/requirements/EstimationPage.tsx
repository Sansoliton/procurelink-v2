/**
 * EstimationPage — Rough quotation estimator
 *
 * Pick a requirement from the active project → each line item is matched
 * against catalog items from all vendors → lowest catalog price is used as
 * the "best estimate" → adjustable margin slider produces the customer total.
 */
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Calculator, ChevronDown } from 'lucide-react'
import { requirementsApi, vendorsApi } from '@/api'
import { useProject } from '@/context/ProjectContext'
import { Card, CardTitle, Button, Spinner, EmptyState } from '@/components/ui'
import { formatCurrency } from '@/lib/utils'
import type { LineItem, VendorCatalogItem, Vendor } from '@/types'

// ── helpers ──────────────────────────────────────────────────────

/** Fuzzy match: does a catalog item loosely cover a line item? */
function matchScore(lineItem: LineItem, catItem: VendorCatalogItem): number {
  const haystack = `${catItem.description} ${catItem.part_number ?? ''}`.toLowerCase()
  const needles = lineItem.description.toLowerCase().split(/\s+/).filter((w) => w.length > 3)
  if (needles.length === 0) return 0
  const hits = needles.filter((n) => haystack.includes(n)).length
  return hits / needles.length
}

interface CatalogMatch {
  vendorName: string
  catItem: VendorCatalogItem
  score: number
  lineTotal: number
}

interface LineEstimate {
  lineItem: LineItem
  matches: CatalogMatch[]   // sorted best → worst
  bestPrice: number | null  // unit price from best match
  qty: number
  lineTotal: number | null
}

function buildEstimates(lineItems: LineItem[], vendors: Vendor[]): LineEstimate[] {
  return lineItems.map((li) => {
    const qty = li.quantity ?? 1
    const allMatches: CatalogMatch[] = []

    vendors.forEach((v) => {
      ;(v.catalog_items ?? []).forEach((ci) => {
        const score = matchScore(li, ci)
        if (score > 0 || li.part_number && li.part_number === ci.part_number) {
          allMatches.push({
            vendorName: v.name,
            catItem: ci,
            score: li.part_number && li.part_number === ci.part_number ? 1 : score,
            lineTotal: ci.unit_price * qty,
          })
        }
      })
    })

    allMatches.sort((a, b) => b.score - a.score || a.lineTotal - b.lineTotal)
    const best = allMatches[0] ?? null

    return {
      lineItem: li,
      matches: allMatches,
      bestPrice: best?.catItem.unit_price ?? null,
      qty,
      lineTotal: best ? best.catItem.unit_price * qty : null,
    }
  })
}

// ── component ────────────────────────────────────────────────────

export default function EstimationPage() {
  const { activeProject } = useProject()
  const [selectedReqId, setSelectedReqId] = useState<string>('')
  const [marginPct, setMarginPct] = useState(18)
  const [manualPrices, setManualPrices] = useState<Record<string, number>>({})

  const { data: requirements, isLoading: loadingReqs } = useQuery({
    queryKey: ['requirements', activeProject?.id],
    queryFn: () => requirementsApi.list(activeProject!.id),
    enabled: !!activeProject,
  })

  const { data: vendors = [], isLoading: loadingVendors } = useQuery({
    queryKey: ['vendors'],
    queryFn: vendorsApi.list,
  })

  const selectedReq = requirements?.find((r) => r.id === selectedReqId)

  const estimates = useMemo(
    () => (selectedReq ? buildEstimates(selectedReq.line_items, vendors) : []),
    [selectedReq, vendors],
  )

  const subtotal = useMemo(() => {
    return estimates.reduce((sum, e) => {
      const price = manualPrices[e.lineItem.id] ?? e.bestPrice
      return sum + (price !== null ? price * e.qty : 0)
    }, 0)
  }, [estimates, manualPrices])

  const customerTotal = subtotal * (1 + marginPct / 100)
  const uncostedCount = estimates.filter(
    (e) => manualPrices[e.lineItem.id] == null && e.bestPrice == null
  ).length

  if (!activeProject) {
    return (
      <EmptyState
        title="No project selected"
        description="Select a project to run estimations."
      />
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-blue-600" /> Rough Estimation
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Estimate costs using vendor catalog prices before sending RFQs
          </p>
        </div>
      </div>

      {/* ── Requirement picker ── */}
      <Card className="mb-4">
        <CardTitle>Select requirement</CardTitle>
        {loadingReqs ? (
          <Spinner size="sm" />
        ) : (
          <div className="relative">
            <select
              className="input-base pr-8 appearance-none"
              value={selectedReqId}
              onChange={(e) => { setSelectedReqId(e.target.value); setManualPrices({}) }}
            >
              <option value="">— choose a requirement —</option>
              {(requirements ?? []).map((r) => (
                <option key={r.id} value={r.id}>{r.title} ({r.status})</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
        )}
      </Card>

      {selectedReq && !loadingVendors && (
        <>
          {/* ── Line items estimation table ── */}
          <Card className="mb-4">
            <CardTitle>Line items — cost estimation</CardTitle>

            {estimates.length === 0 ? (
              <p className="text-xs text-gray-400">This requirement has no line items yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-500 font-semibold">
                    <tr>
                      <th className="text-left px-3 py-2">Description</th>
                      <th className="text-left px-3 py-2 w-20">Qty</th>
                      <th className="text-left px-3 py-2 w-36">Best catalog match</th>
                      <th className="text-right px-3 py-2 w-28">Unit price</th>
                      <th className="text-right px-3 py-2 w-28">Line total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {estimates.map((e) => {
                      const manual = manualPrices[e.lineItem.id]
                      const unitPrice = manual ?? e.bestPrice
                      const lineTotal = unitPrice != null ? unitPrice * e.qty : null
                      const bestMatch = e.matches[0]

                      return (
                        <tr key={e.lineItem.id} className={unitPrice == null ? 'bg-amber-50' : ''}>
                          <td className="px-3 py-2">
                            <p className="font-medium text-gray-800">{e.lineItem.description}</p>
                            {e.lineItem.part_number && (
                              <p className="text-gray-400">{e.lineItem.part_number}</p>
                            )}
                          </td>
                          <td className="px-3 py-2 text-gray-600">
                            {e.qty} {e.lineItem.unit ?? ''}
                          </td>
                          <td className="px-3 py-2">
                            {bestMatch ? (
                              <div>
                                <p className="text-gray-700 font-medium truncate max-w-[130px]">
                                  {bestMatch.catItem.description}
                                </p>
                                <p className="text-gray-400">{bestMatch.vendorName}</p>
                              </div>
                            ) : (
                              <span className="text-amber-600 font-medium">No match found</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder={e.bestPrice != null ? e.bestPrice.toString() : '—'}
                              value={manual ?? ''}
                              onChange={(ev) => {
                                const v = parseFloat(ev.target.value)
                                setManualPrices((p) => ({
                                  ...p,
                                  [e.lineItem.id]: isNaN(v) ? (undefined as any) : v,
                                }))
                              }}
                              className="input-base text-xs py-1 text-right w-24"
                            />
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-gray-800">
                            {lineTotal != null ? formatCurrency(lineTotal) : (
                              <span className="text-amber-500 text-xs">enter price</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {uncostedCount > 0 && (
              <p className="mt-3 text-xs text-amber-600 font-medium">
                ⚠ {uncostedCount} item{uncostedCount > 1 ? 's' : ''} without catalog prices — enter manually above.
              </p>
            )}
          </Card>

          {/* ── Summary & margin ── */}
          <Card>
            <CardTitle>Summary</CardTitle>

            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Margin: {marginPct}%
              </label>
              <input
                type="range" min={0} max={50} step={1}
                value={marginPct}
                onChange={(e) => setMarginPct(Number(e.target.value))}
                className="w-full accent-blue-600"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                <span>0%</span><span>25%</span><span>50%</span>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between border-b border-gray-100 pb-2">
                <span className="text-gray-500">Cost subtotal</span>
                <span className="font-medium">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between border-b border-gray-100 pb-2">
                <span className="text-gray-500">Margin ({marginPct}%)</span>
                <span className="font-medium">{formatCurrency(subtotal * marginPct / 100)}</span>
              </div>
              <div className="flex justify-between pt-1">
                <span className="font-semibold text-gray-800">Customer total (estimated)</span>
                <span className="text-lg font-bold text-blue-700">{formatCurrency(customerTotal)}</span>
              </div>
            </div>

            <p className="text-xs text-gray-400 mt-4">
              * Prices are estimated from vendor catalog items using keyword matching. Actual RFQ prices may differ.
            </p>
          </Card>
        </>
      )}
    </div>
  )
}
