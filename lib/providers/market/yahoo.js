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

export function parseChart(json) {
  const err = json?.chart?.error;
  if (err) throw new Error(`Yahoo: ${err.description || err.code || 'erreur inconnue'}`);
  const r = json?.chart?.result?.[0];
  if (!r || !r.meta) throw new Error('Yahoo: réponse vide');
  const m = r.meta;
  const ts = r.timestamp || [];
  const q = r.indicators?.quote?.[0] || {};
  const candles = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
    // Yahoo pads missing bars with nulls: skip them rather than invent values.
    if ([o, h, l, c].some(v => v == null || Number.isNaN(v))) continue;
    candles.push({ t: ts[i], o, h, l, c, v: q.volume?.[i] ?? null });
  }
  const price = m.regularMarketPrice ?? candles.at(-1)?.c ?? null;
  const prevClose = m.chartPreviousClose ?? m.previousClose ?? null;
  return {
    price,
    prevClose,
    change: price != null && prevClose != null ? price - prevClose : null,
    changePct: price != null && prevClose ? (price / prevClose - 1) * 100 : null,
    currency: m.currency || 'USD',
    exchange: m.fullExchangeName || m.exchangeName || 'ICE Futures U.S.',
    dataTime: m.regularMarketTime ? m.regularMarketTime * 1000 : (candles.at(-1)?.t ?? 0) * 1000 || null,
    candles,
  };
}

export async function fetchChart(symbol, tf, fetchImpl = fetch) {
  const cfg = TIMEFRAMES[tf];
  if (!cfg) throw new Error(`Unité de temps inconnue : ${tf}`);
  const url = `${BASE}${encodeURIComponent(symbol)}?interval=${cfg.interval}&range=${cfg.range}&includePrePost=false`;
  const res = await fetchImpl(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (CocoaWarRoom personal dashboard)', Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
  return { ...parseChart(await res.json()), aggregateHours: cfg.aggregateHours || null };
}
