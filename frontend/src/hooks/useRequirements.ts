import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { requirementsApi } from '@/api'
import type { Requirement, LineItem } from '@/types'

const QUERY_KEY = (projectId: string) => ['requirements', projectId]
const ITEM_KEY = (projectId: string, reqId: string) => ['requirements', projectId, reqId]

export function useRequirements(projectId: string) {
  return useQuery<Requirement[]>({
    queryKey: QUERY_KEY(projectId),
    queryFn: () => requirementsApi.list(projectId),
    enabled: !!projectId,
  })
}

export function useRequirement(projectId: string, reqId: string) {
  return useQuery<Requirement>({
    queryKey: ITEM_KEY(projectId, reqId),
    queryFn: () => requirementsApi.get(projectId, reqId),
    enabled: !!projectId && !!reqId,
  })
}

export function useCreateRequirement(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { title: string; raw_text?: string; delivery_date?: string }) =>
      requirementsApi.create(projectId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY(projectId) }),
  })
}

export function useSubmitRequirement(projectId: string, reqId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => requirementsApi.submit(projectId, reqId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY(projectId) })
      qc.invalidateQueries({ queryKey: ITEM_KEY(projectId, reqId) })
    },
  })
}

export function useEditLineItems(projectId: string, reqId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (items: Partial<LineItem>[]) =>
      requirementsApi.updateItems(projectId, reqId, items),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ITEM_KEY(projectId, reqId) })
    },
  })
}
