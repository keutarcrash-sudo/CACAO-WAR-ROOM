import { db } from '../lib/db/client.js';
import { runAnalysis } from '../lib/services/analysis.js';
import { cached } from '../lib/http/respond.js';
import { guarded, send } from '../lib/http/respond.js';

export default guarded(async (req, res) => {
  const sql = await db();
  send(res, 200, await cached('analysis', 60e3, () => runAnalysis(sql)));
});
