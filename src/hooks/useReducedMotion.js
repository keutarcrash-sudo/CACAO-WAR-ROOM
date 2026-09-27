import { useEffect, useState } from 'react';

export function useReducedMotion() {
  const q = '(prefers-reduced-motion: reduce)';
  const [rm, setRm] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q), on = () => setRm(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return rm;
}
