import { useCallback, useEffect, useRef, useState } from 'react';

// Loads `fn` now and every `everyMs` while the page is visible. `reload()` forces a refresh.
export function usePolling(fn, everyMs, deps = [], { enabled = true } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: enabled });
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const runRef = useRef(() => {});

  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true, timer = 0;
    const run = async () => {
      clearTimeout(timer);
      try {
        const data = await fnRef.current();
        if (alive) setState({ data, error: null, loading: false });
      } catch (e) {
        if (alive) setState(s => ({ data: s.data, error: e, loading: false }));
      }
      if (alive && !document.hidden) timer = setTimeout(run, everyMs);
    };
    runRef.current = run;
    const onVis = () => { if (!document.hidden) run(); else clearTimeout(timer); };
    setState(s => ({ ...s, loading: true }));
    run();
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; clearTimeout(timer); document.removeEventListener('visibilitychange', onVis); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  const reload = useCallback(() => runRef.current(), []);
  const set = useCallback(updater => setState(s => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater })), []);
  return { ...state, reload, set };
}
