// Current state of everything, for Telegram answers and summaries.
import * as repo from '../db/repo.js';
import { marketWithEvents, getRates } from './market.js';
import { loadFundamentals } from './fundamentals.js';
import { runAnalysis } from './analysis.js';
import { computePosition } from '../engines/trade.js';
import { cached } from '../http/respond.js';

// Fresh reading (the continuous monitoring saves one every 5 minutes) is reused rather than recomputed:
// a full analysis on a cold server can take longer than a Telegram answer may.
const RECENT = 20 * 60e3;

export async function snapshot(sql) {
  const [market, trade, fx, saved, score] = await Promise.all([
    marketWithEvents('NY_COCOA', 'D1'), repo.getActiveTrade(sql), getRates().catch(() => null),
    repo.getSetting(sql, 'last_setup', null), repo.lastScore(sql).catch(() => null),
  ]);
  const price = trade.priceSource === 'manual' ? trade.manualPrice?.price ?? null : market.quote?.price ?? null;
  const position = computePosition({ ...trade, price, eurPerUnit: fx?.eurPer?.[trade.product.priceCurrency] ?? null });
  let fund = score && Date.now() - score.at < 24 * 3600e3 ? { score } : null;
  let war = saved && Date.now() - saved.at < RECENT ? saved.setup : null;
  if (!war) {
    fund = await loadFundamentals(sql).catch(() => fund);
    war = (await cached('analysis', 60e3, () => runAnalysis(sql, { fund }))).setup;
  }
  return { market, fund, trade, position, war };
}
