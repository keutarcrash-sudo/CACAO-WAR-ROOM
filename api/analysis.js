import { db } from '../lib/db/client.js';
import { runAnalysis } from '../lib/services/analysis.js';
import { cached, guarded, query, send } from '../lib/http/respond.js';
import { listSetupHistory, getCache, setCache } from '../lib/db/repo.js';
import { historyStats } from '../lib/engines/history.js';

export default guarded(async (req, res) => {
  const sql = await db();
  if (query(req).get('history') === '1') {
    const rows = await listSetupHistory(sql);
    return send(res, 200, { status: 'OK', rows: rows.slice(0, 60), stats: { d1: historyStats(rows, 'd1'), d3: historyStats(rows, 'd3'), d7: historyStats(rows, 'd7') } });
  }
  // the continuous monitoring refreshes the analysis every 5 minutes: serve that one at once,
  // a full computation on a cold server takes several seconds
  const saved = await getCache(sql, 'analysis:last').catch(() => null);
  if (saved && Date.now() - saved.fetchedAt < 6 * 60e3) return send(res, 200, saved.value);
  const fresh = await cached('analysis', 60e3, () => runAnalysis(sql));
  await setCache(sql, 'analysis:last', fresh).catch(() => {});
  send(res, 200, fresh);
});
