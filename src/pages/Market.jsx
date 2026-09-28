import { useMemo, useState } from 'react';
import { LineStyle } from 'lightweight-charts';
import { Chart } from '../components/Chart.jsx';
import { Freshness } from '../components/Freshness.jsx';
import { Num } from '../components/Num.jsx';
import { usePolling } from '../hooks/usePolling.js';
import { api } from '../lib/api.js';
import { money, num, pct } from '../lib/format.js';
import { previousLevels, structure, volatilityRatio } from '../../lib/engines/technical.js';

const TFS = ['W1', 'D1', '4H', '1H', '15M', '5M'];
const STRUCT_TFS = ['W1', 'D1', '4H', '1H', '15M'];
const NOTES = { '15M': '15M : timing de l’entrée.', '5M': '5M : timing uniquement. Ne modifie jamais le contexte Daily.' };

export function Market({ market, daily, atr14, trade, position }) {
  const [tf, setTf] = useState('D1');
  const [ov, setOv] = useState({ prev: true, piv: false, pos: true });
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
    if (showPos && ov.pos) {
      L.push({ price: position.avg, color: '#E6E9EE', title: 'Moyenne', style: LineStyle.Solid });
      if (trade.stop != null) L.push({ price: trade.stop, color: '#E5574F', title: 'Stop' });
      trade.targets.forEach((t, i) => L.push({ price: t, color: '#4CC38A', title: `TP${i + 1}` }));
    }
    return L;
  }, [lv, ov, showPos, position.avg, trade.stop, trade.targets]);

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
        {candles?.length ? <Chart candles={candles} levels={levels} /> : (
          <div className="chart-empty">{tf !== 'D1' && other.loading ? 'Chargement…' : data?.status === 'OFFLINE' ? 'Source hors ligne. Aucune bougie disponible.' : 'Aucune donnée pour cette unité de temps.'}</div>
        )}
      </div>
      {tf !== 'D1' && data && <div className="chart-foot"><Freshness market={data} /></div>}

      <div className="chips no-swipe">
        <button className="toggle" style={{ '--c': 'var(--data)' }} aria-pressed={ov.prev} onClick={() => toggle('prev')}><i />Veille · semaine</button>
        <button className="toggle" style={{ '--c': 'var(--ink-3)' }} aria-pressed={ov.piv} onClick={() => toggle('piv')}><i />Pivots</button>
        <button className="toggle" style={{ '--c': 'var(--ink)' }} aria-pressed={ov.pos} onClick={() => toggle('pos')} disabled={!showPos} title={showPos ? '' : 'Visible si ta position est en USD sur le prix New York'}><i />Ma position</button>
      </div>

      <header className="section-head"><h2>Niveaux</h2><span className="meta">calculés sur le Daily</span></header>
      <ul className="rows levels">
        <li><span className="row-main">Plus haut de la semaine passée<small>PWH · buy-side estimée</small></span><span className="row-side num">{money(lv?.PWH, 'USD')}</span></li>
        <li><span className="row-main">Plus haut de la veille<small>PDH · buy-side estimée</small></span><span className="row-side num">{money(lv?.PDH, 'USD')}</span></li>
        <li><span className="row-main">Pivot du jour<small>R1 {money(lv?.dailyPivots.R1, 'USD')} · S1 {money(lv?.dailyPivots.S1, 'USD')}</small></span><span className="row-side num">{money(lv?.dailyPivots.P, 'USD')}</span></li>
        <li><span className="row-main">Plus bas de la veille<small>PDL · sell-side estimée</small></span><span className="row-side num">{money(lv?.PDL, 'USD')}</span></li>
        <li><span className="row-main">Plus bas de la semaine passée<small>PWL · sell-side estimée</small></span><span className="row-side num">{money(lv?.PWL, 'USD')}</span></li>
        <li><span className="row-main">ATR 14 jours<small>{vr != null ? `${num(vr, 2)}× sa moyenne 20 j · ${vr > 1.2 ? 'expansion' : vr < 0.8 ? 'compression' : 'normale'}` : '—'}</small></span><span className="row-side num">{money(atr14, 'USD')}</span></li>
      </ul>

      <StructureStrip market={market} />

      <header className="section-head"><h2>London Cocoa</h2><span className="meta">ICE Futures Europe</span></header>
      <p className="empty"><Freshness info={{ key: 'na', label: 'Indisponible' }} /><br />Aucune source gratuite fiable pour Londres. Elle sera branchée via l’API de ton courtier.</p>
      <p className="foot">Source : {market?.source?.name || '—'}. Données différées, non officielles.<br />Graphique : <a href="https://www.tradingview.com/lightweight-charts/" target="_blank" rel="noopener noreferrer">TradingView Lightweight Charts</a>.</p>
    </>
  );
}

function StructureStrip({ market }) {
  // structure changes slowly: one request per timeframe every 10 minutes
  const all = usePolling(async () => {
    const res = await Promise.all(STRUCT_TFS.map(t => (t === 'D1' && market ? Promise.resolve(market) : api.market('NY_COCOA', t).catch(() => null))));
    return Object.fromEntries(STRUCT_TFS.map((t, i) => [t, res[i]?.candles?.length ? structure(dedupe(res[i].candles)) : null]));
  }, 600e3, [!!market]);
  return (
    <>
      <header className="section-head"><h2>Structure</h2><span className="meta">contexte → timing</span></header>
      <ol className="tf-strip">
        {STRUCT_TFS.map(t => {
          const s = all.data?.[t];
          const cls = s?.trend === 'BULLISH' ? 'up' : s?.trend === 'BEARISH' ? 'down' : 'faint';
          return <li key={t} className={cls}><b>{t}</b><span>{s ? s.label : all.loading ? '…' : 'N/D'}</span></li>;
        })}
      </ol>
      <p className="fine">Structure simplifiée : deux derniers sommets et creux. BOS et CHoCH arrivent avec le moteur ICT.</p>
    </>
  );
}

function dedupe(c) {
  if (!c) return null;
  const out = [];
  for (const k of c) { if (!out.length || k.t > out.at(-1).t) out.push(k); else if (k.t === out.at(-1).t) out[out.length - 1] = k; }
  return out;
}
