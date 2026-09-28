// Message texts. Short, readable on a lock screen, never "BUY NOW".
import { esc } from './client.js';

const n0 = x => (x == null ? '—' : Math.round(x).toLocaleString('en-US'));
const eur = x => (x == null ? '—' : `${x < 0 ? '−' : '+'}€${Math.abs(x).toFixed(2)}`);
const sign = x => (x == null ? '—' : x > 0 ? `+${x}` : `${x}`);
const BIAS = { BULLISH: '🟢 BULLISH', NEUTRAL: '🟡 NEUTRAL', BEARISH: '🔴 BEARISH', INSUFFICIENT: '⚪ DONNÉES INSUFFISANTES' };
const LVL = { CRITICAL: '🚨', IMPORTANT: '🟠', INFORMATION: '🟢' };

export function alertMessage(a) {
  const lines = [`${LVL[a.level] || '•'} <b>COCOA — ${esc(a.title)}</b>`];
  if (a.message) lines.push('', esc(a.message));
  lines.push('', `Importance ${a.importance}/100 · ${esc(a.source || 'War Room')}`);
  if (a.category === 'MARKET' || a.category === 'LIQUIDITY' || a.category === 'NEWS') lines.push('<i>Pas un signal d’entrée automatique.</i>');
  return lines.join('\n');
}

export function statusMessage({ quote, fund, war, position, trade }) {
  const ST = { NO_SETUP: '⚪ AUCUN SETUP', WATCHING: '🟡 SOUS SURVEILLANCE', DEVELOPING: '🟠 SETUP EN FORMATION', HIGH: '🟢 HAUTE CONFLUENCE', INVALIDATED: '🔴 THÈSE INVALIDÉE' };
  const q = quote || {};
  return [
    '☕ <b>COCOA WAR ROOM</b>',
    '',
    `Prix NY : <b>$${n0(q.price)}</b> ${q.changePct != null ? `(${q.changePct >= 0 ? '+' : ''}${q.changePct.toFixed(2)} %)` : ''} · différé`,
    `Fondamental : ${fund ? `${BIAS[fund.bias]} ${sign(fund.total)}` : '—'}`,
    `Confluence : ${war.score != null ? `${war.score}/15` : '—'}${war.confirmed?.length ? ` (${war.confirmed.map(c => c.label).join(', ')})` : ''}`,
    '',
    `Position : €${n0(position.capital)} / €${trade.plan.plannedCapital}`,
    `Moyenne : ${position.avg != null ? n0(position.avg) : '—'}`,
    `P&amp;L : ${eur(position.pnl)}`,
    `Perte au stop : ${position.lossAtStop != null ? `€${position.lossAtStop.toFixed(2)} / €${trade.plan.maxLoss}` : 'aucun stop'}`,
    '',
    `Statut : <b>${ST[war.status] || esc(war.status)}</b>${war.doNothing ? ' · rien à faire' : ''}`,
    ...war.reasons.slice(0, 3).map(r => `○ ${esc(r.t)}`),
  ].join('\n');
}

export function listMessage(title, rows) {
  if (!rows.length) return `<b>${esc(title)}</b>\n\nRien pour l’instant.`;
  return [`<b>${esc(title)}</b>`, '', ...rows].join('\n');
}

export const HELP = [
  '<b>Commandes</b>',
  '/status — résumé instantané',
  '/position — ta position',
  '/fundamental — biais et facteurs',
  '/news — dernières informations importantes',
  '/alerts — dernières alertes',
  '/silent — seulement les alertes critiques de risque',
  '/resume — alertes critiques normales',
].join('\n');
