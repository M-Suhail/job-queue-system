export function timeAgo(iso?: string) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const sec = Math.round(diff / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m`
  const hr = Math.round(min / 60)
  return `${hr}h`
}
