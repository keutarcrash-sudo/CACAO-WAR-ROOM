import { useEffect, useMemo, useRef } from 'react';
import { drawStory } from '../lib/storyChart.js';
import { useReducedMotion } from '../hooks/useReducedMotion.js';
import { useStoryStep } from '../hooks/useStoryStep.js';
import { money, num, pct } from '../lib/format.js';
import { previousLevels, structure, swings, volatilityRatio } from '../../lib/engines/technical.js';

const LAYERS = ['price', 'structure', 'liquidity', 'ict', 'piv', 'position'];

// Scroll storytelling: the chart stays pinned while the reading of the market unfolds step by step.
// Every sentence is computed from the real candles; nothing here is decorative text.
export function MarketReading({ daily, quote, atr14, trade, position, war, analysis }) {
  const rm = useReducedMotion();
  const canvas = useRef(null);
  const steps = useRef([]);
  const stage = useRef(null);
  const alphas = useRef(Object.fromEntries(LAYERS.map(l => [l, l === 'price' ? 1 : 0])));
  const reveal = useRef(rm ? 1 : 0);

  const model = useMemo(() => {
    if (!daily?.length) return null;
    const ks = daily.slice(-70);
    const lv = previousLevels(daily);
    const showPos = position.entriesCount > 0 && trade.priceSource === 'NY_COCOA' && trade.product.priceCurrency === 'USD';
    return {
      candles: ks,
      swings: swings(ks, 3),
      lv,
      piv: lv?.dailyPivots,
      atr: atr14,
      structure: structure(daily.slice(-120), 3),
      vr: volatilityRatio(daily),
      pos: showPos ? { avg: position.avg, stop: trade.stop, targets: trade.targets } : null,
      ...ictLayer(ks, analysis),
      ict: analysis,
    };
  }, [daily, atr14, position.entriesCount, position.avg, trade.priceSource, trade.product.priceCurrency, trade.stop, trade.targets, analysis]);

  const STEPS = useMemo(() => buildSteps(model, quote, trade, position, war), [model, quote, trade, position, war]);

  const active = Math.min(useStoryStep(stage, steps, STEPS.length), Math.max(0, STEPS.length - 1));

  // animate layer opacities toward the active step
  useEffect(() => {
    const c = canvas.current;
    if (!c || !model) return undefined;
    let raf = 0;
    const targets = STEPS[active]?.layers || { price: 1 };
    const paint = () => {
      const dpr = Math.min(2, devicePixelRatio || 1), W = c.clientWidth, H = c.clientHeight;
      if (c.width !== Math.round(W * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
      const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawStory(ctx, W, H, model, alphas.current, reveal.current);
    };
    const tick = () => {
      let moving = false;
      for (const l of LAYERS) {
        const t = targets[l] ?? 0, a = alphas.current[l];
        if (Math.abs(a - t) > 0.01) { alphas.current[l] = rm ? t : a + (t - a) * 0.14; moving = true; } else alphas.current[l] = t;
      }
      if (reveal.current < 1) { reveal.current = rm ? 1 : Math.min(1, reveal.current + 0.035); moving = true; }
      paint();
      raf = moving ? requestAnimationFrame(tick) : 0;
    };
    raf = requestAnimationFrame(tick);
    const onResize = () => paint();
    addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', onResize); };
  }, [active, model, STEPS, rm]);

  if (!model) return null;
  return (
    <section className="story" aria-label="Lecture du marché">
      <div className="story-stage" ref={stage}>
        <div className="story-head">
          <span className="eyebrow">Lecture du marché · Daily</span>
          <span className="story-count num">{String(active + 1).padStart(2, '0')} / {String(STEPS.length).padStart(2, '0')}</span>
        </div>
        <canvas ref={canvas} className="story-canvas" role="img" aria-label={STEPS[active]?.title} />
        <div className="story-progress" aria-hidden="true">{STEPS.map((s, i) => <i key={s.key} className={i <= active ? 'on' : ''} />)}</div>
      </div>
      <div className="story-steps">
        {STEPS.map((s, i) => (
          <article key={s.key} ref={el => { steps.current[i] = el; }} data-i={i} className={`story-step ${i === active ? 'is-active' : ''}`}>
            <span className="step-n num">{String(i + 1).padStart(2, '0')}</span>
            <h3>{s.title}</h3>
            <p>{s.text}</p>
            {s.foot && <p className="fine">{s.foot}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}

function buildSteps(m, quote, trade, position, war) {
  if (!m) return [];
  const last = m.candles.at(-1).c;
  const lv = m.lv;
  const taken = (level, above) => (level == null ? '' : (above ? last > level : last < level) ? 'pris' : 'intact');
  const S = [];
  S.push({
    key: 'price', title: 'Le prix', layers: { price: 1 },
    text: `Le cacao New York cote ${money(quote?.price ?? last, 'USD')}${quote?.changePct != null ? `, ${pct(quote.changePct)} sur la séance` : ''}. Chaque bougie représente un jour ; voici les ${m.candles.length} derniers.`,
    foot: 'Données différées, source non officielle.',
  });
  S.push({
    key: 'structure', title: 'La structure', layers: { price: 0.55, structure: 1 },
    text: m.structure.trend === 'UNKNOWN' ? 'Pas assez de sommets et de creux pour lire la structure.' : `Structure Daily ${m.structure.label.toLowerCase()} : ${m.structure.detail.toLowerCase()}. Les points violets sont les sommets et creux qui la définissent.`,
    foot: 'Lecture simplifiée. BOS et CHoCH arriveront avec le moteur ICT.',
  });
  if (lv) S.push({
    key: 'liquidity', title: 'Les liquidités', layers: { price: 0.55, liquidity: 1 },
    text: `Au-dessus : plus haut de la veille ${money(lv.PDH, 'USD')} (${taken(lv.PDH, true)}) et de la semaine passée ${money(lv.PWH, 'USD')} (${taken(lv.PWH, true)}). En dessous : ${money(lv.PDL, 'USD')} (${taken(lv.PDL, false)}) et ${money(lv.PWL, 'USD')} (${taken(lv.PWL, false)}).`,
    foot: 'Liquidité estimée à partir de la structure des prix, pas une donnée de liquidation.',
  });
  if (m.ict?.tfs) {
    const d1 = m.ict.tfs.D1, h4 = m.ict.tfs['4H'];
    const z = [...(d1?.fvgs || []).map(x => ({ ...x, k: 'FVG', tf: 'D1' })), ...(d1?.obs || []).map(x => ({ ...x, k: 'OB', tf: 'D1' })), ...(h4?.fvgs || []).map(x => ({ ...x, k: 'FVG', tf: '4H' })), ...(h4?.obs || []).map(x => ({ ...x, k: 'OB', tf: '4H' }))]
      .map(x => ({ ...x, d: Math.abs((x.top + x.bottom) / 2 - last) / (m.atr || 1) }))
      .filter(x => x.d <= 3).sort((a, b) => a.d - b.d).slice(0, 2);
    const sw = [...(h4?.sweeps || []), ...(d1?.sweeps || [])].sort((a, b) => b.t - a.t)[0];
    const bos = [...(d1?.structure || []), ...(h4?.structure || [])].sort((a, b) => b.t - a.t)[0];
    S.push({
      key: 'ict', title: 'Les zones ICT', layers: { price: 0.5, ict: 1, liquidity: 0.3 },
      text: [
        z.length ? `Zones proches : ${z.map(x => `${x.k} ${x.dir === 'BULLISH' ? 'haussier' : 'baissier'} ${x.tf} ${money(x.bottom, 'USD')}–${money(x.top, 'USD')} (${num(x.d, 1)} ATR)`).join(' ; ')}.` : 'Aucun FVG ni order block actif à moins de 3 ATR du prix.',
        sw ? `Dernier sweep : ${sw.side === 'SELL' ? 'sell-side' : 'buy-side'} à ${money(sw.level, 'USD')}${sw.label ? ` (${sw.label})` : ''}.` : 'Aucun sweep récent.',
        bos ? `Dernière rupture : ${bos.type} ${bos.dir === 'BULLISH' ? 'haussier' : 'baissier'} au-delà de ${money(bos.level, 'USD')}.` : '',
      ].join(' '),
      foot: 'Zones et événements détectés par des règles sur les bougies Daily et 4H.',
    });
  }
  if (m.piv) S.push({
    key: 'piv', title: 'Pivots et volatilité', layers: { price: 0.55, piv: 1 },
    text: `Pivot du jour ${money(m.piv.P, 'USD')}, R1 ${money(m.piv.R1, 'USD')}, S1 ${money(m.piv.S1, 'USD')}. L’ATR sur 14 jours vaut ${money(m.atr, 'USD')}${m.vr != null ? `, soit ${num(m.vr, 2)}× sa moyenne` : ''} : la bande claire montre ±1 ATR autour du prix.`,
  });
  S.push({
    key: 'position', title: 'Ta position', layers: { price: 0.55, position: 1, liquidity: 0.3 },
    text: m.pos
      ? `Moyenne ${money(m.pos.avg, 'USD', 1)}${m.pos.stop != null ? `, invalidation à ${money(m.pos.stop, 'USD')} (${num(Math.abs(last - m.pos.stop) / m.atr, 1)} ATR)` : ', aucun stop défini'}. Engagé €${num(position.capital)} sur €${trade.plan.plannedCapital}.`
      : position.entriesCount ? 'Ta position est cotée dans une autre devise ou au prix saisi à la main : elle n’apparaît pas sur ce graphique.' : `Aucune position ouverte. Le budget de €${trade.plan.plannedCapital} reste intact.`,
  });
  S.push({
    key: 'verdict', title: { NO_SETUP: 'Rien à faire', WATCHING: 'Sous surveillance', DEVELOPING: 'Setup en formation', HIGH: 'Haute confluence', INVALIDATED: 'Thèse invalidée' }[war.status] || 'Rien à faire',
    layers: { price: 1, liquidity: 0.35, ict: 0.5, position: 0.8 },
    text: `${war.score != null ? `Confluence ${war.score} / 15. ` : ''}${war.confirmed?.length ? `Confirmé : ${war.confirmed.map(c => c.label.toLowerCase()).join(', ')}. ` : ''}${war.reasons.map(r => r.t).join(' ')}${war.next?.length ? ` À surveiller : ${war.next.join(', ')}.` : ''}`,
    foot: 'Une forte confluence ne sera jamais une certitude.',
  });
  return S;
}

// Maps D1 zones and D1 / 4H events onto the story candles (by time).
function ictLayer(ks, a) {
  if (!a?.tfs || !ks.length) return { zones: [], marks: [] };
  const idx = t => { let j = -1; for (let i = 0; i < ks.length; i++) if (ks[i].t <= t) j = i; return j; };
  const d1 = a.tfs.D1, h4 = a.tfs['4H'];
  const zones = [...(d1?.fvgs || []).map(z => ({ ...z, kind: 'FVG', tf: 'D1' })), ...(d1?.obs || []).map(z => ({ ...z, kind: 'OB', tf: 'D1' }))]
    .map(z => ({ ...z, x: idx(z.t) })).filter(z => z.x >= 0 && Math.abs((z.top + z.bottom) / 2 - ks.at(-1).c) <= 3 * (a.tfs.D1?.atr || Infinity)).slice(0, 4);
  const marks = [
    ...[...(d1?.sweeps || []), ...(h4?.sweeps || [])].map(s => ({ kind: 'sweep', dir: s.dir, price: s.level, t: s.t, label: 'sweep' })),
    ...(d1?.structure || []).map(e => ({ kind: 'bos', dir: e.dir, price: e.level, t: e.t, label: e.type })),
  ].map(m => ({ ...m, x: idx(m.t) })).filter(m => m.x >= 0).slice(-5);
  return { zones, marks };
}
