import { db } from '../lib/db/client.js';
import { getActiveTrade } from '../lib/db/repo.js';
import { runAction } from '../lib/services/trade.js';
import { getRates } from '../lib/services/market.js';
import { guarded, readJson, send } from '../lib/http/respond.js';

export default guarded(async (req, res) => {
  const sql = await db();
  if (req.method === 'GET') return send(res, 200, { status: 'OK', trade: await getActiveTrade(sql) });
  if (req.method !== 'POST') return send(res, 405, { status: 'ERROR' });
  const body = await readJson(req);
  const trade = await runAction(sql, body, {
    eurPerUnitFor: async cur => (await getRates().catch(() => null))?.eurPer?.[cur] ?? null,
  });
  send(res, 200, { status: 'OK', trade });
});
