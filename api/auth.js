import { checkPassword, createToken, isAuthenticated, sessionCookie } from '../lib/auth/session.js';
import { guarded, readJson, send } from '../lib/http/respond.js';

// Slows down password guessing: a few attempts per minute per address.
const attempts = new Map();
function tooMany(ip) {
  const now = Date.now(), list = (attempts.get(ip) || []).filter(t => now - t < 60e3);
  list.push(now); attempts.set(ip, list);
  return list.length > 8;
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
  const { password } = await readJson(req);
  if (!checkPassword(password)) return send(res, 401, { status: 'ERROR', error: 'Mot de passe incorrect.' });
  send(res, 200, { status: 'OK' }, { headers: { 'Set-Cookie': sessionCookie(createToken(), { secure }) } });
}, { auth: false });
