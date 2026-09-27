// MarketDataProvider: the single entry point the API uses for prices.
// Swapping Yahoo for a broker API means adding a file here, nothing else changes.
import * as yahoo from './yahoo.js';
import { aggregate } from '../../engines/technical.js';

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
  const candles = data.aggregateHours ? aggregate(data.candles, data.aggregateHours) : data.candles;
  return {
    ...base,
    status: 'OK',
    quote: {
      price: data.price,
      prevClose: data.prevClose,
      change: data.change,
      changePct: data.changePct,
      currency: data.currency,
      dataTime: data.dataTime,
      delayed: true,
      delayMinutes: yahoo.SOURCE.delayMinutes,
    },
    candles,
    source: { name: yahoo.SOURCE.name, url: yahoo.SOURCE.url, official: false },
  };
}

function publicInstrument({ provider, symbol, unavailableReason, ...rest }) {
  return rest;
}
