// Multi-timeframe ICT reading, confluence for long and short, setup status and its events.
import * as repo from '../db/repo.js';
import { emit } from './notify.js';
import { marketWithEvents, getRates } from './market.js';
import { loadFundamentals } from './fundamentals.js';
import { analyzeTf } from '../engines/ict.js';
import { confluence, evaluateSetup } from '../engines/confluence.js';
import { previousLevels } from '../engines/technical.js';
import { computePosition } from '../engines/trade.js';

const TFS = ['W1', 'D1', '4H', '1H', '15M'];
const fmt = x => Math.round(x).toLocaleString('en-US');

function liquidityMap(price, lv, tfs, atr) {
  const out = [];
  const push = (type, p, swept, tf) => p != null && out.push({ type, price: p, side: p >= price ? 'BUY' : 'SELL', swept: !!swept, tf, dist: atr ? (p - price) / atr : null });
  if (lv) { push('PDH', lv.PDH, price > lv.PDH, 'D1'); push('PDL', lv.PDL, price < lv.PDL, 'D1'); push('PWH', lv.PWH, price > lv.PWH, 'W1'); push('PWL', lv.PWL, price < lv.PWL, 'W1'); }
  for (const tf of ['D1', '4H']) for (const p of tfs[tf]?.pools || []) push(p.type, p.level, p.swept, tf);
  return out.sort((a, b) => b.price - a.price).filter((x, i, a) => !i || Math.abs(x.price - a[i - 1].price) > (atr || 0) * 0.05);
}

export async function runAnalysis(sql, { fund } = {}) {
  const markets = await Promise.all(TFS.map(tf => marketWithEvents('NY_COCOA', tf)));
  const byTf = Object.fromEntries(TFS.map((tf, i) => [tf, markets[i]]));
  const daily = byTf.D1?.candles?.length ? byTf.D1.candles : null;
  const lv = daily ? previousLevels(daily) : null;
  const external = lv ? [
    { side: 'BUY', level: lv.PDH, label: 'PDH' }, { side: 'SELL', level: lv.PDL, label: 'PDL' },
    ...(lv.PWH != null ? [{ side: 'BUY', level: lv.PWH, label: 'PWH' }, { side: 'SELL', level: lv.PWL, label: 'PWL' }] : []),
  ] : [];
  const tfs = {};
  for (const tf of TFS) {
    const c = byTf[tf]?.candles;
    tfs[tf] = c?.length ? analyzeTf(c, { k: 2, lookback: 150, external: tf === '4H' || tf === '1H' || tf === '15M' ? external : [] }) : null;
  }
  const f = fund || await loadFundamentals(sql).catch(() => null);
  const fundamentals = f?.score ?? null;
  const market = byTf.D1;
  const price = market?.quote?.price ?? daily?.at(-1)?.c ?? null;

  const [trade, fx] = await Promise.all([repo.getActiveTrade(sql), getRates().catch(() => null)]);
  const tradePrice = trade.priceSource === 'manual' ? trade.manualPrice?.price ?? null : price;
  const position = computePosition({ ...trade, price: tradePrice, eurPerUnit: fx?.eurPer?.[trade.product.priceCurrency] ?? null });

  const long = price != null ? confluence({ dir: 'LONG', price, tfs, daily, fundamentals }) : null;
  const short = price != null ? confluence({ dir: 'SHORT', price, tfs, daily, fundamentals }) : null;
  const direction = trade.product.direction;
  const setup = evaluateSetup({ market, daily, fundamentals, conf: direction === 'SHORT' ? short : long, position, direction });

  await raiseSetupEvents(sql, setup, direction === 'SHORT' ? short : long, price, fundamentals);

  const summary = Object.fromEntries(TFS.map(tf => {
    const t = tfs[tf];
    if (!t) return [tf, null];
    const near = z => Math.abs((z.top + z.bottom) / 2 - price);
    return [tf, {
      trend: t.trend, atr: t.atr, lastTime: t.lastTime,
      structure: t.structure.slice(-3), sweeps: t.sweeps.slice(-3), displacements: t.displacements.slice(-2),
      fvgs: [...t.fvgs].sort((a, b) => near(a) - near(b)).slice(0, 4),
      obs: [...t.obs].sort((a, b) => near(a) - near(b)).slice(0, 4),
      pools: t.pools.filter(p => !p.swept).slice(-4),
      swings: t.swings,
    }];
  }));
  return { status: 'OK', at: Date.now(), price, setup, long, short, tfs: summary, liquidity: liquidityMap(price, lv, tfs, tfs.D1?.atr) };
}

// Event only when the status changes (one per status and day), CRITICAL for a high-confluence setup.
async function raiseSetupEvents(sql, setup, conf, price, fundamentals) {
  const prev = await repo.getSetting(sql, 'setup_state', null);
  const cur = { status: setup.status, dir: setup.direction, score: setup.score };
  if (prev && prev.status === cur.status && prev.dir === cur.dir) return;
  await repo.setSetting(sql, 'setup_state', { ...cur, at: Date.now() });
  if (!prev) return;
  const day = new Date().toISOString().slice(0, 10);
  const side = setup.direction === 'LONG' ? 'LONG' : 'SHORT';
  const checklist = setup.confirmed.map(i => `✓ ${i.label}${i.evidence ? ` (${i.evidence})` : ''}`).join('\n');
  const against = [...setup.against.map(i => i.label), ...setup.reasons.map(r => r.t)].slice(0, 2).join(' ; ');
  const base = { category: 'SETUP', source: 'Moteur de confluence', data: { score: setup.score, status: setup.status } };
  if (cur.status === 'HIGH') {
    await emit(sql, { ...base, level: 'CRITICAL', importance: 82, title: `Setup ${side} à haute confluence`, fingerprint: `setup:${side}:HIGH:${day}`,
      message: `Prix ${fmt(price)} · confluence ${setup.score}/${setup.max}\n${checklist}\nFondamental : ${fundamentals?.bias ?? 'N/D'}${against ? `\nRisque principal : ${against}` : ''}\nPas un signal d’entrée automatique.` });
  } else if (cur.status === 'DEVELOPING') {
    await emit(sql, { ...base, level: 'IMPORTANT', importance: 60, title: `Setup ${side} en formation`, fingerprint: `setup:${side}:DEV:${day}`, message: `Confluence ${setup.score}/${setup.max}. À surveiller : ${setup.next.join(', ')}.` });
  } else if (cur.status === 'INVALIDATED') {
    await emit(sql, { ...base, category: 'RISK', level: 'CRITICAL', importance: 90, title: 'Thèse technique invalidée', fingerprint: `setup:INVALID:${day}`, message: 'Le prix a franchi ton invalidation. Aucun renforcement.' });
  } else if (prev.status === 'DEVELOPING' || prev.status === 'HIGH') {
    await emit(sql, { ...base, level: 'INFORMATION', importance: 30, title: 'Setup retombé', fingerprint: `setup:${side}:DOWN:${day}:${cur.status}`, message: `Confluence ${setup.score}/${setup.max} : ${cur.status === 'WATCHING' ? 'sous surveillance' : 'aucun setup'}.` });
  }
}
