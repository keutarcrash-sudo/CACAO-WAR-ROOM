import { describe, it, expect } from 'vitest';
import { detectRolls, backAdjust, inRollWindow } from '../lib/engines/rolls.js';
import { rollEvents } from '../lib/engines/alerts.js';

const D = s => Date.parse(`${s}T04:00:00Z`) / 1000;
// weekdays from a start date, flat-ish market around 8000 with 100 $ daily ranges
function series(start, n) {
  const out = []; let t = Date.parse(`${start}T04:00:00Z`);
  while (out.length < n) {
    const d = new Date(t);
    if (d.getUTCDay() % 6) { const c = 8000 + (out.length % 3) * 20; out.push({ t: t / 1000, o: c - 10, h: c + 50, l: c - 50, c, v: 1 }); }
    t += 86400e3;
  }
  return out;
}

describe('contract rolls', () => {
  it('knows the ICE cocoa roll windows', () => {
    expect(inRollWindow(Date.parse('2026-11-20T12:00:00Z'))).toBe(true);  // before December delivery
    expect(inRollWindow(Date.parse('2026-10-15T12:00:00Z'))).toBe(false); // mid-October: no expiry near
    expect(inRollWindow(Date.parse('2026-02-20T12:00:00Z'))).toBe(true);  // before March delivery
  });

  it('detects an unfilled gap inside the window and back-adjusts older candles', () => {
    const s = series('2026-10-01', 40);
    const i = s.findIndex(k => k.t >= D('2026-11-18'));
    for (let j = i; j < s.length; j++) Object.assign(s[j], { o: s[j].o - 400, h: s[j].h - 400, l: s[j].l - 400, c: s[j].c - 400 });
    const rolls = detectRolls(s);
    expect(rolls).toHaveLength(1);
    expect(rolls[0].t).toBe(s[i].t);
    expect(rolls[0].gap).toBeCloseTo(s[i].o - s[i - 1].c);
    const adj = backAdjust(s, rolls);
    expect(adj[i - 1].c).toBeCloseTo(s[i - 1].c + rolls[0].gap);
    expect(adj[i]).toBe(s[i]);
    // after adjustment, the jump is gone: the day opens near the previous close
    expect(Math.abs(adj[i].o - adj[i - 1].c)).toBeLessThan(1);
  });

  it('leaves a real gap alone: outside the window, or filled during the day', () => {
    const s = series('2026-09-28', 40);
    const i = s.findIndex(k => k.t >= D('2026-10-14'));
    for (let j = i; j < s.length; j++) Object.assign(s[j], { o: s[j].o - 400, h: s[j].h - 400, l: s[j].l - 400, c: s[j].c - 400 });
    expect(detectRolls(s)).toEqual([]);
    const f = series('2026-10-01', 40);
    const k = f.findIndex(x => x.t >= D('2026-11-18'));
    f[k] = { ...f[k], o: f[k].o - 400, l: f[k].l - 400 }; // opened lower but traded back to yesterday's close
    expect(detectRolls(f)).toEqual([]);
  });

  it('warns about a recent roll, louder with an open position', () => {
    const now = Date.parse('2026-11-19T12:00:00Z');
    const rolls = [{ t: D('2026-11-18'), gap: -400 }];
    expect(rollEvents({ rolls, now })[0]).toMatchObject({ level: 'INFORMATION', fingerprint: 'roll:NY_COCOA:2026-11-18' });
    expect(rollEvents({ rolls, hasPosition: true, now })[0].level).toBe('IMPORTANT');
    expect(rollEvents({ rolls, now: now + 10 * 86400e3 })).toEqual([]);
  });
});
