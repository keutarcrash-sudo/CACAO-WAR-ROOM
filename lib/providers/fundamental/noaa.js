// NOAA Climate Prediction Center: ONI (official ENSO index) and weekly Niño SST anomalies. Plain text files.
export const SOURCE = { name: 'NOAA CPC', url: 'https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/' };
const ONI_URL = 'https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt';
const WEEKLY_URL = 'https://www.cpc.ncep.noaa.gov/data/indices/wksst9120.for';

async function getText(url, fetchImpl) {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`NOAA HTTP ${res.status}`);
  return res.text();
}

// "  DJF 1950   24.72   -1.53"
export function parseOni(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    const m = line.trim().match(/^([A-Z]{3})\s+(\d{4})\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)$/);
    if (m) rows.push({ season: m[1], year: Number(m[2]), total: Number(m[3]), anom: Number(m[4]) });
  }
  if (rows.length < 12) throw new Error('NOAA ONI: format inattendu');
  return rows;
}

// " 07JAN2026     24.0-0.2     25.9 0.1     26.6 0.3     28.4 0.4"  (Niño 1+2, 3, 3.4, 4: SST then anomaly)
const MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
export function parseWeekly(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*(\d{2})([A-Z]{3})(\d{4})\s+(.*)$/);
    if (!m || !MONTHS[m[2]]) continue;
    const n = (m[4].match(/-?\d+\.\d/g) || []).map(Number);
    if (n.length < 8) continue;
    rows.push({ date: `${m[3]}-${String(MONTHS[m[2]]).padStart(2, '0')}-${m[1]}`, nino12: n[1], nino3: n[3], nino34: n[5], nino4: n[7] });
  }
  if (rows.length < 4) throw new Error('NOAA hebdo: format inattendu');
  return rows;
}

export async function fetchEnso(fetchImpl = fetch) {
  const [oni, weekly] = await Promise.all([getText(ONI_URL, fetchImpl).then(parseOni), getText(WEEKLY_URL, fetchImpl).then(parseWeekly)]);
  return summarizeEnso(oni, weekly);
}

export function summarizeEnso(oni, weekly) {
  const last = oni.at(-1), w = weekly.at(-1), w4 = weekly.at(-5) ?? weekly[0];
  const a = last.anom;
  const phase = a >= 0.5 ? 'EL_NINO' : a <= -0.5 ? 'LA_NINA' : 'NEUTRAL';
  const strength = Math.abs(a) >= 1.5 ? 'fort' : Math.abs(a) >= 1 ? 'modéré' : 'faible';
  const label = phase === 'EL_NINO' ? `El Niño ${strength}` : phase === 'LA_NINA' ? `La Niña ${strength}` : 'Neutre';
  return {
    phase, label,
    oni: { season: last.season, year: last.year, anom: a },
    oniRecent: oni.slice(-6).map(r => ({ season: `${r.season} ${r.year}`, anom: r.anom })),
    weekly: { date: w.date, nino34: w.nino34, nino12: w.nino12, trend4w: w.nino34 - w4.nino34 },
    weeklyRecent: weekly.slice(-12).map(r => ({ date: r.date, nino34: r.nino34 })),
  };
}
