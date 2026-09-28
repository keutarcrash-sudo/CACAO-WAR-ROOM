// Market data + what happens around each fresh fetch: price history, source status and events.
import { getMarket } from '../providers/market/index.js';
import { fetchRates } from '../providers/fx/frankfurter.js';
import { cached, lastGood } from '../http/respond.js';
import { db } from '../db/client.js';
import * as repo from '../db/repo.js';
import { emit } from './notify.js';
import { marketEvents, positionEvents, sourceEvents } from '../engines/alerts.js';

const TTL = { W1: 3600e3, D1: 60e3, '4H': 120e3, '1H': 60e3, '15M': 60e3, '5M': 60e3 };

export async function getRates() {
  return cached('fx', 6 * 3600e3, fetchRates);
}

export async function marketWithEvents(instrument, tf) {
  const key = `${instrument}:${tf}`;
  try {
    return await cached(key, TTL[tf], async () => {
      const data = await getMarket(instrument, tf);
      if (data.status === 'OK' && tf === 'D1') await afterFetch(instrument, data).catch(e => console.error('afterFetch', e));
      return data;
    });
  } catch (e) {
    const error = String(e.message || e);
    if (tf === 'D1') await onFailure(instrument, error).catch(err => console.error('onFailure', err));
    const prev = lastGood(key);
    return { ...(prev || { instrument: { id: instrument }, tf }), status: 'OFFLINE', error, checkedAt: Date.now() };
  }
}

async function afterFetch(instrument, data) {
  let sql;
  try { sql = await db(); } catch (e) { if (e.code === 'DB_NOT_CONFIGURED') return; throw e; }
  const q = data.quote;
  await repo.recordPrice(sql, { instrumentId: instrument, price: q.price, changePct: q.changePct, dataTime: q.dataTime, source: data.source.name, delayed: q.delayed });
  const prevStatus = await repo.setSourceStatus(sql, data.source.name, true);
  const events = [
    ...sourceEvents({ source: data.source.name, prevStatus, status: 'OK' }),
    ...marketEvents({ daily: data.candles, quote: q, instrument }),
  ];
  const trade = await repo.getActiveTrade(sql);
  if (trade.priceSource === instrument) {
    const fx = await getRates().catch(() => null);
    events.push(...positionEvents({ trade, price: q.price, eurPerUnit: fx?.eurPer?.[trade.product.priceCurrency] ?? null, daily: data.candles }));
  }
  for (const e of events) await emit(sql, { ...e, source: e.category === 'SYSTEM' || e.category === 'MARKET' || e.category === 'LIQUIDITY' ? data.source.name : 'War Room' });
}

async function onFailure(instrument, error) {
  let sql;
  try { sql = await db(); } catch { return; }
  const source = 'Yahoo Finance (non officiel)';
  const prevStatus = await repo.setSourceStatus(sql, source, false, error);
  for (const e of sourceEvents({ source, prevStatus, status: 'OFFLINE', error })) await emit(sql, { ...e, source });
}
