import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'

export interface Stats {
  queue_depth: number
  in_progress: number
  succeeded: number
  failed: number
  dead_letter: number
  pending: number
}

export function useMetrics() {
  return useQuery<Stats>({
    queryKey: ['stats'],
    queryFn: async () => {
      const resp = await api.get<Stats>('/stats')
      return resp.data
    },
    staleTime: 5000,
    refetchInterval: 5000, // Auto-refresh every 5 seconds
  })
}
