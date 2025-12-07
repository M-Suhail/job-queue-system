import { backoffSeconds } from '../../packages/worker/src/utils/backoff';

describe('backoffSeconds', () => {
  test('returns >=1 second for attempt 0', () => {
    const secs = backoffSeconds(0);
    expect(typeof secs).toBe('number');
    expect(secs).toBeGreaterThanOrEqual(1);
  });

  test('increases with attempts and caps', () => {
    const a1 = backoffSeconds(1);
    const a2 = backoffSeconds(3);
    expect(a2).toBeGreaterThanOrEqual(a1);

    const large = backoffSeconds(20); // should cap at <= 3600
    expect(large).toBeLessThanOrEqual(3600);
  });

  test('jitter keeps value integer and >=1', () => {
    const val = backoffSeconds(2);
    expect(Number.isInteger(val)).toBe(true);
    expect(val).toBeGreaterThanOrEqual(1);
  });
});
