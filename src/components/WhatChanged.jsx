import { Icon } from './Icon.jsx';
import { ago, eur, pct } from '../lib/format.js';

const ICON = { price: 'price', vol: 'vol', pnl: 'pnl', src: 'source', status: 'status', conf: 'conf', fund: 'fund' };
const CAT = { MARKET: 'Marché', LIQUIDITY: 'Liquidité', RISK: 'Risque', TRADE: 'Trade', SYSTEM: 'Système', NEWS: 'News', FUNDAMENTALS: 'Fondamentaux', SETUP: 'Setup' };

// "What changed since my last analysis": the first question of the spec.
export function WhatChanged({ lastVisit, changes, events = [], onOpen }) {
  const top = [...events].sort((a, b) => b.importance - a.importance).slice(0, 6);
  return (
    <section className="changed">
      <header className="section-head">
        <h2>Ce qui a changé</h2>
        <span className="meta">{lastVisit ? `depuis ta visite, ${ago(lastVisit.at)}` : 'première visite'}</span>
      </header>
      {!lastVisit && <p className="empty">Rien à comparer pour l’instant. À ta prochaine visite, les changements apparaîtront ici.</p>}
      {lastVisit && !changes.length && !events.length && <p className="empty">Rien de significatif depuis ta dernière visite.</p>}
      <ol className="changed-list">
        {changes.map((c, i) => (
          <li key={c.k} style={{ '--i': i }} className="enter-row">
            <span className={`chg-ico ${c.v > 0 ? 'up' : c.v < 0 ? 'down' : ''}`}><Icon name={c.k === 'price' && c.v < 0 ? 'down' : ICON[c.k]} /></span>
            <span className="chg-main">{c.t}<small className="num">{c.s}</small></span>
            <span className={`chg-val num ${c.v > 0 ? 'up' : c.v < 0 ? 'down' : ''}`}>{c.kind === 'pct' ? pct(c.v) : c.kind === 'eur' ? eur(c.v, 2, true) : c.kind === 'pts' ? `${c.v > 0 ? '+' : ''}${c.v}` : c.kind === 'dir' ? (c.v > 0 ? '▲' : c.v < 0 ? '▼' : '•') : ''}</span>
          </li>
        ))}
      </ol>
      {top.length > 0 && (
        <>
          <p className="changed-sub">{events.length} événement{events.length > 1 ? 's' : ''} depuis ta visite{events.length > top.length ? ` · les ${top.length} plus importants` : ''}</p>
          <ul className="rows compact">
            {top.map(a => (
              <li key={a.id} className="clickable" onClick={() => onOpen?.(a)}>
                <span className={`lvl-ico lvl-text-${a.level.toLowerCase()}`}><Icon name={a.category} size={14} /></span>
                <span className="row-main">{a.title}<small>{CAT[a.category] || a.category} · {ago(a.at)}</small></span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
