import { db } from '../lib/db/client.js';
import * as repo from '../lib/db/repo.js';
import * as tg from '../lib/telegram/client.js';
import { statusMessage, listMessage, HELP } from '../lib/telegram/messages.js';
import { marketWithEvents, getRates } from '../lib/services/market.js';
import { loadFundamentals } from '../lib/services/fundamentals.js';
import { computePosition } from '../lib/engines/trade.js';
import { evaluateWarRoom } from '../lib/engines/warroom.js';
import { guarded, query, readJson, send } from '../lib/http/respond.js';
import { isAuthenticated } from '../lib/auth/session.js';

const esc = tg.esc;

async function snapshot(sql) {
  const [market, fund, trade, fx] = await Promise.all([
    marketWithEvents('NY_COCOA', 'D1'), loadFundamentals(sql).catch(() => null), repo.getActiveTrade(sql), getRates().catch(() => null),
  ]);
  const price = trade.priceSource === 'manual' ? trade.manualPrice?.price ?? null : market.quote?.price ?? null;
  const position = computePosition({ ...trade, price, eurPerUnit: fx?.eurPer?.[trade.product.priceCurrency] ?? null });
  const war = evaluateWarRoom({ market, daily: market.candles, modules: { fundamentals: !!fund, confluence: false }, fundamentals: fund?.score, direction: trade.product.direction });
  return { market, fund, trade, position, war };
}

async function answer(sql, text) {
  const cmd = (text || '').trim().split(/\s|@/)[0].toLowerCase();
  if (cmd === '/status' || cmd === '/start') {
    const s = await snapshot(sql);
    return statusMessage({ quote: s.market.quote, fund: s.fund?.score, war: s.war, position: s.position, trade: s.trade });
  }
  if (cmd === '/position') {
    const s = await snapshot(sql);
    const p = s.position, t = s.trade;
    return listMessage('Position', [
      `Statut : ${esc(p.status)}`, `Engagé : €${p.capital} / €${t.plan.plannedCapital}`,
      ...t.entries.map(e => `E${e.n} : ${e.qty} u. à ${e.price} (€${e.capitalEur})${e.offRules ? ' · hors règles' : ''}`),
      `Stop : ${t.stop ?? 'aucun'}`, `P&amp;L : ${p.pnl != null ? `€${p.pnl.toFixed(2)}` : '—'}`,
      `Perte au stop : ${p.lossAtStop != null ? `€${p.lossAtStop.toFixed(2)} / €${t.plan.maxLoss}` : '—'}`,
    ]);
  }
  if (cmd === '/fundamental') {
    const f = await loadFundamentals(sql);
    return listMessage(`Fondamental : ${f.score.bias} ${f.score.total ?? ''}`, f.factors.map(x => `${x.score == null ? '○' : x.score > 0 ? '▲' : x.score < 0 ? '▼' : '•'} ${esc(x.name)} : ${x.score ?? 'N/D'} — ${esc(x.value)}`));
  }
  if (cmd === '/news') {
    const ev = (await repo.recentNewsEvents(sql, 72, 8)).filter(e => e.level !== 'INFORMATION');
    return listMessage('News importantes (72 h)', ev.map(e => `• ${esc(e.title)} <i>(${e.sources.length} src, ${e.importance})</i>`));
  }
  if (cmd === '/alerts') {
    const al = (await repo.listAlerts(sql, 8));
    return listMessage('Dernières alertes', al.map(a => `${a.level === 'CRITICAL' ? '🚨' : a.level === 'IMPORTANT' ? '🟠' : '•'} ${esc(a.title)}`));
  }
  if (cmd === '/silent') { await repo.setSetting(sql, 'telegram_silent', true); return '🔕 Mode silencieux : seules les alertes critiques de risque passeront.'; }
  if (cmd === '/resume') { await repo.setSetting(sql, 'telegram_silent', false); return '🔔 Alertes critiques réactivées.'; }
  return HELP;
}

export default guarded(async (req, res) => {
  // Telegram → webhook
  if (req.method === 'POST' && req.headers['x-telegram-bot-api-secret-token']) {
    if (req.headers['x-telegram-bot-api-secret-token'] !== tg.webhookSecret()) return send(res, 401, { ok: false });
    const update = await readJson(req);
    const msg = update.message || update.edited_message;
    const chat = msg?.chat?.id;
    if (!chat) return send(res, 200, { ok: true });
    if (!tg.chatId()) {
      await tg.sendMessage(`Ton identifiant de conversation est <code>${chat}</code>.\nAjoute-le dans Vercel sous le nom <b>TELEGRAM_CHAT_ID</b>, puis redéploie.`, chat).catch(() => {});
      return send(res, 200, { ok: true });
    }
    if (String(chat) !== String(tg.chatId())) return send(res, 200, { ok: true }); // someone else: ignored
    const sql = await db();
    const text = await answer(sql, msg.text).catch(e => `Erreur : ${esc(e.message)}`);
    await tg.sendMessage(text, chat).catch(e => console.error('telegram reply', e.message));
    return send(res, 200, { ok: true });
  }

  // App (session) → status and setup
  if (!isAuthenticated(req)) return send(res, 401, { status: 'UNAUTHORIZED' });
  const sql = await db();
  const action = query(req).get('action') || 'status';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  let error = null;
  try {
    if (action === 'setup') {
      await tg.call('setWebhook', { url: `https://${host}/api/telegram`, secret_token: tg.webhookSecret(), allowed_updates: ['message'] });
      await tg.call('setMyCommands', { commands: [
        { command: 'status', description: 'Résumé instantané' }, { command: 'position', description: 'Ta position' },
        { command: 'fundamental', description: 'Biais fondamental' }, { command: 'news', description: 'News importantes' },
        { command: 'alerts', description: 'Dernières alertes' }, { command: 'silent', description: 'Mode silencieux' }, { command: 'resume', description: 'Réactiver les alertes' },
      ] });
    } else if (action === 'test') {
      await tg.sendMessage('✅ <b>Cocoa War Room</b> est connecté. Seules les alertes critiques t’arriveront ici.');
    } else if (action === 'silent' || action === 'resume') {
      await repo.setSetting(sql, 'telegram_silent', action === 'silent');
    }
  } catch (e) { error = String(e.message || e); }
  let webhook = null, bot = null;
  if (tg.configured()) {
    try { webhook = await tg.call('getWebhookInfo', {}); bot = await tg.call('getMe', {}); } catch (e) { error = error || String(e.message || e); }
  }
  send(res, 200, {
    status: error ? 'ERROR' : 'OK', error,
    tokenSet: tg.configured(), chatIdSet: !!tg.chatId(), bot: bot ? bot.username : null,
    webhookSet: !!webhook?.url && webhook.url.includes('/api/telegram'), webhookError: webhook?.last_error_message || null,
    silent: await repo.getSetting(sql, 'telegram_silent', false),
    recent: (await repo.recentNotifications(sql)).slice(0, 10),
  });
}, { auth: false });
