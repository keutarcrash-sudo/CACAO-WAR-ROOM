import { useMemo, useState } from 'react';
import { LineStyle } from 'lightweight-charts';
import { Chart } from '../components/Chart.jsx';
import { Freshness } from '../components/Freshness.jsx';
import { Num } from '../components/Num.jsx';
import { usePolling } from '../hooks/usePolling.js';
import { fetchMarket } from '../lib/api.js';
import { money, num, pct } from '../lib/format.js';
import { previousLevels, structure, volatilityRatio, atr } from '../../lib/engines/technical.js';

const TFS = ['W1', 'D1', '4H', '1H', '15M', '5M'];
const STRUCT_TFS = ['W1', 'D1', '4H', '1H', '15M'];
const NOTES = { '15M': '15M : timing de l’entrée.', '5M': '5M : timing uniquement. Ne modifie jamais le contexte Daily.' };

export function Market({ market, daily, trade, position }) {
  const [tf, setTf] = useState('D1');
  const [ov, setOv] = useState({ prev: true, piv: false, pos: true });
  const tfData = usePolling(() => (tf === 'D1' ? Promise.resolve(market) : fetchMarket('NY_COCOA', tf)), tf === 'D1' ? 3600e3 : 60e3, [tf, tf === 'D1' ? market : null]);
  const data = tf === 'D1' ? market : tfData.data;
  const candles = useMemo(() => dedupe(data?.candles), [data]);

  const lv = useMemo(() => (daily ? previousLevels(daily) : null), [daily]);
  const vr = useMemo(() => (daily ? volatilityRatio(daily) : null), [daily]);
  const a = useMemo(() => (daily ? atr(daily) : null), [daily]);
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
      <section className="hero hero-compact">
        <div>
          <div className="label">New York Cocoa · {market?.instrument?.contract || 'CC=F'}</div>
          <div className="price price-md">{q?.price != null ? <><span className="cur">$</span><Num value={q.price} format={x => num(x)} /></> : '—'}</div>
          <div className="chg-row">
            {q?.changePct != null && <span className={`chg ${q.changePct >= 0 ? 'up' : 'down'}`}>{q.changePct >= 0 ? '▲' : '▼'} {pct(q.changePct)}</span>}
            <Freshness market={market} />
          </div>
        </div>
      </section>

      <div className="seg-ctl no-swipe" role="group" aria-label="Unité de temps">
        {TFS.map(t => <button key={t} aria-pressed={t === tf} onClick={() => setTf(t)}>{t}</button>)}
      </div>
      <div className="tf-note">{NOTES[tf] || ''}</div>

      <div className="glass chart-wrap no-swipe">
        {candles?.length ? <Chart candles={candles} levels={levels} /> : (
          <div className="chart-empty">{tfData.loading && tf !== 'D1' ? 'Chargement…' : data?.status === 'OFFLINE' ? 'Source hors ligne. Aucune bougie disponible.' : 'Aucune donnée pour cette unité de temps.'}</div>
        )}
      </div>
      {tf !== 'D1' && data && <div className="chart-foot"><Freshness market={data} /></div>}

      <div className="chips no-swipe">
        <button className="toggle" style={{ '--c': 'var(--data)' }} aria-pressed={ov.prev} onClick={() => toggle('prev')}><i />PDH / PDL · PWH / PWL</button>
        <button className="toggle" style={{ '--c': 'var(--ink-3)' }} aria-pressed={ov.piv} onClick={() => toggle('piv')}><i />Pivots jour</button>
        <button className="toggle" style={{ '--c': 'var(--ink)' }} aria-pressed={ov.pos} onClick={() => toggle('pos')} disabled={!showPos} title={showPos ? '' : 'Visible si ta position est en USD sur le prix New York'}><i />Ma position</button>
      </div>

      <div className="section-head"><h2>Niveaux</h2><span className="label">Calculés sur le Daily</span></div>
      <div className="kv">
        <div><span className="label">ATR 14 jours</span><b>{money(a, 'USD')}</b><small>{vr != null ? `${num(vr, 2)}× sa moyenne 20 j · ${vr > 1.2 ? 'expansion' : vr < 0.8 ? 'compression' : 'normale'}` : '—'}</small></div>
        <div><span className="label">Pivot jour</span><b>{money(lv?.dailyPivots.P, 'USD')}</b><small>R1 {money(lv?.dailyPivots.R1, 'USD')} · S1 {money(lv?.dailyPivots.S1, 'USD')}</small></div>
        <div><span className="label">Veille · haut / bas</span><b>{money(lv?.PDH, 'USD')}</b><small>bas {money(lv?.PDL, 'USD')}</small></div>
        <div><span className="label">Semaine préc. · haut / bas</span><b>{money(lv?.PWH, 'USD')}</b><small>bas {money(lv?.PWL, 'USD')}</small></div>
      </div>

      <StructureGrid market={market} />

      <div className="section-head"><h2>London Cocoa</h2><span className="label">ICE Futures Europe</span></div>
      <div className="glass card">
        <Freshness info={{ key: 'na', label: 'Data unavailable' }} />
        <p className="empty">Aucune source gratuite fiable pour Londres. Elle sera branchée via l’API de ton courtier quand tu l’auras choisi.</p>
      </div>
      <p className="foot">Source : {market?.source?.name || '—'}. Données différées, non officielles.</p>
    </>
  );
}

function StructureGrid({ market }) {
  // One cached request per timeframe, refreshed every 10 minutes: structure changes slowly.
  const all = usePolling(async () => {
    const res = await Promise.all(STRUCT_TFS.map(t => (t === 'D1' && market ? Promise.resolve(market) : fetchMarket('NY_COCOA', t).catch(() => null))));
    return Object.fromEntries(STRUCT_TFS.map((t, i) => [t, res[i]?.candles?.length ? structure(dedupe(res[i].candles)) : null]));
  }, 600e3, [!!market]);
  return (
    <>
      <div className="section-head"><h2>Structure</h2><span className="label">Contexte → timing</span></div>
      <div className="tf-grid">
        {STRUCT_TFS.map(t => {
          const s = all.data?.[t];
          const cls = s?.trend === 'BULLISH' ? 'up' : s?.trend === 'BEARISH' ? 'down' : 'muted';
          return <div key={t}><b>{t}</b><span className={cls}>{s ? s.label : all.loading ? '…' : 'N/D'}</span></div>;
        })}
      </div>
      <p className="disclaim">Structure simplifiée : compare les deux derniers sommets et creux (fractales). BOS / CHoCH arrivent en phase 6.</p>
    </>
  );
}

function dedupe(c) {
  if (!c) return null;
  const out = [];
  for (const k of c) { if (!out.length || k.t > out.at(-1).t) out.push(k); else if (k.t === out.at(-1).t) out[out.length - 1] = k; }
  return out;
}
