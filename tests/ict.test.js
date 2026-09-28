import { describe, it, expect } from 'vitest';
import { structureEvents, findFvgs, findDisplacements, findOrderBlocks, equalLevels, findSweeps, analyzeTf } from '../lib/engines/ict.js';
import { atrSeries, swings } from '../lib/engines/technical.js';
import { confluence, evaluateSetup, labelOf } from '../lib/engines/confluence.js';

const H = 3600;
const bar = (i, o, h, l, c, v = 100) => ({ t: 1_790_000_000 + i * H, o, h, l, c, v });

// A textbook sequence: range, drop into equal lows, sweep, bullish displacement, BOS.
function scenario() {
  const k = [];
  let i = 0;
  const push = (o, h, l, c, v) => k.push(bar(i++, o, h, l, c, v));
  for (let n = 0; n < 30; n++) { const b = 100 + Math.sin(n / 2) * 2; push(b, b + 1, b - 1, b + 0.3); }
  // two equal lows around 95 separated by a bounce
  push(100, 100.5, 97, 97.5); push(97.5, 98, 95.0, 95.6); push(95.6, 98.5, 95.4, 98); push(98, 101, 97.8, 100.5);
  push(100.5, 100.8, 97.5, 97.8); push(97.8, 98, 95.05, 95.5); push(95.5, 97.5, 95.3, 97); push(97, 98, 96.2, 96.8);
  // sweep: wick below 95, close back above
  push(96.8, 97, 94.2, 96.1, 300);
  // bullish displacement creating a FVG, then BOS above the last swing high (~101)
  push(96.1, 103.2, 96, 103, 400); push(103, 105.5, 103.1, 105.2); push(105.2, 105.8, 104.4, 105.5); push(105.5, 106, 104.8, 105.1);
  return k;
}

describe('ICT detection', () => {
  const ks = scenario();
  const atrS = atrSeries(ks, 14), atr = atrS.at(-1);
  const sw = swings(ks, 2);

  it('finds the equal lows pool and marks it swept', () => {
    const eq = equalLevels(ks, sw, atr).find(p => p.type === 'EQL' && Math.abs(p.level - 95) < 0.5);
    expect(eq).toBeTruthy();
    expect(eq.level).toBeCloseTo(95.0, 1);
    expect(eq.swept).toBe(true);
  });
  it('detects the sell-side sweep with a close back above', () => {
    const lv = [{ side: 'SELL', level: 95.0, i: 36, label: 'EQL' }];
    const s = findSweeps(ks, lv, 12);
    expect(s.some(x => x.dir === 'BULLISH' && x.level === 95.0)).toBe(true);
  });
  it('detects the displacement, the FVG it leaves and the order block before it', () => {
    const d = findDisplacements(ks, atrS);
    expect(d.at(-1).dir).toBe('BULLISH');
    const f = findFvgs(ks, atr).filter(z => z.dir === 'BULLISH');
    expect(f.length).toBeGreaterThan(0);
    const ob = findOrderBlocks(ks, d).find(o => o.dir === 'BULLISH');
    expect(ob).toBeTruthy();
  });
  it('reads a bullish break of structure after the sweep', () => {
    const { events, trend } = structureEvents(ks, sw, 2);
    expect(trend).toBe('BULLISH');
    const e = events.at(-1);
    expect(e.dir).toBe('BULLISH');
    expect(['BOS', 'CHoCH']).toContain(e.type);
  });
  it('never uses a swing before it is confirmed', () => {
    const { events } = structureEvents(ks, sw, 2);
    for (const e of events) expect(e.i).toBeGreaterThanOrEqual(e.from + 2);
  });
  it('analyzes a timeframe end to end', () => {
    const a = analyzeTf(ks, { k: 2 });
    expect(a.trend).toBe('BULLISH');
    expect(a.candles).toBe(ks.length);
    expect(analyzeTf(ks.slice(0, 10))).toBeNull();
  });
});

describe('confluence', () => {
  const tf = over => ({ candles: 100, atr: 2, price: 100, fvgs: [], obs: [], swings: [], pools: [], sweeps: [], displacements: [], structure: [], rejections: [], volume: null, ...over });
  const daily = Array.from({ length: 40 }, (_, i) => ({ t: 1_789_000_000 + i * 86400, o: 100, h: 104, l: 96, c: 100 }));
  it('counts each confirmation with its points and evidence', () => {
    const tfs = {
      D1: tf({ fvgs: [{ dir: 'BULLISH', bottom: 99, top: 100.5, status: 'OPEN', i: 90 }] }),
      '4H': tf({ sweeps: [{ dir: 'BULLISH', level: 97, i: 95, label: 'EQL' }], displacements: [{ dir: 'BULLISH', i: 96, size: 1.8 }], obs: [{ dir: 'BULLISH', bottom: 99.5, top: 100.2, status: 'FRESH', i: 94 }] }),
      '1H': tf({ structure: [{ dir: 'BULLISH', type: 'CHoCH', level: 101, i: 98 }], fvgs: [{ dir: 'BULLISH', bottom: 99.8, top: 100.4, status: 'OPEN', i: 97 }] }),
      '15M': tf({ rejections: [{ dir: 'BULLISH', i: 99 }], volume: { ratio: 2.1, spike: true } }),
    };
    const c = confluence({ dir: 'LONG', price: 100, tfs, daily, fundamentals: { bias: 'BULLISH', total: 6 } });
    const ok = Object.fromEntries(c.items.map(i => [i.k, i.ok]));
    expect(ok).toMatchObject({ fund: true, htf: true, sweep: true, fvg: true, ob: true, disp: true, bos: true, rej: true, vol: true });
    expect(c.score).toBeGreaterThanOrEqual(11);
    expect(c.label).toBe('HIGH');
    expect(c.items.find(i => i.k === 'sweep').evidence).toMatch(/97/);
  });
  it('mirrors for a short and subtracts contrary fundamentals', () => {
    const c = confluence({ dir: 'SHORT', price: 100, tfs: { D1: tf(), '4H': tf(), '1H': tf(), '15M': tf() }, daily, fundamentals: { bias: 'BULLISH', total: 6 } });
    expect(c.items.find(i => i.k === 'fund')).toMatchObject({ pts: -2, ok: true });
    expect(c.score).toBeLessThan(0);
  });
  it('labels', () => { expect([labelOf(4), labelOf(5), labelOf(8), labelOf(11)]).toEqual(['NO_SETUP', 'WATCHING', 'DEVELOPING', 'HIGH']); });
});

describe('setup status and do nothing', () => {
  const daily = Array.from({ length: 40 }, (_, i) => ({ t: 1_789_000_000 + i * 86400, o: 100, h: 104, l: 96, c: 100 }));
  const conf = score => ({ score, items: [{ k: 'htf', ok: true, pts: 2, label: 'Support HTF' }, { k: 'bos', ok: false, pts: 2, label: 'BOS / CHoCH' }] });
  const market = price => ({ status: 'OK', quote: { price } });
  it('caps at watching when soft reasons exist', () => {
    const s = evaluateSetup({ market: market(97), daily, fundamentals: { bias: 'INSUFFICIENT', coverage: 2 }, conf: conf(12) });
    expect(s.status).toBe('WATCHING');
    expect(s.doNothing).toBe(true);
  });
  it('reaches high confluence only when nothing blocks', () => {
    const s = evaluateSetup({ market: market(97), daily, fundamentals: { bias: 'BULLISH', total: 6, coverage: 5 }, conf: conf(12) });
    expect(s.status).toBe('HIGH');
    expect(s.doNothing).toBe(false);
    expect(s.next).toEqual(['BOS / CHoCH (+2)']);
  });
  it('blocks on contrary fundamentals and offline data, flags invalidation', () => {
    expect(evaluateSetup({ market: market(97), daily, fundamentals: { bias: 'BEARISH', total: -5 }, conf: conf(12) }).status).toBe('NO_SETUP');
    expect(evaluateSetup({ market: { status: 'OFFLINE' }, daily, fundamentals: { bias: 'BULLISH', total: 6 }, conf: conf(12) }).status).toBe('NO_SETUP');
    expect(evaluateSetup({ market: market(97), daily, fundamentals: { bias: 'BULLISH', total: 6 }, conf: conf(3), position: { flags: { technical: 'INVALIDATED' } } }).status).toBe('INVALIDATED');
  });
});

import { evaluateOutcome, historyStats } from '../lib/engines/history.js';
describe('setup history', () => {
  const D = 86400;
  const at = Date.UTC(2026, 8, 1) ;
  const daily = Array.from({ length: 10 }, (_, i) => ({ t: at / 1000 + (i + 1) * D - 3600, o: 100 + i, h: 102 + i, l: 99 + i, c: 101 + i }));
  it('measures the move in the setup direction at each horizon', () => {
    const r = evaluateOutcome({ at, price: 100, direction: 'LONG' }, daily, at + 8 * D * 1000);
    expect(r.done).toBe(true);
    expect(r.outcome.d1.pct).toBeCloseTo(1);
    expect(r.outcome.d7.pct).toBeCloseTo(7);
    expect(r.outcome.d7.worst).toBeCloseTo(-1);
    const s = evaluateOutcome({ at, price: 100, direction: 'SHORT' }, daily, at + 8 * D * 1000);
    expect(s.outcome.d7.pct).toBeCloseTo(-7);
    expect(evaluateOutcome({ at, price: 100, direction: 'LONG' }, daily, at + 2 * D * 1000).done).toBe(false);
  });
  it('groups by status and by confirmation', () => {
    const rows = [
      { status: 'HIGH', items: ['sweep', 'bos'], outcome: { d7: { pct: 5 } } },
      { status: 'HIGH', items: ['sweep'], outcome: { d7: { pct: -2 } } },
      { status: 'WATCHING', items: ['fund'], outcome: { d7: { pct: 1 } } },
      { status: 'DEVELOPING', items: ['bos'], outcome: null },
    ];
    const st = historyStats(rows, 'd7');
    expect(st.evaluated).toBe(3);
    expect(st.byStatus.HIGH).toMatchObject({ n: 2, avg: 1.5, hit: 0.5 });
    expect(st.byItem[0].k).toBe('bos');
  });
});
