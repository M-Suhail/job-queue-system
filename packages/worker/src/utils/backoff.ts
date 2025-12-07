export function backoffSeconds(attempts: number): number {
  const base = 5;
  const cap = 3600;
  const secs = Math.pow(2, attempts) * base;
  const jitter = secs * 0.1 * (Math.random() * 2 - 1);
  return Math.max(1, Math.min(cap, Math.round(secs + jitter)));
}
