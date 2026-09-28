// One monitoring pass: market events, fundamentals, news. Called by the scheduled job.
import { marketWithEvents } from './market.js';
import { loadFundamentals } from './fundamentals.js';
import { refreshNews } from './news.js';
import { runAnalysis } from './analysis.js';
import { createHmac } from 'node:crypto';
import * as repo from '../db/repo.js';
import * as tg from '../telegram/client.js';
import { statusMessage } from '../telegram/messages.js';
import { snapshot } from './snapshot.js';

// Optional summaries (off by default): 8:00 and 18:00, Paris time, once a day each.
export function dueSummary(settings, sent, now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(p => [p.type, p.value]));
  const hour = Number(parts.hour), day = `${parts.year}-${parts.month}-${parts.day}`;
  if (settings?.morning && hour >= 8 && hour < 11 && sent?.morning !== day) return { slot: 'morning', day };
  if (settings?.evening && hour >= 18 && hour < 21 && sent?.evening !== day) return { slot: 'evening', day };
  return null;
}

async function maybeSummary(sql) {
  if (!tg.configured() || !tg.chatId()) return { skipped: 'telegram non configuré' };
  const [settings, sent] = await Promise.all([repo.getSetting(sql, 'telegram_summaries', null), repo.getSetting(sql, 'summary_sent', {})]);
  const due = dueSummary(settings, sent);
  if (!due) return { skipped: true };
  const s = await snapshot(sql);
  const since = Date.now() - 12 * 3600e3;
  const events = (await repo.listAlerts(sql, 40)).filter(a => a.at > since && a.level !== 'INFORMATION').slice(0, 6);
  const text = `${due.slot === 'morning' ? '☀️ Résumé du matin' : '🌙 Résumé du soir'}\n\n`
    + statusMessage({ quote: s.market.quote, fund: s.fund?.score, war: s.war, position: s.position, trade: s.trade })
    + (events.length ? `\n\n<b>Dernières 12 h</b>\n${events.map(e => `• ${tg.esc(e.title)}`).join('\n')}` : '\n\nRien d’important ces 12 dernières heures.');
  await tg.sendMessage(text);
  await repo.setSetting(sql, 'summary_sent', { ...sent, [due.slot]: due.day });
  return { sent: due.slot };
}

export function cronSecret() {
  const base = process.env.CRON_SECRET || process.env.SESSION_SECRET || '';
  return createHmac('sha256', base).update('cron').digest('hex').slice(0, 48);
}

export async function runMonitor(sql) {
  const out = {};
  const step = async (name, fn) => { try { out[name] = await fn(); } catch (e) { out[name] = { error: String(e.message || e) }; } };
  await step('market', async () => { const m = await marketWithEvents('NY_COCOA', 'D1'); return { status: m.status, price: m.quote?.price }; });
  let fund = null;
  await step('fundamentals', async () => { fund = await loadFundamentals(sql); return { total: fund.score.total, bias: fund.score.bias }; });
  await step('analysis', async () => { const a = await runAnalysis(sql, { fund }); return { status: a.setup.status, score: a.setup.score }; });
  await step('news', () => refreshNews(sql));
  await step('summary', () => maybeSummary(sql));
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
