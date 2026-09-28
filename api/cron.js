import { db } from '../lib/db/client.js';
import { getSetting, setSetting } from '../lib/db/repo.js';
import { runMonitor, cronSecret, scheduleSql } from '../lib/services/monitor.js';
import { guarded, publicHost, query, send } from '../lib/http/respond.js';
import { isAuthenticated } from '../lib/auth/session.js';
import { timingSafeEqual } from 'node:crypto';

const sameSecret = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// POST with the cron secret (Supabase scheduler) runs a pass.
// GET ?action=status|install|uninstall from the app (session) manages the schedule.
export default guarded(async (req, res) => {
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (bearer && sameSecret(bearer, cronSecret())) {
    const sql = await db();
    const result = await runMonitor(sql);
    await setSetting(sql, 'monitor_last_run', { at: Date.now(), result });
    return send(res, 200, { status: 'OK', result });
  }
  if (!isAuthenticated(req)) return send(res, 401, { status: 'UNAUTHORIZED' });
  const sql = await db();
  const action = query(req).get('action') || 'status';
  const host = publicHost(req);
  const url = `https://${host}/api/cron`;

  if (action === 'run') {
    const result = await runMonitor(sql);
    await setSetting(sql, 'monitor_last_run', { at: Date.now(), result, manual: true });
    return send(res, 200, { status: 'OK', result });
  }
  if (action === 'install' || action === 'uninstall') {
    try {
      if (action === 'install') for (const s of scheduleSql(url, cronSecret())) await sql.unsafe(s);
      else await sql.unsafe("select cron.unschedule('cocoa-war-room-monitor')");
      await setSetting(sql, 'monitor', { installed: action === 'install', url, at: Date.now() });
    } catch (e) {
      return send(res, 200, { status: 'ERROR', error: String(e.message || e), manualSql: action === 'install' ? scheduleSql(url, '<la clé affichée dans l’app>').join(';\n') + ';' : null });
    }
  }
  let job = null, lastCall = null;
  try { [job] = await sql`select jobid, schedule, active, command from cron.job where jobname = 'cocoa-war-room-monitor'`; } catch { /* pg_cron not enabled */ }
  // what Supabase actually got back from its last call (pg_net keeps recent responses)
  try { [lastCall] = await sql`select status_code, error_msg, created from net._http_response order by created desc limit 1`; } catch { /* pg_net not enabled */ }
  const jobUrl = job?.command?.match(/url\s*:=\s*'([^']+)'/)?.[1] ?? null;
  send(res, 200, {
    status: 'OK',
    scheduled: !!job?.active, schedule: job?.schedule ?? null, url,
    jobUrl, staleUrl: !!jobUrl && jobUrl !== url,
    lastCall: lastCall ? { status: lastCall.status_code, error: lastCall.error_msg, at: new Date(lastCall.created).getTime() } : null,
    lastRun: await getSetting(sql, 'monitor_last_run'),
  });
}, { auth: false });
