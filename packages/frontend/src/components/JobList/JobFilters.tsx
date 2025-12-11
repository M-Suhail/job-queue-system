import { useState } from 'react'

export default function JobFilters({ onChange }: { onChange?: (filters: Record<string, string>) => void }) {
  const [showAdvanced, setShowAdvanced] = useState(false)

  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-center flex-wrap">
        <input 
          className="px-2 py-1 border rounded" 
          placeholder="Search by id, type, or payload" 
          onChange={(e) => onChange?.({ q: e.target.value })} 
        />
        <select className="px-2 py-1 border rounded cursor-pointer" onChange={(e) => onChange?.({ status: e.target.value })}>
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In progress</option>
          <option value="succeeded">Succeeded</option>
          <option value="failed">Failed</option>
          <option value="dead_letter">Dead letter</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="px-2 py-1 text-sm text-slate-600 hover:text-slate-800 cursor-pointer"
        >
          {showAdvanced ? '▼ Hide Filters' : '▶ More Filters'}
        </button>
      </div>
      
      {showAdvanced && (
        <div className="flex gap-2 items-center flex-wrap p-3 bg-slate-50 rounded">
          <div className="flex items-center gap-1">
            <label className="text-xs text-slate-600">Created after:</label>
            <input
              type="datetime-local"
              className="px-2 py-1 text-sm border rounded"
              onChange={(e) => onChange?.({ created_after: e.target.value ? new Date(e.target.value).toISOString() : '' })}
            />
          </div>
          <div className="flex items-center gap-1">
            <label className="text-xs text-slate-600">Created before:</label>
            <input
              type="datetime-local"
              className="px-2 py-1 text-sm border rounded"
              onChange={(e) => onChange?.({ created_before: e.target.value ? new Date(e.target.value).toISOString() : '' })}
            />
          </div>
          <div className="flex items-center gap-1">
            <label className="text-xs text-slate-600">Min attempts:</label>
            <input
              type="number"
              min="0"
              max="100"
              className="px-2 py-1 text-sm border rounded w-16"
              placeholder="0"
              onChange={(e) => onChange?.({ min_attempts: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-1">
            <label className="text-xs text-slate-600">Max attempts:</label>
            <input
              type="number"
              min="0"
              max="100"
              className="px-2 py-1 text-sm border rounded w-16"
              placeholder="∞"
              onChange={(e) => onChange?.({ max_attempts: e.target.value })}
            />
          </div>
        </div>
      )}
    </div>
  )
}
