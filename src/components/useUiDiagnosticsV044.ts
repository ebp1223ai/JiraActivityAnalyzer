import { useEffect, useRef } from 'react';

export function useUiDiagnosticsV044(route: string) {
  const previous = useRef<string | null>(null);
  useEffect(() => {
    const api = window.desktopApp?.appDiagnostics;
    if (!api) return;
    const context = { operationId: crypto.randomUUID(), spanId: crypto.randomUUID(), parentSpanId: null, route };
    let stopped = false, terminal = false, frame = 0;
    const end = (outcome: string) => { if (!terminal) { terminal = true; void api.reportRendererEvent({ event: 'navigation-shell', phase: 'END', context, outcome }); } };
    void api.reportRendererEvent({ event: 'navigation-shell', phase: 'START', context, from: previous.current, to: route }).then(() => {
      if (stopped) { end('SUPERSEDED'); return; }
      frame = requestAnimationFrame(() => end('SUCCEEDED'));
    }).catch(() => { terminal = true; });
    previous.current = route;
    const command = (event: Event) => {
      const control = event.target instanceof Element ? event.target.closest('button,summary,select,input') : null;
      if (!control || control instanceof HTMLInputElement && ['password','text','search','email'].includes(control.type)) return;
      void api.reportRendererEvent({ event: 'ui-command', route, control: control.tagName.toLowerCase(), inputType: control instanceof HTMLInputElement ? control.type : null }).catch(() => {});
    };
    document.addEventListener('click', command, true);
    return () => { stopped = true; cancelAnimationFrame(frame); end('SUPERSEDED'); document.removeEventListener('click', command, true); };
  }, [route]);
}
