// One monitoring pass: market events, fundamentals, news. Called by the scheduled job.
import { marketWithEvents } from './market.js';
import { loadFundamentals } from './fundamentals.js';
import { refreshNews } from './news.js';
import { createHmac } from 'node:crypto';

export function cronSecret() {
  const base = process.env.CRON_SECRET || process.env.SESSION_SECRET || '';
  return createHmac('sha256', base).update('cron').digest('hex').slice(0, 48);
}

export async function runMonitor(sql) {
  const out = {};
  const step = async (name, fn) => { try { out[name] = await fn(); } catch (e) { out[name] = { error: String(e.message || e) }; } };
  await step('market', async () => { const m = await marketWithEvents('NY_COCOA', 'D1'); return { status: m.status, price: m.quote?.price }; });
  await step('fundamentals', async () => { const f = await loadFundamentals(sql); return { total: f.score.total, bias: f.score.bias }; });
  await step('news', () => refreshNews(sql));
  return out;
}

// SQL that makes Supabase call the monitor every 5 minutes (pg_cron + pg_net).
export function scheduleSql(url, secret) {
  const q = s => s.replace(/'/g, "''");
  return [
    'create extension if not exists pg_net',
    'create extension if not exists pg_cron',
    `select cron.schedule('cocoa-war-room-monitor', '*/5 * * * *', $cron$ select net.http_post(url := '${q(url)}', headers := '{"Content-Type": "application/json", "Authorization": "Bearer ${q(secret)}"}'::jsonb, body := '{}'::jsonb, timeout_milliseconds := 55000) $cron$)`,
  ];
}
