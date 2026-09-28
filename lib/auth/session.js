// Single-user session: one password (APP_PASSWORD) and an HMAC-signed cookie (SESSION_SECRET).
import { createHmac, timingSafeEqual } from 'node:crypto';

export const COOKIE = 'cwr_session';
const DAYS = 30;

export class AuthNotConfigured extends Error {
  constructor() { super('APP_PASSWORD ou SESSION_SECRET manquant'); this.code = 'AUTH_NOT_CONFIGURED'; }
}

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || !process.env.APP_PASSWORD) throw new AuthNotConfigured();
  return s;
}

const b64 = s => Buffer.from(s).toString('base64url');
const sign = (payload, key) => createHmac('sha256', key).update(payload).digest('base64url');

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export function checkPassword(candidate) {
  secret();
  // compare HMACs so the comparison time does not depend on the password length
  const key = 'pw-check';
  // spaces or line breaks pasted around the value (in Vercel or on a phone keyboard) are ignored
  return safeEqual(sign(String(candidate ?? '').trim(), key), sign(String(process.env.APP_PASSWORD).trim(), key));
}

export function createToken(now = Date.now()) {
  const payload = b64(JSON.stringify({ exp: now + DAYS * 86400e3 }));
  return `${payload}.${sign(payload, secret())}`;
}

export function verifyToken(token, now = Date.now()) {
  if (!token || !token.includes('.')) return false;
  const [payload, sig] = token.split('.');
  if (!safeEqual(sig, sign(payload, secret()))) return false;
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > now; } catch { return false; }
}

export function readCookie(req, name = COOKIE) {
  const raw = req.headers?.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function sessionCookie(token, { secure = true } = {}) {
  const maxAge = token ? DAYS * 86400 : 0;
  return `${COOKIE}=${token || ''}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

export function isAuthenticated(req) {
  return verifyToken(readCookie(req));
}
