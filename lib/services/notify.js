// Stores an event and decides whether it deserves to wake the user on Telegram.
// Only CRITICAL events are candidates; then silent mode, cooldown and a daily cap apply.
import * as repo from '../db/repo.js';
import * as tg from '../telegram/client.js';
import { alertMessage } from '../telegram/messages.js';

export const COOLDOWN_MIN = 30;
export const DAILY_CAP = 6;

// Same kind of event (category + title) within the cooldown is suppressed unless it escalated by 15+ points.
export function decide({ alert, silent, recent, now = Date.now() }) {
  if (alert.level !== 'CRITICAL') return 'NOT_CRITICAL';
  if (silent && !(alert.category === 'RISK' && alert.importance >= 85)) return 'SUPPRESSED_SILENT';
  const family = `${alert.category}:${alert.title}`;
  const same = recent.filter(r => r.family === family && r.status === 'SENT' && now - r.sentAt < COOLDOWN_MIN * 60e3);
  if (same.length && !(alert.importance >= Math.max(...same.map(r => r.importance)) + 15)) return 'SUPPRESSED_COOLDOWN';
  const today = recent.filter(r => r.status === 'SENT' && now - r.sentAt < 86400e3);
  if (today.length >= DAILY_CAP) return 'SUPPRESSED_CAP';
  return 'SEND';
}

export async function emit(sql, alert) {
  const stored = await repo.addAlert(sql, alert);
  if (!stored) return null; // already known: nothing new to say
  if (stored.level !== 'CRITICAL') return stored;
  let status;
  if (!tg.configured() || !tg.chatId()) status = 'NOT_CONFIGURED';
  else {
    const [silent, recent] = await Promise.all([repo.getSetting(sql, 'telegram_silent', false), repo.recentNotifications(sql)]);
    status = decide({ alert: stored, silent, recent });
    if (status === 'SEND') {
      try { await tg.sendMessage(alertMessage(stored)); status = 'SENT'; } catch (e) { console.error('telegram', e.message); status = 'FAILED'; }
    }
  }
  await repo.logNotification(sql, { alertId: stored.id, family: `${stored.category}:${stored.title}`, importance: stored.importance, status });
  return stored;
}
