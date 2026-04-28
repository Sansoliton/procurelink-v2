import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft, ArrowRight, Plus, Users, Calendar,
  ClipboardList, Clock, CheckCircle2, FileCheck,
} from 'lucide-react'
import { projectsApi, requirementsApi } from '@/api'
import { useProject } from '@/context/ProjectContext'
import { Card, Badge, Button, StatusBadge, EmptyState, Spinner } from '@/components/ui'
import { formatDate } from '@/lib/utils'
import type { Requirement } from '@/types'

function getRequirementRoute(req: Requirement): string {
  if (['invoiced', 'completed'].includes(req.status)) return `/requirement/${req.id}/invoice`
  if (req.status === 'po_raised') return `/requirement/${req.id}/po`
  return `/requirement/${req.id}/quote`
}

const STATUS_LEFT_BORDER: Record<string, string> = {
  draft:           'border-l-gray-300',
  submitted:       'border-l-blue-400',
  rfq_sent:        'border-l-purple-400',
  quotes_received: 'border-l-amber-400',
  quote_ready:     'border-l-amber-500',
  approved:        'border-l-green-400',
  po_raised:       'border-l-green-500',
  invoiced:        'border-l-green-600',
  completed:       'border-l-green-700',
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const { activeProject, setActiveProject } = useProject()

  const { data: project, isLoading: loadingProject } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsApi.get(id!),
    enabled: !!id,
  })

  const { data: requirements, isLoading: loadingReqs } = useQuery({
    queryKey: ['requirements', id],
    queryFn: () => requirementsApi.list(id!),
    enabled: !!id,
  })

  const isLoading = loadingProject || loadingReqs

  if (isLoading) {
    return <div className="flex justify-center py-16"><Spinner size="lg" /></div>
  }

  if (!project) {
    return <p className="text-sm text-gray-400">Project not found.</p>
  }

  const total = requirements?.length ?? 0
  const inProgress = requirements?.filter(r =>
    ['rfq_sent', 'quotes_received', 'quote_ready'].includes(r.status)
  ).length ?? 0
  const approved = requirements?.filter(r =>
    ['approved', 'po_raised', 'invoiced', 'completed'].includes(r.status)
  ).length ?? 0
  const drafts = requirements?.filter(r =>
    ['draft', 'submitted'].includes(r.status)
  ).length ?? 0

  const isActive = activeProject?.id === project.id

  function handleSetActive() {
    setActiveProject(project ?? null)
    nav('/')
  }

  function handleNewReq() {
    setActiveProject(project ?? null)
    nav('/submit')
  }

  return (
    <div>
      {/* Back + header */}
      <button
        onClick={() => nav(-1)}
        className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 mb-5 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      <div className="flex items-start justify-between mb-6 gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <span className="text-blue-700 text-base font-bold">{project.name[0]?.toUpperCase()}</span>
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl">{project.name}</h1>
              <Badge variant={project.status === 'active' ? 'green' : 'gray'}>{project.status}</Badge>
              {isActive && <Badge variant="blue">Active project</Badge>}
            </div>
            {project.description && (
              <p className="text-sm text-gray-400 mt-0.5">{project.description}</p>
            )}
            <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                {project.members.length} member{project.members.length !== 1 ? 's' : ''}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                Created {formatDate(project.created_at)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-2 flex-shrink-0">
          {!isActive && (
            <Button variant="ghost" onClick={handleSetActive}>
              Set as active
            </Button>
          )}
          <Button variant="primary" onClick={handleNewReq}>
            <Plus className="w-4 h-4" />
            New requirement
          </Button>
        </div>
      </div>

      {/* KPI stats */}
      {total > 0 && (
        <div className="grid grid-cols-4 gap-3 mb-5">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <ClipboardList className="w-4 h-4 text-gray-400" />
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Total</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{total}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">In progress</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{inProgress}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Approved</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{approved}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <FileCheck className="w-4 h-4 text-blue-400" />
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Drafts</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{drafts}</p>
          </div>
        </div>
      )}

      {/* Requirements list */}
      <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
        Requirements
      </h2>

      {requirements?.length === 0 && (
        <EmptyState
          title="No requirements yet"
          description="Submit the first procurement requirement for this project."
          action={
            <Button variant="primary" onClick={handleNewReq}>
              <Plus className="w-4 h-4" />
              New requirement
            </Button>
          }
        />
      )}

      <div className="flex flex-col gap-2.5">
        {requirements?.map((req) => (
          <Card
            key={req.id}
            className={`hover:border-blue-200 cursor-pointer transition-all hover:shadow-sm border-l-4 ${STATUS_LEFT_BORDER[req.status] ?? 'border-l-gray-200'}`}
            onClick={() => nav(getRequirementRoute(req))}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{req.title}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {req.line_items.length} item{req.line_items.length !== 1 ? 's' : ''}
                  {req.delivery_date && ` · Due ${formatDate(req.delivery_date)}`}
                  {' · '}Created {formatDate(req.created_at)}
                </p>
                {req.line_items.length > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {req.line_items.slice(0, 2).map((i) => i.description).join(', ')}
                    {req.line_items.length > 2 && ` +${req.line_items.length - 2} more`}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <StatusBadge status={req.status} />
                <ArrowRight className="w-4 h-4 text-gray-300" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
