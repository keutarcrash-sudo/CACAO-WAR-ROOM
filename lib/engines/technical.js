// Deterministic technical calculations on real candles. No AI, no guessing.
// Candle shape: { t: unix seconds, o, h, l, c, v }

// Group candles into buckets of `hours` (UTC-aligned). Used to build 4H from 1H.
export function aggregate(candles, hours) {
  const size = hours * 3600;
  const out = [];
  for (const k of candles) {
    const bucket = Math.floor(k.t / size) * size;
    const last = out.at(-1);
    if (last && last.t === bucket) {
      last.h = Math.max(last.h, k.h);
      last.l = Math.min(last.l, k.l);
      last.c = k.c;
      last.v = last.v == null || k.v == null ? null : last.v + k.v;
    } else {
      out.push({ t: bucket, o: k.o, h: k.h, l: k.l, c: k.c, v: k.v });
    }
  }
  return out;
}

export function trueRanges(candles) {
  return candles.map((k, i) => i === 0 ? k.h - k.l : Math.max(k.h - k.l, Math.abs(k.h - candles[i - 1].c), Math.abs(k.l - candles[i - 1].c)));
}

// Wilder ATR series. Returns an array aligned with candles (null until enough data).
export function atrSeries(candles, n = 14) {
  const tr = trueRanges(candles);
  const out = new Array(candles.length).fill(null);
  if (candles.length < n + 1) return out;
  let a = tr.slice(1, n + 1).reduce((s, x) => s + x, 0) / n;
  out[n] = a;
  for (let i = n + 1; i < candles.length; i++) { a = (a * (n - 1) + tr[i]) / n; out[i] = a; }
  return out;
}

export function atr(candles, n = 14) {
  return atrSeries(candles, n).at(-1) ?? null;
}

// Current ATR divided by its own average over `lookback` bars: >1 expansion, <1 compression.
export function volatilityRatio(candles, n = 14, lookback = 20) {
  const s = atrSeries(candles, n).filter(x => x != null);
  if (s.length < lookback) return null;
  const avg = s.slice(-lookback).reduce((a, b) => a + b, 0) / lookback;
  return avg ? s.at(-1) / avg : null;
}

// Classic floor pivots from one period's high / low / close.
export function pivots({ h, l, c }) {
  const P = (h + l + c) / 3;
  return { P, R1: 2 * P - l, S1: 2 * P - h, R2: P + (h - l), S2: P - (h - l), R3: h + 2 * (P - l), S3: l - 2 * (h - P) };
}

// ISO week key for weekly grouping of daily candles.
function weekKey(t) {
  const d = new Date(t * 1000);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

export function toWeekly(daily) {
  const out = [];
  for (const k of daily) {
    const key = weekKey(k.t), last = out.at(-1);
    if (last && last.key === key) { last.h = Math.max(last.h, k.h); last.l = Math.min(last.l, k.l); last.c = k.c; }
    else out.push({ key, t: k.t, o: k.o, h: k.h, l: k.l, c: k.c });
  }
  return out;
}

// Previous day and previous week levels from daily candles.
// The last daily candle is treated as the current (unfinished) session.
export function previousLevels(daily) {
  if (daily.length < 3) return null;
  const pd = daily.at(-2);
  const weeks = toWeekly(daily);
  const pw = weeks.length >= 2 ? weeks.at(-2) : null;
  return {
    PDH: pd.h, PDL: pd.l, PDC: pd.c,
    PWH: pw?.h ?? null, PWL: pw?.l ?? null,
    dailyPivots: pivots(pd),
    weeklyPivots: pw ? pivots(pw) : null,
  };
}

// Fractal swing points: a high (low) greater (lower) than the k bars on each side.
export function swings(candles, k = 3) {
  const out = [];
  for (let i = k; i < candles.length - k; i++) {
    let hi = true, lo = true;
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue;
      if (candles[j].h >= candles[i].h) hi = false;
      if (candles[j].l <= candles[i].l) lo = false;
    }
    if (hi) out.push({ i, t: candles[i].t, price: candles[i].h, type: 'H' });
    if (lo) out.push({ i, t: candles[i].t, price: candles[i].l, type: 'L' });
  }
  return out;
}

// Simplified structure from the last two swing highs and lows.
export function structure(candles, k = 3) {
  const s = swings(candles, k);
  const H = s.filter(x => x.type === 'H').slice(-2), L = s.filter(x => x.type === 'L').slice(-2);
  if (H.length < 2 || L.length < 2) return { trend: 'UNKNOWN', label: 'Données insuffisantes' };
  const hh = H[1].price > H[0].price, hl = L[1].price > L[0].price;
  if (hh && hl) return { trend: 'BULLISH', label: 'Bullish', detail: 'Sommets et creux ascendants' };
  if (!hh && !hl) return { trend: 'BEARISH', label: 'Bearish', detail: 'Sommets et creux descendants' };
  return { trend: 'NEUTRAL', label: 'Neutre', detail: hh ? 'Sommet plus haut, creux plus bas' : 'Sommet plus bas, creux plus haut' };
}

// Where the price sits inside the range of the last `n` candles (0 = low, 1 = high).
export function rangePosition(candles, price, n = 20) {
  const w = candles.slice(-n);
  if (w.length < n) return null;
  const hi = Math.max(...w.map(k => k.h)), lo = Math.min(...w.map(k => k.l));
  return hi > lo ? { pos: (price - lo) / (hi - lo), hi, lo } : null;
}
