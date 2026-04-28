import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, FolderOpen, Users, ArrowRight } from 'lucide-react'
import { projectsApi } from '@/api'
import { useProject } from '@/context/ProjectContext'
import { Card, Button, Badge, Spinner, EmptyState } from '@/components/ui'
import { formatDate } from '@/lib/utils'

export default function ProjectsPage() {
  const qc = useQueryClient()
  const nav = useNavigate()
  const { activeProject, setActiveProject } = useProject()
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')

  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsApi.list,
  })

  const createMut = useMutation({
    mutationFn: () => projectsApi.create({ name, description: desc }),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      setActiveProject(p)
      setShowForm(false)
      setName('')
      setDesc('')
    },
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1>Projects</h1>
        <Button variant="primary" onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4" />
          New project
        </Button>
      </div>

      {showForm && (
        <Card className="mb-4 border-blue-200">
          <h3 className="mb-4">Create project</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Project name *</label>
              <input
                className="input-base"
                placeholder="e.g. Hydraulic System Overhaul Q2"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <textarea
                className="input-base resize-none"
                rows={2}
                placeholder="Optional description"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button
                variant="primary"
                loading={createMut.isPending}
                disabled={!name.trim()}
                onClick={() => createMut.mutate()}
              >
                Create project
              </Button>
            </div>
          </div>
        </Card>
      )}

      {isLoading && <div className="flex justify-center py-12"><Spinner size="lg" /></div>}

      {!isLoading && (!projects || projects.length === 0) && (
        <EmptyState title="No projects yet" description="Create your first project to start managing procurement." />
      )}

      <div className="flex flex-col gap-3">
        {projects?.map((p) => (
          <Card
            key={p.id}
            className={`cursor-pointer transition-all hover:shadow-sm ${
              activeProject?.id === p.id
                ? 'border-blue-400 bg-blue-50/30'
                : 'hover:border-blue-200'
            }`}
            onClick={() => nav(`/projects/${p.id}`)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <FolderOpen className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{p.name}</p>
                  {p.description && (
                    <p className="text-xs text-gray-400 mt-0.5">{p.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="flex items-center gap-1 text-xs text-gray-400">
                      <Users className="w-3 h-3" />
                      {p.members.length} member{p.members.length !== 1 ? 's' : ''}
                    </span>
                    <span className="text-xs text-gray-400">Created {formatDate(p.created_at)}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {activeProject?.id === p.id && <Badge variant="blue">Active</Badge>}
                <Badge variant={p.status === 'active' ? 'green' : 'gray'}>{p.status}</Badge>
                <ArrowRight className="w-4 h-4 text-gray-300" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
