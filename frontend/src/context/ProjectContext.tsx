import { createContext, useContext, useState, ReactNode } from 'react'
import type { Project } from '@/types'

interface ProjectContextType {
  activeProject: Project | null
  setActiveProject: (p: Project | null) => void
}

const ProjectContext = createContext<ProjectContextType | null>(null)

export function ProjectProvider({ children }: { children: ReactNode }) {
  const stored = localStorage.getItem('pl_active_project')
  const [activeProject, setActiveProjectState] = useState<Project | null>(
    stored ? JSON.parse(stored) : null
  )

  const setActiveProject = (p: Project | null) => {
    setActiveProjectState(p)
    if (p) localStorage.setItem('pl_active_project', JSON.stringify(p))
    else localStorage.removeItem('pl_active_project')
  }

  return (
    <ProjectContext.Provider value={{ activeProject, setActiveProject }}>
      {children}
    </ProjectContext.Provider>
  )
}

export function useProject() {
  const ctx = useContext(ProjectContext)
  if (!ctx) throw new Error('useProject must be inside ProjectProvider')
  return ctx
}
