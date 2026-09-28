// All data goes through our own /api routes. The session cookie is sent automatically.
export class ApiError extends Error {
  constructor(status, body) { super(body?.error || `HTTP ${status}`); this.status = status; this.code = body?.status; this.body = body; }
}

async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const api = {
  auth: () => call('/api/auth'),
  login: password => call('/api/auth', { method: 'POST', body: { password } }),
  logout: () => call('/api/auth', { method: 'DELETE' }),
  market: (instrument, tf) => call(`/api/market?instrument=${instrument}&tf=${encodeURIComponent(tf)}`),
  fx: () => call('/api/fx'),
  state: () => call('/api/state'),
  ack: id => call('/api/state', { method: 'POST', body: { action: 'ack', id } }),
  trade: (action, payload = {}) => call('/api/trade', { method: 'POST', body: { action, ...payload } }),
  journal: () => call('/api/journal'),
  fundamentals: () => call('/api/fundamentals'),
  analysis: () => call('/api/analysis'),
  news: (refresh = false) => call(`/api/news${refresh ? '?refresh=1' : ''}`),
  telegram: (action = 'status') => call(`/api/telegram?action=${action}`),
  monitor: (action = 'status') => call(`/api/cron?action=${action}`),
  addFundamental: entry => call('/api/fundamentals', { method: 'POST', body: { action: 'add', ...entry } }),
  deleteFundamental: id => call('/api/fundamentals', { method: 'POST', body: { action: 'delete', id } }),
  addNote: (answers, snapshot) => call('/api/journal', { method: 'POST', body: { answers, snapshot } }),
};

// Sent when the page is hidden, so it must survive the page going away.
export function sendVisit(snapshot) {
  const body = JSON.stringify({ action: 'visit', snapshot });
  if (!navigator.sendBeacon?.('/api/state', new Blob([body], { type: 'text/plain' }))) {
    fetch('/api/state', { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } }).catch(() => {});
  }
}
