// ICT / SMC detection on one timeframe. Deterministic rules on real candles, no AI.
// Candle: { t (unix s), o, h, l, c, v }. All "zones" are [bottom, top].
import { atrSeries, swings } from './technical.js';

const last = (a, n) => a.slice(Math.max(0, a.length - n));

// BOS / CHoCH: a close beyond the last confirmed swing. CHoCH when it goes against the current trend.
export function structureEvents(ks, sw, k) {
  const events = [];
  let trend = 'NEUTRAL', hi = null, lo = null, p = 0;
  const sorted = [...sw].sort((a, b) => a.i - b.i);
  for (let i = 0; i < ks.length; i++) {
    // a swing at index j is only known once k candles have closed after it
    while (p < sorted.length && sorted[p].i + k <= i) {
      const s = sorted[p++];
      if (s.type === 'H') hi = { ...s, broken: false };
      else lo = { ...s, broken: false };
    }
    const c = ks[i].c;
    if (hi && !hi.broken && c > hi.price) {
      events.push({ i, t: ks[i].t, dir: 'BULLISH', type: trend === 'BEARISH' ? 'CHoCH' : 'BOS', level: hi.price, from: hi.i });
      hi.broken = true; trend = 'BULLISH';
    }
    if (lo && !lo.broken && c < lo.price) {
      events.push({ i, t: ks[i].t, dir: 'BEARISH', type: trend === 'BULLISH' ? 'CHoCH' : 'BOS', level: lo.price, from: lo.i });
      lo.broken = true; trend = 'BEARISH';
    }
  }
  return { events, trend };
}

// Fair value gaps (3-candle imbalance) and what price did with them afterwards.
export function findFvgs(ks, atr) {
  const out = [];
  const min = (atr || 0) * 0.1;
  for (let i = 1; i < ks.length - 1; i++) {
    const a = ks[i - 1], c = ks[i + 1];
    let z = null;
    if (c.l > a.h && c.l - a.h >= min) z = { dir: 'BULLISH', bottom: a.h, top: c.l };
    if (c.h < a.l && a.l - c.h >= min) z = { dir: 'BEARISH', bottom: c.h, top: a.l };
    if (!z) continue;
    let status = 'OPEN';
    for (let j = i + 2; j < ks.length; j++) {
      if (z.dir === 'BULLISH') { if (ks[j].l <= z.bottom) { status = 'FILLED'; break; } if (ks[j].l < z.top) status = 'MITIGATED'; }
      else { if (ks[j].h >= z.top) { status = 'FILLED'; break; } if (ks[j].h > z.bottom) status = 'MITIGATED'; }
    }
    out.push({ ...z, i: i + 1, t: c.t, status });
  }
  return out;
}

// Displacement: a large, decisive candle (body ≥ 1.5 ATR and ≥ 60 % of its range).
export function findDisplacements(ks, atrS) {
  const out = [];
  ks.forEach((k, i) => {
    const a = atrS[i] ?? atrS[i - 1];
    const body = Math.abs(k.c - k.o), range = k.h - k.l;
    if (a && range > 0 && body >= 1.5 * a && body / range >= 0.6) out.push({ i, t: k.t, dir: k.c > k.o ? 'BULLISH' : 'BEARISH', size: body / a });
  });
  return out;
}

// Order block: last opposite candle before a displacement.
export function findOrderBlocks(ks, displacements) {
  const out = [];
  for (const d of displacements) {
    const want = d.dir === 'BULLISH' ? (k => k.c < k.o) : (k => k.c > k.o);
    let j = -1;
    for (let x = d.i - 1; x >= Math.max(0, d.i - 3); x--) if (want(ks[x])) { j = x; break; }
    if (j < 0) continue;
    const z = { dir: d.dir, bottom: ks[j].l, top: ks[j].h, i: j, t: ks[j].t };
    let status = 'FRESH';
    for (let y = d.i + 1; y < ks.length; y++) {
      if (d.dir === 'BULLISH') { if (ks[y].c < z.bottom) { status = 'BROKEN'; break; } if (ks[y].l <= z.top) status = 'MITIGATED'; }
      else { if (ks[y].c > z.top) { status = 'BROKEN'; break; } if (ks[y].h >= z.bottom) status = 'MITIGATED'; }
    }
    if (!out.some(o => o.i === z.i)) out.push({ ...z, status });
  }
  return out;
}

// Equal highs / lows: two swings at (almost) the same price, a classic resting liquidity pool.
export function equalLevels(ks, sw, atr) {
  const tol = (atr || 0) * 0.15;
  const out = [];
  for (const type of ['H', 'L']) {
    const s = sw.filter(x => x.type === type);
    for (let a = 0; a < s.length; a++) for (let b = a + 1; b < s.length; b++) {
      if (Math.abs(s[a].price - s[b].price) > tol || s[b].i - s[a].i < 3) continue;
      const level = type === 'H' ? Math.max(s[a].price, s[b].price) : Math.min(s[a].price, s[b].price);
      const after = ks.slice(s[b].i + 1);
      const swept = type === 'H' ? after.some(k => k.h > level) : after.some(k => k.l < level);
      out.push({ type: type === 'H' ? 'EQH' : 'EQL', side: type === 'H' ? 'BUY' : 'SELL', level, i: s[b].i, t: ks[s[b].i].t, swept });
    }
  }
  return out;
}

// Sweep: a wick through a level followed by a close back on the other side.
export function findSweeps(ks, levels, recent = 12) {
  const out = [];
  const start = Math.max(0, ks.length - recent);
  for (let i = start; i < ks.length; i++) {
    const k = ks[i];
    for (const L of levels) {
      if (L.i != null && L.i >= i) continue;
      if (L.side === 'SELL' && k.l < L.level && k.c > L.level) out.push({ i, t: k.t, dir: 'BULLISH', side: 'SELL', level: L.level, label: L.label });
      if (L.side === 'BUY' && k.h > L.level && k.c < L.level) out.push({ i, t: k.t, dir: 'BEARISH', side: 'BUY', level: L.level, label: L.label });
    }
  }
  return out;
}

export function rejections(ks, atr, n = 3) {
  return last(ks, n).flatMap((k, x) => {
    const i = ks.length - n + x, body = Math.abs(k.c - k.o);
    const lower = Math.min(k.o, k.c) - k.l, upper = k.h - Math.max(k.o, k.c);
    const out = [];
    if (lower >= 2 * body && lower >= 0.5 * (atr || Infinity)) out.push({ i, t: k.t, dir: 'BULLISH' });
    if (upper >= 2 * body && upper >= 0.5 * (atr || Infinity)) out.push({ i, t: k.t, dir: 'BEARISH' });
    return out;
  });
}

export function volumeSpike(ks) {
  const v = ks.map(k => k.v).filter(x => x != null && x > 0);
  if (v.length < 21) return null;
  const lastV = v.at(-1), avg = v.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
  return avg ? { ratio: lastV / avg, spike: lastV / avg >= 1.5 } : null;
}

// Full reading of one timeframe. `external` = levels from higher timeframes (PDH, PWL…).
export function analyzeTf(candles, { k = 2, lookback = 150, external = [] } = {}) {
  const ks = candles.slice(-lookback);
  if (ks.length < 30) return null;
  const atrS = atrSeries(ks, 14);
  const atr = atrS.at(-1);
  const sw = swings(ks, k);
  const { events, trend } = structureEvents(ks, sw, k);
  const disp = findDisplacements(ks, atrS);
  const pools = equalLevels(ks, sw, atr);
  const swingLevels = sw.filter(s => s.i + k < ks.length).map(s => ({ side: s.type === 'H' ? 'BUY' : 'SELL', level: s.price, i: s.i, label: s.type === 'H' ? 'swing high' : 'swing low' }));
  const levels = [...swingLevels, ...pools.map(p => ({ side: p.side, level: p.level, i: p.i, label: p.type })), ...external];
  return {
    candles: ks.length, atr, price: ks.at(-1).c, lastTime: ks.at(-1).t, trend,
    structure: events.slice(-6), swings: sw.slice(-12),
    fvgs: findFvgs(ks, atr).filter(f => f.status !== 'FILLED').slice(-8),
    obs: findOrderBlocks(ks, disp).filter(o => o.status !== 'BROKEN').slice(-8),
    displacements: disp.slice(-5), pools,
    sweeps: findSweeps(ks, levels),
    rejections: rejections(ks, atr),
    volume: volumeSpike(ks),
  };
}
