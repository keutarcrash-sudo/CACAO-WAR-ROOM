import { db } from '../lib/db/client.js';
import { recentNewsEvents, getCache } from '../lib/db/repo.js';
import { refreshNews } from '../lib/services/news.js';
import { guarded, query, send } from '../lib/http/respond.js';

export default guarded(async (req, res) => {
  const sql = await db();
  const refresh = await refreshNews(sql, { force: query(req).get('refresh') === '1' }).catch(e => ({ error: String(e.message || e) }));
  const last = await getCache(sql, 'news:last');
  send(res, 200, { status: 'OK', events: await recentNewsEvents(sql, 72, 60), refresh, lastFetch: last ? { at: last.fetchedAt, ...last.value } : null });
});
