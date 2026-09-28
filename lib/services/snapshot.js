// Current state of everything, for Telegram answers and summaries.
import * as repo from '../db/repo.js';
import { marketWithEvents, getRates } from './market.js';
import { loadFundamentals } from './fundamentals.js';
import { runAnalysis } from './analysis.js';
import { computePosition } from '../engines/trade.js';
import { cached } from '../http/respond.js';

export async function snapshot(sql) {
  const [market, fund, trade, fx] = await Promise.all([
    marketWithEvents('NY_COCOA', 'D1'), loadFundamentals(sql).catch(() => null), repo.getActiveTrade(sql), getRates().catch(() => null),
  ]);
  const price = trade.priceSource === 'manual' ? trade.manualPrice?.price ?? null : market.quote?.price ?? null;
  const position = computePosition({ ...trade, price, eurPerUnit: fx?.eurPer?.[trade.product.priceCurrency] ?? null });
  const war = (await cached('analysis', 60e3, () => runAnalysis(sql, { fund }))).setup;
  return { market, fund, trade, position, war };
}
