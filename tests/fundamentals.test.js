// Fixtures are written by hand from the documented formats of each source (not captured live).
import { describe, it, expect } from 'vitest';
import { parseOni, parseWeekly, summarizeEnso } from '../lib/providers/fundamental/noaa.js';
import { parseCot, summarizeCot } from '../lib/providers/fundamental/cftc.js';
import { parseRecent, parseNormal, anomaly, ZONES } from '../lib/providers/fundamental/openmeteo.js';
import { weatherFactor, ensoFactor, positioningFactor, manualFactor, fundamentalScore, scoreChangeEvent } from '../lib/engines/fundamentals.js';

const ONI = `SEAS  YR   TOTAL   ANOM
${['DJF', 'JFM', 'FMA', 'MAM', 'AMJ', 'MJJ', 'JJA', 'JAS', 'ASO', 'SON', 'OND', 'NDJ'].map((s, i) => `  ${s} 2025   26.${i}   ${(-0.4 + i * 0.1).toFixed(2)}`).join('\n')}
  DJF 2026   26.90    0.74
`;
const WEEKLY = ` Weekly SST data starts week centered on 3Jan1990

                Nino1+2      Nino3        Nino34        Nino4
 Week          SST SSTA     SST SSTA     SST SSTA     SST SSTA
 03SEP2026     21.0 0.5     25.9 0.4     27.1 0.2     28.9 0.3
 10SEP2026     21.2 0.7     26.0 0.5     27.2 0.4     29.0 0.4
 17SEP2026     21.1-0.1     26.1 0.6     27.4 0.6     29.0 0.5
 24SEP2026     21.4 1.1     26.3 0.8     27.6 0.9     29.1 0.6
 01OCT2026     21.5 1.2     26.4 0.9     27.7 1.0     29.2 0.7
`;

describe('NOAA', () => {
  it('parses ONI and derives the phase', () => {
    const oni = parseOni(ONI);
    expect(oni.at(-1)).toEqual({ season: 'DJF', year: 2026, total: 26.9, anom: 0.74 });
    const w = parseWeekly(WEEKLY);
    expect(w).toHaveLength(5);
    expect(w[2]).toMatchObject({ date: '2026-09-17', nino12: -0.1, nino34: 0.6 });
    const s = summarizeEnso(oni, w);
    expect(s.phase).toBe('EL_NINO');
    expect(s.label).toBe('El Niño faible');
    expect(s.weekly.trend4w).toBeCloseTo(0.8);
  });
  it('rejects unexpected text', () => {
    expect(() => parseOni('<html>maintenance</html>')).toThrow();
  });
});

describe('CFTC', () => {
  const rows = Array.from({ length: 60 }, (_, i) => ({
    market_and_exchange_names: 'COCOA - ICE FUTURES U.S.',
    report_date_as_yyyy_mm_dd: new Date(Date.UTC(2025, 0, 7 + i * 7)).toISOString(),
    m_money_positions_long_all: String(20000 + i * 100), m_money_positions_short_all: String(25000),
    m_money_positions_long_old: '1', prod_merc_positions_long: '50000', prod_merc_positions_short: '60000', open_interest_all: '150000',
  })).reverse();
  it('finds fields by pattern and computes net and percentile', () => {
    const s = summarizeCot(parseCot(rows));
    expect(s.mmNet).toBe(20000 + 59 * 100 - 25000);
    expect(s.percentile).toBe(100);
    expect(s.change1w).toBe(100);
    expect(s.commercialNet).toBe(-10000);
  });
  it('refuses another market', () => {
    expect(() => parseCot([{ ...rows[0], market_and_exchange_names: 'COFFEE C - ICE' }])).toThrow(/inattendu/);
  });
});

describe('Open-Meteo', () => {
  it('maps one response per zone', () => {
    const one = { daily: { time: ['2026-09-01', '2026-09-02'], precipitation_sum: [3, null], temperature_2m_max: [30, 31] } };
    const r = parseRecent(ZONES.map(() => one));
    expect(r.CI_SOUBRE[1]).toEqual({ date: '2026-09-02', rain: null, tmax: 31 });
    expect(() => parseRecent([one])).toThrow();
  });
  it('builds a daily normal and an anomaly', () => {
    const time = [], p = [];
    for (let y = 2001; y <= 2002; y++) for (let d = 0; d < 365; d++) { const t = new Date(Date.UTC(y, 0, 1 + d)).toISOString().slice(0, 10); time.push(t); p.push(y === 2001 ? 2 : 4); }
    const n = parseNormal({ daily: { time, precipitation_sum: p } });
    expect(n['06-15']).toBe(3);
    const days = Array.from({ length: 10 }, (_, i) => ({ date: `2026-06-${String(i + 10).padStart(2, '0')}`, rain: 1.5 }));
    expect(anomaly(days, n).pct).toBeCloseTo(-50);
  });
});

describe('fundamental score', () => {
  const now = Date.parse('2026-09-28T12:00:00Z');
  const weather = { fetchedAt: now, countries: { CI: { past30: -40 }, GH: { past30: -30 }, NG: { past30: 0 }, CM: { past30: 0 } }, normalYears: '2001–2020' };
  it('weights countries and scores the rain deficit', () => {
    const f = weatherFactor(weather, now);
    expect(f.pct).toBeCloseTo((-40 * 0.45 - 30 * 0.25) / 0.9);
    expect(f.score).toBe(1);
  });
  it('counts El Niño only with an observed deficit', () => {
    const enso = { phase: 'EL_NINO', label: 'El Niño modéré', oni: { season: 'JAS', year: 2026, anom: 1.2 }, fetchedAt: now };
    expect(ensoFactor(enso, -20, now).score).toBe(2);
    expect(ensoFactor(enso, 5, now).score).toBe(0);
    expect(ensoFactor(enso, null, now).score).toBe(0);
  });
  it('scores extreme positioning', () => {
    const cot = { date: '2026-09-22', mmNet: -18000, percentile: 6, weeks: 156, change1w: -500 };
    expect(positioningFactor(cot, now).score).toBe(2);
  });
  it('uses the latest manual entry per region and ages it', () => {
    const e = [
      { metric: 'production', region: 'GH', value: 620, previous: 760, dataTime: now - 5 * 86400e3, source: 'COCOBOD' },
      { metric: 'production', region: 'GH', value: 700, previous: 760, dataTime: now - 50 * 86400e3, source: 'old' },
    ];
    const f = manualFactor('production', e, now);
    expect(f.score).toBe(2);
    expect(f.fresh).toBe('ok');
    expect(manualFactor('stocks', [{ metric: 'stocks', region: 'ICE_US', value: 105, previous: 100, dataTime: now - 30 * 86400e3, source: 'ICE' }], now)).toMatchObject({ score: -1, fresh: 'stale' });
    expect(manualFactor('grindings', [], now).score).toBeNull();
  });
  it('never counts a missing factor, halves stale ones, needs 3 factors for a bias', () => {
    const s = fundamentalScore([{ key: 'a', score: 2, fresh: 'ok' }, { key: 'b', score: null }, { key: 'c', score: 2, fresh: 'ok' }, { key: 'd', score: -2, fresh: 'stale' }]);
    expect(s.coverage).toBe(3);
    expect(s.total).toBe(Math.round(((2 + 2 - 1) / (2 * 2.5)) * 10));
    expect(s.bias).toBe('BULLISH');
    expect(fundamentalScore([{ key: 'a', score: 2, fresh: 'ok' }]).bias).toBe('INSUFFICIENT');
  });
  it('turns a big score move into a thesis alert', () => {
    expect(scoreChangeEvent({ total: 7, bias: 'BULLISH' }, { total: 2, bias: 'NEUTRAL' }).level).toBe('CRITICAL');
    expect(scoreChangeEvent({ total: 5, bias: 'BULLISH' }, { total: 4, bias: 'BULLISH' }).level).toBe('INFORMATION');
    expect(scoreChangeEvent(null, { total: 4 })).toBeNull();
  });
});
