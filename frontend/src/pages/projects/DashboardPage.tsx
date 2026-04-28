import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, X, FolderOpen, Users, Calendar,
  Clock, CheckCircle2, AlertCircle, ArrowRight,
} from 'lucide-react'
import { requirementsApi, projectsApi } from '@/api'
import { useProject } from '@/context/ProjectContext'
import { useAuth } from '@/context/AuthContext'
import { Card, Button, Badge, EmptyState, Spinner } from '@/components/ui'
import { formatDate } from '@/lib/utils'
import type { Requirement, Project } from '@/types'

// ── helpers ──────────────────────────────────────────────────────
function calcStats(reqs: Requirement[]) {
  return {
    total:      reqs.length,
    drafts:     reqs.filter(r => ['draft', 'submitted'].includes(r.status)).length,
    inProgress: reqs.filter(r => ['rfq_sent', 'quotes_received', 'quote_ready'].includes(r.status)).length,
    approved:   reqs.filter(r => ['approved', 'po_raised', 'invoiced', 'completed'].includes(r.status)).length,
  }
}

// ── Project card ──────────────────────────────────────────────────
function ProjectCard({
  project, reqs, isActive, onSetActive, onNewReq, onView,
}: {
  project: Project
  reqs: Requirement[]
  isActive: boolean
  onSetActive: () => void
  onNewReq: () => void
  onView: () => void
}) {
  const stats = calcStats(reqs)
  const latest = reqs[0]

  return (
    <Card
      className={`flex flex-col gap-3 transition-all hover:shadow-sm ${
        isActive ? 'border-blue-300 bg-blue-50/20' : 'hover:border-blue-200'
      }`}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div
          className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-sm font-bold ${
            project.status === 'active' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
          }`}
        >
          {project.name[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-gray-900 truncate">{project.name}</p>
            {isActive && <Badge variant="blue">Active</Badge>}
            <Badge variant={project.status === 'active' ? 'green' : 'gray'}>{project.status}</Badge>
          </div>
          {project.description && (
            <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{project.description}</p>
          )}
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" />{project.members.length} member{project.members.length !== 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />{formatDate(project.created_at)}
            </span>
          </div>
        </div>
      </div>

      {/* Per-project requirement stats */}
      {stats.total > 0 ? (
        <div className="grid grid-cols-4 gap-1.5">
          <div className="bg-gray-50 rounded-lg p-2 text-center">
            <p className="text-base font-bold text-gray-800">{stats.total}</p>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Total</p>
          </div>
          <div className="bg-amber-50 rounded-lg p-2 text-center">
            <p className="text-base font-bold text-amber-700">{stats.inProgress}</p>
            <p className="text-[10px] text-amber-500 uppercase tracking-wide">Active</p>
          </div>
          <div className="bg-green-50 rounded-lg p-2 text-center">
            <p className="text-base font-bold text-green-700">{stats.approved}</p>
            <p className="text-[10px] text-green-500 uppercase tracking-wide">Approved</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-2 text-center">
            <p className="text-base font-bold text-blue-700">{stats.drafts}</p>
            <p className="text-[10px] text-blue-500 uppercase tracking-wide">Draft</p>
          </div>
        </div>
      ) : (
        <div className="py-2 text-center text-xs text-gray-400 bg-gray-50 rounded-lg">
          No requirements yet
        </div>
      )}

      {/* Most recent requirement */}
      {latest && (
        <div className="border-t border-gray-100 pt-2.5">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Latest</p>
          <p className="text-xs font-medium text-gray-700 truncate">{latest.title}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">{formatDate(latest.created_at)}</p>
        </div>
      )}

      {/* Card footer actions */}
      <div className="flex items-center gap-2 border-t border-gray-100 pt-2.5">
        {!isActive && (
          <button
            onClick={onSetActive}
            className="text-xs text-gray-400 hover:text-blue-600 transition-colors"
          >
            Set active
          </button>
        )}
        <div className="ml-auto flex gap-2">
          <button
            onClick={onNewReq}
            className="flex items-center gap-1 text-xs text-gray-600 border border-gray-200 hover:border-blue-300 hover:text-blue-700 rounded-lg px-2.5 py-1.5 transition-colors"
          >
            <Plus className="w-3 h-3" />
            New req
          </button>
          <button
            onClick={onView}
            className="flex items-center gap-1 text-xs text-white bg-blue-600 hover:bg-blue-700 rounded-lg px-2.5 py-1.5 transition-colors"
          >
            View all
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </Card>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────
export default function DashboardPage() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const { activeProject, setActiveProject } = useProject()
  const { user } = useAuth()

  const [showNewProject, setShowNewProject] = useState(false)
  const [projName, setProjName] = useState('')
  const [projDesc, setProjDesc] = useState('')

  const isAdmin = user?.org_role === 'org-admin' || user?.org_role === 'super-admin'

  // Greeting
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = user?.full_name?.split(' ')[0] ?? user?.email?.split('@')[0] ?? 'there'

  // All projects
  const { data: projects, isLoading: loadingProjects } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsApi.list,
  })

  // Requirements for every project — parallel
  const reqResults = useQueries({
    queries: (projects ?? []).map(p => ({
      queryKey: ['requirements', p.id],
      queryFn:  () => requirementsApi.list(p.id),
      staleTime: 30_000,
    })),
  })

  const reqByProject: Record<string, Requirement[]> = {}
  ;(projects ?? []).forEach((p, i) => {
    reqByProject[p.id] = reqResults[i]?.data ?? []
  })

  const allReqs     = Object.values(reqByProject).flat()
  const loadingReqs = reqResults.some(r => r.isLoading)
  const isLoading   = loadingProjects || loadingReqs

  // Org-wide stats (admin only)
  const orgStats = {
    totalProjects:   projects?.length ?? 0,
    openRFQs:        allReqs.filter(r => r.status === 'rfq_sent').length,
    pendingApproval: allReqs.filter(r => r.status === 'quote_ready').length,
    completed:       allReqs.filter(r => ['invoiced', 'completed'].includes(r.status)).length,
  }

  const createProjectMut = useMutation({
    mutationFn: () =>
      projectsApi.create({ name: projName.trim(), description: projDesc.trim() || undefined }),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      setActiveProject(p)
      setShowNewProject(false)
      setProjName('')
      setProjDesc('')
    },
  })

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1>{greeting}, {firstName}</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {isAdmin
              ? `Org admin · ${orgStats.totalProjects} project${orgStats.totalProjects !== 1 ? 's' : ''}`
              : `${projects?.length ?? 0} project${(projects?.length ?? 0) !== 1 ? 's' : ''}`}
          </p>
        </div>
        <Button variant="primary" onClick={() => setShowNewProject(v => !v)}>
          <Plus className="w-4 h-4" />
          New project
        </Button>
      </div>

      {/* ── Admin org-wide KPIs ── */}
      {isAdmin && !isLoading && allReqs.length > 0 && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <FolderOpen className="w-4 h-4 text-gray-400" />
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Projects</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{orgStats.totalProjects}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Open RFQs</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{orgStats.openRFQs}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Pending approval</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{orgStats.pendingApproval}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Completed</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{orgStats.completed}</p>
          </div>
        </div>
      )}

      {/* ── Create project form ── */}
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

      {/* ── Loading ── */}
      {isLoading && <div className="flex justify-center py-16"><Spinner size="lg" /></div>}

      {/* ── Empty ── */}
      {!isLoading && (!projects || projects.length === 0) && (
        <EmptyState
          title="No projects yet"
          description="Create your first project to start managing procurement requirements."
          action={
            <Button variant="primary" onClick={() => setShowNewProject(true)}>
              <Plus className="w-4 h-4" />
              Create first project
            </Button>
          }
        />
      )}

      {/* ── Projects grid ── */}
      {!isLoading && projects && projects.length > 0 && (
        <>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            {isAdmin ? 'All projects' : 'Your projects'} &nbsp;·&nbsp; {projects.length}
          </p>
          <div className="grid grid-cols-2 gap-4">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                reqs={reqByProject[project.id] ?? []}
                isActive={activeProject?.id === project.id}
                onSetActive={() => setActiveProject(project)}
                onNewReq={() => { setActiveProject(project); nav('/submit') }}
                onView={() => nav(`/projects/${project.id}`)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
