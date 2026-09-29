// Weekly context: the background trend a short-term setup lives in.
// A high confluence against a falling weekly market is often just a bounce, unless the price
// sits on a weekly support. Structure comes from weekly swings (BOS / CHoCH), the 52-week range
// says whether the price is cheap or expensive in the year.
import { rangePosition, atr } from './technical.js';

export function weeklyContext({ w1, weekly, price, direction = 'LONG' }) {
  if (!w1 || !weekly?.length || price == null) return null;
  const L = direction !== 'SHORT';
  const want = L ? 'BULLISH' : 'BEARISH';
  const trend = w1.trend; // BULLISH / BEARISH / NEUTRAL, from the last weekly break of structure
  const range = rangePosition(weekly, price, Math.min(52, weekly.length));
  const wAtr = atr(weekly);
  // a weekly level the price is sitting on: a swing low (for a long) or a weekly demand zone
  const lows = (w1.swings || []).filter(s => s.type === (L ? 'L' : 'H'));
  const zones = [...(w1.fvgs || []), ...(w1.obs || [])].filter(z => z.dir === want);
  const onLevel = wAtr ? lows.find(s => (price - s.price) * (L ? 1 : -1) >= -0.25 * wAtr && (price - s.price) * (L ? 1 : -1) <= 0.75 * wAtr) : null;
  const inZone = wAtr ? zones.find(z => price >= z.bottom - 0.25 * wAtr && price <= z.top + 0.25 * wAtr) : null;
  const support = onLevel ? { kind: 'swing', level: onLevel.price } : inZone ? { kind: 'zone', bottom: inZone.bottom, top: inZone.top } : null;
  const contrary = trend !== 'NEUTRAL' && trend !== want;
  return {
    trend, contrary, aligned: trend === want, support,
    range: range ? { pos: range.pos, lo: range.lo, hi: range.hi } : null,
    // the one sentence shown everywhere
    text: `Hebdomadaire ${trend === 'BULLISH' ? 'haussier' : trend === 'BEARISH' ? 'baissier' : 'neutre'}`
      + (range ? `, prix à ${Math.round(range.pos * 100)} % de son range 52 semaines (${Math.round(range.lo)}–${Math.round(range.hi)} $)` : '')
      + (support ? (support.kind === 'swing' ? `, sur le creux hebdo ${Math.round(support.level)} $` : `, dans la zone hebdo ${Math.round(support.bottom)}–${Math.round(support.top)} $`) : ''),
  };
}
