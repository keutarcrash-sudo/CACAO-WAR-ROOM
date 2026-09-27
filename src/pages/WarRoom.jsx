import { useEffect, useRef } from 'react';
import { Num } from '../components/Num.jsx';
import { Pulse } from '../components/Pulse.jsx';
import { Freshness } from '../components/Freshness.jsx';
import { Sparkline } from '../components/Sparkline.jsx';
import { StatusCore } from '../components/StatusCore.jsx';
import { WhatChanged } from '../components/WhatChanged.jsx';
import { MarketReading } from '../components/MarketReading.jsx';
import { Timeline } from '../components/Timeline.jsx';
import { eur, money, num, pct } from '../lib/format.js';
import { whatChanged } from '../../lib/engines/warroom.js';

const TEAM = [
  { name: 'Market Analyst', state: 'on', note: 'Prix New York différé, historique, ATR' },
  { name: 'Risk Manager', state: 'on', note: 'Position, risque au stop, règles d’entrée, alertes de risque' },
  { name: 'ICT / Technical Analyst', state: 'part', note: 'Niveaux et structure simplifiée · ICT en phase 6' },
  { name: 'News Analyst', state: 'off', note: 'Phase 3 · news et Telegram' },
  { name: 'Weather Analyst', state: 'off', note: 'Phase 4 · météo, ENSO' },
  { name: 'Agricultural / Supply Analyst', state: 'off', note: 'Phase 4 · production, stocks, arrivages' },
  { name: 'AI Research Assistant', state: 'off', note: 'Phase 8 · synthèse, contradictions' },
];

export function WarRoom({ market, marketState, intraday, daily, pulse, war, atr14, position, trade, alerts, lastVisit, openSheet, go }) {
  const q = market?.quote;
  const up = (q?.changePct ?? 0) >= 0;
  const changes = whatChanged(lastVisit, { price: q?.price ?? null, atr: atr14, pnl: position.pnl ?? null, sourceStatus: market?.status ?? null });
  const hero = useRef(null);

  // light parallax: the price drifts a little slower than the page
  useEffect(() => {
    let raf = 0;
    const on = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => hero.current?.style.setProperty('--sy', String(Math.min(scrollY, 400)))); };
    addEventListener('scroll', on, { passive: true });
    return () => { removeEventListener('scroll', on); cancelAnimationFrame(raf); };
  }, []);

  return (
    <>
      <section className="hero" ref={hero}>
        <div className="hero-main">
          <p className="eyebrow">New York Cocoa · ICE Futures U.S.</p>
          <div className="price" data-info="Prix|Contrat continu CC=F, ICE Futures U.S. Source : Yahoo Finance, non officielle, différée d’environ 10 minutes.">
            {q?.price != null
              ? <><span className="cur">$</span><Num value={q.price} format={x => num(x)} /></>
              : <span className="price-na">{marketState.loading ? '…' : 'Indisponible'}</span>}
          </div>
          <div className="price-meta">
            {q?.changePct != null && <span className={`chg num ${up ? 'up' : 'down'}`}>{up ? '▲' : '▼'} {pct(q.changePct)} <span className="faint">{money(q.change, 'USD')}</span></span>}
            <Freshness market={market} />
          </div>
        </div>
        <Pulse pulse={pulse} onClick={() => openSheet({ type: 'pulse' })} />
        <div className="hero-spark">
          <Sparkline candles={intraday?.candles} up={up} />
          <div className="spark-legend"><span>48 h · 1H</span><span>London <b>indisponible</b></span><span>ATR 14 j <b className="num">{money(atr14, 'USD')}</b></span></div>
        </div>
      </section>

      <StatusCore war={war} tiles={[
        { k: 'Thèse', v: 'N/D' },
        { k: 'Timing', v: 'Attendre', color: 'var(--watch)' },
        { k: 'Confluence', v: 'N/D' },
      ]} />

      <WhatChanged lastVisit={lastVisit} changes={changes} />

      <MarketReading daily={daily} quote={q} atr14={atr14} trade={trade} position={position} war={war} />

      <section>
        <header className="section-head"><h2>Position</h2><span className="meta">{position.status}</span></header>
        <button className="glass surface-3 position-card tappable" onClick={() => go('trade')} aria-label="Ouvrir le Trade Manager">
          <div className="pos-top">
            <span className="pos-cap num">€{num(position.capital)}<span className="faint"> / €{trade.plan.plannedCapital}</span></span>
            <span className={`pos-pnl num ${position.pnl > 0 ? 'up' : position.pnl < 0 ? 'down' : 'faint'}`}>{position.pnl != null ? <Num value={position.pnl} format={x => eur(x, 2, true)} /> : '—'}</span>
          </div>
          <div className="alloc" style={{ gridTemplateColumns: trade.plan.split.map(s => `${s}fr`).join(' ') }} aria-hidden="true">
            {trade.plan.split.map((_, i) => <i key={i} className={trade.entries[i] ? 'on' : ''} />)}
          </div>
          <div className="pos-meta">
            {position.entriesCount
              ? <><span>Moyenne <b className="num">{money(position.avg, trade.product.priceCurrency, 1)}</b></span><span>Perte au stop <b className="num">{position.lossAtStop != null ? `${eur(position.lossAtStop)} / €${trade.plan.maxLoss}` : 'aucun stop'}</b></span></>
              : <span>Aucune position. Perte maximale prévue €{trade.plan.maxLoss}.</span>}
          </div>
        </button>
      </section>

      <Timeline alerts={alerts} onOpen={a => openSheet({ type: 'alert', alert: a })} />

      <section>
        <header className="section-head"><h2>L’équipe</h2><span className="meta">ce qui est branché</span></header>
        <ul className="rows team">
          {TEAM.map(m => (
            <li key={m.name} className={m.state === 'off' ? 'is-off' : ''}>
              <i className={`dot fresh-${m.state === 'on' ? 'ok' : m.state === 'part' ? 'delayed' : 'na'}`} aria-hidden="true" />
              <span className="row-main">{m.name}<small>{m.note}</small></span>
              <span className="row-side">{m.state === 'on' ? 'actif' : m.state === 'part' ? 'partiel' : 'à venir'}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="foot">Aucune donnée n’est inventée. Ce qui n’est pas branché est affiché comme tel.</p>
    </>
  );
}
