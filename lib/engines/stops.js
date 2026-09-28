// Suggested invalidation for a new position: where the idea is proved wrong, not where the loss hurts.
// For a long: just under the most relevant recent low (a swept low, or the last swing low on 4H / 1H /
// Daily), with a small buffer so that ordinary noise does not trigger it. Mirror image for a short.
// The level must leave room (not closer than 0.5 ATR) and stay away from a turbo's barrier.

const BUFFER = 0.2;   // ATR below the low
const MIN_ROOM = 0.5; // ATR between price and stop
const MAX_ROOM = 3;   // ATR: further than this, the position becomes too small to matter

export function suggestStop({ direction = 'LONG', price, atr, tfs, product = null }) {
  if (price == null || !atr || !tfs) return null;
  const L = direction !== 'SHORT';
  const want = L ? 'BULLISH' : 'BEARISH';
  const candidates = [];
  for (const tf of ['1H', '4H', 'D1']) {
    const t = tfs[tf];
    if (!t) continue;
    for (const s of (t.sweeps || []).filter(x => x.dir === want).slice(-2)) candidates.push({ level: s.level, why: `${tf} : liquidité balayée ${s.label ? `(${s.label}) ` : ''}à ${Math.round(s.level)} $` });
    const sw = (t.swings || []).filter(x => x.type === (L ? 'L' : 'H')).slice(-2);
    for (const s of sw) candidates.push({ level: s.price, why: `${tf} : dernier ${L ? 'creux' : 'sommet'} à ${Math.round(s.price)} $` });
  }
  const dir = L ? 1 : -1;
  const barrier = product?.kind === 'turbo' ? (product.barrier ?? product.strike) : null;
  const options = candidates
    .map(c => ({ ...c, stop: Math.round(c.level - dir * BUFFER * atr) }))
    .map(c => ({ ...c, room: (price - c.stop) * dir / atr }))
    .filter(c => c.room >= MIN_ROOM && c.room <= MAX_ROOM)
    // a stop beyond a turbo's barrier would never be reached: the turbo dies first
    .filter(c => barrier == null || (c.stop - barrier) * dir > 0.3 * atr)
    // the closest structure that still leaves room: the thesis is wrong as soon as it breaks
    .sort((a, b) => a.room - b.room);
  const best = options[0];
  if (!best) return { stop: null, why: `aucun creux récent entre ${MIN_ROOM} et ${MAX_ROOM} ATR du prix${barrier != null ? ' et au-dessus de la barrière du turbo' : ''}` };
  return { stop: best.stop, why: `${best.why}, moins ${BUFFER} ATR de marge`, room: best.room };
}
