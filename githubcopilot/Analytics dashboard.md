Build the Analytics module for ProcureLink (Sprint 11).
All data scoped to current_user.org_id. No external analytics service — pure SQL aggregations.

1. backend/app/routers/analytics.py
   All endpoints require auth + filter by org_id from current_user.

   GET /analytics/overview
   Returns:
   {
     total_requirements: int,     -- all time
     active_projects: int,        -- status=active
     total_po_value: float,       -- sum of all po amounts in org
     open_rfqs: int,              -- status=sent
     overdue_invoices: int,       -- status=issued AND due_at < NOW()
     avg_cycle_days: float        -- avg days from req created to po raised
   }

   GET /analytics/spend-by-project?months=6
   Returns list: [{project_name, month: "2026-03", total_spend: float}]
   SQL: GROUP BY project_id, DATE_TRUNC('month', po.raised_at)

   GET /analytics/vendor-performance
   Returns list: [{vendor_name, rfqs_sent, rfqs_responded, avg_response_days,
                   avg_unit_price_index, win_rate_pct}]

   GET /analytics/cycle-time?months=6
   Returns list: [{month, avg_days_to_quote, avg_days_to_po, avg_days_to_payment}]

   GET /analytics/requirements-by-status
   Returns: [{status, count}] — for pie chart

2. frontend/src/pages/analytics/AnalyticsDashboard.tsx
   Uses Recharts. Role: org-admin.

   Overview stat tiles (top row):
   Total spend | Active projects | Open RFQs | Overdue invoices | Avg cycle days

   Row 1 charts:
   - BarChart: Monthly spend by project (stacked bars, one series per project)
     useSpendByProject() hook
   - LineChart: Cycle time trend (days to quote, days to PO, days to payment)
     useAnalyticsCycleTime() hook

   Row 2 charts:
   - BarChart: Vendor performance (win rate, avg response time)
     useVendorPerformance() hook
   - PieChart: Requirements by status distribution
     useRequirementsByStatus() hook

3. frontend/src/hooks/useAnalytics.ts
   useAnalyticsOverview()
   useSpendByProject(months?: number)
   useVendorPerformance()
   useAnalyticsCycleTime(months?: number)
   useRequirementsByStatus()

   All hooks use React Query with staleTime: 5 * 60 * 1000 (5min cache)

Use Recharts ResponsiveContainer for all charts.
Use shadcn Card components to wrap each chart.
Include loading skeletons while data fetches.

Show all files in full.