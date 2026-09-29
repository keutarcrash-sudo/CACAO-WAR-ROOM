// Price alerts set by the user ("tell me when cocoa touches 4 600 $"). The side is fixed at creation:
// below the price when created = wait for a fall to the level, above = wait for a rise.
export function addPriceAlert(list = [], { level, note = '', price }) {
  if (!(level > 0)) throw new Error('Niveau invalide');
  const side = price != null && level > price ? 'above' : 'below';
  const id = Math.max(0, ...list.map(a => a.id)) + 1;
  return [...list, { id, level: Math.round(level), side, note: String(note || '').slice(0, 80), createdAt: Date.now(), triggeredAt: null }];
}

// Alerts reached by the price. The day's low / high also count (a spike between two checks),
// but only for an alert that already existed when that day started.
export function reachedAlerts(list = [], { price, low = null, high = null, dayStart = null }) {
  if (price == null) return [];
  return list.filter(a => {
    if (a.triggeredAt) return false;
    const useDay = dayStart != null && a.createdAt < dayStart;
    return a.side === 'below'
      ? Math.min(price, useDay && low != null ? low : price) <= a.level
      : Math.max(price, useDay && high != null ? high : price) >= a.level;
  });
}
