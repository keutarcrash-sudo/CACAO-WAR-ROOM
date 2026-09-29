import { describe, it, expect } from 'vitest';
import { planLadder, targetForGain } from '../lib/engines/ladder.js';
import { positionEvents } from '../lib/engines/alerts.js';

const turbo = { kind: 'turbo', direction: 'LONG', strike: 4490, barrier: 4635, parity: 100, pointValue: 0.01, priceCurrency: 'USD' };
const plan = { plannedCapital: 150, maxLoss: 50, split: [30, 50, 70], targetGain: 15 };
const eurPerUnit = 1 / 1.14;

describe('plan B ladder', () => {
  it('spreads three entries between the signal price and just above the stop', () => {
    const l = planLadder({ product: turbo, plan, price: 5700, stop: 5400, atr: 300, eurPerUnit });
    expect(l.levels.map(x => x.level)).toEqual([5700, 5610, 5520]);
    expect(l.levels[0].qty).toBe(Math.floor(30 / ((5700 - 4490) / 100 / 1.14)));
    expect(l.worstLoss).toBeLessThanOrEqual(50);
    expect(l.stop).toBe(5400);
  });
  it('shrinks the sizes when the worst case would exceed the maximum loss', () => {
    const l = planLadder({ product: turbo, plan: { ...plan, maxLoss: 10 }, price: 5700, stop: 5100, atr: 300, eurPerUnit });
    expect(l.scaled).toBe(true);
    expect(l.worstLoss).toBeLessThanOrEqual(10);
  });
  it('keeps one entry when the stop is too close for a zone', () => {
    const l = planLadder({ product: turbo, plan, price: 5700, stop: 5600, atr: 300, eurPerUnit });
    expect(l.single).toBe(true);
    expect(l.levels).toHaveLength(1);
  });
  it('turns the gain target into a price for the position held', () => {
    const t = targetForGain({ entries: [{ price: 5700, qty: 3, feesEur: 0 }], product: turbo, gainEur: 15, eurPerUnit });
    expect(t).toBeCloseTo(5700 + 15 * 1.14 / (3 * 0.01));
  });
  it('warns when a planned level is reached, and when the gain target is', () => {
    const trade = { id: 1, product: turbo, plan: { ...plan, ladder: { stop: 5400, levels: [{ n: 1, level: 5700, qty: 3 }, { n: 2, level: 5610, qty: 5 }, { n: 3, level: 5520, qty: 7 }] } }, stop: 5400, targets: [], entries: [{ n: 1, price: 5700, qty: 3, capitalEur: 30, feesEur: 0 }] };
    const ev = positionEvents({ trade, price: 5600, eurPerUnit, daily: null });
    expect(ev.map(e => e.fingerprint)).toContain('ladder:1:E2');
    expect(ev.find(e => e.fingerprint === 'ladder:1:E2').message).toMatch(/8 turbos/);
    const win = positionEvents({ trade: { ...trade, entries: [{ ...trade.entries[0], qty: 30, capitalEur: 300 }] }, price: 5700 + 20 * 1.14 / 0.3, eurPerUnit, daily: null });
    expect(win.map(e => e.title).join()).toMatch(/Objectif de gain/);
  });
});

import { cocoaMarketOpen } from '../lib/engines/hours.js';
describe('cocoa market hours', () => {
  it('is open 4:45–13:30 New York time on weekdays only', () => {
    expect(cocoaMarketOpen(new Date('2026-09-29T01:50:00Z'))).toBe(false); // 03:50 Paris
    expect(cocoaMarketOpen(new Date('2026-09-29T09:10:00Z'))).toBe(true);  // 11:10 Paris
    expect(cocoaMarketOpen(new Date('2026-09-29T17:40:00Z'))).toBe(false); // 19:40 Paris
    expect(cocoaMarketOpen(new Date('2026-10-03T12:00:00Z'))).toBe(false); // Saturday
  });
});

import { addPriceAlert, reachedAlerts } from '../lib/engines/pricealerts.js';
describe('price alerts', () => {
  it('waits for a fall when set below the price, for a rise when set above', () => {
    let l = addPriceAlert([], { level: 4600, price: 5600, note: 'premier retest' });
    l = addPriceAlert(l, { level: 6200, price: 5600 });
    expect(l.map(a => a.side)).toEqual(['below', 'above']);
    expect(reachedAlerts(l, { price: 5000 })).toEqual([]);
    expect(reachedAlerts(l, { price: 4590 }).map(a => a.level)).toEqual([4600]);
    expect(reachedAlerts(l, { price: 6210 }).map(a => a.level)).toEqual([6200]);
  });
  it('counts a spike of the day only for an alert older than that day', () => {
    const old = [{ id: 1, level: 4600, side: 'below', createdAt: 1000, triggeredAt: null }];
    expect(reachedAlerts(old, { price: 4700, low: 4550, dayStart: 5000 })).toHaveLength(1);
    const recent = [{ ...old[0], createdAt: 9000 }];
    expect(reachedAlerts(recent, { price: 4700, low: 4550, dayStart: 5000 })).toHaveLength(0);
    expect(reachedAlerts([{ ...old[0], triggeredAt: 1 }], { price: 4000 })).toHaveLength(0);
  });
});
