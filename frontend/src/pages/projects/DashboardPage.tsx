import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, X, DollarSign, Clock, CheckCircle2, TrendingUp, Edit2, ArrowRight,
} from 'lucide-react'
import { projectsApi } from '@/api'
import { useProject } from '@/context/ProjectContext'
import { useAuth } from '@/context/AuthContext'
import { Card, Button, Badge, EmptyState, Spinner } from '@/components/ui'
import { formatDate } from '@/lib/utils'
import { readData } from '@/lib/storage'

interface QuotationRow {
  id: string
  quotationNo: string
  date: string
  customerName: string
  lines: { qty: string; unitPrice: string; amount: string }[]
  vatPct: number
  status: string
  invoiceId?: string
  createdAt: string
}

function calcTotal(doc: QuotationRow): number {
  const sub = doc.lines.reduce((s, l) => {
    const q = parseFloat(l.qty), p = parseFloat(l.unitPrice)
    return s + ((!isNaN(q) && !isNaN(p)) ? q * p : (parseFloat(l.amount) || 0))
  }, 0)
  return sub + sub * (doc.vatPct / 100)
}

const STATUS_VARIANT: Record<string, 'gray' | 'blue' | 'green' | 'red' | 'amber' | 'purple'> = {
  draft: 'gray', shared: 'blue', acknowledged: 'purple',
  po_received: 'amber', invoiced: 'blue', complete: 'green',
  final: 'blue', sent: 'blue', approved: 'green', rejected: 'red',
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', shared: 'Shared', acknowledged: 'Acknowledged',
  po_received: 'PO Received', invoiced: 'Invoiced', complete: 'Complete',
}

const fmt = (n: number) => n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function DashboardPage() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const { setActiveProject } = useProject()
  const { user } = useAuth()

  const [quotations, setQuotations] = useState<QuotationRow[]>([])
  const [showNewProject, setShowNewProject] = useState(false)
  const [projName, setProjName] = useState('')
  const [projDesc, setProjDesc] = useState('')

  useEffect(() => {
    try {
      const raw = readData('pl_quotations')
      if (raw) {
        const parsed = JSON.parse(raw)
        const list: QuotationRow[] = Array.isArray(parsed) ? parsed : Object.values(parsed)
        setQuotations(list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
      }
    } catch { /* ok */ }
  }, [])

  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsApi.list,
  })

  const createProjectMut = useMutation({
    mutationFn: () => projectsApi.create({ name: projName.trim(), description: projDesc.trim() || undefined }),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      setActiveProject(p)
      setShowNewProject(false)
      setProjName('')
      setProjDesc('')
    },
  })

  const totalValue = quotations.reduce((s, q) => s + calcTotal(q), 0)
  const inProgress = quotations.filter(q => ['draft', 'shared', 'acknowledged', 'final'].includes(q.status))
  const won = quotations.filter(q => ['po_received', 'invoiced', 'complete'].includes(q.status))
  const wonValue = won.reduce((s, q) => s + calcTotal(q), 0)
  const winRate = quotations.length > 0 ? Math.round((won.length / quotations.length) * 100) : 0

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = user?.full_name?.split(' ')[0] ?? user?.email?.split('@')[0] ?? 'there'

  const recent = quotations.slice(0, 5)

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1>{greeting}, {firstName}</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {quotations.length} quotation{quotations.length !== 1 ? 's' : ''} · {projects?.length ?? 0} project{(projects?.length ?? 0) !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => setShowNewProject(v => !v)}>
            <Plus className="w-4 h-4" />
            New project
          </Button>
          <Button variant="primary" onClick={() => nav('/quotations/new')}>
            <Plus className="w-4 h-4" />
            New quotation
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-blue-500" />
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Total Pipeline</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">AED {fmt(totalValue)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{quotations.length} quotation{quotations.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">In Progress</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{inProgress.length}</p>
          <p className="text-xs text-gray-400 mt-0.5">Draft · Shared · Acknowledged</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">PO Received / Won</span>
          </div>
          <p className="text-2xl font-bold text-green-700">AED {fmt(wonValue)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{won.length} quotation{won.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-purple-400" />
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Win Rate</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{winRate}%</p>
          <p className="text-xs text-gray-400 mt-0.5">{won.length} of {quotations.length} won</p>
        </div>
      </div>

      {/* New project form */}
      {showNewProject && (
        <Card className="mb-5 border-blue-200">
          <div className="flex items-center justify-between mb-4">
            <h3>Create project</h3>
            <button onClick={() => setShowNewProject(false)} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Project name *</label>
              <input
                className="input-base"
                placeholder="e.g. Hydraulic System Overhaul Q2"
                value={projName}
                onChange={e => setProjName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && projName.trim() && createProjectMut.mutate()}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <textarea
                className="input-base resize-none"
                rows={2}
                placeholder="Optional description"
                value={projDesc}
                onChange={e => setProjDesc(e.target.value)}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setShowNewProject(false)}>Cancel</Button>
              <Button
                variant="primary"
                loading={createProjectMut.isPending}
                disabled={!projName.trim()}
                onClick={() => createProjectMut.mutate()}
              >
                Create project
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Recent quotations */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Recent Quotations</p>
        <button
          onClick={() => nav('/quotations')}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
        >
          View all <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {isLoading && <div className="flex justify-center py-16"><Spinner size="lg" /></div>}

      {!isLoading && quotations.length === 0 && (
        <EmptyState
          title="No quotations yet"
          description="Create your first quotation to start tracking your sales pipeline."
          action={
            <Button variant="primary" onClick={() => nav('/quotations/new')}>
              <Plus className="w-4 h-4" />
              Create first quotation
            </Button>
          }
        />
      )}

      {recent.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Quotation No.</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Customer</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Date</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Amount (AED)</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Stage</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {recent.map(q => (
                <tr
                  key={q.id}
                  className="border-b border-gray-100 last:border-0 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => nav(`/quotations/${q.id}`)}
                >
                  <td className="px-4 py-3 font-mono font-semibold text-blue-700">{q.quotationNo}</td>
                  <td className="px-4 py-3 text-gray-800">{q.customerName || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{q.date ? formatDate(q.date) : '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">
                    {calcTotal(q).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={STATUS_VARIANT[q.status] ?? 'gray'}>
                      {STATUS_LABEL[q.status] ?? q.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => nav(`/quotations/${q.id}`)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
