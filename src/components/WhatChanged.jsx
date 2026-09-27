import { Icon } from './Icon.jsx';
import { ago, eur, pct } from '../lib/format.js';

const ICON = { price: 'price', vol: 'vol', pnl: 'pnl', src: 'source' };

// "What changed since my last analysis": the first question of the spec.
export function WhatChanged({ lastVisit, changes }) {
  return (
    <section className="changed">
      <header className="section-head">
        <h2>Ce qui a changé</h2>
        <span className="meta">{lastVisit ? `depuis ta visite, ${ago(lastVisit.at)}` : 'première visite'}</span>
      </header>
      {!lastVisit && <p className="empty">Rien à comparer pour l’instant. À ta prochaine visite, les changements apparaîtront ici.</p>}
      {lastVisit && !changes.length && <p className="empty">Rien de significatif depuis ta dernière visite.</p>}
      <ol className="changed-list">
        {changes.map((c, i) => (
          <li key={c.k} style={{ '--i': i }} className="enter-row">
            <span className={`chg-ico ${c.v > 0 ? 'up' : c.v < 0 ? 'down' : ''}`}><Icon name={c.k === 'price' && c.v < 0 ? 'down' : ICON[c.k]} /></span>
            <span className="chg-main">{c.t}<small className="num">{c.s}</small></span>
            <span className={`chg-val num ${c.v > 0 ? 'up' : c.v < 0 ? 'down' : ''}`}>{c.kind === 'pct' ? pct(c.v) : c.kind === 'eur' ? eur(c.v, 2, true) : ''}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
