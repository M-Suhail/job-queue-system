import { useMetrics } from '../hooks/useMetrics'

export default function MetricsPanel() {
  const { data, isLoading, isError } = useMetrics()
  
  if (isLoading) {
    return (
      <div className="bg-white p-4 rounded shadow">
        <h4 className="font-medium mb-2">Metrics</h4>
        <div className="text-sm text-slate-500">Loading...</div>
      </div>
    )
  }
  
  if (isError) {
    return (
      <div className="bg-white p-4 rounded shadow">
        <h4 className="font-medium mb-2">Metrics</h4>
        <div className="text-sm text-red-500">Failed to load metrics</div>
      </div>
    )
  }
  
  return (
    <div className="bg-white p-4 rounded shadow">
      <h4 className="font-medium mb-2">Metrics</h4>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="p-2 border rounded">
          <div className="text-slate-500">Queue depth</div>
          <div className="text-lg font-semibold">{data?.queue_depth ?? 0}</div>
        </div>
        <div className="p-2 border rounded">
          <div className="text-slate-500">Pending</div>
          <div className="text-lg font-semibold">{data?.pending ?? 0}</div>
        </div>
        <div className="p-2 border rounded">
          <div className="text-slate-500">In progress</div>
          <div className="text-lg font-semibold text-blue-600">{data?.in_progress ?? 0}</div>
        </div>
        <div className="p-2 border rounded">
          <div className="text-slate-500">Succeeded</div>
          <div className="text-lg font-semibold text-green-600">{data?.succeeded ?? 0}</div>
        </div>
        <div className="p-2 border rounded">
          <div className="text-slate-500">Failed</div>
          <div className="text-lg font-semibold text-amber-600">{data?.failed ?? 0}</div>
        </div>
        <div className="p-2 border rounded">
          <div className="text-slate-500">Dead letter</div>
          <div className="text-lg font-semibold text-red-600">{data?.dead_letter ?? 0}</div>
        </div>
      </div>
    </div>
  )
}
