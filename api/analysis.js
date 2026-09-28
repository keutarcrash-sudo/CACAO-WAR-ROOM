import { db } from '../lib/db/client.js';
import { runAnalysis } from '../lib/services/analysis.js';
import { cached, guarded, query, send } from '../lib/http/respond.js';
import { listSetupHistory } from '../lib/db/repo.js';
import { historyStats } from '../lib/engines/history.js';

export default guarded(async (req, res) => {
  const sql = await db();
  if (query(req).get('history') === '1') {
    const rows = await listSetupHistory(sql);
    return send(res, 200, { status: 'OK', rows: rows.slice(0, 60), stats: { d1: historyStats(rows, 'd1'), d3: historyStats(rows, 'd3'), d7: historyStats(rows, 'd7') } });
  }
  send(res, 200, await cached('analysis', 60e3, () => runAnalysis(sql)));
});
