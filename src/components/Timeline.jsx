import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon.jsx';
import { hhmm, dateShort } from '../lib/format.js';

const CAT = { MARKET: 'Marché', LIQUIDITY: 'Liquidité', RISK: 'Risque', TRADE: 'Trade', SYSTEM: 'Système' };

// Market Story: the stored events, newest first. The line draws itself when the section enters the screen.
export function Timeline({ alerts, onOpen }) {
  const ref = useRef(null);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) return undefined;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setDrawn(true); io.disconnect(); } }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section className="story-line" ref={ref}>
      <header className="section-head">
        <h2>Market Story</h2>
        <span className="meta">{alerts.length ? `${alerts.length} événements` : 'en attente'}</span>
      </header>
      {!alerts.length && <p className="empty">Les événements s’inscriront ici : mouvements forts, niveaux pris, stop proche, entrées, source hors ligne.</p>}
      <ol className={`tl ${drawn ? 'draw' : ''}`}>
        {alerts.length > 0 && <li className="tl-now">Maintenant</li>}
        {alerts.map((a, i) => (
          <li key={a.id} style={{ '--i': Math.min(i, 8) }} className={`lvl-${a.level.toLowerCase()}`}>
            <span className="tl-pt" aria-hidden="true" />
            <button onClick={() => onOpen(a)}>
              <span className="tl-t num">{dateShort(a.at)} · {hhmm(a.at)} · {CAT[a.category] || a.category}</span>
              <span className="tl-m"><Icon name={a.category} size={14} /> {a.title}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function AlertDetail({ alert }) {
  if (!alert) return null;
  return (
    <>
      <p className="eyebrow">{CAT[alert.category] || alert.category} · {new Date(alert.at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}</p>
      <h2 id="sheet-title">{alert.title}</h2>
      {alert.message && <p className="sheet-lead">{alert.message}</p>}
      <dl className="facts">
        <div><dt>Niveau</dt><dd className={`lvl-text-${alert.level.toLowerCase()}`}>{alert.level}</dd></div>
        <div><dt>Importance</dt><dd className="num">{alert.importance} / 100</dd></div>
        <div><dt>Source</dt><dd>{alert.source || '—'}</dd></div>
        <div><dt>Telegram</dt><dd>Pas encore branché (phase 3)</dd></div>
      </dl>
    </>
  );
}
