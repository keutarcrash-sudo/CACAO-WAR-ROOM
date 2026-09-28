// Contract rolls on the continuous future (Yahoo CC=F). When the nearest ICE cocoa contract expires,
// the series jumps to the next month: the price "moves" by the spread between the two contracts
// although the market did not. Left alone, that jump inflates the ATR, breaks the structure and
// fires false alerts. We detect it (roll window + gap that trading did not fill) and back-adjust
// the older candles so the series is continuous in the current contract.
import { atrSeries } from './technical.js';

// ICE cocoa (CC) delivery months: March, May, July, September, December.
export const DELIVERY_MONTHS = [2, 4, 6, 8, 11];

const DAY = 86400e3;
const isBiz = d => d.getUTCDay() !== 0 && d.getUTCDay() !== 6;
const addBiz = (d, n) => {
  const x = new Date(d);
  const step = n < 0 ? -1 : 1;
  for (let k = Math.abs(n); k > 0;) { x.setTime(x.getTime() + step * DAY); if (isBiz(x)) k--; }
  return x;
};
const firstBiz = (y, m) => { const d = new Date(Date.UTC(y, m, 1)); while (!isBiz(d)) d.setTime(d.getTime() + DAY); return d; };
const lastBiz = (y, m) => { const d = new Date(Date.UTC(y, m + 1, 0)); while (!isBiz(d)) d.setTime(d.getTime() - DAY); return d; };

// Window in which the continuous contract may switch: from a few days before first notice day
// (10 business days before the delivery month) to a few days after the last trading day
// (about 11 business days before the end of the delivery month). Exchange holidays are ignored,
// hence the margins.
export function rollWindows(year) {
  return DELIVERY_MONTHS.map(m => ({
    month: m,
    from: addBiz(firstBiz(year, m), -13).getTime(),
    to: addBiz(lastBiz(year, m), -9).getTime() + DAY,
  }));
}

export function inRollWindow(ms) {
  const y = new Date(ms).getUTCFullYear();
  return [...rollWindows(y - 1), ...rollWindows(y)].some(w => ms >= w.from && ms < w.to);
}

// A roll: inside a roll window, the open jumps away from the previous close by at least `k` ATR
// and the day never trades back to that close (a real gap that fills is left alone).
export function detectRolls(daily, { k = 1.2 } = {}) {
  if (!daily || daily.length < 20) return [];
  const atr = atrSeries(daily);
  const out = [];
  for (let i = 15; i < daily.length; i++) {
    const prev = daily[i - 1], cur = daily[i], a = atr[i - 1];
    if (!a) continue;
    const gap = cur.o - prev.c;
    if (Math.abs(gap) < k * a) continue;
    if (prev.c >= cur.l && prev.c <= cur.h) continue;
    if (!inRollWindow(cur.t * 1000)) continue;
    out.push({ t: cur.t, gap, atr: a });
  }
  return out;
}

// Shift every candle before each roll by that roll's gap (older rolls add up).
export function backAdjust(candles, rolls) {
  if (!rolls?.length || !candles?.length) return candles;
  return candles.map(k => {
    const shift = rolls.reduce((s, r) => (k.t < r.t ? s + r.gap : s), 0);
    return shift ? { ...k, o: k.o + shift, h: k.h + shift, l: k.l + shift, c: k.c + shift, adjusted: true } : k;
  });
}
