import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseChart } from '../lib/providers/market/yahoo.js';
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
