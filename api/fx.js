import { fetchRates, SOURCE } from '../lib/providers/fx/frankfurter.js';
import { cached, lastGood, send } from '../lib/http/respond.js';

export default async function handler(req, res) {
  try {
    const rates = await cached('fx', 6 * 3600e3, () => fetchRates());
    send(res, 200, { status: 'OK', ...rates, source: SOURCE, fetchedAt: Date.now() }, { cdnSeconds: 3600 });
  } catch (e) {
    const prev = lastGood('fx');
    send(res, 200, { ...(prev || {}), status: 'OFFLINE', source: SOURCE, error: String(e.message || e), checkedAt: Date.now() });
  }
}
