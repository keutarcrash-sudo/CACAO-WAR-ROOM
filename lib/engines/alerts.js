// Turns facts into events for the Market Story and, later, Telegram.
// Pure functions: they only describe events; the caller stores them (idempotent via fingerprint).
import { atr, previousLevels } from './technical.js';
import { computePosition, isTurbo } from './trade.js';

export const levelOf = importance => (importance >= 70 ? 'CRITICAL' : importance >= 40 ? 'IMPORTANT' : 'INFORMATION');

const ev = (category, importance, title, message, fingerprint, data) => ({ category, importance, level: levelOf(importance), title, message, fingerprint, data });
const day = ms => new Date(ms).toISOString().slice(0, 10);
const r0 = x => Math.round(x).toLocaleString('en-US');

export function sourceEvents({ source, prevStatus, status, at = Date.now(), error }) {
  if (!prevStatus || prevStatus === status) return [];
  if (status === 'OFFLINE') return [ev('SYSTEM', 50, 'Source de prix hors ligne', `${source} ne répond plus${error ? ` (${error})` : ''}. Les dernières données restent affichées.`, `src:${source}:off:${new Date(at).toISOString().slice(0, 13)}`)];
  return [ev('SYSTEM', 20, 'Source de prix rétablie', `${source} répond de nouveau.`, `src:${source}:on:${new Date(at).toISOString().slice(0, 13)}`)];
}

// Facts derived from the daily candles and the latest quote.
export function marketEvents({ daily, quote, instrument = 'NY_COCOA' }) {
  if (!daily?.length || quote?.price == null || !quote.dataTime) return [];
  const out = [];
  const a = atr(daily);
  const d = day(quote.dataTime);
  if (a && quote.change != null) {
    const n = Math.abs(quote.change) / a;
    const bucket = Math.floor(n);
    if (bucket >= 1) {
      const up = quote.change > 0;
      out.push(ev('MARKET', bucket >= 2 ? 75 : 45, `Mouvement de ${n.toFixed(1)} ATR`, `Prix ${up ? 'en hausse' : 'en baisse'} de ${Math.abs(quote.changePct).toFixed(2)} % sur la séance (${r0(quote.price)}).`, `move:${instrument}:${d}:${up ? 'up' : 'down'}:${bucket}`, { atrMultiple: n }));
    }
  }
  const lv = previousLevels(daily);
  if (lv) {
    if (quote.price > lv.PDH) out.push(ev('LIQUIDITY', 30, 'Plus haut de la veille dépassé', `Buy-side de la veille (${r0(lv.PDH)}) pris.`, `pdh:${instrument}:${d}`, { level: lv.PDH }));
    if (quote.price < lv.PDL) out.push(ev('LIQUIDITY', 30, 'Plus bas de la veille enfoncé', `Sell-side de la veille (${r0(lv.PDL)}) pris.`, `pdl:${instrument}:${d}`, { level: lv.PDL }));
    if (lv.PWH != null && quote.price > lv.PWH) out.push(ev('LIQUIDITY', 40, 'Plus haut de la semaine passée dépassé', `Niveau ${r0(lv.PWH)} pris.`, `pwh:${instrument}:${r0(lv.PWH)}`, { level: lv.PWH }));
    if (lv.PWL != null && quote.price < lv.PWL) out.push(ev('LIQUIDITY', 40, 'Plus bas de la semaine passée enfoncé', `Niveau ${r0(lv.PWL)} pris.`, `pwl:${instrument}:${r0(lv.PWL)}`, { level: lv.PWL }));
  }
  return out;
}

// A contract roll was neutralised in the data: say so, and warn when a position is open
// (the broker adjusts or rolls positions its own way; entries and stop were set on the old contract).
export function rollEvents({ rolls, hasPosition = false, now = Date.now(), instrument = 'NY_COCOA' }) {
  const r = rolls?.at(-1);
  if (!r || now - r.t * 1000 > 4 * 86400e3) return [];
  const gap = `${r.gap > 0 ? '+' : '−'}${r0(Math.abs(r.gap))} $`;
  return [ev('MARKET', hasPosition ? 65 : 35, 'Changement d’échéance du contrat',
    `Le contrat continu est passé à l’échéance suivante le ${day(r.t * 1000)} (écart ${gap}). Ce saut n’est pas un mouvement de marché : l’historique a été ajusté et aucune alerte de mouvement n’en découle.`
    + (hasPosition ? ' Vérifie chez ton courtier comment ta position a été reportée : tes entrées et ton stop dans l’app sont sur l’ancien contrat.' : ''),
    `roll:${instrument}:${day(r.t * 1000)}`, { gap: r.gap })];
}

// Risk facts about the open position at the current price.
export function positionEvents({ trade, price, eurPerUnit, daily, at = Date.now() }) {
  if (!trade?.entries?.length || trade.closed || price == null) return [];
  const p = computePosition({ ...trade, price, eurPerUnit });
  const out = [];
  const id = trade.id;
  const dir = trade.product.direction === 'SHORT' ? -1 : 1;
  if (isTurbo(trade.product)) {
    const b = trade.product.barrier ?? trade.product.strike;
    const a = daily?.length ? atr(daily) : null;
    if (p.knockedOut) out.push(ev('RISK', 95, 'Turbo désactivé', `Le prix (${r0(price)}) a touché la barrière du turbo (${r0(b)}). Le turbo ne vaut plus rien et ne reviendra pas, même si le cacao remonte.`, `ko:${id}:${b}`));
    else if (a && Math.abs(price - b) < a) out.push(ev('RISK', 80, 'Barrière du turbo proche', `Moins d’1 ATR (${r0(a)} $) entre le prix (${r0(price)}) et la barrière (${r0(b)}). Si elle est touchée, le turbo est désactivé définitivement.`, `nearko:${id}:${b}:${day(at)}`));
  }
  // plan B: a planned level reached means a limit order has probably been filled at the broker
  const ladder = trade.plan?.ladder;
  if (ladder?.levels?.length) {
    for (const l of ladder.levels.filter(x => x.n > trade.entries.length)) {
      if ((price - l.level) * dir <= 0) {
        const held = trade.entries.reduce((s, e) => s + e.qty, 0) + ladder.levels.filter(x => x.n > trade.entries.length && x.n <= l.n).reduce((s, x) => s + x.qty, 0);
        out.push(ev('TRADE', 72, `E${l.n} atteinte (${r0(l.level)})`, `Ton ordre limite E${l.n} a normalement été exécuté. Vérifie dans BoursoBank, enregistre l’entrée dans l’app, et passe ton ordre stop à ${held} ${isTurbo(trade.product) ? 'turbos' : 'unités'} au total (même stop, ${r0(ladder.stop)} $).`, `ladder:${id}:E${l.n}`));
      }
    }
  }
  const goal = trade.plan?.targetGain;
  if (goal && p.pnl != null && p.pnl >= goal) out.push(ev('TRADE', 70, `Objectif de gain atteint (+${goal} €)`, `P&L ${p.pnl.toFixed(2)} € au prix ${r0(price)}. Ton plan dit de vendre : vends la position dans BoursoBank.`, `goal:${id}:${goal}`));
  if (p.flags.technical === 'INVALIDATED') {
    out.push(ev('RISK', 90, 'Invalidation atteinte', `Le prix (${r0(price)}) a franchi ton stop à ${r0(trade.stop)}. La thèse technique est invalidée.`, `stop:${id}:${trade.stop}`));
  } else if (trade.stop != null && daily?.length) {
    const a = atr(daily);
    if (a && (price - trade.stop) * dir < 0.5 * a) out.push(ev('RISK', 60, 'Stop proche', `Moins de 0,5 ATR entre le prix (${r0(price)}) et ton stop (${r0(trade.stop)}).`, `nearstop:${id}:${trade.stop}:${day(at)}`));
  }
  if (p.flags.risk === 'RISK LIMIT REACHED') out.push(ev('RISK', 92, 'Perte maximale atteinte', `La perte latente atteint ${Math.abs(p.pnl).toFixed(2)} €, au-delà des ${trade.plan.maxLoss} € prévus.`, `risklimit:${id}`));
  for (const t of trade.targets || []) {
    if ((price - t) * dir >= 0) out.push(ev('TRADE', 65, 'Objectif atteint', `Le prix a atteint ton objectif ${r0(t)}.`, `tp:${id}:${t}`));
  }
  return out;
}

// Events generated by the user's own actions in the Trade manager.
export function tradeActionEvent(action, { trade, entry, stop, prevStop, errors }) {
  const id = trade.id;
  switch (action) {
    case 'addEntry':
      return entry.offRules
        ? ev('TRADE', 55, `Entrée ${entry.n} hors règles`, errors.join(' '), `entry:${id}:${entry.id}`)
        : ev('TRADE', 35, `Entrée ${entry.n} enregistrée`, `${entry.qty} u. à ${r0(entry.price)} · €${entry.capitalEur}.`, `entry:${id}:${entry.id}`);
    case 'stop': {
      const dir = trade.product.direction === 'SHORT' ? -1 : 1;
      const widened = prevStop != null && stop != null && (stop - prevStop) * dir < 0 && trade.entries.length > 0;
      return widened
        ? ev('RISK', 60, 'Stop éloigné', `Stop déplacé de ${r0(prevStop)} à ${r0(stop)} sur une position ouverte : le risque augmente.`, `stopmove:${id}:${prevStop}:${stop}`)
        : ev('TRADE', 25, stop == null ? 'Stop retiré' : 'Stop défini', stop == null ? 'Aucune invalidation active.' : `Invalidation à ${r0(stop)}.`, `stopmove:${id}:${prevStop}:${stop}`);
    }
    case 'close':
      return ev('TRADE', 40, 'Position clôturée', null, `close:${id}`);
    default:
      return null;
  }
}
