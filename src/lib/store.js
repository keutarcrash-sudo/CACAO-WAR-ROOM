// v0.1 stores the trade and the journal in this browser only (localStorage).
// Every access is guarded: private windows or blocked storage must never break the app.
const PREFIX = 'cwr.';

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function exportAll() {
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith(PREFIX)) out[k.slice(PREFIX.length)] = JSON.parse(localStorage.getItem(k));
    }
  } catch { /* storage unavailable */ }
  return { app: 'cocoa-war-room', version: 1, exportedAt: new Date().toISOString(), data: out };
}

export function importAll(obj) {
  if (obj?.app !== 'cocoa-war-room' || typeof obj.data !== 'object') throw new Error('Fichier non reconnu');
  for (const [k, v] of Object.entries(obj.data)) save(k, v);
}
