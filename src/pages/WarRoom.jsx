import { Num } from '../components/Num.jsx';
import { Pulse } from '../components/Pulse.jsx';
import { Freshness } from '../components/Freshness.jsx';
import { ago, eur, money, num, pct } from '../lib/format.js';
import { whatChanged } from '../../lib/engines/warroom.js';

const TEAM = [
  { name: 'Market Analyst', state: 'on', note: 'Prix New York différé, historique, ATR' },
  { name: 'Risk Manager', state: 'on', note: 'Prix moyen, P&L, risque au stop, règles d’entrée' },
  { name: 'ICT / Technical Analyst', state: 'part', note: 'Pivots, PDH/PDL, structure simplifiée. ICT en phase 6' },
  { name: 'News Analyst', state: 'off', note: 'Phase 3 · news + alertes Telegram' },
  { name: 'Weather Analyst', state: 'off', note: 'Phase 4 · Open-Meteo, ENSO' },
  { name: 'Agricultural / Supply Analyst', state: 'off', note: 'Phase 4 · production, stocks, arrivages' },
  { name: 'AI Research Assistant', state: 'off', note: 'Phase 8 · synthèse et contradictions' },
];

export function WarRoom({ market, marketState, pulse, war, atr14, position, trade, openSheet, go, prevSnapshot }) {
  const q = market?.quote;
  const up = (q?.changePct ?? 0) >= 0;
  const cur = { price: q?.price ?? null, atr: atr14, pnl: position.pnl ?? null, sourceStatus: market?.status ?? null };
  const changes = whatChanged(prevSnapshot, cur);

  return (
    <>
      <section className="hero">
        <div>
          <div className="label">New York Cocoa · ICE Futures U.S.</div>
          <div className="price">
            {q?.price != null
              ? <><span className="cur">$</span><Num value={q.price} format={x => num(x)} /></>
              : <span className="price-na">{marketState.loading ? '…' : 'Indisponible'}</span>}
          </div>
          <div className="chg-row">
            {q?.changePct != null && <span className={`chg ${up ? 'up' : 'down'}`}>{up ? '▲' : '▼'} {pct(q.changePct)}</span>}
            <Freshness market={market} />
          </div>
        </div>
        <Pulse pulse={pulse} onClick={() => openSheet('pulse')} />
        <div className="sub-market">
          <span>London <b className="faint">indisponible</b></span>
          <span>ATR 14 j <b className="num">{atr14 != null ? money(atr14, 'USD') : '—'}</b></span>
          <span className="faint">{market?.source?.name}</span>
        </div>
      </section>

      <section className="glass nothing">
        <div className="nothing-ring" aria-hidden="true" />
        <h3>Rien à faire</h3>
        <p>Rien ne justifie une entrée pour l’instant. Attendre fait partie du plan.</p>
        <div className="nothing-grid">
          <div><span className="label">Thèse</span><b className="faint">N/D</b></div>
          <div><span className="label">Timing</span><b style={{ color: 'var(--watch)' }}>WAIT</b></div>
          <div><span className="label">Confluence</span><b className="faint">N/D</b></div>
        </div>
        <ul className="nothing-why">
          {war.reasons.map(r => <li key={r.k}>○ {r.t}</li>)}
        </ul>
      </section>

      <div className="section-head">
        <h2>Ce qui a changé</h2>
        <span className="label">{prevSnapshot ? `Depuis ta visite · ${ago(prevSnapshot.at)}` : 'Première visite'}</span>
      </div>
      <div className="glass card">
        {!prevSnapshot && <p className="empty">Rien à comparer pour l’instant. À ta prochaine visite, les changements apparaîtront ici.</p>}
        {prevSnapshot && !changes.length && <p className="empty">Rien de significatif depuis ta dernière visite.</p>}
        {changes.map((c, i) => (
          <div className="wc-row enter-row" style={{ '--i': i }} key={c.k}>
            <div className="wc-ico" aria-hidden="true">{c.k === 'price' ? '↕' : c.k === 'vol' ? '≈' : c.k === 'pnl' ? '€' : '●'}</div>
            <div className="wc-title">{c.t}<small>{c.s}</small></div>
            <div className={`wc-val ${c.v > 0 ? 'up' : c.v < 0 ? 'down' : ''}`}>{c.kind === 'pct' ? pct(c.v) : c.kind === 'eur' ? eur(c.v, 2, true) : ''}</div>
          </div>
        ))}
      </div>

      <div className="section-head">
        <h2>Position</h2>
        <span className="label">{position.status}</span>
      </div>
      <button className="glass card tappable pos-card" onClick={() => go('trade')}>
        {position.entriesCount ? (
          <div className="kv kv-plain">
            <div><span className="label">Engagé</span><b className="num">€{num(position.capital)} <span className="faint">/ €{trade.plan.plannedCapital}</span></b></div>
            <div><span className="label">Prix moyen</span><b className="num">{money(position.avg, trade.product.priceCurrency)}</b></div>
            <div><span className="label">P&amp;L</span><b className={position.pnl >= 0 ? 'up' : 'down'}>{position.pnl != null ? <Num value={position.pnl} format={x => eur(x, 2, true)} /> : '—'}</b></div>
            <div><span className="label">Perte au stop</span><b className="num">{position.lossAtStop != null ? `${eur(position.lossAtStop)} / €${trade.plan.maxLoss}` : 'stop non défini'}</b></div>
          </div>
        ) : (
          <p className="empty" style={{ margin: 0 }}>Aucune position. Budget €{trade.plan.plannedCapital}, perte maximale €{trade.plan.maxLoss}. Toucher pour ouvrir le Trade Manager.</p>
        )}
      </button>

      <div className="section-head">
        <h2>L’équipe</h2>
        <span className="label">Ce qui est branché</span>
      </div>
      <div className="glass card team">
        {TEAM.map(m => (
          <div className="team-row" key={m.name}>
            <i className={`dot ${m.state === 'on' ? 'fresh-ok' : m.state === 'part' ? 'fresh-delayed' : 'fresh-na'}`} aria-hidden="true" />
            <div>{m.name}<small>{m.note}</small></div>
            <span className="label">{m.state === 'on' ? 'Actif' : m.state === 'part' ? 'Partiel' : 'À venir'}</span>
          </div>
        ))}
      </div>

      <p className="foot">Aucune donnée n’est inventée. Ce qui n’est pas branché est affiché comme tel.</p>
    </>
  );
}
