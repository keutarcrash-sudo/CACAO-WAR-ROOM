import { describe, it, expect } from 'vitest';
import { averagePrice, computePosition, checkEntry, DEFAULT_PLAN, turboValue, knockedOut, underlyingForTurboPrice } from '../lib/engines/trade.js';

const product = { kind: 'cfd', priceCurrency: 'GBP', pointValue: 1, direction: 'LONG' };
const e1 = { n: 1, price: 4152, qty: 0.04, capitalEur: 30 };
const e2 = { n: 2, price: 4101, qty: 0.066, capitalEur: 50 };

describe('averagePrice', () => {
  it('weights by quantity, not by capital', () => {
    expect(averagePrice([e1, e2])).toBeCloseTo((4152 * 0.04 + 4101 * 0.066) / 0.106, 6);
  });
  it('is null without entries', () => expect(averagePrice([])).toBeNull());
});

describe('computePosition', () => {
  const base = { entries: [e1, e2], product, stop: 3940, price: 4231, eurPerUnit: 1.17, targets: [4500] };
  it('computes P&L, exposure and risk in EUR', () => {
    const p = computePosition(base);
    const avg = (4152 * 0.04 + 4101 * 0.066) / 0.106;
    expect(p.capital).toBe(80);
    expect(p.remaining).toBe(70);
    expect(p.pnl).toBeCloseTo((4231 - avg) * 0.106 * 1.17, 6);
    expect(p.lossAtStop).toBeCloseTo((avg - 3940) * 0.106 * 1.17, 6);
    expect(p.exposure).toBeCloseTo(4231 * 0.106 * 1.17, 6);
    expect(p.rMultiple).toBeCloseTo(p.pnl / p.lossAtStop, 9);
    expect(p.targets[0].rr).toBeGreaterThan(1);
    expect(p.status).toBe('ENTRY 2');
    expect(p.flags).toEqual({ technical: 'VALID', risk: 'OK', stopDefined: true });
  });
  it('subtracts fees', () => {
    const p = computePosition({ ...base, entries: [{ ...e1, feesEur: 2 }] });
    expect(p.pnl).toBeCloseTo((4231 - 4152) * 0.04 * 1.17 - 2, 6);
    expect(p.lossAtStop).toBeCloseTo((4152 - 3940) * 0.04 * 1.17 + 2, 6);
  });
  it('flags technical invalidation below the stop', () => {
    const p = computePosition({ ...base, price: 3900 });
    expect(p.flags.technical).toBe('INVALIDATED');
    expect(p.status).toBe('THESIS INVALIDATED');
  });
  it('reaches the risk limit', () => {
    const p = computePosition({ ...base, stop: 3000, entries: [{ n: 1, price: 4200, qty: 0.5, capitalEur: 30 }], price: 4100 });
    expect(p.pnl).toBeLessThanOrEqual(-50);
    expect(p.flags.risk).toBe('RISK LIMIT REACHED');
    expect(p.status).toBe('LOSS');
  });
  it('handles shorts', () => {
    const p = computePosition({ ...base, product: { ...product, direction: 'SHORT' }, entries: [e1], stop: 4300, price: 4100 });
    expect(p.pnl).toBeCloseTo(52 * 0.04 * 1.17, 6);
  });
  it('returns null money values when the FX rate is unknown', () => {
    const p = computePosition({ ...base, eurPerUnit: null });
    expect(p.pnl).toBeNull();
    expect(p.avg).not.toBeNull();
  });
  it('is NO POSITION without entries', () => {
    expect(computePosition({ entries: [] }).status).toBe('NO POSITION');
  });
});

describe('checkEntry', () => {
  const ctx = { entries: [e1], plan: DEFAULT_PLAN, product, stop: 3940, eurPerUnit: 1.17 };
  it('requires a stop', () => {
    expect(checkEntry({ ...ctx, stop: null }, e2).errors.join()).toMatch(/invalidation/);
  });
  it('rejects an entry that pushes loss at stop over the max', () => {
    const r = checkEntry(ctx, { price: 4100, qty: 1, capitalEur: 50 });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/Perte au stop/);
  });
  it('warns that a lower price is not a reason to add', () => {
    const r = checkEntry(ctx, e2);
    expect(r.ok).toBe(true);
    expect(r.notes.join()).toMatch(/baisse/);
  });
  it('refuses a fourth entry and budget overflow', () => {
    const r = checkEntry({ ...ctx, entries: [e1, e2, { n: 3, price: 4000, qty: 0.01, capitalEur: 70 }] }, { price: 4000, qty: 0.01, capitalEur: 10 });
    expect(r.errors.length).toBeGreaterThanOrEqual(2);
  });
});

import { maxQuantity } from '../lib/engines/trade.js';
describe('position sizing', () => {
  it('fits the remaining loss budget at the stop', () => {
    const r = maxQuantity({ entries: [], product, plan: DEFAULT_PLAN, stop: 5111, eurPerUnit: 0.85 }, 5662);
    expect(r.qty).toBeCloseTo(50 / (551 * 0.85), 6);
    const withE1 = maxQuantity({ entries: [{ price: 5662, qty: 0.05, capitalEur: 30 }], product, plan: DEFAULT_PLAN, stop: 5111, eurPerUnit: 0.85 }, 5662);
    expect(withE1.room).toBeCloseTo(50 - 551 * 0.05 * 0.85, 6);
    expect(maxQuantity({ product, plan: DEFAULT_PLAN, stop: 5700, eurPerUnit: 0.85 }, 5662)).toBeNull();
    expect(maxQuantity({ product, plan: DEFAULT_PLAN, stop: null, eurPerUnit: 0.85 }, 5662)).toBeNull();
  });
});

describe('turbo', () => {
  const product = { kind: 'turbo', direction: 'LONG', strike: 4490, barrier: 4490, parity: 100, pointValue: 0.01, priceCurrency: 'USD' };
  const eurPerUnit = 1 / 1.14;
  it('values a Call turbo from the underlying and knows its barrier', () => {
    expect(turboValue(product, 5630)).toBeCloseTo(11.4);
    expect(turboValue(product, 4400)).toBe(0);
    expect(knockedOut(product, 4490)).toBe(true);
    expect(underlyingForTurboPrice(product, 10, eurPerUnit)).toBeCloseTo(4490 + 1140);
  });
  it('never loses more than what was paid, and is worth nothing past the barrier', () => {
    const entries = [{ price: 5630, qty: 3, capitalEur: 30, feesEur: 0 }];
    const p = computePosition({ entries, product, stop: 5100, price: 5300, eurPerUnit });
    expect(p.pnl).toBeCloseTo(-330 * 3 * 0.01 / 1.14);
    expect(p.lossAtStop).toBeCloseTo(530 * 3 * 0.01 / 1.14);
    const ko = computePosition({ entries, product, stop: 5100, price: 4400, eurPerUnit });
    expect(ko.knockedOut).toBe(true);
    expect(ko.pnl).toBe(-30);
  });
  it('warns when the stop sits beyond the barrier', () => {
    const c = checkEntry({ product, stop: 4300, eurPerUnit }, { price: 5630, qty: 3, capitalEur: 30 });
    expect(c.warnings.join(' ')).toMatch(/barrière/);
  });
});
