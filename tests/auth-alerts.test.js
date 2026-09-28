import { describe, it, expect, beforeEach } from 'vitest';
import { checkPassword, createToken, verifyToken, readCookie } from '../lib/auth/session.js';
import { marketEvents, positionEvents, sourceEvents, levelOf } from '../lib/engines/alerts.js';

describe('session', () => {
  beforeEach(() => { process.env.APP_PASSWORD = 'cacao'; process.env.SESSION_SECRET = 'x'.repeat(32); });
  it('checks the password', () => {
    expect(checkPassword('cacao')).toBe(true);
    expect(checkPassword('nope')).toBe(false);
    expect(checkPassword(undefined)).toBe(false);
    expect(checkPassword(' cacao\n')).toBe(true);
    process.env.APP_PASSWORD = 'cacao \n';
    expect(checkPassword('cacao')).toBe(true);
    expect(checkPassword('Cacao')).toBe(false);
  });
  it('signs and verifies tokens', () => {
    const t = createToken();
    expect(verifyToken(t)).toBe(true);
    expect(verifyToken(t + 'x')).toBe(false);
    expect(verifyToken(createToken(Date.now() - 31 * 86400e3))).toBe(false);
    process.env.SESSION_SECRET = 'y'.repeat(32);
    expect(verifyToken(t)).toBe(false);
  });
  it('reads cookies', () => {
    expect(readCookie({ headers: { cookie: 'a=1; cwr_session=abc.def' } })).toBe('abc.def');
  });
  it('fails closed when not configured', () => {
    delete process.env.APP_PASSWORD;
    expect(() => checkPassword('x')).toThrow(/manquant/);
  });
});

describe('alert rules', () => {
  const day = 86400;
  const daily = Array.from({ length: 40 }, (_, i) => ({ t: 1789000000 + i * day, o: 100, h: 105, l: 95, c: 100 }));
  it('levels', () => { expect(levelOf(39)).toBe('INFORMATION'); expect(levelOf(40)).toBe('IMPORTANT'); expect(levelOf(70)).toBe('CRITICAL'); });
  it('source transitions only', () => {
    expect(sourceEvents({ source: 's', prevStatus: 'OK', status: 'OK' })).toEqual([]);
    expect(sourceEvents({ source: 's', prevStatus: null, status: 'OFFLINE' })).toEqual([]);
    expect(sourceEvents({ source: 's', prevStatus: 'OK', status: 'OFFLINE' })[0].level).toBe('IMPORTANT');
  });
  it('big move and level breaks', () => {
    const ev = marketEvents({ daily, quote: { price: 125, change: 25, changePct: 25, dataTime: Date.now() } });
    expect(ev.find(e => e.category === 'MARKET').level).toBe('CRITICAL');
    expect(ev.some(e => e.title.includes('veille'))).toBe(true);
  });
  it('position risk', () => {
    const trade = { id: 1, entries: [{ price: 100, qty: 10, capitalEur: 30 }], product: { direction: 'LONG', pointValue: 1, priceCurrency: 'USD' }, plan: { plannedCapital: 150, maxLoss: 50, split: [30, 50, 70] }, stop: 97, targets: [110] };
    expect(positionEvents({ trade, price: 96, eurPerUnit: 1, daily }).map(e => e.title)).toContain('Invalidation atteinte');
    expect(positionEvents({ trade, price: 98, eurPerUnit: 1, daily }).map(e => e.title)).toContain('Stop proche');
    expect(positionEvents({ trade, price: 111, eurPerUnit: 1, daily }).map(e => e.title)).toContain('Objectif atteint');
    expect(positionEvents({ trade: { ...trade, stop: 50 }, price: 94, eurPerUnit: 1, daily }).map(e => e.title)).toContain('Perte maximale atteinte');
  });
});
