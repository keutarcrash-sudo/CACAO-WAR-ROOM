import { describe, it, expect } from 'vitest';
import { reinforcement } from '../lib/engines/reinforce.js';

const turbo = { kind: 'turbo', direction: 'LONG', strike: 4490, barrier: 4635, parity: 100, pointValue: 0.01, priceCurrency: 'USD' };
const plan = { plannedCapital: 150, maxLoss: 50, split: [30, 50, 70] };
const eurPerUnit = 1 / 1.14;
const entryAt = Date.parse('2026-10-01T12:00:00Z');
const base = { product: turbo, plan, stop: 5100, targets: [], closed: false, entries: [{ n: 1, price: 5600, qty: 3, capitalEur: 30, feesEur: 0, date: '2026-10-01', createdAt: entryAt }] };
const bos = { tf: '4H', type: 'BOS', dir: 'BULLISH', level: 5750, t: (entryAt + 86400e3) / 1000 };

describe('reinforcement signal', () => {
  it('never fires on a drop in price', () => {
    const r = reinforcement({ trade: base, price: 5450, eurPerUnit, atr: 300, structure: [bos], setupStatus: 'HIGH' });
    expect(r.ok).toBe(false);
    expect(r.checks.find(c => c.k === 'gain').ok).toBe(false);
  });
  it('needs a new confirmation after the last entry', () => {
    const old = { ...bos, t: (entryAt - 86400e3) / 1000 };
    const r = reinforcement({ trade: base, price: 5800, eurPerUnit, atr: 300, structure: [old], setupStatus: 'WATCHING' });
    expect(r.checks.find(c => c.k === 'confirm').ok).toBe(false);
    expect(r.ok).toBe(false);
  });
  it('fires with gain, confirmation and a size within the maximum loss, raising the stop if needed', () => {
    const r = reinforcement({ trade: base, price: 5800, eurPerUnit, atr: 300, structure: [bos], setupStatus: 'WATCHING' });
    expect(r.ok).toBe(true);
    expect(r.n).toBe(2);
    expect(r.qty).toBe(Math.floor(50 / ((5800 - 4490) / 100 / 1.14)));
    expect(r.lossAfter).toBeLessThanOrEqual(50.01);
    if (r.stopNeeded != null) expect(r.stopNeeded).toBeGreaterThan(5100);
  });
  it('does nothing without a position, or once the three entries are used', () => {
    expect(reinforcement({ trade: { ...base, entries: [] }, price: 5800, eurPerUnit, atr: 300 })).toBeNull();
    const three = { ...base, entries: [1, 2, 3].map(n => ({ ...base.entries[0], n })) };
    expect(reinforcement({ trade: three, price: 5800, eurPerUnit, atr: 300 })).toBeNull();
  });
});
