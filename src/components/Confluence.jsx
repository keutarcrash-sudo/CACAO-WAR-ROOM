import { useState } from 'react';
import { Num } from './Num.jsx';

const LABEL = { NO_SETUP: ['Pas de setup', 'var(--none)'], WATCHING: ['Watch', 'var(--watch)'], DEVELOPING: ['Interesting', 'var(--dev)'], HIGH: ['High confluence', 'var(--ok)'] };

export function ConfluenceCard({ conf, onOpen }) {
  const score = Math.max(0, conf?.score ?? 0);
  const [lab, col] = LABEL[conf?.label] || LABEL.NO_SETUP;
  const ok = conf?.items.filter(i => i.ok && i.pts > 0).length ?? 0;
  const miss = conf?.items.filter(i => !i.ok && i.pts > 0).length ?? 0;
  return (
    <button className="glass surface-3 conf-card tappable" onClick={onOpen} aria-label="Détail de la confluence"
      data-info="Confluence|Nombre de confirmations présentes, sur 15 points. Ce n’est pas une probabilité de réussite.">
      <div className="conf-top">
        <span className="conf-score">{conf ? <Num value={conf.score} format={x => Math.round(x)} /> : '—'}<small> / 15</small></span>
        <span className="conf-side"><span className="bias-chip" style={{ color: col }}>{lab}</span><small className="meta">{conf ? `${conf.dir === 'LONG' ? 'Long' : 'Short'} · ${ok} confirmations · ${miss} manquantes` : 'calcul en cours'}</small></span>
      </div>
      <div className="segs" aria-hidden="true">{Array.from({ length: 15 }, (_, i) => <i key={i} className={i < score ? 'on' : ''} style={{ '--i': i }} />)}</div>
      <div className="scale" aria-hidden="true"><span>0–4</span><span>5–7</span><span>8–10</span><span>11+</span></div>
      <p className="fine">Compte les confirmations présentes, pas une probabilité. Toucher pour le détail.</p>
    </button>
  );
}

export function ConfluenceDetail({ analysis, direction = 'LONG' }) {
  const [dir, setDir] = useState(direction);
  if (!analysis) return <p className="empty">Analyse en cours…</p>;
  const c = dir === 'LONG' ? analysis.long : analysis.short;
  if (!c) return <p className="empty">Prix indisponible : pas de confluence calculable.</p>;
  return (
    <>
      <p className="eyebrow">Confluence · calculée {new Date(analysis.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</p>
      <h2 id="sheet-title"><span className="num">{c.score}</span><span className="faint"> / 15</span></h2>
      <div className="seg" style={{ marginTop: 12 }}>
        {['LONG', 'SHORT'].map(d => <button key={d} aria-pressed={d === dir} onClick={() => setDir(d)}>{d === 'LONG' ? `Long · ${analysis.long?.score ?? '—'}` : `Short · ${analysis.short?.score ?? '—'}`}</button>)}
      </div>
      <ul className="rows">
        {c.items.map(i => (
          <li key={i.k} className={i.ok ? '' : 'is-off'}>
            <span className={i.ok ? (i.pts < 0 ? 'down' : 'up') : 'faint'} aria-hidden="true">{i.ok ? (i.pts < 0 ? '!' : '✓') : '○'}</span>
            <span className="row-main">{i.label}<small>{i.ok ? i.evidence : 'non observé'}{i.tf ? ` · ${i.tf}` : ''}</small></span>
            <span className={`row-side ${i.ok && i.pts < 0 ? 'down' : ''}`}>{i.ok ? `${i.pts > 0 ? '+' : ''}${i.pts}` : `+${i.pts}`}</span>
          </li>
        ))}
      </ul>
      <p className="fine">0–4 pas de setup · 5–7 surveiller · 8–10 intéressant · 11+ haute confluence. Détection par règles sur les bougies (différées). Une forte confluence n’est jamais une certitude.</p>
    </>
  );
}
