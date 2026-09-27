import { ago, hhmm } from '../lib/format.js';

// FRESH / DELAYED / STALE / OFFLINE / UNAVAILABLE, always with words, never color alone.
export function freshnessOf(market) {
  if (!market) return { key: 'na', label: 'Chargement' };
  if (market.status === 'UNAVAILABLE') return { key: 'na', label: 'Indisponible' };
  if (market.status === 'OFFLINE') return { key: 'offline', label: `Source hors ligne · dernière donnée ${market.quote ? hhmm(market.quote.dataTime) : '—'}` };
  const q = market.quote;
  if (!q?.dataTime) return { key: 'na', label: 'Heure de la donnée inconnue' };
  const ageH = (Date.now() - q.dataTime) / 3600e3;
  if (ageH > 18) return { key: 'stale', label: `Marché fermé · dernière cotation ${ago(q.dataTime)}` };
  return { key: 'delayed', label: `Différé ~${q.delayMinutes} min · ${hhmm(q.dataTime)}` };
}

export function Freshness({ market, info }) {
  const f = info || freshnessOf(market);
  return (
    <span className="fresh">
      <i className={`dot fresh-${f.key}`} aria-hidden="true" />
      <span>{f.label}</span>
    </span>
  );
}
