import { SOURCE } from '../lib/providers/fx/frankfurter.js';
import { getRates } from '../lib/services/market.js';
import { guarded, lastGood, send } from '../lib/http/respond.js';

export default guarded(async (req, res) => {
  try {
    send(res, 200, { status: 'OK', ...(await getRates()), source: SOURCE, fetchedAt: Date.now() }, { cdnSeconds: 3600 });
  } catch (e) {
    send(res, 200, { ...(lastGood('fx') || {}), status: 'OFFLINE', source: SOURCE, error: String(e.message || e), checkedAt: Date.now() });
  }
});
