// All data goes through our own /api routes. The session cookie is sent automatically.
export class ApiError extends Error {
  constructor(status, body) { super(message(status, body)); this.status = status; this.code = body?.status; this.body = body; }
}

// Our routes answer { error: "phrase" }; the hosting platform may answer { error: { message } } or HTML.
function message(status, body) {
  const e = body?.error;
  if (typeof e === 'string') return e;
  if (status === 504) return 'Le serveur a mis trop de temps à répondre. Réessaie dans un instant.';
  if (e && typeof e === 'object' && e.message) return `Erreur du serveur : ${e.message}`;
  return `Erreur du serveur (${status || 'réseau'}).`;
}

// A request never waits forever: a phone resuming the app, a server starting cold or a busy database
// can leave it hanging. Reads are retried once.
const TIMEOUT = 20000;
async function call(path, { method = 'GET', body } = {}, attempt = 0) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout ? AbortSignal.timeout(TIMEOUT) : undefined,
    });
  } catch (e) {
    if (method === 'GET' && attempt === 0) return call(path, { method, body }, 1);
    // the browser's own message ("Load failed", "Failed to fetch") says nothing useful
    throw new ApiError(0, { error: e?.name === 'TimeoutError' || e?.name === 'AbortError'
      ? 'Le serveur met trop de temps à répondre. Réessaie dans un instant.'
      : 'Le serveur n’a pas répondu (réseau coupé, ou mise à jour de l’app en cours). Réessaie dans un instant.' });
  }
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
  priceAlert: (action, payload) => call('/api/state', { method: 'POST', body: { action, ...payload } }),
  trade: (action, payload = {}) => call('/api/trade', { method: 'POST', body: { action, ...payload } }),
  journal: () => call('/api/journal'),
  fundamentals: () => call('/api/fundamentals'),
  analysis: () => call('/api/analysis'),
  history: () => call('/api/analysis?history=1'),
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
