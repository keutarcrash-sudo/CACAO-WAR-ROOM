import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseChart } from '../lib/providers/market/yahoo.js';
import { rebuildDaily, needsRebuild } from '../lib/providers/market/rebuild.js';
import { parseRates } from '../lib/providers/fx/frankfurter.js';

// Fixture written by hand from the documented shape of Yahoo's chart endpoint (not captured live).
const fixture = JSON.parse(readFileSync(new URL('./fixtures/yahoo-chart.json', import.meta.url)));

describe('yahoo parseChart', () => {
  it('takes yesterday from the daily bars, never chartPreviousClose (start of the range)', () => {
    const r = parseChart(fixture, { daily: true });
    expect(r.price).toBe(7412);
    expect(r.prevClose).toBe(7300); // bar before the current session
    expect(r.change).toBe(112);
    expect(r.changePct).toBeCloseTo(1.534, 2);
    expect(r.dataTime).toBe(1790500000 * 1000);
  });
  it('uses previousClose when Yahoo provides it', () => {
    const j = structuredClone(fixture); j.chart.result[0].meta.previousClose = 7400;
    expect(parseChart(j, { daily: true }).prevClose).toBe(7400);
  });
  it('leaves the change unknown on intraday series', () => {
    const r = parseChart(fixture);
    expect(r.prevClose).toBeNull();
    expect(r.changePct).toBeNull();
  });
  it('skips null bars instead of inventing them', () => {
    const r = parseChart(fixture);
    expect(r.candles).toHaveLength(3);
    expect(r.candles.map(c => c.c)).toEqual([7260, 7300, 7412]);
  });
  it('throws on API error', () => {
    expect(() => parseChart({ chart: { result: null, error: { code: 'Not Found', description: 'No data found' } } })).toThrow(/No data/);
  });
});

describe('frankfurter parseRates', () => {
  it('inverts EUR-based rates', () => {
    const r = parseRates({ date: '2026-09-25', rates: { USD: 1.25, GBP: 0.8 } });
    expect(r.eurPer.USD).toBeCloseTo(0.8);
    expect(r.eurPer.GBP).toBeCloseTo(1.25);
  });
  it('rejects malformed payloads', () => {
    expect(() => parseRates({ rates: {} })).toThrow();
  });
});

import { saneBar } from '../lib/providers/market/yahoo.js';
describe('bar sanity', () => {
  it('drops corrupt and placeholder daily bars', () => {
    expect(saneBar({ o: 5818, h: 5819, l: 5816, c: 5759 }, true)).toBe(false); // close outside its range
    expect(saneBar({ o: 5924, h: 5924, l: 5924, c: 5924 }, true)).toBe(false); // flat placeholder
    expect(saneBar({ o: 5924, h: 5924, l: 5924, c: 5924 }, false)).toBe(true); // flat is fine intraday
    expect(saneBar({ o: 5625, h: 5741, l: 5580, c: 5662 }, true)).toBe(true);
  });
});

describe('daily bars rebuilt from hourly bars', () => {
  const off = -14400; // New York summer time
  const day = d => Date.parse(`${d}T00:00:00Z`) / 1000 - off; // midnight New York
  const hours = (d, bars) => bars.map(([o, h, l, c], i) => ({ t: day(d) + (5 + i) * 3600, o, h, l, c, v: 10 }));
  const daily = [
    { t: day('2026-09-14'), o: 5000, h: 5100, l: 4950, c: 5050, v: 90 },
    { t: day('2026-09-17'), o: 5200, h: 5300, l: 5150, c: 5250, v: 90 },
  ];
  const hourly = [
    ...hours('2026-09-14', [[5000, 5050, 4990, 5020], [5020, 5100, 5000, 5080], [5080, 5090, 4950, 5050]]),
    ...hours('2026-09-15', [[5050, 5120, 5040, 5100], [5100, 5180, 5090, 5170], [5170, 5175, 5060, 5080]]),
    ...hours('2026-09-16', [[5080, 5090, 5070, 5085]]), // a single bar: too thin to stand for a session
    ...hours('2026-09-17', [[5200, 5300, 5150, 5250]]),
  ];

  it('fills a dropped day with the range of its hourly bars, keeping Yahoo’s timestamp', () => {
    const droppedAt = [day('2026-09-15') + 60];
    const r = rebuildDaily(daily, hourly, { gmtoffset: off, droppedAt });
    expect(r.rebuilt).toBe(1);
    const k = r.candles.find(x => x.rebuilt);
    expect(k).toMatchObject({ t: droppedAt[0], o: 5050, h: 5180, l: 5040, c: 5080, v: 30 });
    expect(r.candles.map(x => x.t)).toEqual([...r.candles.map(x => x.t)].sort((a, b) => a - b));
  });
  it('never touches a day Yahoo already provides, and invents nothing without hourly data', () => {
    const r = rebuildDaily(daily, hourly, { gmtoffset: off });
    expect(r.candles.filter(x => !x.rebuilt)).toEqual(daily);
    expect(rebuildDaily(daily, [], { gmtoffset: off })).toEqual({ candles: daily, rebuilt: 0 });
  });
  it('only asks for hourly data when recent bars are missing', () => {
    const since = day('2026-09-01');
    expect(needsRebuild(daily, [], since)).toBe(false);
    expect(needsRebuild(daily, [day('2026-09-15')], since)).toBe(true);
    expect(needsRebuild(daily, [day('2026-03-02')], since)).toBe(false);
    expect(needsRebuild([daily[0], { ...daily[1], t: day('2026-09-24') }], [], since)).toBe(true);
  });
});
