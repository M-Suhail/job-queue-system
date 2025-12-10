import { useState } from 'react'
import { pauseQueue, resumeQueue } from '../api/client'

export default function Controls() {
  const [paused, setPaused] = useState(false)
  async function onPause() {
    await pauseQueue()
    setPaused(true)
  }
  async function onResume() {
    await resumeQueue()
    setPaused(false)
  }
  return (
    <div className="flex items-center gap-2">
      {paused ? (
        <button onClick={onResume} className="px-3 py-1 bg-green-600 text-white rounded cursor-pointer hover:bg-green-700">Resume</button>
      ) : (
        <button onClick={onPause} className="px-3 py-1 bg-yellow-500 text-white rounded cursor-pointer hover:bg-yellow-600">Pause</button>
      )}
    </div>
  )
}
