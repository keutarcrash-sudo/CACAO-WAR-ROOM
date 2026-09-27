async function get(path) {
  const res = await fetch(path, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export const fetchMarket = (instrument, tf) => get(`/api/market?instrument=${instrument}&tf=${encodeURIComponent(tf)}`);
export const fetchFx = () => get('/api/fx');
