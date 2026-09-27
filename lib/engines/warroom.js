// War Room status, Market Pulse and "do nothing" reasons, computed only from data that exists.
import { atr, volatilityRatio, rangePosition } from './technical.js';

const clamp01 = x => Math.max(0, Math.min(1, x));

// Market Pulse: activity of the system, 0-100. Not a prediction.
// Components whose data is not connected yet are excluded and reported, never guessed.
export function marketPulse({ daily, quote }) {
  const comps = [];
  const ratio = daily ? volatilityRatio(daily) : null;
  comps.push({ key: 'vol', label: 'Volatilité vs moyenne 20 j', weight: 30, value: ratio == null ? null : clamp01((ratio - 0.6) / 1.4), detail: ratio == null ? 'indisponible' : `${ratio.toFixed(2)}× la moyenne` });
  const a = daily ? atr(daily) : null;
  const move = a && quote?.change != null ? Math.abs(quote.change) / a : null;
  comps.push({ key: 'move', label: 'Mouvement du prix (en ATR)', weight: 25, value: move == null ? null : clamp01(move / 1.5), detail: move == null ? 'indisponible' : `${move.toFixed(2)} ATR` });
  comps.push({ key: 'news', label: 'Nouvelles importantes', weight: 20, value: null, detail: 'module news pas encore branché' });
  comps.push({ key: 'conf', label: 'Changement de confluence', weight: 15, value: null, detail: 'moteur de confluence pas encore branché' });
  comps.push({ key: 'fund', label: 'Changement fondamental', weight: 10, value: null, detail: 'fondamentaux pas encore branchés' });
  const avail = comps.filter(c => c.value != null);
  const w = avail.reduce((s, c) => s + c.weight, 0);
  const value = w ? Math.round(avail.reduce((s, c) => s + c.value * c.weight, 0) / w * 100) : null;
  return { value, level: value == null ? 'calm' : value < 30 ? 'calm' : value < 70 ? 'active' : 'converge', components: comps, coverage: `${avail.length}/${comps.length}` };
}

// The v1 War Room can only ever say "do nothing": confluence and fundamentals are not connected.
// It still explains why, using real market facts where they exist.
export function evaluateWarRoom({ market, daily, modules }) {
  const reasons = [];
  if (!market || market.status === 'OFFLINE') reasons.push({ k: 'offline', t: 'Source de prix hors ligne : données insuffisantes.' });
  if (!modules.fundamentals) reasons.push({ k: 'fund', t: 'Fondamentaux pas encore branchés : aucun biais fiable.' });
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
      'Brancher les fondamentaux (météo, ENSO, COT) pour obtenir un biais.',
      'Brancher la détection ICT et le score de confluence.',
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
  if (prev.sourceStatus && cur.sourceStatus && prev.sourceStatus !== cur.sourceStatus) {
    rows.push({ k: 'src', t: 'Source de prix', s: `${prev.sourceStatus} → ${cur.sourceStatus}`, v: null, kind: 'text' });
  }
  return rows;
}

const fmt = x => Math.round(x).toLocaleString('en-US');
const eur = x => (x < 0 ? '−€' : '€') + Math.abs(x).toFixed(2);
