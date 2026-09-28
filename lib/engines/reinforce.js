// "Renfort possible": when the next planned entry (E2, E3) is allowed. Never on a drop in price.
// All conditions must hold:
//   1. an open position with an entry left;
//   2. price at least 0.5 ATR beyond the average entry, in the trade's favour;
//   3. a new confirmation since the last entry: a break of structure in the trade's direction
//      (D1 / 4H / 1H), or the setup back at high confluence;
//   4. a size exists that keeps the total loss at the stop within the plan's maximum,
//      if needed with the stop raised, but never closer than 0.5 ATR to the price.
import { computePosition, isTurbo, turboValue } from './trade.js';

export const MIN_GAIN_ATR = 0.5;
export const MIN_STOP_ATR = 0.5;

export function reinforcement({ trade, price, eurPerUnit, atr, structure = [], setupStatus = null }) {
  const n = trade.entries.length + 1;
  if (trade.closed || !trade.entries.length || n > 3) return null;
  const p = trade.product;
  const dir = p.direction === 'SHORT' ? -1 : 1;
  const want = dir > 0 ? 'BULLISH' : 'BEARISH';
  const pos = computePosition({ ...trade, price, eurPerUnit });
  const amount = Math.min(trade.plan.split[n - 1] ?? 0, trade.plan.plannedCapital - pos.capital);
  const checks = [];
  const add = (k, label, ok, detail) => checks.push({ k, label, ok: !!ok, detail });

  // 2. in profit by at least half an ATR
  const gain = price != null && pos.avg != null ? (price - pos.avg) * dir : null;
  add('gain', `Prix au moins ${MIN_GAIN_ATR} ATR au-delà de ta moyenne`, gain != null && atr && gain >= MIN_GAIN_ATR * atr,
    gain == null || !atr ? 'prix ou ATR indisponible' : `${gain >= 0 ? '+' : '−'}${Math.round(Math.abs(gain))} $ (${(gain / atr).toFixed(2)} ATR)`);

  // 3. a new confirmation since the last entry
  const since = Math.max(...trade.entries.map(e => e.createdAt || Date.parse(e.date) || 0));
  const fresh = structure.filter(e => e.dir === want && e.t * 1000 > since).sort((a, b) => b.t - a.t)[0];
  const high = setupStatus === 'HIGH';
  add('confirm', 'Nouvelle confirmation depuis ta dernière entrée', fresh || high,
    fresh ? `${fresh.tf} : ${fresh.type} ${dir > 0 ? 'haussier' : 'baissier'} au-delà de ${Math.round(fresh.level)} $` : high ? 'setup de nouveau en haute confluence' : 'aucune cassure dans ton sens, confluence pas haute');

  // 4. size and risk
  let qty = null, unitEur = null, stopNeeded = null, lossAfter = null, riskOk = false, riskDetail = '';
  if (price == null || eurPerUnit == null) riskDetail = 'prix ou taux de change indisponible';
  else if (trade.stop == null) riskDetail = 'aucun stop défini';
  else if (!(amount > 0)) riskDetail = 'budget épuisé';
  else {
    const pv = p.pointValue || 1;
    if (isTurbo(p)) { unitEur = turboValue(p, price) * eurPerUnit; qty = unitEur > 0 ? Math.floor(amount / unitEur) : 0; }
    else qty = null; // a CFD's size is not set by the amount: the risk decides it below
    const entries = [...trade.entries];
    const lossWith = (q, stop) => computePosition({ ...trade, entries: q ? [...entries, { price, qty: q, capitalEur: q * (unitEur || 0), feesEur: 0 }] : entries, stop, price, eurPerUnit }).lossAtStop;
    if (qty == null) {
      // CFD: the largest size that fits with the current stop
      const perUnit = (price - trade.stop) * dir * pv * eurPerUnit;
      const room = trade.plan.maxLoss - Math.max(0, pos.lossAtStop ?? 0);
      qty = perUnit > 0 && room > 0 ? Math.floor((room / perUnit) * 1000) / 1000 : 0;
    }
    if (!(qty > 0)) riskDetail = isTurbo(p) ? `1 turbo coûte plus que les €${amount} prévus` : 'aucune taille ne tient sous la perte maximale avec ce stop';
    else {
      lossAfter = lossWith(qty, trade.stop);
      if (lossAfter != null && lossAfter <= trade.plan.maxLoss) riskOk = true;
      else {
        // raise the stop until the total loss fits: loss is linear in the stop
        const all = [...entries, { price, qty }];
        const Q = all.reduce((s, e) => s + e.qty, 0);
        const avgAll = all.reduce((s, e) => s + e.price * e.qty, 0) / Q;
        const fees = entries.reduce((s, e) => s + (e.feesEur || 0), 0);
        const s = avgAll - dir * (trade.plan.maxLoss - fees) / (Q * pv * eurPerUnit);
        if (atr && (price - s) * dir >= MIN_STOP_ATR * atr) { stopNeeded = Math.round(s); lossAfter = lossWith(qty, stopNeeded); riskOk = true; }
        else riskDetail = `il faudrait remonter le stop à ${Math.round(s)} $, trop près du prix (moins de ${MIN_STOP_ATR} ATR)`;
      }
      if (riskOk) riskDetail = `perte totale au stop ≈ €${lossAfter.toFixed(0)} sur €${trade.plan.maxLoss}${stopNeeded != null ? `, stop à remonter à ${stopNeeded} $` : ''}`;
    }
  }
  add('risk', `Risque total sous €${trade.plan.maxLoss}`, riskOk, riskDetail);

  const ok = checks.every(c => c.ok);
  return { n, amount, qty, unitEur, stopNeeded, lossAfter, checks, ok };
}
