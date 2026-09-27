import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Flow } from './components/Flow.jsx';
import { TabBar, TABS } from './components/TabBar.jsx';
import { Sheet } from './components/Sheet.jsx';
import { PulseDetail } from './components/Pulse.jsx';
import { WarRoom } from './pages/WarRoom.jsx';
import { Market } from './pages/Market.jsx';
import { Fundamentals } from './pages/Fundamentals.jsx';
import { Intel } from './pages/Intel.jsx';
import { Trade } from './pages/Trade.jsx';
import { usePolling } from './hooks/usePolling.js';
import { useStored } from './hooks/useStored.js';
import { fetchMarket, fetchFx } from './lib/api.js';
import { load, save } from './lib/store.js';
import { marketPulse, evaluateWarRoom } from '../lib/engines/warroom.js';
import { atr } from '../lib/engines/technical.js';
import { computePosition, DEFAULT_PLAN, DEFAULT_PRODUCT } from '../lib/engines/trade.js';

export const DEFAULT_TRADE = {
  product: DEFAULT_PRODUCT,
  plan: DEFAULT_PLAN,
  priceSource: 'NY_COCOA',
  manualPrice: null,
  entries: [],
  stop: null,
  targets: [],
  closed: false,
};

const MODULES = { fundamentals: false, confluence: false };

export default function App() {
  const [tab, setTab] = useState(() => {
    const h = location.hash.slice(1);
    return TABS.some(t => t.id === h) ? h : 'warroom';
  });
  const [dir, setDir] = useState(1);
  const [sheet, setSheet] = useState(null);
  const [trade, setTrade] = useStored('trade', DEFAULT_TRADE);

  // Daily NY data drives the War Room (price, ATR, pulse). Refreshed every minute while visible.
  const ny = usePolling(() => fetchMarket('NY_COCOA', 'D1'), 60e3);
  const fx = usePolling(fetchFx, 6 * 3600e3);
  const market = ny.data;
  const daily = market?.candles?.length ? market.candles : null;

  const pulse = useMemo(() => marketPulse({ daily, quote: market?.quote }), [daily, market?.quote]);
  const war = useMemo(() => evaluateWarRoom({ market, daily, modules: MODULES }), [market, daily]);
  const atr14 = useMemo(() => (daily ? atr(daily) : null), [daily]);

  const tradePrice = trade.priceSource === 'manual' ? trade.manualPrice?.price ?? null : market?.quote?.price ?? null;
  const eurPerUnit = fx.data?.eurPer?.[trade.product.priceCurrency] ?? null;
  const position = useMemo(() => computePosition({
    entries: trade.entries, product: trade.product, plan: trade.plan, stop: trade.stop,
    targets: trade.targets, price: tradePrice, eurPerUnit, closed: trade.closed,
  }), [trade, tradePrice, eurPerUnit]);

  // "What changed since your last visit": read the previous snapshot once, save a new one when leaving.
  const prevSnapshot = useRef(load('snapshot', null));
  const current = useRef(null);
  current.current = { at: Date.now(), price: market?.quote?.price ?? null, atr: atr14, pnl: position.pnl ?? null, sourceStatus: market?.status ?? null };
  useEffect(() => {
    const store = () => { if (current.current.price != null) save('snapshot', current.current); };
    const onVis = () => document.hidden && store();
    document.addEventListener('visibilitychange', onVis);
    addEventListener('pagehide', store);
    return () => { document.removeEventListener('visibilitychange', onVis); removeEventListener('pagehide', store); };
  }, []);

  const go = useCallback(id => {
    setTab(cur => {
      if (cur === id) return cur;
      setDir(TABS.findIndex(t => t.id === id) > TABS.findIndex(t => t.id === cur) ? 1 : -1);
      return id;
    });
    history.replaceState(null, '', `#${id}`);
    scrollTo({ top: 0 });
  }, []);

  // Swipe left / right between sections (never the only way: the tab bar does the same).
  useEffect(() => {
    let x = 0, y = 0, ok = false;
    const start = e => { const t = e.touches[0]; x = t.clientX; y = t.clientY; ok = !e.target.closest('.no-swipe, .sheet, input, textarea, select'); };
    const end = e => {
      if (!ok || sheet) return;
      const t = e.changedTouches[0], dx = t.clientX - x, dy = t.clientY - y;
      if (Math.abs(dx) > 70 && Math.abs(dy) < 45) {
        const i = TABS.findIndex(tb => tb.id === tab) + (dx < 0 ? 1 : -1);
        if (i >= 0 && i < TABS.length) go(TABS[i].id);
      }
    };
    addEventListener('touchstart', start, { passive: true });
    addEventListener('touchend', end, { passive: true });
    return () => { removeEventListener('touchstart', start); removeEventListener('touchend', end); };
  }, [tab, sheet, go]);

  // Dynamic glass: a slow reflection follows the pointer.
  useEffect(() => {
    const move = e => {
      const g = e.target.closest?.('.glass'); if (!g) return;
      const r = g.getBoundingClientRect();
      g.style.setProperty('--mx', `${e.clientX - r.left}px`);
      g.style.setProperty('--my', `${e.clientY - r.top}px`);
      g.classList.add('lit');
    };
    const out = e => { const g = e.target.closest?.('.glass'); if (g && !g.contains(e.relatedTarget)) g.classList.remove('lit'); };
    addEventListener('pointermove', move, { passive: true });
    addEventListener('pointerout', out);
    return () => { removeEventListener('pointermove', move); removeEventListener('pointerout', out); };
  }, []);

  const closeSheet = useCallback(() => setSheet(null), []);
  // keep the content while the sheet slides out
  const lastSheet = useRef(null);
  if (sheet) lastSheet.current = sheet;
  const shownSheet = sheet || lastSheet.current;
  const ctx = { market, marketState: ny, daily, fx, pulse, war, atr14, trade, setTrade, position, tradePrice, eurPerUnit, go, openSheet: setSheet, prevSnapshot: prevSnapshot.current };

  return (
    <>
      <Flow energy={pulse.value == null ? 0.25 : pulse.value / 100} />
      <div className="app">
        <header className="top">
          <div className="brand">
            <svg className="brand-mark" viewBox="0 0 26 26" fill="none" aria-hidden="true">
              <ellipse cx="13" cy="13" rx="7.2" ry="11" stroke="#62C6DE" strokeWidth="1.2" />
              <path d="M13 2.4v21.2" stroke="#62C6DE" strokeWidth="1" opacity=".6" />
              <path d="M7.4 8.5c3.4 1.6 7.8 1.6 11.2 0M7 13c3.6 1.7 8.4 1.7 12 0M7.4 17.5c3.4 1.6 7.8 1.6 11.2 0" stroke="#62C6DE" strokeWidth=".9" opacity=".45" />
            </svg>
            <div className="brand-name">Cocoa War Room<span>v0.1 · Phase 1–2</span></div>
          </div>
          <button className="mini-pulse" style={{ '--pd': pulse.level === 'calm' ? '4.2s' : pulse.level === 'active' ? '2.6s' : '1.5s' }} onClick={() => setSheet('pulse')} aria-label="Market Pulse">
            <i /> <span className="num">{pulse.value ?? '—'}</span>
          </button>
        </header>

        <main key={tab} className="view enter" style={{ '--dir': dir }}>
          {tab === 'warroom' && <WarRoom {...ctx} />}
          {tab === 'market' && <Market {...ctx} />}
          {tab === 'fund' && <Fundamentals />}
          {tab === 'intel' && <Intel />}
          {tab === 'trade' && <Trade {...ctx} />}
        </main>
      </div>

      <TabBar current={tab} onChange={go} />

      <Sheet open={!!sheet} onClose={closeSheet}>
        {shownSheet === 'pulse' && <PulseDetail pulse={pulse} />}
      </Sheet>
    </>
  );
}
