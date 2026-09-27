import { useEffect, useRef, useState } from 'react';

// Bottom sheet: slides up, closes on backdrop tap, Escape, the close button or a swipe down.
export function Sheet({ open, onClose, children }) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const panel = useRef(null);
  const startY = useRef(0);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(r);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), 380);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = e => e.key === 'Escape' && onClose();
    addEventListener('keydown', onKey);
    const f = setTimeout(() => panel.current?.querySelector('.sheet-close')?.focus({ preventScroll: true }), 60);
    return () => { removeEventListener('keydown', onKey); clearTimeout(f); };
  }, [open, onClose]);

  if (!mounted) return null;
  return (
    <>
      <div className={`scrim ${shown ? 'open' : ''}`} onClick={onClose} />
      <div
        ref={panel}
        className={`sheet ${shown ? 'open' : ''}`}
        role="dialog" aria-modal="true" aria-labelledby="sheet-title"
        onTouchStart={e => { startY.current = e.touches[0].clientY; }}
        onTouchEnd={e => { if (panel.current.scrollTop <= 0 && e.changedTouches[0].clientY - startY.current > 90) onClose(); }}
      >
        <div className="grab" aria-hidden="true" />
        <button className="sheet-close" onClick={onClose} aria-label="Fermer">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M4 4l10 10M14 4 4 14" /></svg>
        </button>
        {children}
      </div>
    </>
  );
}
