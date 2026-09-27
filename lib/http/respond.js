// Tiny helpers shared by the /api handlers (plain Node req/res, works on Vercel and in the Vite dev server).

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

export function send(res, status, body, { cdnSeconds = 0 } = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cdnSeconds ? `public, s-maxage=${cdnSeconds}, stale-while-revalidate=${cdnSeconds * 5}` : 'no-store');
  res.end(JSON.stringify(body));
}
