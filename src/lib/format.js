export const SYM = { USD: '$', GBP: '£', EUR: '€' };

export const num = (x, d = 0) =>
  x == null || Number.isNaN(x) ? '—' : x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

export const money = (x, cur = 'USD', d = 0) => (x == null ? '—' : (x < 0 ? '−' : '') + (SYM[cur] || '') + num(Math.abs(x), d));

export const eur = (x, d = 2, signed = false) =>
  x == null || Number.isNaN(x) ? '—' : (x < 0 ? '−' : signed && x > 0 ? '+' : '') + '€' + num(Math.abs(x), d);

export const pct = (x, d = 2) => (x == null || Number.isNaN(x) ? '—' : (x > 0 ? '+' : x < 0 ? '−' : '') + num(Math.abs(x), d) + '%');

export function ago(ms) {
  if (!ms) return '—';
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'à l’instant';
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}

export const hhmm = ms => (ms ? new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—');
export const dateShort = ms => (ms ? new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '—');
