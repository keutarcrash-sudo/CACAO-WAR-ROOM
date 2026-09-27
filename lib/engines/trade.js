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

export const DEFAULT_PLAN = { plannedCapital: 150, maxLoss: 50, split: [30, 50, 70] };
export const DEFAULT_PRODUCT = { kind: 'cfd', priceCurrency: 'USD', pointValue: 1, direction: 'LONG' };

const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);

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
  const pnl = move != null ? minus(eur(move), fees) : null;
  const lossAtStop = stop != null ? minus(eur((avg - stop) * dir), -fees) : null; // positive = money lost if stop hit
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
    price, pnl, exposure, lossAtStop, targets: t,
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
  const avg = averagePrice(entries);
  if (avg != null && (cand.price - avg) * dir < 0) notes.push('Le prix est plus bas que ta moyenne. Une baisse n’est jamais une raison suffisante de renforcer : quelles confirmations as-tu ?');
  return { n, errors, warnings, notes, ok: !errors.length };
}
