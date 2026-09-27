import { useEffect, useRef, useState } from 'react';

// Loads `fn` now and every `everyMs` while the page is visible.
export function usePolling(fn, everyMs, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let alive = true, timer = 0;
    const run = async () => {
      clearTimeout(timer);
      try {
        const data = await fnRef.current();
        if (alive) setState({ data, error: null, loading: false });
      } catch (e) {
        if (alive) setState(s => ({ data: s.data, error: String(e.message || e), loading: false }));
      }
      if (alive && !document.hidden) timer = setTimeout(run, everyMs);
    };
    const onVis = () => { if (!document.hidden) run(); else clearTimeout(timer); };
    setState(s => ({ ...s, loading: true }));
    run();
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; clearTimeout(timer); document.removeEventListener('visibilitychange', onVis); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
