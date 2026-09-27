import { getMarket, INSTRUMENTS, TIMEFRAMES } from '../lib/providers/market/index.js';
import { cached, lastGood, query, send } from '../lib/http/respond.js';

const TTL = { W1: 3600e3, D1: 300e3, '4H': 120e3, '1H': 60e3, '15M': 60e3, '5M': 60e3 };

export default async function handler(req, res) {
  const q = query(req);
  const instrument = q.get('instrument') || 'NY_COCOA';
  const tf = q.get('tf') || 'D1';
  if (!INSTRUMENTS[instrument] || !TIMEFRAMES.includes(tf)) {
    return send(res, 400, { status: 'ERROR', error: 'Paramètre instrument ou tf invalide' });
  }
  const key = `${instrument}:${tf}`;
  try {
    const data = await cached(key, TTL[tf], () => getMarket(instrument, tf));
    send(res, 200, data, { cdnSeconds: 60 });
  } catch (e) {
    // Never crash the app: return the last known data, clearly flagged as offline.
    const prev = lastGood(key);
    send(res, 200, {
      ...(prev || { instrument: { id: instrument }, tf }),
      status: 'OFFLINE',
      error: String(e.message || e),
      checkedAt: Date.now(),
    });
  }
}
