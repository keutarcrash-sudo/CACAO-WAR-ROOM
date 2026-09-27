// Trade manager actions. Rules are checked on the server, the database is the only source of truth.
import * as repo from '../db/repo.js';
import { checkEntry } from '../engines/trade.js';
import { tradeActionEvent } from '../engines/alerts.js';
import { HttpError } from '../http/respond.js';

const num = (v, name, { min = null, optional = false } = {}) => {
  if (v === null || v === undefined || v === '') {
    if (optional) return null;
    throw new HttpError(400, `${name} manquant`);
  }
  const x = Number(v);
  if (!Number.isFinite(x) || (min != null && x < min)) throw new HttpError(400, `${name} invalide`);
  return x;
};
const oneOf = (v, allowed, name) => {
  if (!allowed.includes(v)) throw new HttpError(400, `${name} invalide`);
  return v;
};

async function alert(sql, action, ctx) {
  const e = tradeActionEvent(action, ctx);
  if (e) await repo.addAlert(sql, { ...e, source: 'Trade Manager' });
}

export async function runAction(sql, body, { eurPerUnitFor }) {
  const trade = await repo.getActiveTrade(sql);
  const a = body.action;

  if (a === 'levels') {
    const stop = num(body.stop, 'Stop', { min: 0, optional: true });
    const targets = (Array.isArray(body.targets) ? body.targets : []).map(t => num(t, 'Objectif', { min: 0, optional: true })).filter(t => t != null).slice(0, 3);
    const patch = { targets };
    if (stop !== trade.stop) {
      patch.stop = stop;
      patch.stopHistory = [...(trade.stopHistory || []), { at: Date.now(), from: trade.stop, to: stop }];
    }
    await repo.updateTrade(sql, trade.id, patch);
    if (stop !== trade.stop) await alert(sql, 'stop', { trade, stop, prevStop: trade.stop });
  } else if (a === 'addEntry') {
    if (trade.closed) throw new HttpError(409, 'Position clôturée : ouvre une nouvelle position.');
    const cand = {
      price: num(body.price, 'Prix', { min: 0 }), qty: num(body.qty, 'Quantité', { min: 0 }),
      capitalEur: num(body.capitalEur, 'Capital', { min: 0, optional: true }) ?? trade.plan.split[trade.entries.length] ?? 0,
      feesEur: num(body.feesEur, 'Frais', { min: 0, optional: true }) ?? 0,
    };
    const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : new Date().toISOString().slice(0, 10);
    const eurPerUnit = await eurPerUnitFor(trade.product.priceCurrency);
    const check = checkEntry({ entries: trade.entries, plan: trade.plan, product: trade.product, stop: trade.stop, eurPerUnit }, cand);
    if (check.n > 3) throw new HttpError(409, 'Les trois entrées sont déjà utilisées.');
    if (!check.ok && !body.override) throw new HttpError(422, check.errors.join(' '), 'RULES');
    const entry = await repo.addEntry(sql, trade.id, { ...cand, n: check.n, date, offRules: !check.ok, ruleErrors: check.errors });
    await alert(sql, 'addEntry', { trade, entry, errors: check.errors });
    if (!check.ok) await repo.addNote(sql, { positionId: trade.id, auto: true, text: `Entrée ${check.n} enregistrée hors règles : ${check.errors.join(' ')}`, snapshot: { price: cand.price } });
  } else if (a === 'deleteEntry') {
    await repo.deleteEntry(sql, trade.id, num(body.id, 'Entrée'));
  } else if (a === 'settings') {
    const p = body.product || {}, plan = body.plan || {};
    const product = {
      kind: oneOf(p.kind ?? trade.product.kind, ['cfd', 'spot'], 'Type'),
      priceCurrency: oneOf(p.priceCurrency ?? trade.product.priceCurrency, ['USD', 'GBP', 'EUR'], 'Devise'),
      pointValue: num(p.pointValue ?? trade.product.pointValue, 'Valeur du point', { min: 0 }),
      direction: oneOf(p.direction ?? trade.product.direction, ['LONG', 'SHORT'], 'Sens'),
    };
    const newPlan = {
      plannedCapital: num(plan.plannedCapital ?? trade.plan.plannedCapital, 'Budget', { min: 0 }),
      maxLoss: num(plan.maxLoss ?? trade.plan.maxLoss, 'Perte maximale', { min: 0 }),
      split: trade.plan.split,
    };
    let priceSource = oneOf(body.priceSource ?? trade.priceSource, ['NY_COCOA', 'manual'], 'Source du prix');
    if (product.priceCurrency !== 'USD') priceSource = 'manual';
    await repo.updateTrade(sql, trade.id, { product, plan: newPlan, priceSource });
  } else if (a === 'manualPrice') {
    const price = num(body.price, 'Prix', { min: 0, optional: true });
    await repo.updateTrade(sql, trade.id, { manualPrice: price == null ? null : { price, at: Date.now() } });
  } else if (a === 'close') {
    if (!trade.entries.length) throw new HttpError(409, 'Aucune entrée à clôturer.');
    await repo.updateTrade(sql, trade.id, { closed: true, closedAt: Date.now(), closePrice: num(body.closePrice, 'Prix de clôture', { min: 0, optional: true }) });
    await alert(sql, 'close', { trade });
  } else if (a === 'newPosition') {
    await repo.newPosition(sql);
  } else {
    throw new HttpError(400, 'Action inconnue');
  }
  return repo.getActiveTrade(sql);
}
