import { useEffect, useState } from 'react';

// Long press (or right click) on any element carrying data-info="Title|Text" shows source and definition.
// The same information is always reachable elsewhere by a plain tap: the gesture is a shortcut, never the only way.
export function useLongPress() {
  const [tip, setTip] = useState(null);
  useEffect(() => {
    let timer = 0, hide = 0;
    const show = el => {
      const [title, text] = el.dataset.info.split('|');
      const r = el.getBoundingClientRect();
      setTip({ title, text, x: Math.max(12, Math.min(innerWidth - 272, r.left)), y: Math.max(12, r.top - 100) });
      navigator.vibrate?.(8);
      clearTimeout(hide); hide = setTimeout(() => setTip(null), 2600);
    };
    const down = e => { const el = e.target.closest?.('[data-info]'); if (el) timer = setTimeout(() => show(el), 480); };
    const cancel = () => clearTimeout(timer);
    const ctx = e => { const el = e.target.closest?.('[data-info]'); if (el) { e.preventDefault(); show(el); } };
    const scroll = () => { clearTimeout(timer); setTip(null); };
    addEventListener('pointerdown', down);
    addEventListener('pointerup', cancel);
    addEventListener('pointercancel', cancel);
    addEventListener('contextmenu', ctx);
    addEventListener('scroll', scroll, { passive: true });
    return () => { removeEventListener('pointerdown', down); removeEventListener('pointerup', cancel); removeEventListener('pointercancel', cancel); removeEventListener('contextmenu', ctx); removeEventListener('scroll', scroll); clearTimeout(timer); clearTimeout(hide); };
  }, []);
  return tip;
}
