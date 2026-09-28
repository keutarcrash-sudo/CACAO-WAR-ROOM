// Fundamentals: free sources cached in the database, manual entries, score and its history.
import * as repo from '../db/repo.js';
import * as meteo from '../providers/fundamental/openmeteo.js';
import * as noaa from '../providers/fundamental/noaa.js';
import * as cftc from '../providers/fundamental/cftc.js';
import { weatherFactor, ensoFactor, positioningFactor, manualFactor, fundamentalScore, scoreChangeEvent, MANUAL } from '../engines/fundamentals.js';

const H = 3600e3;
const TTL = { weather: 3 * H, enso: 24 * H, cot: 12 * H };
const RETRY_AFTER = 15 * 60e3;
const failedAt = new Map(); // per instance: do not retry a failing source on every request

// Fresh value from the cache, or a new fetch; on failure keep the last good value, flagged.
async function source(sql, key, ttl, load) {
  const c = await repo.getCache(sql, key);
  if (c && Date.now() - c.fetchedAt < ttl) return { value: c.value, fetchedAt: c.fetchedAt, status: 'OK' };
  const lastFail = Math.max(failedAt.get(key) || 0, c?.errorAt || 0);
  if (Date.now() - lastFail < RETRY_AFTER) return { value: c?.value ?? null, fetchedAt: c?.fetchedAt ?? null, status: c ? 'STALE' : 'OFFLINE', error: c?.error };
  try {
    const value = await load();
    await repo.setCache(sql, key, value);
    return { value, fetchedAt: Date.now(), status: 'OK' };
  } catch (e) {
    const error = String(e.message || e);
    failedAt.set(key, Date.now());
    if (c) await repo.setCacheError(sql, key, error);
    console.error('fundamentals source', key, error);
    return { value: c?.value ?? null, fetchedAt: c?.fetchedAt ?? null, status: c ? 'STALE' : 'OFFLINE', error };
  }
}

// Daily normals never change: fetched once per zone, a couple per request to stay light.
async function normals(sql) {
  const out = {};
  let fetched = 0;
  for (const z of meteo.ZONES) {
    const key = `normal:${z.id}`;
    const c = await repo.getCache(sql, key);
    if (c) { out[z.id] = c.value; continue; }
    if (fetched >= 2 || Date.now() - (failedAt.get(key) || 0) < RETRY_AFTER) continue;
    fetched++;
    try { const v = await meteo.fetchNormal(z); await repo.setCache(sql, key, v); out[z.id] = v; }
    catch (e) { failedAt.set(key, Date.now()); console.error('normal', z.id, e.message); }
  }
  return out;
}

async function weather(sql) {
  const [recent, norm] = await Promise.all([source(sql, 'weather:recent', TTL.weather, () => meteo.fetchRecent()), normals(sql)]);
  if (!recent.value) return { status: recent.status, error: recent.error };
  const zones = meteo.ZONES.map(z => {
    const series = recent.value[z.id] || [];
    const a = norm[z.id] ? meteo.zoneAnomalies(series, norm[z.id]) : null;
    const today = new Date().toISOString().slice(0, 10);
    return {
      id: z.id, name: z.name, country: z.country,
      past30: a?.past30?.pct ?? null, next14: a?.next14?.pct ?? null,
      rain30: series.filter(d => d.date < today).slice(-30).reduce((s, d) => s + (d.rain || 0), 0),
      normalReady: !!norm[z.id],
    };
  });
  const countries = {};
  for (const c of Object.keys(meteo.COUNTRIES)) {
    const zs = zones.filter(z => z.country === c && z.past30 != null);
    if (zs.length) countries[c] = { past30: avg(zs.map(z => z.past30)), next14: avg(zs.filter(z => z.next14 != null).map(z => z.next14)) };
  }
  const w = Object.entries(countries).reduce((s, [c]) => s + meteo.COUNTRIES[c].weight, 0);
  const next14 = w ? Object.entries(countries).reduce((s, [c, v]) => s + (v.next14 ?? 0) * meteo.COUNTRIES[c].weight, 0) / w : null;
  return {
    status: recent.status, error: recent.error, fetchedAt: recent.fetchedAt, zones, countries, next14,
    normalYears: `${meteo.NORMAL_YEARS[0]}–${meteo.NORMAL_YEARS[1]}`,
    pendingNormals: zones.filter(z => !z.normalReady).length,
  };
}

const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

export async function loadFundamentals(sql, now = Date.now()) {
  const [wx, enso, cot, entries] = await Promise.all([
    weather(sql),
    source(sql, 'enso', TTL.enso, () => noaa.fetchEnso()),
    source(sql, 'cot', TTL.cot, () => cftc.fetchCot()),
    repo.listFundamentals(sql),
  ]);
  const ensoV = enso.value ? { ...enso.value, fetchedAt: enso.fetchedAt } : null;
  const wf = weatherFactor(wx.countries ? wx : null, now);
  const factors = [
    wf,
    ensoFactor(ensoV, wf.pct ?? null, now),
    positioningFactor(cot.value, now),
    ...Object.keys(MANUAL).map(k => manualFactor(k, entries, now)),
  ];
  const score = fundamentalScore(factors);

  // history + event when the score moves
  const prev = await repo.lastScore(sql);
  if (!prev || prev.total !== score.total || prev.bias !== score.bias) {
    await repo.recordScore(sql, score, factors.map(f => ({ key: f.key, score: f.score, fresh: f.fresh })));
    const ev = scoreChangeEvent(prev, score, now);
    if (ev) await repo.addAlert(sql, { ...ev, source: 'Moteur fondamental' });
  }

  return {
    status: 'OK',
    score: { total: score.total, bias: score.bias, coverage: score.coverage, of: score.of, reasons: score.reasons.map(f => f.key), counters: score.counters.map(f => f.key) },
    factors: factors.map(({ entries: _e, ...f }) => f),
    weather: wx,
    enso: { ...(ensoV || {}), status: enso.status, error: enso.error, fetchedAt: enso.fetchedAt },
    cot: { ...(cot.value || {}), status: cot.status, error: cot.error, fetchedAt: cot.fetchedAt },
    entries,
    manual: Object.fromEntries(Object.entries(MANUAL).map(([k, d]) => [k, { name: d.name, unit: d.unit, labels: d.labels, regions: d.regions, rule: d.rule, validDays: d.validDays }])),
  };
}
