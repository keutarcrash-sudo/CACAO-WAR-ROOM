// Confluence score (spec §36-39) and setup status. Counts confirmations; it is not a probability.
import { previousLevels, volatilityRatio, rangePosition } from './technical.js';

export const MAX_SCORE = 15;
export const labelOf = s => (s >= 11 ? 'HIGH' : s >= 8 ? 'DEVELOPING' : s >= 5 ? 'WATCHING' : 'NO_SETUP');
const fmt = x => Math.round(x).toLocaleString('en-US');

// Recent = within the last `n` candles of that timeframe.
const recent = (a, tf, n) => a && tf ? tf.candles - 1 - a.i <= n : false;

export function confluence({ dir, price, tfs, daily, fundamentals }) {
  const L = dir === 'LONG';
  const want = L ? 'BULLISH' : 'BEARISH';
  const d1 = tfs.D1, h4 = tfs['4H'], h1 = tfs['1H'], m15 = tfs['15M'];
  const atrD = d1?.atr || null, atr4 = h4?.atr || atrD;
  const lv = daily ? previousLevels(daily) : null;
  const items = [];
  const add = (k, label, pts, ok, evidence, tf = null) => items.push({ k, label, pts, ok: !!ok, evidence: ok ? evidence : null, tf });
  const near = (z, a, k = 0.5) => a && price >= z.bottom - k * a && price <= z.top + k * a;
  const below = (lvl, a, k) => a && (L ? lvl <= price && price - lvl <= k * a : lvl >= price && lvl - price <= k * a);
  const aboveAgainst = (lvl, a, k) => a && (L ? lvl > price && lvl - price <= k * a : lvl < price && price - lvl <= k * a);

  // Fundamentals (±2)
  const fb = fundamentals?.bias;
  if (fb === (L ? 'BULLISH' : 'BEARISH')) add('fund', 'Fondamentaux favorables', 2, true, `biais ${fb} (${fundamentals.total > 0 ? '+' : ''}${fundamentals.total})`);
  else if (fb === (L ? 'BEARISH' : 'BULLISH')) add('fund', 'Fondamentaux contraires', -2, true, `biais ${fb} (${fundamentals.total > 0 ? '+' : ''}${fundamentals.total})`);
  else add('fund', 'Fondamentaux favorables', 2, false);

  // HTF support (+2) / major resistance in the way (−2)
  // a zone wider than 1.5 daily ATR is too vague to count as a level
  const usable = z => !atrD || z.top - z.bottom <= 1.5 * atrD;
  const htfZones = [d1, h4].filter(Boolean).flatMap((t, x) => [...t.fvgs, ...t.obs].filter(z => z.dir === want && usable(z)).map(z => ({ ...z, tf: x ? '4H' : 'D1' })));
  const htfZone = htfZones.find(z => near(z, atrD));
  const htfLevels = [lv && (L ? ['PDL', lv.PDL] : ['PDH', lv.PDH]), lv && (L ? ['PWL', lv.PWL] : ['PWH', lv.PWH]),
    ...[d1, h4].filter(Boolean).flatMap(t => t.swings.filter(s => s.type === (L ? 'L' : 'H')).slice(-2).map(s => ['swing', s.price]))].filter(x => x && x[1] != null);
  const htfLevel = htfLevels.find(([, p]) => below(p, atrD, 0.5));
  add('htf', L ? 'Support HTF (Daily / 4H)' : 'Résistance HTF (Daily / 4H)', 2, htfZone || htfLevel,
    htfZone ? `${htfZone.tf} ${htfZone.bottom === htfZone.top ? '' : `zone ${fmt(htfZone.bottom)}–${fmt(htfZone.top)}`}` : htfLevel ? `${htfLevel[0]} ${fmt(htfLevel[1])}` : null);
  const against = [d1, h4].filter(Boolean).flatMap(t => [...t.obs, ...t.fvgs].filter(z => z.dir !== want && usable(z))).find(z => aboveAgainst(L ? z.bottom : z.top, atrD, 0.5))
    || (lv && [[L ? 'PWH' : 'PWL', L ? lv.PWH : lv.PWL]].find(([, p]) => p != null && aboveAgainst(p, atrD, 0.5)));
  if (against) add('against', L ? 'Résistance majeure proche' : 'Support majeur proche', -2, true, Array.isArray(against) ? `${against[0]} ${fmt(against[1])}` : `zone ${fmt(against.bottom)}–${fmt(against.top)}`);

  // Liquidity pool on the side we expect to be taken (+1)
  const side = L ? 'SELL' : 'BUY';
  const pool = [h4, h1].filter(Boolean).flatMap(t => t.pools.filter(p => p.side === side && !p.swept)).find(p => below(p.level, atrD, 1));
  const extPool = lv && (L ? [['PDL', lv.PDL], ['PWL', lv.PWL]] : [['PDH', lv.PDH], ['PWH', lv.PWH]]).find(([, p]) => p != null && below(p, atrD, 1));
  add('pool', `Liquidité ${L ? 'sell-side sous' : 'buy-side au-dessus du'} prix`, 1, pool || extPool, pool ? `${pool.type} ${fmt(pool.level)}` : extPool ? `${extPool[0]} ${fmt(extPool[1])}` : null);

  // Liquidity sweep (+2)
  const sweep = [['4H', h4], ['1H', h1]].flatMap(([n, t]) => (t?.sweeps || []).filter(s => s.dir === want && recent(s, t, 12)).map(s => ({ ...s, tf: n }))).at(-1);
  add('sweep', 'Liquidity sweep', 2, sweep, sweep && `${sweep.tf} : ${sweep.label || 'niveau'} ${fmt(sweep.level)} balayé puis clôture ${L ? 'au-dessus' : 'en dessous'}`);

  // FVG (+1) and order block (+1) near price
  const fvg = [['4H', h4], ['1H', h1]].flatMap(([n, t]) => (t?.fvgs || []).filter(z => z.dir === want && near(z, atr4)).map(z => ({ ...z, tf: n })))[0];
  add('fvg', 'Fair Value Gap', 1, fvg, fvg && `${fvg.tf} ${fmt(fvg.bottom)}–${fmt(fvg.top)} (${fvg.status === 'OPEN' ? 'ouvert' : 'partiellement comblé'})`);
  const ob = [['4H', h4], ['1H', h1]].flatMap(([n, t]) => (t?.obs || []).filter(z => z.dir === want && near(z, atr4)).map(z => ({ ...z, tf: n })))[0];
  add('ob', 'Order Block', 1, ob, ob && `${ob.tf} ${fmt(ob.bottom)}–${fmt(ob.top)} (${ob.status === 'FRESH' ? 'intact' : 'déjà testé'})`);

  // Displacement (+1)
  const disp = [['4H', h4], ['1H', h1]].flatMap(([n, t]) => (t?.displacements || []).filter(x => x.dir === want && recent(x, t, 10)).map(x => ({ ...x, tf: n }))).at(-1);
  add('disp', 'Displacement', 1, disp, disp && `${disp.tf} : bougie de ${disp.size.toFixed(1)} ATR`);

  // BOS / CHoCH on the entry timeframes (+2)
  const bos = [['1H', h1], ['15M', m15]].flatMap(([n, t]) => (t?.structure || []).filter(e => e.dir === want && recent(e, t, 20)).map(e => ({ ...e, tf: n }))).at(-1);
  add('bos', 'BOS / CHoCH', 2, bos, bos && `${bos.tf} : ${bos.type} ${bos.dir === 'BULLISH' ? 'haussier' : 'baissier'} au-delà de ${fmt(bos.level)}`);

  // Pivot confluence (+1)
  const piv = lv && Object.entries(lv.dailyPivots).filter(([k]) => (L ? /^(P|S1|S2)$/ : /^(P|R1|R2)$/).test(k)).find(([, p]) => atrD && Math.abs(p - price) <= 0.25 * atrD);
  add('piv', 'Confluence de pivots', 1, piv, piv && `pivot ${piv[0]} ${fmt(piv[1])}`);

  // Price action: rejection (+1) and unusual volume (+1) on the entry timeframes
  const rej = [['1H', h1], ['15M', m15]].flatMap(([n, t]) => (t?.rejections || []).filter(r => r.dir === want).map(r => ({ ...r, tf: n })))[0];
  add('rej', 'Rejet (mèche)', 1, rej, rej && `${rej.tf} : mèche de rejet ${L ? 'basse' : 'haute'}`);
  const vol = [['1H', h1], ['15M', m15]].find(([, t]) => t?.volume?.spike);
  add('vol', 'Volume inhabituel', 1, vol, vol && `${vol[0]} : ${vol[1].volume.ratio.toFixed(1)}× la moyenne`);

  const score = items.reduce((s, x) => s + (x.ok ? x.pts : 0), 0);
  return { dir, score, max: MAX_SCORE, label: labelOf(score), items };
}

// Final status: confluence, capped by the "do nothing" rules (spec §47).
export function evaluateSetup({ market, daily, fundamentals, conf, position, direction = 'LONG' }) {
  const hard = [], soft = [];
  if (!market || market.status !== 'OK') hard.push({ k: 'offline', t: 'Source de prix hors ligne : données insuffisantes.' });
  const vr = daily ? volatilityRatio(daily) : null;
  if (vr != null && vr > 2) hard.push({ k: 'vol', t: `Volatilité excessive : ATR à ${vr.toFixed(1)}× sa moyenne.` });
  const L = direction === 'LONG';
  if (fundamentals?.bias === (L ? 'BEARISH' : 'BULLISH')) hard.push({ k: 'fund', t: `Fondamentaux contraires (${fundamentals.total > 0 ? '+' : ''}${fundamentals.total}).` });
  else if (!fundamentals || fundamentals.bias === 'INSUFFICIENT') soft.push({ k: 'fund', t: `Fondamentaux insuffisants (${fundamentals?.coverage ?? 0} facteurs) : aucun biais fiable.` });
  else if (fundamentals.bias === 'NEUTRAL') soft.push({ k: 'fund', t: `Fondamentaux neutres (${fundamentals.total > 0 ? '+' : ''}${fundamentals.total}).` });
  const price = market?.quote?.price;
  const rp = daily && price != null ? rangePosition(daily, price, 20) : null;
  if (rp && rp.pos > 0.35 && rp.pos < 0.65) soft.push({ k: 'mid', t: `Prix au milieu du range 20 jours (${Math.round(rp.pos * 100)} %).` });
  if (!conf) soft.push({ k: 'conf', t: 'Analyse technique en cours de calcul.' });
  else if (!conf.items.find(i => i.k === 'htf')?.ok) soft.push({ k: 'nohtf', t: `Aucune zone HTF à moins de 0,5 ATR.` });

  const score = conf?.score ?? 0;
  let status = labelOf(score);
  if (hard.length) status = 'NO_SETUP';
  else if (soft.length && (status === 'DEVELOPING' || status === 'HIGH')) status = 'WATCHING';
  if (position?.flags?.technical === 'INVALIDATED') status = 'INVALIDATED';
  if (status === 'NO_SETUP' && score < 5 && conf) soft.push({ k: 'low', t: `Confluence faible : ${score} / ${MAX_SCORE}.` });

  const missing = (conf?.items || []).filter(i => !i.ok && i.pts > 0).sort((a, b) => b.pts - a.pts).slice(0, 3);
  return {
    status, direction, score, max: MAX_SCORE,
    doNothing: status === 'NO_SETUP' || status === 'WATCHING',
    reasons: [...hard, ...soft],
    confirmed: (conf?.items || []).filter(i => i.ok && i.pts > 0),
    against: (conf?.items || []).filter(i => i.ok && i.pts < 0),
    next: status === 'INVALIDATED' ? ['Réévaluer la position : aucun renforcement.']
      : missing.map(i => `${i.label} (+${i.pts})`),
  };
}
