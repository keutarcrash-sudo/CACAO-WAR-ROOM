import { describe, it, expect } from 'vitest';
import { aggregate, atr, pivots, previousLevels, swings, structure, rangePosition } from '../lib/engines/technical.js';
import { marketPulse, whatChanged, evaluateWarRoom } from '../lib/engines/warroom.js';

const day = 86400;
const mk = (i, o, h, l, c) => ({ t: 1790000000 + i * day, o, h, l, c, v: 100 });

describe('aggregate', () => {
  it('builds 4h candles from 1h', () => {
    const t0 = 1789992000; // multiple of 4h
    const h = [0, 1, 2, 3, 4].map(i => ({ t: t0 + i * 3600, o: 10 + i, h: 12 + i, l: 9 + i, c: 11 + i, v: 1 }));
    const a = aggregate(h, 4);
    expect(a).toHaveLength(2);
    expect(a[0]).toEqual({ t: t0, o: 10, h: 15, l: 9, c: 14, v: 4 });
  });
});

describe('atr', () => {
  it('equals the constant range when ranges are constant', () => {
    const c = Array.from({ length: 30 }, (_, i) => mk(i, 100, 105, 95, 100));
    expect(atr(c)).toBeCloseTo(10, 9);
  });
  it('is null with too little data', () => expect(atr([mk(0, 1, 2, 0, 1)])).toBeNull());
});

describe('pivots', () => {
  it('classic floor pivots', () => {
    const p = pivots({ h: 110, l: 90, c: 100 });
    expect(p.P).toBe(100); expect(p.R1).toBe(110); expect(p.S1).toBe(90); expect(p.R2).toBe(120); expect(p.S2).toBe(80);
  });
});

describe('previousLevels', () => {
  it('uses the previous completed day', () => {
    const c = [mk(0, 1, 5, 0, 2), mk(1, 2, 8, 1, 3), mk(2, 3, 4, 2, 3)];
    const lv = previousLevels(c);
    expect(lv.PDH).toBe(8); expect(lv.PDL).toBe(1);
  });
});

describe('swings and structure', () => {
  const zig = [100, 110, 104, 116, 108, 122, 112, 128, 118, 134, 124].flatMap((v, i, a) => {
    // expand each pivot into a small peak/trough so fractals (k=1) exist
    return [mk(i * 3, v, v + 1, v - 1, v)];
  });
  it('finds alternating swings', () => {
    const s = swings(zig, 1);
    expect(s.filter(x => x.type === 'H').length).toBeGreaterThanOrEqual(2);
    expect(s.filter(x => x.type === 'L').length).toBeGreaterThanOrEqual(2);
  });
  it('reads higher highs and higher lows as bullish', () => {
    expect(structure(zig, 1).trend).toBe('BULLISH');
  });
  it('range position', () => {
    const c = Array.from({ length: 20 }, (_, i) => mk(i, 100, 110, 90, 100));
    expect(rangePosition(c, 100, 20).pos).toBeCloseTo(0.5);
  });
});

describe('war room', () => {
  const daily = Array.from({ length: 60 }, (_, i) => mk(i, 100, 105, 95, 100));
  it('pulse only uses connected components', () => {
    const p = marketPulse({ daily, quote: { change: 5 } });
    expect(p.coverage).toBe('2/5');
    expect(p.value).toBeGreaterThanOrEqual(0);
    expect(p.components.find(c => c.key === 'news').value).toBeNull();
  });
  it('v1 always says do nothing, with reasons', () => {
    const r = evaluateWarRoom({ market: { status: 'OK', quote: { price: 100 } }, daily, modules: {} });
    expect(r.doNothing).toBe(true);
    expect(r.reasons.map(x => x.k)).toEqual(expect.arrayContaining(['fund', 'conf', 'mid']));
  });
  it('what changed compares snapshots', () => {
    const rows = whatChanged({ price: 100, atr: 10, pnl: 1 }, { price: 110, atr: 12, pnl: 5 });
    expect(rows.map(r => r.k)).toEqual(['price', 'vol', 'pnl']);
    expect(whatChanged(null, { price: 1 })).toEqual([]);
  });
});
