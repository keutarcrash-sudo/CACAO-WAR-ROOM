// Plan B, "accumulate in a zone": everything is decided before the first entry.
//   - one stop, under the whole zone (the structural invalidation), never moved;
//   - three limit orders: E1 at the signal price, E3 just above the stop, E2 halfway;
//   - sizes from the plan's amounts (30 / 50 / 70 €), scaled down if needed so that the worst case
//     (all three filled, then the stop) stays within the maximum loss;
//   - a gain target in euros, turned into a price for the position actually held.
// Not a martingale: nothing is added outside this plan, and the worst case is known in advance.
import { isTurbo, turboValue } from './trade.js';

const E3_ABOVE_STOP = 0.4; // ATR between the last entry and the stop
const MIN_ZONE = 0.3;      // ATR: narrower than this, one entry is enough

// value in € of one unit at a given underlying level (turbo: its price; CFD: not a price, null)
const unitEur = (product, level, eurPerUnit) => (isTurbo(product) ? turboValue(product, level) * eurPerUnit : null);
// € lost per unit between an entry level and the stop
const lossPerUnit = (product, entry, stop, eurPerUnit) => {
  const dir = product.direction === 'SHORT' ? -1 : 1;
  return Math.max(0, (entry - stop) * dir) * (product.pointValue || 1) * eurPerUnit;
};

export function planLadder({ product, plan, price, stop, atr, eurPerUnit }) {
  if (price == null || stop == null || !atr || !eurPerUnit) return null;
  const dir = product.direction === 'SHORT' ? -1 : 1;
  if ((price - stop) * dir <= 0) return null;
  const e3 = stop + dir * E3_ABOVE_STOP * atr;
  const zone = (price - e3) * dir;
  const levels = zone >= MIN_ZONE * atr ? [price, price - dir * zone / 2, e3] : [price];
  const amounts = plan.split.slice(0, levels.length);
  let rows = levels.map((level, i) => {
    const u = unitEur(product, level, eurPerUnit);
    const qty = u ? Math.floor(amounts[i] / u) : null;
    return { n: i + 1, level: Math.round(level), unitEur: u, qty, amount: amounts[i] };
  });
  // CFD: no price per unit, size each entry for an equal share of the maximum loss
  if (!isTurbo(product)) rows = rows.map(r => ({ ...r, qty: Math.floor((plan.maxLoss / rows.length) / lossPerUnit(product, r.level, stop, eurPerUnit) * 1000) / 1000 }));
  const worst = rs => rs.reduce((s, r) => s + (r.qty || 0) * lossPerUnit(product, r.level, stop, eurPerUnit), 0);
  let scaled = false;
  const w = worst(rows);
  if (w > plan.maxLoss) {
    const k = plan.maxLoss / w;
    rows = rows.map(r => ({ ...r, qty: isTurbo(product) ? Math.floor(r.qty * k) : Math.floor(r.qty * k * 1000) / 1000 }));
    scaled = true;
  }
  rows = rows.map(r => ({ ...r, cost: r.unitEur != null && r.qty != null ? r.qty * r.unitEur : null, lossAtStop: (r.qty || 0) * lossPerUnit(product, r.level, stop, eurPerUnit) }));
  return {
    stop: Math.round(stop), stopUnitEur: unitEur(product, stop, eurPerUnit),
    levels: rows, worstLoss: worst(rows), scaled,
    single: levels.length === 1,
  };
}

// Underlying level at which the position held makes `gainEur` (after fees).
export function targetForGain({ entries, product, gainEur, eurPerUnit }) {
  const qty = entries.reduce((s, e) => s + e.qty, 0);
  if (!qty || !eurPerUnit || !gainEur) return null;
  const avg = entries.reduce((s, e) => s + e.price * e.qty, 0) / qty;
  const fees = entries.reduce((s, e) => s + (e.feesEur || 0), 0);
  const dir = product.direction === 'SHORT' ? -1 : 1;
  return avg + dir * (gainEur + fees) / (qty * (product.pointValue || 1) * eurPerUnit);
}
