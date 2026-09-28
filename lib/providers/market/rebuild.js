// Yahoo sometimes serves empty (open = high = low = close) or corrupt daily bars, and sometimes none at all.
// Those days did trade: their real range is in the hourly bars, so the daily bar is rebuilt from them.
// Days with no hourly data stay missing: nothing is invented.

const DAY = 86400;
const dateKey = (t, offset) => new Date((t + offset) * 1000).toISOString().slice(0, 10);

// Recent holes worth repairing: a dropped bar, or a gap longer than a long weekend.
export function needsRebuild(daily, droppedAt = [], since) {
  if (droppedAt.some(t => t >= since)) return true;
  return daily.some((k, i) => i > 0 && k.t >= since && k.t - daily[i - 1].t > 4 * DAY);
}

export function rebuildDaily(daily, hourly, { gmtoffset = 0, droppedAt = [] } = {}) {
  if (!hourly?.length) return { candles: daily, rebuilt: 0 };
  const have = new Set(daily.map(k => dateKey(k.t, gmtoffset)));
  const stamp = new Map(droppedAt.map(t => [dateKey(t, gmtoffset), t]));
  const days = new Map();
  for (const k of hourly) {
    const key = dateKey(k.t, gmtoffset);
    if (have.has(key)) continue;
    const d = days.get(key);
    if (!d) days.set(key, { t: stamp.get(key) ?? Date.parse(key) / 1000 - gmtoffset, o: k.o, h: k.h, l: k.l, c: k.c, v: k.v, n: 1 });
    else { d.h = Math.max(d.h, k.h); d.l = Math.min(d.l, k.l); d.c = k.c; d.v = d.v == null || k.v == null ? null : d.v + k.v; d.n++; }
  }
  // a day with a single hourly bar is too thin to stand for a session, unless it is today (session in progress)
  const lastKey = dateKey(hourly.at(-1).t, gmtoffset);
  const added = [...days.entries()].filter(([key, d]) => d.n >= 3 || key === lastKey).map(([, { n, ...d }]) => ({ ...d, rebuilt: true }));
  if (!added.length) return { candles: daily, rebuilt: 0 };
  return { candles: [...daily, ...added].sort((a, b) => a.t - b.t), rebuilt: added.length };
}
