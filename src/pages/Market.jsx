import { useMemo, useState } from 'react';
import { LineStyle } from 'lightweight-charts';
import { Chart } from '../components/Chart.jsx';
import { Freshness } from '../components/Freshness.jsx';
import { Num } from '../components/Num.jsx';
import { usePolling } from '../hooks/usePolling.js';
import { api } from '../lib/api.js';
import { money, num, pct } from '../lib/format.js';
import { previousLevels, volatilityRatio } from '../../lib/engines/technical.js';

const TFS = ['W1', 'D1', '4H', '1H', '15M', '5M'];
const STRUCT_TFS = ['W1', 'D1', '4H', '1H', '15M'];
const NOTES = { '15M': '15M : timing de l’entrée.', '5M': '5M : timing uniquement. Ne modifie jamais le contexte Daily.' };

export function Market({ market, daily, atr14, trade, position, analysis }) {
  const [tf, setTf] = useState('D1');
  const [ov, setOv] = useState({ prev: true, piv: false, pos: true, fvg: true, ob: false, struct: true });
  const ta = analysis?.data?.tfs?.[tf] || null;
  const other = usePolling(() => api.market('NY_COCOA', tf), 60e3, [tf], { enabled: tf !== 'D1' });
  const data = tf === 'D1' ? market : other.data;
  const candles = useMemo(() => dedupe(data?.candles), [data]);

  const lv = useMemo(() => (daily ? previousLevels(daily) : null), [daily]);
  const vr = useMemo(() => (daily ? volatilityRatio(daily) : null), [daily]);
  const showPos = trade.priceSource === 'NY_COCOA' && trade.product.priceCurrency === 'USD' && position.entriesCount > 0;

  const levels = useMemo(() => {
    const L = [];
    if (lv && ov.prev) {
      L.push({ price: lv.PDH, color: '#62C6DE', title: 'PDH' }, { price: lv.PDL, color: '#62C6DE', title: 'PDL' });
      L.push({ price: lv.PWH, color: 'rgba(98,198,222,.6)', title: 'PWH', style: LineStyle.LargeDashed }, { price: lv.PWL, color: 'rgba(98,198,222,.6)', title: 'PWL', style: LineStyle.LargeDashed });
    }
    if (lv && ov.piv) {
      const p = lv.dailyPivots;
      L.push({ price: p.P, color: '#8A93A1', title: 'P', style: LineStyle.Dotted }, { price: p.R1, color: '#6D7786', title: 'R1', style: LineStyle.Dotted }, { price: p.S1, color: '#6D7786', title: 'S1', style: LineStyle.Dotted });
    }
    // only zones within 3 ATR of price: distant ones would squash the chart and are not actionable
    const close = z => ta && ta.atr && Math.abs((z.top + z.bottom) / 2 - (market?.quote?.price ?? z.top)) <= 3 * ta.atr;
    if (ta && ov.fvg) for (const z of ta.fvgs.filter(close).slice(0, 3)) {
      const c = z.dir === 'BULLISH' ? 'rgba(98,198,222,.75)' : 'rgba(229,87,79,.7)';
      L.push({ price: z.top, color: c, title: `FVG ${z.dir === 'BULLISH' ? '↑' : '↓'}`, style: LineStyle.Dotted }, { price: z.bottom, color: c, title: '', style: LineStyle.Dotted });
    }
    if (ta && ov.ob) for (const z of ta.obs.filter(close).slice(0, 3)) {
      const c = z.dir === 'BULLISH' ? 'rgba(156,143,245,.85)' : 'rgba(229,138,74,.85)';
      L.push({ price: z.top, color: c, title: `OB ${z.dir === 'BULLISH' ? '↑' : '↓'}`, style: LineStyle.SparseDotted }, { price: z.bottom, color: c, title: '', style: LineStyle.SparseDotted });
    }
    if (showPos && ov.pos) {
      L.push({ price: position.avg, color: '#E6E9EE', title: 'Moyenne', style: LineStyle.Solid });
      if (trade.stop != null) L.push({ price: trade.stop, color: '#E5574F', title: 'Stop' });
      trade.targets.forEach((t, i) => L.push({ price: t, color: '#4CC38A', title: `TP${i + 1}` }));
    }
    return L;
  }, [lv, ov, showPos, position.avg, trade.stop, trade.targets, ta, market?.quote?.price]);

  const markers = useMemo(() => {
    if (!ta || !ov.struct || !candles?.length) return [];
    // map event times onto this timeframe's bars
    const at = t => { let x = null; for (const k of candles) if (k.t <= t) x = k.t; return x; };
    return [
      ...ta.structure.map(e => ({ time: at(e.t), position: e.dir === 'BULLISH' ? 'aboveBar' : 'belowBar', color: '#9C8FF5', shape: e.dir === 'BULLISH' ? 'arrowUp' : 'arrowDown', text: e.type })),
      ...ta.sweeps.map(e => ({ time: at(e.t), position: e.dir === 'BULLISH' ? 'belowBar' : 'aboveBar', color: '#62C6DE', shape: 'circle', text: 'sweep' })),
    ].filter(m => m.time != null);
  }, [ta, ov.struct, candles]);

  const toggle = k => setOv(o => ({ ...o, [k]: !o[k] }));
  const q = market?.quote;

  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">New York Cocoa · contrat continu</p>
        <div className="price price-md">{q?.price != null ? <><span className="cur">$</span><Num value={q.price} format={x => num(x)} /></> : '—'}</div>
        <div className="price-meta">
          {q?.changePct != null && <span className={`chg num ${q.changePct >= 0 ? 'up' : 'down'}`}>{q.changePct >= 0 ? '▲' : '▼'} {pct(q.changePct)}</span>}
          <Freshness market={market} />
        </div>
      </section>

      <div className="seg no-swipe" role="group" aria-label="Unité de temps">
        {TFS.map(t => <button key={t} aria-pressed={t === tf} onClick={() => setTf(t)}>{t}</button>)}
      </div>
      <p className="tf-note">{NOTES[tf] || ''}</p>

      <div className="glass surface-2 chart-wrap no-swipe">
        {candles?.length ? <Chart candles={candles} levels={levels} markers={markers} title={`New York Cocoa · ${tf}`} toolbar={(
          <div className="seg" role="group" aria-label="Unité de temps">{TFS.map(t => <button key={t} aria-pressed={t === tf} onClick={() => setTf(t)}>{t}</button>)}</div>
        )} /> : (
          <div className="chart-empty">{tf !== 'D1' && other.loading ? 'Chargement…' : data?.status === 'OFFLINE' ? 'Source hors ligne. Aucune bougie disponible.' : 'Aucune donnée pour cette unité de temps.'}</div>
        )}
      </div>
      {tf !== 'D1' && data && <div className="chart-foot"><Freshness market={data} /></div>}

      <div className="chips no-swipe">
        <button className="toggle" style={{ '--c': 'var(--data)' }} aria-pressed={ov.prev} onClick={() => toggle('prev')}><i />Veille · semaine</button>
        <button className="toggle" style={{ '--c': 'var(--struct)' }} aria-pressed={ov.struct} onClick={() => toggle('struct')} disabled={!ta}><i />BOS · sweeps</button>
        <button className="toggle" style={{ '--c': 'var(--data)' }} aria-pressed={ov.fvg} onClick={() => toggle('fvg')} disabled={!ta}><i />FVG</button>
        <button className="toggle" style={{ '--c': 'var(--struct)' }} aria-pressed={ov.ob} onClick={() => toggle('ob')} disabled={!ta}><i />Order blocks</button>
        <button className="toggle" style={{ '--c': 'var(--ink-3)' }} aria-pressed={ov.piv} onClick={() => toggle('piv')}><i />Pivots</button>
        <button className="toggle" style={{ '--c': 'var(--ink)' }} aria-pressed={ov.pos} onClick={() => toggle('pos')} disabled={!showPos} title={showPos ? '' : 'Visible si ta position est en USD sur le prix New York'}><i />Ma position</button>
      </div>

      <LiquidityMap analysis={analysis?.data} />

      <header className="section-head"><h2>Niveaux</h2><span className="meta">calculés sur le Daily</span></header>
      <ul className="rows levels">
        <li><span className="row-main">Plus haut de la semaine passée<small>PWH · buy-side estimée</small></span><span className="row-side num">{money(lv?.PWH, 'USD')}</span></li>
        <li><span className="row-main">Plus haut de la veille<small>PDH · buy-side estimée</small></span><span className="row-side num">{money(lv?.PDH, 'USD')}</span></li>
        <li><span className="row-main">Pivot du jour<small>R1 {money(lv?.dailyPivots.R1, 'USD')} · S1 {money(lv?.dailyPivots.S1, 'USD')}</small></span><span className="row-side num">{money(lv?.dailyPivots.P, 'USD')}</span></li>
        <li><span className="row-main">Plus bas de la veille<small>PDL · sell-side estimée</small></span><span className="row-side num">{money(lv?.PDL, 'USD')}</span></li>
        <li><span className="row-main">Plus bas de la semaine passée<small>PWL · sell-side estimée</small></span><span className="row-side num">{money(lv?.PWL, 'USD')}</span></li>
        <li><span className="row-main">ATR 14 jours<small>{vr != null ? `${num(vr, 2)}× sa moyenne 20 j · ${vr > 1.2 ? 'expansion' : vr < 0.8 ? 'compression' : 'normale'}` : '—'}</small></span><span className="row-side num">{money(atr14, 'USD')}</span></li>
      </ul>

      <StructureStrip analysis={analysis?.data} />

      <header className="section-head"><h2>London Cocoa</h2><span className="meta">ICE Futures Europe</span></header>
      <p className="empty"><Freshness info={{ key: 'na', label: 'Indisponible' }} /><br />Aucune source gratuite fiable pour Londres. Elle sera branchée via l’API de ton courtier.</p>
      <p className="foot">Source : {market?.source?.name || '—'}. Données différées, non officielles.<br />Graphique : <a href="https://www.tradingview.com/lightweight-charts/" target="_blank" rel="noopener noreferrer">TradingView Lightweight Charts</a>.</p>
    </>
  );
}

function StructureStrip({ analysis }) {
  const T = { BULLISH: ['Bullish', 'up'], BEARISH: ['Bearish', 'down'], NEUTRAL: ['Neutre', 'faint'] };
  return (
    <>
      <header className="section-head"><h2>Structure</h2><span className="meta">contexte → timing</span></header>
      <ol className="tf-strip">
        {STRUCT_TFS.map(t => {
          const a = analysis?.tfs?.[t];
          const [l, c] = a ? T[a.trend] || T.NEUTRAL : ['…', 'faint'];
          const e = a?.structure?.at(-1);
          return <li key={t} className={c}><b>{t}</b><span>{l}</span>{e && <small className="faint">{e.type}</small>}</li>;
        })}
      </ol>
      <p className="fine">Tendance lue sur la dernière rupture de structure (BOS / CHoCH) à la clôture. Le 5M ne sert qu’au timing et n’entre pas dans le contexte.</p>
    </>
  );
}

function LiquidityMap({ analysis }) {
  const rows = analysis?.liquidity || [];
  if (!rows.length) return null;
  const price = analysis.price;
  const above = rows.filter(r => r.price >= price).slice(-5), below = rows.filter(r => r.price < price).slice(0, 5);
  const Row = r => (
    <li key={`${r.type}${r.price}`} className={r.swept ? 'is-off' : ''}>
      <span className="row-main">{r.type} · {r.tf}<small>{r.swept ? 'balayée' : 'intacte'}{r.dist != null ? ` · ${r.dist > 0 ? '+' : ''}${num(r.dist, 1)} ATR` : ''}</small></span>
      <span className="row-side num">{money(r.price, 'USD')}</span>
    </li>
  );
  return (
    <section>
      <header className="section-head"><h2>Carte de liquidité</h2><span className="meta">estimée</span></header>
      <p className="side-lab up">Buy-side au-dessus</p>
      <ul className="rows">{above.map(Row)}</ul>
      <div className="price-now"><span>Prix</span><b className="num">{money(price, 'USD')}</b></div>
      <p className="side-lab down">Sell-side en dessous</p>
      <ul className="rows">{below.map(Row)}</ul>
      <p className="fine">Liquidité estimée d’après la structure (sommets et creux égaux, plus hauts et plus bas de la veille et de la semaine). Aucune donnée de liquidation réelle.</p>
    </section>
  );
}

function dedupe(c) {
  if (!c) return null;
  const out = [];
  for (const k of c) { if (!out.length || k.t > out.at(-1).t) out.push(k); else if (k.t === out.at(-1).t) out[out.length - 1] = k; }
  return out;
}
