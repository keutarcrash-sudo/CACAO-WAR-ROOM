// Open-Meteo (free, no key): recent and forecast rain per cocoa zone, and a 2001-2020 daily normal.
export const SOURCE = { name: 'Open-Meteo', url: 'https://open-meteo.com' };

export const ZONES = [
  { id: 'CI_SOUBRE', country: 'CI', name: 'Soubré', lat: 5.78, lon: -6.61 },
  { id: 'CI_DALOA', country: 'CI', name: 'Daloa', lat: 6.88, lon: -6.45 },
  { id: 'CI_SANPEDRO', country: 'CI', name: 'San-Pédro', lat: 4.75, lon: -6.64 },
  { id: 'CI_ABENGOUROU', country: 'CI', name: 'Abengourou', lat: 6.73, lon: -3.49 },
  { id: 'GH_KUMASI', country: 'GH', name: 'Kumasi (Ashanti)', lat: 6.69, lon: -1.62 },
  { id: 'GH_SEFWI', country: 'GH', name: 'Sefwi Wiawso', lat: 6.2, lon: -2.49 },
  { id: 'NG_ONDO', country: 'NG', name: 'Ondo', lat: 7.25, lon: 5.19 },
  { id: 'CM_CENTRE', country: 'CM', name: 'Centre (Mbalmayo)', lat: 3.52, lon: 11.5 },
];
export const COUNTRIES = { CI: { name: 'Côte d’Ivoire', weight: 0.45 }, GH: { name: 'Ghana', weight: 0.25 }, NG: { name: 'Nigeria', weight: 0.1 }, CM: { name: 'Cameroun', weight: 0.1 } };
export const NORMAL_YEARS = [2001, 2020];

async function getJson(url, fetchImpl) {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const j = await res.json();
  if (j?.error) throw new Error(`Open-Meteo: ${j.reason || 'erreur'}`);
  return j;
}

// Last 31 days + next 16 days of daily rain for every zone, in one request.
export async function fetchRecent(fetchImpl = fetch) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${ZONES.map(z => z.lat).join(',')}&longitude=${ZONES.map(z => z.lon).join(',')}`
    + '&daily=precipitation_sum,temperature_2m_max&past_days=31&forecast_days=16&timezone=UTC';
  return parseRecent(await getJson(url, fetchImpl));
}

export function parseRecent(json) {
  const list = Array.isArray(json) ? json : [json];
  if (list.length !== ZONES.length) throw new Error(`Open-Meteo: ${list.length} zones reçues au lieu de ${ZONES.length}`);
  return Object.fromEntries(ZONES.map((z, i) => {
    const d = list[i]?.daily;
    if (!d?.time) throw new Error('Open-Meteo: réponse sans données journalières');
    return [z.id, d.time.map((t, k) => ({ date: t, rain: d.precipitation_sum?.[k] ?? null, tmax: d.temperature_2m_max?.[k] ?? null }))];
  }));
}

// Mean daily rain for each calendar day (MM-DD) over the normal period.
export async function fetchNormal(zone, fetchImpl = fetch) {
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${zone.lat}&longitude=${zone.lon}`
    + `&start_date=${NORMAL_YEARS[0]}-01-01&end_date=${NORMAL_YEARS[1]}-12-31&daily=precipitation_sum&timezone=UTC`;
  return parseNormal(await getJson(url, fetchImpl));
}

export function parseNormal(json) {
  const t = json?.daily?.time, p = json?.daily?.precipitation_sum;
  if (!t?.length || !p?.length) throw new Error('Open-Meteo archive: réponse vide');
  const acc = {};
  t.forEach((d, i) => {
    const md = d.slice(5);
    if (md === '02-29' || p[i] == null) return;
    (acc[md] ||= []).push(p[i]);
  });
  const out = {};
  for (const [md, v] of Object.entries(acc)) out[md] = v.reduce((a, b) => a + b, 0) / v.length;
  if (Object.keys(out).length < 360) throw new Error('Open-Meteo archive: normale incomplète');
  return out;
}

// Rain over a window compared with the normal for the same calendar days.
export function anomaly(days, normal) {
  const valid = days.filter(d => d.rain != null && normal[d.date.slice(5)] != null);
  if (valid.length < days.length * 0.8 || !valid.length) return null;
  const obs = valid.reduce((s, d) => s + d.rain, 0);
  const ref = valid.reduce((s, d) => s + normal[d.date.slice(5)], 0);
  return { obs, ref, pct: ref > 0.5 ? (obs / ref - 1) * 100 : null, days: valid.length };
}

export function zoneAnomalies(series, normal, today = new Date().toISOString().slice(0, 10)) {
  const past = series.filter(d => d.date < today).slice(-30);
  const next = series.filter(d => d.date >= today).slice(0, 14);
  return { past30: anomaly(past, normal), next14: anomaly(next, normal) };
}

// Extras, fetched apart so that a failure never touches the rain data:
// - soil moisture 9-27 cm (root zone of young trees), hourly, averaged per day; no normal exists at this depth;
// - sunshine duration (hours) and FAO reference evapotranspiration (mm: how much water the air draws).
export async function fetchExtras(fetchImpl = fetch) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${ZONES.map(z => z.lat).join(',')}&longitude=${ZONES.map(z => z.lon).join(',')}`
    + '&hourly=soil_moisture_9_to_27cm&daily=sunshine_duration,et0_fao_evapotranspiration&past_days=31&forecast_days=16&timezone=UTC';
  return parseExtras(await getJson(url, fetchImpl));
}

export function parseExtras(json) {
  const list = Array.isArray(json) ? json : [json];
  if (list.length !== ZONES.length) throw new Error(`Open-Meteo extras : ${list.length} zones reçues au lieu de ${ZONES.length}`);
  return Object.fromEntries(ZONES.map((z, i) => {
    const h = list[i]?.hourly, d = list[i]?.daily;
    const acc = {};
    (h?.time || []).forEach((t, k) => { const v = h.soil_moisture_9_to_27cm?.[k]; if (v != null) (acc[t.slice(0, 10)] ||= []).push(v); });
    const days = {};
    for (const [date, v] of Object.entries(acc)) days[date] = { soil: v.reduce((a, b) => a + b, 0) / v.length };
    (d?.time || []).forEach((t, k) => {
      const sun = d.sunshine_duration?.[k], et0 = d.et0_fao_evapotranspiration?.[k];
      days[t] = { ...days[t], sun: sun == null ? null : sun / 3600, et0: et0 ?? null };
    });
    return [z.id, days];
  }));
}

// 2001-2020 daily normals of max temperature, sunshine (hours) and evapotranspiration, per calendar day.
export async function fetchNormalExtra(zone, fetchImpl = fetch) {
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${zone.lat}&longitude=${zone.lon}`
    + `&start_date=${NORMAL_YEARS[0]}-01-01&end_date=${NORMAL_YEARS[1]}-12-31&daily=temperature_2m_max,sunshine_duration,et0_fao_evapotranspiration&timezone=UTC`;
  return parseNormalExtra(await getJson(url, fetchImpl));
}

export function parseNormalExtra(json) {
  const d = json?.daily;
  if (!d?.time?.length) throw new Error('Open-Meteo archive : réponse vide');
  const keys = { tmax: 'temperature_2m_max', sun: 'sunshine_duration', et0: 'et0_fao_evapotranspiration' };
  const acc = {};
  d.time.forEach((t, i) => {
    const md = t.slice(5);
    if (md === '02-29') return;
    const a = (acc[md] ||= { tmax: [], sun: [], et0: [] });
    for (const [k, src] of Object.entries(keys)) { const v = d[src]?.[i]; if (v != null) a[k].push(k === 'sun' ? v / 3600 : v); }
  });
  const mean = v => (v.length ? v.reduce((x, y) => x + y, 0) / v.length : null);
  const out = {};
  for (const [md, a] of Object.entries(acc)) out[md] = { tmax: mean(a.tmax), sun: mean(a.sun), et0: mean(a.et0) };
  if (Object.keys(out).length < 360) throw new Error('Open-Meteo archive : normale incomplète');
  return out;
}

// Observed side, from the same reanalysis (ERA5) as the 2001-2020 normals: comparing the forecast
// model's recent rain to ERA5 normals mixes two "climates" and biases the anomaly. ERA5 lags ~5 days.
export async function fetchObserved(fetchImpl = fetch, now = new Date()) {
  const d = n => new Date(now.getTime() - n * 86400e3).toISOString().slice(0, 10);
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${ZONES.map(z => z.lat).join(',')}&longitude=${ZONES.map(z => z.lon).join(',')}`
    + `&start_date=${d(45)}&end_date=${d(1)}&daily=precipitation_sum&timezone=UTC`;
  const json = await getJson(url, fetchImpl);
  const list = Array.isArray(json) ? json : [json];
  if (list.length !== ZONES.length) throw new Error(`Open-Meteo archive : ${list.length} zones reçues au lieu de ${ZONES.length}`);
  return Object.fromEntries(ZONES.map((z, i) => {
    const x = list[i]?.daily;
    if (!x?.time) throw new Error('Open-Meteo archive : réponse sans données journalières');
    return [z.id, x.time.map((t, k) => ({ date: t, rain: x.precipitation_sum?.[k] ?? null })).filter(r => r.rain != null)];
  }));
}

// Anomalies measured against the normals with like-for-like data:
// - past 30 days: ERA5 (same source as the normals), last 30 days available;
// - forecast: model rain divided by the model / ERA5 ratio seen on the days both cover (bias removed).
// Without ERA5, falls back to the model alone and says so.
export function calibratedAnomalies(series, observed, normal, today = new Date().toISOString().slice(0, 10)) {
  const model = series.filter(d => d.date < today);
  const next = series.filter(d => d.date >= today).slice(0, 14);
  const obs = (observed || []).filter(d => d.date < today).slice(-30);
  if (obs.length < 20) {
    const a = zoneAnomalies(series, normal, today);
    return { past30: a.past30, next14: a.next14, bias: null, method: 'model' };
  }
  const byDate = new Map(model.map(d => [d.date, d.rain]));
  const both = obs.filter(d => byDate.get(d.date) != null);
  const sObs = both.reduce((s, d) => s + d.rain, 0), sMod = both.reduce((s, d) => s + byDate.get(d.date), 0);
  // a ratio is only meaningful with enough rain on both sides
  const bias = both.length >= 15 && sObs > 10 && sMod > 10 ? Math.min(2, Math.max(0.5, sMod / sObs)) : null;
  const corrected = next.map(d => ({ ...d, rain: d.rain == null ? null : d.rain / (bias ?? 1) }));
  return { past30: anomaly(obs, normal), next14: anomaly(corrected, normal), bias, method: 'era5' };
}
