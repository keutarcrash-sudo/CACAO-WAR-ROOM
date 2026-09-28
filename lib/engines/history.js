// Post-trade memory (spec phase 9): what did the market do after each status change?
export const HORIZONS = [1, 3, 7];
const DAY = 86400e3;

// Move in the setup's direction (positive = the setup was right), from daily candles.
export function evaluateOutcome(row, daily, now = Date.now()) {
  const dir = row.direction === 'SHORT' ? -1 : 1;
  const out = { ...(row.outcome || {}) };
  for (const h of HORIZONS) {
    if (out[`d${h}`] || now - row.at < h * DAY) continue;
    const window = daily.filter(k => k.t * 1000 > row.at && k.t * 1000 <= row.at + h * DAY);
    if (!window.length) continue;
    const close = window.at(-1).c;
    const fav = Math.max(...window.map(k => (dir > 0 ? k.h : k.l)));
    const adv = Math.min(...window.map(k => (dir > 0 ? k.l : k.h)));
    const pct = p => ((p / row.price - 1) * 100) * dir;
    out[`d${h}`] = { pct: pct(close), best: pct(fav), worst: pct(adv) };
  }
  return { outcome: out, done: HORIZONS.every(h => out[`d${h}`]) };
}

const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

// Which statuses and which confirmations were followed by a move in the right direction.
export function historyStats(rows, horizon = 'd7') {
  const done = rows.filter(r => r.outcome?.[horizon]);
  const group = list => ({ n: list.length, avg: avg(list.map(r => r.outcome[horizon].pct)), hit: list.length ? list.filter(r => r.outcome[horizon].pct > 0).length / list.length : null });
  const byStatus = Object.fromEntries(['NO_SETUP', 'WATCHING', 'DEVELOPING', 'HIGH'].map(s => [s, group(done.filter(r => r.status === s))]));
  const keys = [...new Set(done.flatMap(r => r.items))];
  const byItem = keys.map(k => ({ k, ...group(done.filter(r => r.items.includes(k))) })).sort((a, b) => (b.avg ?? -99) - (a.avg ?? -99));
  return { horizon, total: rows.length, evaluated: done.length, byStatus, byItem, enough: done.length >= 10 };
}
