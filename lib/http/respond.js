// Tiny helpers shared by the /api handlers (plain Node req/res, works on Vercel and in the Vite dev server).
import { isAuthenticated } from '../auth/session.js';
import { parseDatabaseUrl } from '../db/client.js';

const cache = new Map();

// Per-instance memory cache so a burst of requests never hammers a free source.
export async function cached(key, ttlMs, load) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

// Last good value, used to answer "DATA SOURCE OFFLINE" with the last known data instead of nothing.
export function lastGood(key) {
  return cache.get(key)?.value ?? null;
}

export function query(req) {
  return new URL(req.url, 'http://local').searchParams;
}

export function send(res, status, body, { cdnSeconds = 0, headers = {} } = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // private: responses depend on the session cookie, a shared CDN must not keep them
  res.setHeader('Cache-Control', cdnSeconds ? `private, max-age=${cdnSeconds}` : 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

export async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

export class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

// Wraps a handler: session check, then uniform error answers the frontend knows how to display.
export function guarded(handler, { auth = true } = {}) {
  return async (req, res) => {
    try {
      if (auth && !isAuthenticated(req)) return send(res, 401, { status: 'UNAUTHORIZED' });
      await handler(req, res);
    } catch (e) {
      if (e.code === 'DB_NOT_CONFIGURED' || e.code === 'AUTH_NOT_CONFIGURED') return send(res, 503, { status: e.code, error: e.message });
      if (e instanceof HttpError) return send(res, e.status, { status: e.code || 'ERROR', error: e.message });
      if (e instanceof SyntaxError) return send(res, 400, { status: 'ERROR', error: 'JSON invalide' });
      const db = dbProblem(e);
      if (db) { console.error('database', e.code, e.message); return send(res, 503, { status: 'DB_UNREACHABLE', error: db, details: describeDb(e) }); }
      console.error(e);
      send(res, 500, { status: 'ERROR', error: 'Erreur serveur' });
    }
  };
}

// Translates connection failures into a sentence the setup screen can show.
function dbProblem(e) {
  const code = e?.code || '', msg = String(e?.message || '');
  if (code === '28P01' || /password authentication failed/i.test(msg)) return 'Mot de passe de la base refusé : vérifie le mot de passe dans DATABASE_URL (sans crochets).';
  if (/tenant or user not found/i.test(msg)) return 'Projet Supabase introuvable : recopie l’adresse du Shared Pooler en entier.';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'Adresse de la base introuvable : vérifie DATABASE_URL (elle doit contenir pooler.supabase.com).';
  if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'ENETUNREACH' || code === 'CONNECT_TIMEOUT' || code === 'CONNECTION_CLOSED') return 'Base de données injoignable : utilise l’adresse du Shared Pooler, pas la connexion directe.';
  if (e instanceof TypeError && /Invalid URL|URL/i.test(msg)) return 'DATABASE_URL mal formée : un caractère spécial dans le mot de passe peut la casser.';
  return null;
}

// What the server actually read from DATABASE_URL, without ever revealing the password.
function describeDb(e) {
  const d = { error: `${e?.code || ''} ${e?.message || ''}`.trim() };
  try {
    const c = parseDatabaseUrl(process.env.DATABASE_URL || '');
    Object.assign(d, { host: c.host, port: c.port, user: c.username, database: c.database, passwordLength: c.password.length });
  } catch { d.url = 'illisible'; }
  return d;
}

// Address that outside services (Telegram, Supabase cron) must call. Vercel protects each deployment's own
// URL (xxx-hash-team.vercel.app) behind a login, which answers them 401: use the production domain instead.
export function publicHost(req) {
  const fixed = process.env.APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (fixed) return fixed.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return req.headers['x-forwarded-host'] || req.headers.host;
}
