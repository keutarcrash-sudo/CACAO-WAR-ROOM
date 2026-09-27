import { useEffect, useRef, useState } from 'react';

// The War Room status, centerpiece of the interface. Shape + word + colour for every state.
export const STATES = {
  NO_SETUP: { label: 'Aucun setup', sub: 'Rien à faire', color: 'var(--none)', shape: 'hollow' },
  WATCHING: { label: 'Sous surveillance', sub: 'Watching', color: 'var(--watch)', shape: 'quarter' },
  DEVELOPING: { label: 'Setup en formation', sub: 'Setup developing', color: 'var(--dev)', shape: 'half' },
  HIGH: { label: 'Haute confluence', sub: 'High confluence', color: 'var(--ok)', shape: 'full' },
  INVALIDATED: { label: 'Thèse invalidée', sub: 'Thesis invalidated', color: 'var(--risk)', shape: 'cross' },
};

function Shape({ shape }) {
  return (
    <svg className="state-shape" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="15" fill="none" stroke="currentColor" strokeWidth="1.4" />
      {shape === 'quarter' && <path d="M20 5a15 15 0 0 1 15 15H20Z" fill="currentColor" />}
      {shape === 'half' && <path d="M20 5a15 15 0 0 1 0 30Z" fill="currentColor" />}
      {shape === 'full' && <circle cx="20" cy="20" r="15" fill="currentColor" />}
      {shape === 'cross' && <path d="M14 14l12 12M26 14 14 26" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
      {shape === 'hollow' && <circle className="breath" cx="20" cy="20" r="2.4" fill="currentColor" />}
    </svg>
  );
}

export function StatusCore({ war, tiles }) {
  const st = STATES[war.status] || STATES.NO_SETUP;
  const [changing, setChanging] = useState(false);
  const prev = useRef(war.status);
  useEffect(() => {
    if (prev.current === war.status) return undefined;
    prev.current = war.status;
    setChanging(true);
    const t = setTimeout(() => setChanging(false), 950);
    return () => clearTimeout(t);
  }, [war.status]);

  return (
    <section className={`glass status surface-4 ${changing ? 'changing' : ''}`} style={{ '--state': st.color }} role="status" aria-live="polite"
      data-info="War Room status|Synthèse de tous les moteurs branchés. « Rien à faire » est l’état par défaut tant que rien ne converge.">
      <div className="status-head">
        <Shape shape={st.shape} />
        <div key={war.status} className="swap-in">
          <div className="status-label">{st.label}</div>
          <div className="status-sub">{st.sub}</div>
        </div>
      </div>
      {war.doNothing && <p className="status-lead">Rien ne justifie une entrée pour l’instant. Attendre fait partie du plan.</p>}
      <div className="status-tiles">
        {tiles.map(t => <div key={t.k}><span>{t.k}</span><b style={t.color ? { color: t.color } : undefined}>{t.v}</b></div>)}
      </div>
      <ul className="status-why">
        {war.reasons.map(r => <li key={r.k}><i aria-hidden="true">○</i>{r.t}</li>)}
      </ul>
      {war.next?.length > 0 && (
        <div className="status-next">
          <span className="eyebrow">Avant d’envisager une entrée</span>
          <ul>{war.next.map(n => <li key={n}>{n}</li>)}</ul>
        </div>
      )}
    </section>
  );
}
