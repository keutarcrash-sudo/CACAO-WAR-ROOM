// Position maths. Pure functions, covered by tests.
//
// Units
//   price       : quote currency of the product (USD, GBP or EUR) per tonne, as displayed by the broker
//   qty         : product units (e.g. tonnes for a cocoa CFD)
//   pointValue  : quote currency earned per 1.0 price move per 1 unit of qty (1 for a CFD quoted per tonne)
//   eurPerUnit  : EUR value of 1 unit of quote currency (from ECB rates); null if unknown
//
// The spec's "Σcapital / Σqty" is only right when capital = price × qty (no leverage).
// For a CFD the capital is a margin, so the average is always the quantity-weighted price.

export const DEFAULT_PLAN = { plannedCapital: 150, maxLoss: 50, split: [30, 50, 70], targetGain: 15 };
export const DEFAULT_PRODUCT = { kind: 'cfd', priceCurrency: 'USD', pointValue: 1, direction: 'LONG' };

const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);

// Turbo (knock-out certificate). Linear in the underlying while the barrier holds:
// value per turbo = (underlying − strike) / parity for a Call, (strike − underlying) / parity for a Put,
// in the underlying's currency. At the barrier it is worth nothing and cannot come back.
// qty = number of turbos; pointValue = 1 / parity.
export const isTurbo = product => product?.kind === 'turbo';
export function turboValue(product, underlying) {
  if (!isTurbo(product) || underlying == null || !product.strike || !product.parity) return null;
  const dir = product.direction === 'SHORT' ? -1 : 1;
  if (knockedOut(product, underlying)) return 0;
  return Math.max(0, ((underlying - product.strike) * dir) / product.parity);
}
export function knockedOut(product, underlying) {
  if (!isTurbo(product) || underlying == null) return false;
  const b = product.barrier ?? product.strike;
  return product.direction === 'SHORT' ? underlying >= b : underlying <= b;
}
// Underlying level matching a turbo price (in EUR): what a limit or stop order on the turbo really aims at.
export function underlyingForTurboPrice(product, turboEur, eurPerUnit) {
  if (!isTurbo(product) || !eurPerUnit) return null;
  const dir = product.direction === 'SHORT' ? -1 : 1;
  return product.strike + (dir * turboEur * product.parity) / eurPerUnit;
}

export function averagePrice(entries) {
  const q = sum(entries, e => e.qty);
  return q > 0 ? sum(entries, e => e.price * e.qty) / q : null;
}

export function computePosition({ entries = [], product = DEFAULT_PRODUCT, plan = DEFAULT_PLAN, stop = null, targets = [], price = null, eurPerUnit = null, closed = false }) {
  const dir = product.direction === 'SHORT' ? -1 : 1;
  const qty = sum(entries, e => e.qty);
  const avg = averagePrice(entries);
  const capital = sum(entries, e => e.capitalEur || 0);
  const fees = sum(entries, e => e.feesEur || 0);
  const pv = product.pointValue || 1;
  // money result, in EUR, of a move of `points` in the trade's favour
  const eur = points => (eurPerUnit == null || !qty ? null : points * qty * pv * eurPerUnit);
  const minus = (a, b) => (a == null ? null : a - b);

  const base = {
    qty, avg, capital, fees,
    remaining: plan.plannedCapital - capital,
    entriesCount: entries.length,
    currencyKnown: eurPerUnit != null,
  };
  if (!entries.length) return { ...base, status: closed ? 'CLOSED' : 'NO POSITION', flags: flagsNone(stop) };

  const move = price != null ? (price - avg) * dir : null;
  let pnl = move != null ? minus(eur(move), fees) : null;
  let lossAtStop = stop != null ? minus(eur((avg - stop) * dir), -fees) : null; // positive = money lost if stop hit
  // a turbo can never lose more than what was paid for it, and is worth nothing past its barrier
  const ko = isTurbo(product) && knockedOut(product, price);
  if (isTurbo(product)) {
    if (ko) pnl = -(capital + fees);
    else if (pnl != null) pnl = Math.max(pnl, -(capital + fees));
    if (lossAtStop != null) lossAtStop = Math.min(lossAtStop, capital + fees);
  }
  const exposure = price != null && eurPerUnit != null ? price * qty * pv * eurPerUnit : null;

  const t = targets.filter(x => x != null && !Number.isNaN(x)).map(tp => {
    const reward = minus(eur((tp - avg) * dir), fees);
    return {
      price: tp,
      rewardEur: reward,
      distPct: price != null ? ((tp - price) / price) * 100 : null,
      rr: reward != null && lossAtStop > 0 ? reward / lossAtStop : null,
    };
  });

  const res = {
    ...base,
    price, pnl, exposure, lossAtStop, targets: t, knockedOut: ko,
    roi: pnl != null && capital > 0 ? (pnl / capital) * 100 : null,
    rMultiple: pnl != null && lossAtStop > 0 ? pnl / lossAtStop : null,
    distToStopPct: price != null && stop != null ? ((price - stop) / price) * 100 * dir : null,
  };
  res.flags = flags(res, { plan, stop, price, dir });
  res.status = status(res, { plan, closed });
  return res;
}

function flagsNone(stop) {
  return { technical: 'VALID', risk: 'OK', stopDefined: stop != null };
}

function flags(p, { plan, stop, price, dir }) {
  const lost = p.pnl != null ? -p.pnl : null;
  let risk = 'OK';
  if (lost != null && lost >= plan.maxLoss) risk = 'RISK LIMIT REACHED';
  else if (lost != null && lost >= plan.maxLoss * 0.6) risk = 'WARNING';
  if (p.lossAtStop != null && p.lossAtStop > plan.maxLoss && risk === 'OK') risk = 'WARNING';

  let technical = 'VALID';
  if (stop != null && price != null) {
    if ((price - stop) * dir <= 0) technical = 'INVALIDATED';
    else if (p.distToStopPct != null && p.distToStopPct < 1) technical = 'WARNING';
  }
  return { technical, risk, stopDefined: stop != null };
}

function status(p, { plan, closed }) {
  if (closed) return 'CLOSED';
  if (p.flags.technical === 'INVALIDATED') return 'THESIS INVALIDATED';
  if (p.flags.risk === 'RISK LIMIT REACHED') return 'LOSS';
  if (p.capital >= plan.plannedCapital) return 'FULL POSITION';
  return `ENTRY ${p.entriesCount}`;
}

// Checks a candidate entry against the rules. Never blocks: the broker is where orders happen.
// errors = a rule is broken; warnings = think twice; notes = reminders.
export function checkEntry({ entries = [], plan = DEFAULT_PLAN, product = DEFAULT_PRODUCT, stop = null, eurPerUnit = null }, cand) {
  const errors = [], warnings = [], notes = [];
  const n = entries.length + 1;
  const dir = product.direction === 'SHORT' ? -1 : 1;
  if (n > 3) errors.push('Les trois entrées sont déjà utilisées.');
  if (stop == null) errors.push('Aucune invalidation définie. Fixe un stop avant d’entrer.');
  if (!(cand.price > 0) || !(cand.qty > 0)) errors.push('Prix et quantité doivent être positifs.');
  const planned = plan.split[n - 1];
  if (planned != null && cand.capitalEur > planned) warnings.push(`Capital supérieur au plan de l’entrée ${n} (€${planned}).`);
  const capital = sum(entries, e => e.capitalEur || 0) + (cand.capitalEur || 0);
  if (capital > plan.plannedCapital) errors.push(`Le capital total (€${capital}) dépasserait le budget de €${plan.plannedCapital}.`);
  if (stop != null && !errors.length) {
    const after = computePosition({ entries: [...entries, { ...cand, n }], product, plan, stop, price: cand.price, eurPerUnit });
    if (after.lossAtStop != null && after.lossAtStop > plan.maxLoss) errors.push(`Perte au stop après cette entrée : €${after.lossAtStop.toFixed(2)}, au-delà du maximum de €${plan.maxLoss}.`);
    if (after.lossAtStop == null) warnings.push('Taux de change indisponible : le risque en euros ne peut pas être vérifié.');
  }
  if (isTurbo(product) && stop != null && knockedOut(product, stop)) warnings.push(`Ton stop (${stop}) est au-delà de la barrière du turbo (${product.barrier ?? product.strike}) : la barrière sera touchée avant, et le turbo ne vaudra plus rien.`);
  if (isTurbo(product) && knockedOut(product, cand.price)) errors.push('Le prix saisi est au-delà de la barrière : ce turbo serait désactivé.');
  const avg = averagePrice(entries);
  // plan B: an entry at a level of the frozen plan was decided before the first entry
  const step = plan.ladder?.levels?.find(l => l.n === n);
  const inPlan = step && Math.abs(cand.price - step.level) <= step.level * 0.01;
  if (plan.ladder && !step) errors.push(`L’entrée ${n} ne fait pas partie du plan figé.`);
  else if (inPlan) notes.push(`Entrée prévue par le plan figé (E${n} à ${Math.round(step.level)} $).`);
  else if (step) warnings.push(`Prix éloigné du niveau prévu par le plan (E${n} à ${Math.round(step.level)} $) : n’ajoute rien hors plan.`);
  else if (avg != null && (cand.price - avg) * dir < 0) notes.push('Le prix est plus bas que ta moyenne. Une baisse n’est jamais une raison suffisante de renforcer : quelles confirmations as-tu ?');
  return { n, errors, warnings, notes, ok: !errors.length };
}

// Largest quantity for a new entry that keeps the loss at the stop within the plan's maximum.
export function maxQuantity({ entries = [], plan = DEFAULT_PLAN, product = DEFAULT_PRODUCT, stop = null, eurPerUnit = null }, price) {
  if (stop == null || eurPerUnit == null || !(price > 0)) return null;
  const dir = product.direction === 'SHORT' ? -1 : 1;
  const perUnit = (price - stop) * dir * (product.pointValue || 1) * eurPerUnit; // € lost per unit if the stop is hit
  if (perUnit <= 0) return null;
  const current = entries.length ? computePosition({ entries, product, plan, stop, price, eurPerUnit }).lossAtStop ?? 0 : 0;
  const room = plan.maxLoss - Math.max(0, current);
  return { qty: room > 0 ? room / perUnit : 0, room, perUnit };
}
