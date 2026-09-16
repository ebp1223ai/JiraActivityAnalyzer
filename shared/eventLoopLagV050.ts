export function monitorEventLoopV050(report: (sample: { lagMs: number; severity: 'SAMPLE' | 'WARNING' | 'FAIL'; measuredAtUtc: string }) => void) {
  const interval = 250;
  let expected = performance.now() + interval;
  const timer = setInterval(() => {
    const now = performance.now(), lagMs = Math.max(0, now - expected);
    expected = now + interval;
    if (lagMs > 250) report({ lagMs, severity: lagMs > 2000 ? 'FAIL' : lagMs > 500 ? 'WARNING' : 'SAMPLE', measuredAtUtc: new Date().toISOString() });
  }, interval);
  (timer as unknown as { unref?: () => void }).unref?.();
  return () => clearInterval(timer);
}
