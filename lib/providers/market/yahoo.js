// Yahoo Finance chart endpoint. Unofficial: no contract, delayed quotes, can change without notice.
// Everything it returns is labelled as such in the UI.

const BASE = 'https://query1.finance.yahoo.com/v8/finance/chart/';

// Yahoo has no 4h interval: 4H is built from 1h candles by the technical engine.
export const TIMEFRAMES = {
  W1: { interval: '1wk', range: '5y' },
  D1: { interval: '1d', range: '2y' },
  '4H': { interval: '1h', range: '3mo', aggregateHours: 4 },
  '1H': { interval: '1h', range: '1mo' },
  '15M': { interval: '15m', range: '5d' },
  '5M': { interval: '5m', range: '2d' },
};

export const SOURCE = {
  id: 'yahoo',
  name: 'Yahoo Finance (non officiel)',
  url: 'https://finance.yahoo.com/quote/CC=F',
  delayMinutes: 10,
};

export function parseChart(json, { daily = false } = {}) {
  const err = json?.chart?.error;
  if (err) throw new Error(`Yahoo: ${err.description || err.code || 'erreur inconnue'}`);
  const r = json?.chart?.result?.[0];
  if (!r || !r.meta) throw new Error('Yahoo: réponse vide');
  const m = r.meta;
  const ts = r.timestamp || [];
  const q = r.indicators?.quote?.[0] || {};
  const candles = [];
  const droppedAt = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
    // Yahoo pads missing bars with nulls: skip them rather than invent values.
    if ([o, h, l, c].some(v => v == null || Number.isNaN(v))) continue;
    if (!saneBar({ o, h, l, c }, daily)) { droppedAt.push(ts[i]); continue; }
    candles.push({ t: ts[i], o, h, l, c, v: q.volume?.[i] ?? null });
  }
  const price = m.regularMarketPrice ?? candles.at(-1)?.c ?? null;
  // Careful: chartPreviousClose is the close before the FIRST bar of the requested range
  // (two years ago for D1), not yesterday's close. Yesterday comes from the daily bars.
  let prevClose = typeof m.previousClose === 'number' ? m.previousClose : null;
  if (prevClose == null && daily && candles.length >= 2) {
    const last = candles.at(-1);
    const lastIsCurrentSession = m.regularMarketTime ? m.regularMarketTime - last.t < 86400 : true;
    prevClose = lastIsCurrentSession ? candles.at(-2).c : last.c;
  }
  return {
    price,
    prevClose,
    change: price != null && prevClose != null ? price - prevClose : null,
    changePct: price != null && prevClose ? (price / prevClose - 1) * 100 : null,
    currency: m.currency || 'USD',
    exchange: m.fullExchangeName || m.exchangeName || 'ICE Futures U.S.',
    dataTime: m.regularMarketTime ? m.regularMarketTime * 1000 : (candles.at(-1)?.t ?? 0) * 1000 || null,
    candles,
    gmtoffset: typeof m.gmtoffset === 'number' ? m.gmtoffset : 0,
    quality: { dropped: droppedAt.length, droppedAt },
  };
}

export async function fetchChart(symbol, tf, fetchImpl = fetch, { range } = {}) {
  const cfg = TIMEFRAMES[tf];
  if (!cfg) throw new Error(`Unité de temps inconnue : ${tf}`);
  const url = `${BASE}${encodeURIComponent(symbol)}?interval=${cfg.interval}&range=${range || cfg.range}&includePrePost=false`;
  const res = await fetchImpl(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (CocoaWarRoom personal dashboard)', Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
  return { ...parseChart(await res.json(), { daily: cfg.interval === '1d' }), aggregateHours: cfg.aggregateHours || null };
}

// A bar whose open or close sits outside its own high-low range is corrupt. On daily bars, a range of zero
// (open = high = low = close) is a placeholder, not a trading session. Both would distort ATR and structure.
export function saneBar({ o, h, l, c }, daily = false) {
  const tol = Math.max(h, 1) * 0.001;
  if (h < l) return false;
  if (o > h + tol || o < l - tol || c > h + tol || c < l - tol) return false;
  if (daily && h === l) return false;
  return true;
}
