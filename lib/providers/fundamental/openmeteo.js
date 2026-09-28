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
