// War Room status, Market Pulse and "do nothing" reasons, computed only from data that exists.
import { atr, volatilityRatio, rangePosition } from './technical.js';

const clamp01 = x => Math.max(0, Math.min(1, x));

// Market Pulse: activity of the system, 0-100. Not a prediction.
// Components whose data is not connected yet are excluded and reported, never guessed.
export function marketPulse({ daily, quote, alerts = [], fundamentalsOn = false, confluenceOn = false, newsEvents = null, now = Date.now() }) {
  const comps = [];
  const ratio = daily ? volatilityRatio(daily) : null;
  comps.push({ key: 'vol', label: 'Volatilité vs moyenne 20 j', weight: 30, value: ratio == null ? null : clamp01((ratio - 0.6) / 1.4), detail: ratio == null ? 'indisponible' : `${ratio.toFixed(2)}× la moyenne` });
  const a = daily ? atr(daily) : null;
  const move = a && quote?.change != null ? Math.abs(quote.change) / a : null;
  comps.push({ key: 'move', label: 'Mouvement du prix (en ATR)', weight: 25, value: move == null ? null : clamp01(move / 1.5), detail: move == null ? 'indisponible' : `${move.toFixed(2)} ATR` });
  // most important news of the last 6 h, fading with age
  const news = newsEvents == null ? null : Math.max(0, ...newsEvents.map(e => (e.importance / 100) * Math.max(0, 1 - (now - e.updatedAt) / (6 * 3600e3))));
  const recentNews = newsEvents?.filter(e => now - e.updatedAt < 6 * 3600e3 && e.level !== 'INFORMATION').length ?? 0;
  comps.push({ key: 'news', label: 'Nouvelles importantes (6 h)', weight: 20, value: news, detail: news == null ? 'module news indisponible' : recentNews ? `${recentNews} information${recentNews > 1 ? 's' : ''} importante${recentNews > 1 ? 's' : ''}` : 'rien d’important' });
  const setupEv = alerts.filter(a => a.category === 'SETUP' && now - a.at < 86400e3);
  const conf = confluenceOn ? Math.max(0, ...setupEv.map(a => a.importance / 100)) : null;
  comps.push({ key: 'conf', label: 'Changement de confluence (24 h)', weight: 15, value: conf, detail: conf == null ? 'analyse technique en cours' : setupEv.length ? `${setupEv.length} changement${setupEv.length > 1 ? 's' : ''} de statut` : 'aucun changement' });
  // strongest fundamental score change of the last 24 h (0 when nothing moved)
  const fundEv = alerts.filter(a => a.category === 'FUNDAMENTALS' && now - a.at < 86400e3);
  const fund = fundamentalsOn ? Math.max(0, ...fundEv.map(a => a.importance / 100)) : null;
  comps.push({ key: 'fund', label: 'Changement fondamental (24 h)', weight: 10, value: fund, detail: fund == null ? 'fondamentaux pas encore branchés' : fundEv.length ? `${fundEv.length} changement${fundEv.length > 1 ? 's' : ''} de score` : 'aucun changement' });
  const avail = comps.filter(c => c.value != null);
  const w = avail.reduce((s, c) => s + c.weight, 0);
  const value = w ? Math.round(avail.reduce((s, c) => s + c.value * c.weight, 0) / w * 100) : null;
  return { value, level: value == null ? 'calm' : value < 30 ? 'calm' : value < 70 ? 'active' : 'converge', components: comps, coverage: `${avail.length}/${comps.length}` };
}

// The v1 War Room can only ever say "do nothing": confluence and fundamentals are not connected.
// It still explains why, using real market facts where they exist.
export function evaluateWarRoom({ market, daily, modules, fundamentals = null, direction = 'LONG' }) {
  const reasons = [];
  if (!market || market.status === 'OFFLINE') reasons.push({ k: 'offline', t: 'Source de prix hors ligne : données insuffisantes.' });
  if (!modules.fundamentals) reasons.push({ k: 'fund', t: 'Fondamentaux pas encore branchés : aucun biais fiable.' });
  else if (!fundamentals || fundamentals.bias === 'INSUFFICIENT') reasons.push({ k: 'fund', t: `Fondamentaux insuffisants (${fundamentals?.coverage ?? 0} facteurs) : aucun biais fiable.` });
  else if (fundamentals.bias === 'NEUTRAL') reasons.push({ k: 'fund', t: `Fondamentaux neutres (${fundamentals.total > 0 ? '+' : ''}${fundamentals.total}) : pas de thèse claire.` });
  else if ((fundamentals.bias === 'BEARISH') === (direction === 'LONG')) reasons.push({ k: 'fund', t: `Fondamentaux contraires à un ${direction === 'LONG' ? 'achat' : 'short'} (${fundamentals.total > 0 ? '+' : ''}${fundamentals.total}).` });
  if (!modules.confluence) reasons.push({ k: 'conf', t: 'Moteur de confluence pas encore branché : aucun setup évaluable.' });
  const price = market?.quote?.price;
  if (daily && price != null) {
    const rp = rangePosition(daily, price, 20);
    if (rp && rp.pos > 0.35 && rp.pos < 0.65) reasons.push({ k: 'mid', t: `Prix au milieu du range 20 jours (${Math.round(rp.pos * 100)} %).` });
    const vr = volatilityRatio(daily);
    if (vr != null && vr > 2) reasons.push({ k: 'vol', t: `Volatilité excessive : ATR à ${vr.toFixed(1)}× sa moyenne.` });
  }
  return {
    status: 'NO_SETUP',
    doNothing: true,
    reasons,
    next: [
      ...(fundamentals && fundamentals.bias !== 'INSUFFICIENT' ? [] : ['Compléter les fondamentaux (au moins 3 facteurs) pour obtenir un biais.']),
      'Brancher la détection ICT et le score de confluence (phases 5 à 7).',
    ],
  };
}

// "What changed since your last visit": compares a stored snapshot with the current one.
export function whatChanged(prev, cur) {
  if (!prev || !cur) return [];
  const rows = [];
  if (prev.price != null && cur.price != null && prev.price !== cur.price) {
    const pct = (cur.price / prev.price - 1) * 100;
    rows.push({ k: 'price', t: 'Prix', s: `${fmt(prev.price)} → ${fmt(cur.price)}`, v: pct, kind: 'pct' });
  }
  if (prev.atr != null && cur.atr != null && Math.abs(cur.atr / prev.atr - 1) > 0.05) {
    rows.push({ k: 'vol', t: 'Volatilité (ATR 14 j)', s: `${fmt(prev.atr)} → ${fmt(cur.atr)}`, v: (cur.atr / prev.atr - 1) * 100, kind: 'pct' });
  }
  if (prev.pnl != null && cur.pnl != null && Math.abs(cur.pnl - prev.pnl) >= 0.5) {
    rows.push({ k: 'pnl', t: 'P&L de la position', s: `${eur(prev.pnl)} → ${eur(cur.pnl)}`, v: cur.pnl - prev.pnl, kind: 'eur' });
  }
  const ST = { NO_SETUP: 'Aucun setup', WATCHING: 'Sous surveillance', DEVELOPING: 'Setup en formation', HIGH: 'Haute confluence', INVALIDATED: 'Thèse invalidée' };
  const RANK = { INVALIDATED: -1, NO_SETUP: 0, WATCHING: 1, DEVELOPING: 2, HIGH: 3 };
  if (prev.status && cur.status && prev.status !== cur.status) {
    rows.push({ k: 'status', t: 'Statut War Room', s: `${ST[prev.status] || prev.status} → ${ST[cur.status] || cur.status}`, v: (RANK[cur.status] ?? 0) - (RANK[prev.status] ?? 0), kind: 'dir' });
  }
  if (prev.score != null && cur.score != null && prev.score !== cur.score) {
    rows.push({ k: 'conf', t: 'Confluence', s: `${prev.score} → ${cur.score} sur 15`, v: cur.score - prev.score, kind: 'pts' });
  }
  if (prev.fund != null && cur.fund != null && prev.fund !== cur.fund) {
    rows.push({ k: 'fund', t: 'Score fondamental', s: `${prev.fund > 0 ? '+' : ''}${prev.fund} → ${cur.fund > 0 ? '+' : ''}${cur.fund}${prev.fundBias !== cur.fundBias ? ` (${cur.fundBias})` : ''}`, v: cur.fund - prev.fund, kind: 'pts' });
  }
  if (prev.sourceStatus && cur.sourceStatus && prev.sourceStatus !== cur.sourceStatus) {
    rows.push({ k: 'src', t: 'Source de prix', s: `${prev.sourceStatus} → ${cur.sourceStatus}`, v: null, kind: 'text' });
  }
  return rows;
}

const fmt = x => Math.round(x).toLocaleString('en-US');
const eur = x => (x < 0 ? '−€' : '€') + Math.abs(x).toFixed(2);
