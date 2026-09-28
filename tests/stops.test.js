import { describe, it, expect } from 'vitest';
import { suggestStop } from '../lib/engines/stops.js';

const tfs = {
  '4H': { sweeps: [{ dir: 'BULLISH', level: 5550, label: 'PDL' }], swings: [{ type: 'L', price: 5480 }, { type: 'H', price: 5800 }] },
  '1H': { sweeps: [], swings: [{ type: 'L', price: 5610 }] },
  D1: { sweeps: [], swings: [{ type: 'L', price: 5111 }] },
};

describe('suggested stop', () => {
  it('takes the closest structure that leaves at least 0.5 ATR, minus a small buffer', () => {
    const s = suggestStop({ price: 5700, atr: 300, tfs });
    // 1H low 5610 → 5550 would be only 0.5 ATR: kept; it is the closest
    expect(s.stop).toBe(5550);
    expect(s.why).toMatch(/1H/);
  });
  it('never proposes a stop beyond a turbo barrier', () => {
    const s = suggestStop({ price: 5300, atr: 300, tfs: { D1: { sweeps: [], swings: [{ type: 'L', price: 4700 }] } }, product: { kind: 'turbo', barrier: 4635 } });
    expect(s.stop).toBeNull();
  });
  it('mirrors for a short', () => {
    const s = suggestStop({ direction: 'SHORT', price: 5700, atr: 300, tfs });
    expect(s.stop).toBe(5860);
  });
});
