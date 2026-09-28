import { checkPassword, createToken, isAuthenticated, sessionCookie } from '../lib/auth/session.js';
import { guarded, readJson, send } from '../lib/http/respond.js';
import { db } from '../lib/db/client.js';
import * as repo from '../lib/db/repo.js';

// Slows down password guessing. First line: a few attempts per minute per address on this instance.
const attempts = new Map();
function tooMany(ip) {
  const now = Date.now(), list = (attempts.get(ip) || []).filter(t => now - t < 60e3);
  list.push(now); attempts.set(ip, list);
  return list.length > 8;
}

// Second line, in the database so every server instance sees it: failed attempts over 15 minutes,
// per address and in total (an attacker can change address, not the total).
const WINDOW = 15 * 60e3, PER_IP = 5, TOTAL = 20;
async function locked(ip) {
  try {
    const f = await repo.loginFailures(await db(), ip, WINDOW);
    if (f.total >= TOTAL) return 'Trop de tentatives échouées : accès bloqué 15 minutes par sécurité.';
    if (f.ip >= PER_IP) return 'Trop de tentatives échouées depuis cet appareil : réessaie dans 15 minutes.';
  } catch { /* database unavailable: the per-instance limit still applies */ }
  return null;
}
async function recordFailure(ip) {
  try { await repo.addLoginFailure(await db(), ip); } catch { /* ignore */ }
}

export default guarded(async (req, res) => {
  const secure = (req.headers['x-forwarded-proto'] || '').includes('https');
  if (req.method === 'GET') {
    let configured = true, authenticated = false;
    try { authenticated = isAuthenticated(req); } catch { configured = false; }
    return send(res, 200, { status: 'OK', configured, authenticated, database: !!process.env.DATABASE_URL });
  }
  if (req.method === 'DELETE') return send(res, 200, { status: 'OK' }, { headers: { 'Set-Cookie': sessionCookie(null, { secure }) } });
  if (req.method !== 'POST') return send(res, 405, { status: 'ERROR' });

  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  if (tooMany(ip)) return send(res, 429, { status: 'ERROR', error: 'Trop de tentatives, réessaie dans une minute.' });
  const lock = await locked(ip);
  if (lock) return send(res, 429, { status: 'ERROR', error: lock });
  const { password } = await readJson(req);
  if (!checkPassword(password)) {
    await recordFailure(ip);
    return send(res, 401, { status: 'ERROR', error: 'Mot de passe incorrect.' });
  }
  send(res, 200, { status: 'OK' }, { headers: { 'Set-Cookie': sessionCookie(createToken(), { secure }) } });
}, { auth: false });
