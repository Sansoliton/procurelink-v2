import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { analyticsApi } from '@/api'
import { Card, CardTitle, StatTile, Spinner } from '@/components/ui'
import { formatCurrency } from '@/lib/utils'

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4']

const DEMO_SPEND = [
  { month: 'Jan', value: 12400 },
  { month: 'Feb', value: 8900 },
  { month: 'Mar', value: 15600 },
  { month: 'Apr', value: 21300 },
  { month: 'May', value: 18700 },
  { month: 'Jun', value: 24100 },
]

const DEMO_STATUS = [
  { name: 'Completed', value: 32 },
  { name: 'In progress', value: 18 },
  { name: 'Draft', value: 7 },
  { name: 'Invoiced', value: 12 },
]

export default function AnalyticsPage() {
  const { data: overview, isLoading } = useQuery({
    queryKey: ['analytics-overview'],
    queryFn: analyticsApi.overview,
  })

  return (
    <div>
      <h1 className="mb-6">Analytics</h1>

      {isLoading && <div className="flex justify-center py-16"><Spinner size="lg" /></div>}

      {overview && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <StatTile label="Total requirements" value={overview.total_requirements} />
          <StatTile label="Active projects" value={overview.active_projects} />
          <StatTile label="Total PO value" value={formatCurrency(overview.total_po_value)} sub="all time" />
          <StatTile label="Open RFQs" value={overview.open_rfqs} sub="awaiting response" />
          <StatTile label="Overdue invoices" value={overview.overdue_invoices} />
          <StatTile label="Avg cycle time" value={`${overview.avg_cycle_days.toFixed(1)} days`} sub="submit to PO" />
        </div>
      )}

      {/* Spend chart */}
      <Card className="mb-4">
        <CardTitle>Monthly spend</CardTitle>
        <p className="text-xs text-gray-400 mb-4">Total procurement spend per month (demo data)</p>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={DEMO_SPEND} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                formatter={(value: number) => [formatCurrency(value), 'Spend']}
                contentStyle={{ border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }}
              />
              <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        {/* Status distribution */}
        <Card>
          <CardTitle>Requirements by status</CardTitle>
          <p className="text-xs text-gray-400 mb-4">Demo data</p>
          <div style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={DEMO_STATUS}
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={72}
                  dataKey="value"
                  paddingAngle={3}
                >
                  {DEMO_STATUS.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {DEMO_STATUS.map((s, i) => (
              <div key={s.name} className="flex items-center gap-1.5 text-xs text-gray-500">
                <span
                  className="w-2.5 h-2.5 rounded-sm"
                  style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                />
                {s.name} ({s.value})
              </div>
            ))}
          </div>
        </Card>

        {/* Quick stats */}
        <Card>
          <CardTitle>Performance summary</CardTitle>
          <div className="flex flex-col gap-3 mt-2">
            {[
              { label: 'Avg quotes per RFQ', value: '2.8' },
              { label: 'Avg days to first quote', value: '4.2 days' },
              { label: 'Quote acceptance rate', value: '87%' },
              { label: 'On-time delivery rate', value: '91%' },
              { label: 'Invoice paid on time', value: '78%' },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                <span className="text-xs text-gray-500">{label}</span>
                <span className="text-sm font-semibold text-gray-800">{value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
