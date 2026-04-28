import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { FolderOpen, Archive, Activity } from 'lucide-react'
import { projectsApi } from '@/api'
import { useProject } from '@/context/ProjectContext'
import { Spinner, EmptyState } from '@/components/ui'
import ProjectsGridList from '@/components/ProjectsGridList'
import type { Project } from '@/types'

export default function ProjectsShowcasePage() {
  const nav = useNavigate()
  const { activeProject } = useProject()
  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsApi.list,
  })

  const active = projects?.filter((p) => p.status === 'active').length ?? 0
  const archived = projects?.filter((p) => p.status === 'archived').length ?? 0

  function handleProjectClick(p: Project) {
    nav(`/projects/${p.id}`)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-blue-600" />
            All Projects
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {projects?.length ?? 0} project{(projects?.length ?? 0) !== 1 ? 's' : ''} in your organisation
          </p>
        </div>
        {activeProject && (
          <div className="flex items-center gap-2 text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-1.5">
            <Activity className="w-3.5 h-3.5 text-blue-500" />
            Active: <span className="font-semibold text-blue-700">{activeProject.name}</span>
          </div>
        )}
      </div>

      {/* Stats row */}
      {!isLoading && (projects?.length ?? 0) > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Total</p>
            <p className="text-2xl font-bold text-gray-900">{projects?.length ?? 0}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Active</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">{active}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Archive className="w-3.5 h-3.5 text-gray-400" />
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Archived</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">{archived}</p>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      )}

      {!isLoading && (!projects || projects.length === 0) && (
        <EmptyState
          title="No projects yet"
          description="Create your first project from the Dashboard to get started."
        />
      )}

      {!isLoading && projects && projects.length > 0 && (
        <ProjectsGridList
          projects={projects}
          onProjectClick={handleProjectClick}
        />
      )}

    </div>
  )
}
