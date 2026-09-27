import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../hooks/useReducedMotion.js';

// Animated number: rolls from the previous value and flashes the direction of the change.
export function Num({ value, format, className = '', dur = 600 }) {
  const rm = useReducedMotion();
  const [shown, setShown] = useState(value);
  const [flash, setFlash] = useState('');
  const prev = useRef(value);

  useEffect(() => {
    const from = prev.current, to = value;
    prev.current = value;
    if (from == null || to == null || from === to || rm) { setShown(to); return; }
    setFlash(to > from ? 'flash-up' : 'flash-down');
    const t0 = performance.now();
    let raf = 0;
    const step = now => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      setShown(from + (to - from) * e);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    const clear = setTimeout(() => setFlash(''), 950);
    return () => { cancelAnimationFrame(raf); clearTimeout(clear); };
  }, [value, rm, dur]);

  return <span className={`num ${flash} ${className}`}>{format(shown)}</span>;
}
