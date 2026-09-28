// Fundamental score, -10 to +10. Each factor is scored -2..+2 by a written rule.
// A factor without data is excluded (never counted as 0); stale data counts half.
import { COUNTRIES } from '../providers/fundamental/openmeteo.js';

const DAY = 86400e3;
// steps: [limit, score] pairs checked in order; the last pair also carries the score above its limit
const band = (x, steps) => { for (const [lim, s] of steps) if (x < lim) return s; return steps.at(-1)[2]; };
const fmtPct = x => `${x > 0 ? '+' : ''}${x.toFixed(1).replace('.', ',')} %`;

// Manual metrics: the user types two numbers and a source; the change drives the score.
export const MANUAL = {
  production: {
    name: 'Production', unit: 'kt', validDays: 120,
    labels: { value: 'Prévision actuelle', previous: 'Prévision précédente' },
    regions: ['CI', 'GH', 'NG', 'CM', 'WORLD'],
    // lower production = bullish
    score: pct => band(pct, [[-10, 2], [-3, 1], [3, 0], [10, -1, -2]]),
    rule: 'révision < −10 % → +2 · −10 à −3 % → +1 · ±3 % → 0 · +3 à +10 % → −1 · > +10 % → −2',
  },
  arrivals: {
    name: 'Arrivages / exports', unit: 't', validDays: 21,
    labels: { value: 'Cumul saison actuelle', previous: 'Cumul saison précédente, même date' },
    regions: ['CI', 'GH'],
    score: pct => band(pct, [[-15, 2], [-5, 1], [5, 0], [15, -1, -2]]),
    rule: '< −15 % → +2 · −15 à −5 % → +1 · ±5 % → 0 · +5 à +15 % → −1 · > +15 % → −2',
  },
  stocks: {
    name: 'Stocks ICE', unit: 'sacs', validDays: 14,
    labels: { value: 'Stocks certifiés actuels', previous: 'Il y a 4 semaines' },
    regions: ['ICE_US', 'ICE_EU'],
    score: pct => band(pct, [[-10, 2], [-3, 1], [3, 0], [10, -1, -2]]),
    rule: 'sur 4 semaines : < −10 % → +2 · −10 à −3 % → +1 · ±3 % → 0 · +3 à +10 % → −1 · > +10 % → −2',
  },
  grindings: {
    name: 'Demande (grindings)', unit: 't', validDays: 120,
    labels: { value: 'Trimestre publié', previous: 'Même trimestre, année précédente' },
    regions: ['EU', 'NA', 'ASIA'],
    // more grinding = more demand = bullish
    score: pct => band(pct, [[-7, -2], [-2, -1], [2, 0], [7, 1, 2]]),
    rule: 'sur un an : < −7 % → −2 · −7 à −2 % → −1 · ±2 % → 0 · +2 à +7 % → +1 · > +7 % → +2',
  },
};

function fresh(at, validDays, now) {
  if (!at) return 'na';
  return now - at > validDays * DAY ? 'stale' : 'ok';
}

export function weatherFactor(weather, now = Date.now()) {
  const f = { key: 'weather', name: 'Météo Afrique de l’Ouest', source: 'Open-Meteo', validDays: 3 };
  if (!weather?.countries) return { ...f, score: null, fresh: 'na', value: 'indisponible' };
  let w = 0, s = 0;
  for (const [c, meta] of Object.entries(COUNTRIES)) {
    const v = weather.countries[c]?.past30;
    if (v == null) continue;
    w += meta.weight; s += v * meta.weight;
  }
  if (!w) return { ...f, score: null, fresh: 'na', value: 'normales en cours de calcul' };
  const pct = s / w;
  // dry = bullish; very wet is ambiguous (black pod risk), so it is not scored as bearish
  const score = pct < -30 ? 2 : pct < -15 ? 1 : pct <= 15 ? 0 : pct <= 30 ? -1 : 0;
  return {
    ...f, score, pct, fresh: fresh(weather.fetchedAt, 3, now), at: weather.fetchedAt,
    value: `Pluie 30 j : ${fmtPct(pct)} vs normale ${weather.normalYears || ''}`.trim(),
    prev: weather.next14 != null ? `Prévision 14 j : ${fmtPct(weather.next14)}` : null,
    rule: '< −30 % → +2 · −30 à −15 % → +1 · ±15 % → 0 · +15 à +30 % → −1 · excès > +30 % : ambigu (pourriture brune) → 0',
    note: pct > 30 ? 'Excès de pluie : risque de pourriture brune, effet sur le prix ambigu.' : null,
  };
}

// ENSO only counts when its effect is visible in the real rain of the growing regions.
export function ensoFactor(enso, weatherPct, now = Date.now()) {
  const f = { key: 'enso', name: 'ENSO / El Niño', source: 'NOAA CPC', validDays: 45 };
  if (!enso?.oni) return { ...f, score: null, fresh: 'na', value: 'indisponible' };
  const a = enso.oni.anom;
  let score = 0, why = 'phase neutre';
  if (enso.phase === 'EL_NINO') {
    if (weatherPct != null && weatherPct < -15) { score = a >= 1 ? 2 : 1; why = 'El Niño avec déficit de pluie observé'; }
    else why = weatherPct == null ? 'El Niño, météo locale inconnue : non compté' : 'El Niño sans déficit de pluie observé';
  } else if (enso.phase === 'LA_NINA') {
    if (weatherPct != null && weatherPct > 0) { score = -1; why = 'La Niña avec pluies au-dessus de la normale'; } else why = 'La Niña sans effet visible sur la pluie';
  }
  return {
    ...f, score, fresh: fresh(enso.fetchedAt, 45, now), at: enso.fetchedAt,
    value: `${enso.label} · ONI ${enso.oni.season} ${enso.oni.year} : ${a > 0 ? '+' : ''}${a.toFixed(2)} °C`,
    prev: enso.weekly ? `Niño 3.4 hebdo ${enso.weekly.nino34 > 0 ? '+' : ''}${enso.weekly.nino34.toFixed(1)} °C (${enso.weekly.trend4w >= 0 ? '↑' : '↓'} sur 4 sem.)` : null,
    rule: 'El Niño + déficit de pluie observé → +1 / +2 · El Niño sans déficit → 0 · La Niña + pluies excédentaires → −1',
    note: why,
  };
}

export function positioningFactor(cot, now = Date.now()) {
  const f = { key: 'positioning', name: 'Positioning (fonds, NY)', source: 'CFTC', validDays: 14 };
  if (!cot) return { ...f, score: null, fresh: 'na', value: 'indisponible' };
  const p = cot.percentile;
  const score = p < 10 ? 2 : p < 25 ? 1 : p > 90 ? -2 : p > 75 ? -1 : 0;
  const at = Date.parse(cot.date);
  return {
    ...f, score, fresh: fresh(at, 14, now), at,
    value: `Managed Money net ${cot.mmNet > 0 ? '+' : ''}${cot.mmNet.toLocaleString('fr-FR')} contrats · percentile ${p} % sur ${Math.round(cot.weeks / 52)} ans`,
    prev: `${cot.change1w >= 0 ? '+' : ''}${cot.change1w.toLocaleString('fr-FR')} sur 1 semaine · données du ${cot.date}`,
    rule: 'percentile < 10 % → +2 (short squeeze possible) · < 25 % → +1 · > 75 % → −1 · > 90 % → −2 (long squeeze possible)',
  };
}

// Latest entry per region for one manual metric, averaged into one factor.
export function manualFactor(key, entries, now = Date.now()) {
  const def = MANUAL[key];
  const f = { key, name: def.name, validDays: def.validDays, rule: def.rule, manual: true };
  const latest = {};
  for (const e of entries.filter(x => x.metric === key)) if (!latest[e.region] || e.dataTime > latest[e.region].dataTime) latest[e.region] = e;
  const list = Object.values(latest).filter(e => e.previous);
  if (!list.length) return { ...f, score: null, fresh: 'na', value: 'à saisir' };
  const parts = list.map(e => ({ e, pct: (e.value / e.previous - 1) * 100 }));
  const score = Math.round(parts.reduce((s, x) => s + def.score(x.pct), 0) / parts.length);
  const newest = Math.max(...list.map(e => e.dataTime));
  return {
    ...f, score, fresh: fresh(newest, def.validDays, now), at: newest,
    value: parts.map(({ e, pct }) => `${e.region} ${e.value.toLocaleString('fr-FR')} ${def.unit} (${fmtPct(pct)})`).join(' · '),
    prev: parts.map(({ e }) => `${e.region} avant ${e.previous.toLocaleString('fr-FR')}`).join(' · '),
    source: [...new Set(list.map(e => e.source))].join(', '),
    estimate: list.some(e => e.isEstimate),
    entries: list,
  };
}

export function fundamentalScore(factors) {
  const used = factors.filter(f => f.score != null);
  const weight = f => (f.fresh === 'stale' ? 0.5 : 1);
  const w = used.reduce((s, f) => s + weight(f), 0);
  const total = w ? Math.round((used.reduce((s, f) => s + f.score * weight(f), 0) / (2 * w)) * 10) : null;
  const coverage = used.length;
  const bias = coverage < 3 || total == null ? 'INSUFFICIENT' : total >= 3 ? 'BULLISH' : total <= -3 ? 'BEARISH' : 'NEUTRAL';
  return {
    total, bias, coverage, of: factors.length,
    reasons: used.filter(f => f.score > 0).sort((a, b) => b.score - a.score),
    counters: used.filter(f => f.score < 0).sort((a, b) => a.score - b.score),
  };
}

// Event when the score moves: a big move changes the thesis, a small one is information.
export function scoreChangeEvent(prev, next, at = Date.now()) {
  if (!prev || next.total == null || prev.total === next.total) return null;
  if (prev.total == null) {
    return {
      category: 'FUNDAMENTALS', importance: 45, level: 'IMPORTANT', title: 'Biais fondamental disponible',
      message: `Assez de données pour un biais : ${next.bias} (${next.total > 0 ? '+' : ''}${next.total}).`,
      fingerprint: `fund:first:${next.total}:${new Date(at).toISOString().slice(0, 13)}`,
    };
  }
  const d = next.total - prev.total;
  const importance = Math.abs(d) >= 3 ? 75 : prev.bias !== next.bias ? 60 : 30;
  const level = importance >= 70 ? 'CRITICAL' : importance >= 40 ? 'IMPORTANT' : 'INFORMATION';
  const sign = x => (x > 0 ? `+${x}` : `${x}`);
  return {
    category: 'FUNDAMENTALS', importance, level,
    title: Math.abs(d) >= 3 ? (d > 0 ? 'La thèse se renforce' : 'La thèse s’affaiblit') : 'Score fondamental modifié',
    message: `Score fondamental ${sign(prev.total)} → ${sign(next.total)}${prev.bias !== next.bias ? ` (${prev.bias} → ${next.bias})` : ''}.`,
    fingerprint: `fund:${prev.total}:${next.total}:${new Date(at).toISOString().slice(0, 13)}`,
  };
}
