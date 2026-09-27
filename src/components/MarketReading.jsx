import { useEffect, useMemo, useRef, useState } from 'react';
import { drawStory } from '../lib/storyChart.js';
import { useReducedMotion } from '../hooks/useReducedMotion.js';
import { money, num, pct } from '../lib/format.js';
import { previousLevels, structure, swings, volatilityRatio } from '../../lib/engines/technical.js';

const LAYERS = ['price', 'structure', 'liquidity', 'piv', 'position'];

// Scroll storytelling: the chart stays pinned while the reading of the market unfolds step by step.
// Every sentence is computed from the real candles; nothing here is decorative text.
export function MarketReading({ daily, quote, atr14, trade, position, war }) {
  const rm = useReducedMotion();
  const [active, setActive] = useState(0);
  const canvas = useRef(null);
  const steps = useRef([]);
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
    };
  }, [daily, atr14, position.entriesCount, position.avg, trade.priceSource, trade.product.priceCurrency, trade.stop, trade.targets]);

  const STEPS = useMemo(() => buildSteps(model, quote, trade, position, war), [model, quote, trade, position, war]);

  // which step is crossing the middle of the screen
  useEffect(() => {
    const io = new IntersectionObserver(es => {
      for (const e of es) if (e.isIntersecting) setActive(Number(e.target.dataset.i));
    }, { rootMargin: '-48% 0px -48% 0px' });
    steps.current.forEach(el => el && io.observe(el));
    return () => io.disconnect();
  }, [STEPS.length]);

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
      <div className="story-stage">
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
    key: 'verdict', title: war.doNothing ? 'Rien à faire' : 'Setup', layers: { price: 1, liquidity: 0.35, structure: 0.35, position: 0.8 },
    text: war.reasons.map(r => r.t).join(' '),
    foot: 'Une forte confluence ne sera jamais une certitude.',
  });
  return S;
}
