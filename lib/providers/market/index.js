// MarketDataProvider: the single entry point the API uses for prices.
// Swapping Yahoo for a broker API means adding a file here, nothing else changes.
import * as yahoo from './yahoo.js';
import { aggregate } from '../../engines/technical.js';
import { needsRebuild, rebuildDaily } from './rebuild.js';
import { detectRolls, backAdjust } from '../../engines/rolls.js';

export const INSTRUMENTS = {
  NY_COCOA: {
    id: 'NY_COCOA',
    name: 'New York Cocoa',
    exchange: 'ICE Futures U.S.',
    currency: 'USD',
    unit: '$/t',
    provider: 'yahoo',
    symbol: 'CC=F',
    contract: 'Contrat continu (échéance la plus proche)',
  },
  LDN_COCOA: {
    id: 'LDN_COCOA',
    name: 'London Cocoa',
    exchange: 'ICE Futures Europe',
    currency: 'GBP',
    unit: '£/t',
    provider: null,
    unavailableReason: 'Aucune source gratuite fiable pour ICE Europe. À brancher via l’API de ton courtier.',
  },
};

export const TIMEFRAMES = Object.keys(yahoo.TIMEFRAMES);

export async function getMarket(instrumentId, tf, fetchImpl) {
  const inst = INSTRUMENTS[instrumentId];
  if (!inst) throw new Error(`Instrument inconnu : ${instrumentId}`);
  const base = { instrument: publicInstrument(inst), tf, fetchedAt: Date.now() };
  if (!inst.provider) return { ...base, status: 'UNAVAILABLE', reason: inst.unavailableReason };

  const data = await yahoo.fetchChart(inst.symbol, tf, fetchImpl);
  let candles = data.aggregateHours ? aggregate(data.candles, data.aggregateHours) : data.candles;
  let quality = data.quality;
  let quote = { price: data.price, prevClose: data.prevClose, change: data.change, changePct: data.changePct };
  if (tf === 'D1') {
    ({ candles, quality } = await repairDaily(inst, data, fetchImpl));
    // contract rolls: older candles are shifted onto the current contract (see engines/rolls.js)
    const rolls = detectRolls(candles);
    if (rolls.length) {
      candles = backAdjust(candles, rolls);
      quality = { ...quality, rolls: rolls.map(r => ({ t: r.t, gap: r.gap })) };
      // rolled today: yesterday's close belongs to the old contract, the session change must not include the jump
      if (rolls.at(-1).t === candles.at(-1).t && candles.length > 1 && quote.price != null) {
        const prevClose = candles.at(-2).c;
        quote = { ...quote, prevClose, change: quote.price - prevClose, changePct: (quote.price / prevClose - 1) * 100, rolledToday: true };
      }
    }
  }
  return {
    ...base,
    status: 'OK',
    quote: {
      ...quote,
      currency: data.currency,
      dataTime: data.dataTime,
      delayed: true,
      delayMinutes: yahoo.SOURCE.delayMinutes,
    },
    candles,
    quality,
    source: { name: yahoo.SOURCE.name, url: yahoo.SOURCE.url, official: false },
  };
}

// Empty or missing daily bars of the last 6 months are rebuilt from hourly bars (see rebuild.js).
const HOURLY_RANGE = '6mo';
let hourlyMemo = null;
async function repairDaily(inst, data, fetchImpl) {
  const { droppedAt = [] } = data.quality || {};
  const since = Date.now() / 1000 - 175 * 86400;
  const base = { dropped: droppedAt.length, rebuilt: 0, unrepaired: droppedAt.length };
  if (!needsRebuild(data.candles, droppedAt, since)) return { candles: data.candles, quality: base };
  try {
    // hourly history barely changes: reuse it for a few minutes instead of refetching every minute
    if (!hourlyMemo || hourlyMemo.symbol !== inst.symbol || Date.now() - hourlyMemo.at > 5 * 60e3) {
      const h = await yahoo.fetchChart(inst.symbol, '1H', fetchImpl, { range: HOURLY_RANGE });
      hourlyMemo = { symbol: inst.symbol, at: Date.now(), candles: h.candles };
    }
    const { candles, rebuilt } = rebuildDaily(data.candles, hourlyMemo.candles, { gmtoffset: data.gmtoffset, droppedAt });
    return { candles, quality: { ...base, rebuilt, unrepaired: Math.max(0, droppedAt.length - rebuilt) } };
  } catch (e) {
    return { candles: data.candles, quality: { ...base, repairError: String(e.message || e) } };
  }
}

function publicInstrument({ provider, symbol, unavailableReason, ...rest }) {
  return rest;
}
