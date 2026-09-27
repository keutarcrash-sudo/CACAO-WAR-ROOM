import { INSTRUMENTS, TIMEFRAMES } from '../lib/providers/market/index.js';
import { marketWithEvents } from '../lib/services/market.js';
import { guarded, query, send } from '../lib/http/respond.js';

export default guarded(async (req, res) => {
  const q = query(req);
  const instrument = q.get('instrument') || 'NY_COCOA';
  const tf = q.get('tf') || 'D1';
  if (!INSTRUMENTS[instrument] || !TIMEFRAMES.includes(tf)) return send(res, 400, { status: 'ERROR', error: 'Paramètre instrument ou tf invalide' });
  send(res, 200, await marketWithEvents(instrument, tf), { cdnSeconds: 30 });
});
