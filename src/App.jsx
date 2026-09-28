import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Field } from './components/Field.jsx';
import { TabBar, TABS } from './components/TabBar.jsx';
import { Sheet } from './components/Sheet.jsx';
import { PulseDetail } from './components/Pulse.jsx';
import { AlertDetail } from './components/Timeline.jsx';
import { Takeover } from './components/Takeover.jsx';
import { Login, Setup } from './components/Gate.jsx';
import { Brand } from './components/Brand.jsx';
import { WarRoom } from './pages/WarRoom.jsx';
import { Market } from './pages/Market.jsx';
import { Fundamentals } from './pages/Fundamentals.jsx';
import { Intel, NewsDetail } from './pages/Intel.jsx';
import { BriefSheet } from './components/BriefSheet.jsx';
import { ConfluenceDetail } from './components/Confluence.jsx';
import { Trade } from './pages/Trade.jsx';
import { usePolling } from './hooks/usePolling.js';
import { useLongPress } from './hooks/useLongPress.js';
import { api, sendVisit } from './lib/api.js';
import { marketPulse, evaluateWarRoom } from '../lib/engines/warroom.js';
import { atr } from '../lib/engines/technical.js';
import { computePosition } from '../lib/engines/trade.js';

export default function App() {
  const auth = usePolling(api.auth, 24 * 3600e3);
  const [gate, setGate] = useState(null); // forced state after a 401 / 503 from another route

  if (auth.loading && !auth.data) return <><Field energy={0.2} /><main className="gate"><Brand large /></main></>;
  const a = auth.data;
  const missing = [];
  if (a && !a.configured) missing.push('le mot de passe');
  if ((a && !a.database) || gate === 'db') missing.push('la base de données');
  if (auth.error || missing.length) return <><Field energy={0.2} /><Setup missing={missing.length ? missing : ['la configuration du serveur']} /></>;
  if (!a.authenticated || gate === 'login') {
    return <><Field energy={0.2} /><Login onDone={async pw => { await api.login(pw); setGate(null); await auth.reload(); }} /></>;
  }
  if (gate && typeof gate === 'object') return <><Field energy={0.2} /><Setup missing={['la base de données']} detail={gate.message} tech={gate.details} /></>;
  return <Room onUnauthorized={() => setGate('login')} onDbMissing={(message, details) => setGate(message ? { message, details } : 'db')} />;
}

function Room({ onUnauthorized, onDbMissing }) {
  const [tab, setTab] = useState(() => {
    const h = location.hash.slice(1);
    return TABS.some(t => t.id === h) ? h : 'warroom';
  });
  const [sheet, setSheet] = useState(null);
  const [burst, setBurst] = useState(0);
  const tip = useLongPress();

  const ny = usePolling(() => api.market('NY_COCOA', 'D1'), 60e3);
  const intraday = usePolling(() => api.market('NY_COCOA', '1H'), 120e3);
  const fx = usePolling(api.fx, 6 * 3600e3);
  const st = usePolling(api.state, 60e3);
  const fund = usePolling(api.fundamentals, 10 * 60e3);
  const news = usePolling(() => api.news(), 10 * 60e3);
  const analysis = usePolling(api.analysis, 2 * 60e3);

  // any route answering 401 / 503 sends us back to the right gate
  useEffect(() => {
    for (const e of [ny.error, st.error, fx.error, fund.error, analysis.error]) {
      if (e?.status === 401) onUnauthorized();
      if (e?.code === 'DB_NOT_CONFIGURED') onDbMissing();
      if (e?.code === 'DB_UNREACHABLE') onDbMissing(e.message, e.body?.details);
    }
  }, [ny.error, st.error, fx.error, fund.error, analysis.error, onUnauthorized, onDbMissing]);

  const market = ny.data;
  const daily = market?.candles?.length ? market.candles : null;
  const trade = st.data?.trade ?? null;
  const alerts = st.data?.alerts ?? [];

  // the snapshot of the previous visit is read once, before this visit overwrites it
  const lastVisit = useRef(undefined);
  if (lastVisit.current === undefined && st.data) lastVisit.current = st.data.lastVisit ?? null;

  const fundScore = fund.data?.score ?? null;
  const pulse = useMemo(() => marketPulse({ daily, quote: market?.quote, alerts, fundamentalsOn: !!fundScore, confluenceOn: !!analysis.data?.setup, newsEvents: news.data?.events ?? null }), [daily, market?.quote, alerts, fundScore, news.data, analysis.data]);
  const fallbackWar = useMemo(() => evaluateWarRoom({ market, daily, modules: { fundamentals: !!fundScore, confluence: false }, fundamentals: fundScore, direction: trade?.product.direction }), [market, daily, fundScore, trade?.product.direction]);
  // the server reading (ICT + confluence + do-nothing rules) wins as soon as it is available
  const war = analysis.data?.setup ?? fallbackWar;
  const atr14 = useMemo(() => (daily ? atr(daily) : null), [daily]);

  const tradePrice = !trade ? null : trade.priceSource === 'manual' ? trade.manualPrice?.price ?? null : market?.quote?.price ?? null;
  const eurPerUnit = trade ? fx.data?.eurPer?.[trade.product.priceCurrency] ?? null : null;
  const position = useMemo(() => computePosition(trade ? {
    entries: trade.entries, product: trade.product, plan: trade.plan, stop: trade.stop,
    targets: trade.targets, price: tradePrice, eurPerUnit, closed: trade.closed,
  } : {}), [trade, tradePrice, eurPerUnit]);

  // save "this visit" when the page is hidden, for the next "what changed"
  const snap = useRef(null);
  snap.current = { price: market?.quote?.price ?? null, atr: atr14, pnl: position.pnl ?? null, sourceStatus: market?.status ?? null };
  useEffect(() => {
    const save = () => { if (snap.current.price != null) sendVisit(snap.current); };
    const onVis = () => document.hidden && save();
    document.addEventListener('visibilitychange', onVis);
    addEventListener('pagehide', save);
    return () => { document.removeEventListener('visibilitychange', onVis); removeEventListener('pagehide', save); };
  }, []);

  // critical, not yet acknowledged: takes the screen
  const critical = alerts.find(x => x.level === 'CRITICAL' && !x.acknowledged) || null;
  const seen = useRef(new Set());
  useEffect(() => {
    if (critical && !seen.current.has(critical.id)) { seen.current.add(critical.id); setBurst(b => b + 1); }
  }, [critical]);
  const ack = async id => { st.set(d => ({ ...d, alerts: d.alerts.map(x => (x.id === id ? { ...x, acknowledged: true } : x)) })); await api.ack(id).catch(() => {}); };

  const mutate = useCallback(async (action, payload) => {
    const r = await api.trade(action, payload);
    st.set(d => ({ ...d, trade: r.trade }));
    st.reload();
    return r.trade;
  }, [st]);

  const go = useCallback(id => {
    if (id === tab) return;
    history.replaceState(null, '', `#${id}`);
    const apply = () => { setTab(id); scrollTo({ top: 0 }); };
    // View Transitions: shared elements (the position card) morph into their page
    if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.documentElement.dataset.dir = TABS.findIndex(t => t.id === id) > TABS.findIndex(t => t.id === tab) ? 'fwd' : 'back';
      document.startViewTransition(() => flushSync(apply));
    } else apply();
  }, [tab]);

  // swipe between sections (the tab bar always does the same)
  useEffect(() => {
    let x = 0, y = 0, ok = false;
    const start = e => { const t = e.touches[0]; x = t.clientX; y = t.clientY; ok = !e.target.closest('.no-swipe, .sheet, input, textarea, select, .takeover'); };
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

  // dynamic glass: a slow reflection follows the finger or the pointer
  useEffect(() => {
    const move = e => {
      const g = e.target.closest?.('.glass'); if (!g) return;
      const r = g.getBoundingClientRect();
      g.style.setProperty('--mx', `${e.clientX - r.left}px`);
      g.style.setProperty('--my', `${e.clientY - r.top}px`);
      g.classList.add('lit');
    };
    const out = e => { const g = e.target.closest?.('.glass'); if (g && !g.contains(e.relatedTarget)) g.classList.remove('lit'); };
    const up = e => { if (e.pointerType === 'touch') setTimeout(() => document.querySelectorAll('.glass.lit').forEach(g => g.classList.remove('lit')), 700); };
    addEventListener('pointermove', move, { passive: true });
    addEventListener('pointerout', out);
    addEventListener('pointerup', up);
    return () => { removeEventListener('pointermove', move); removeEventListener('pointerout', out); removeEventListener('pointerup', up); };
  }, []);

  const closeSheet = useCallback(() => setSheet(null), []);
  const lastSheet = useRef(null);
  if (sheet) lastSheet.current = sheet;
  const shown = sheet || lastSheet.current;

  const ctx = {
    fund, news, analysis,
    market, marketState: ny, intraday: intraday.data, daily, fx, pulse, war, atr14, trade, tradeState: st, mutate,
    position, tradePrice, eurPerUnit, alerts, lastVisit: lastVisit.current, go, openSheet: setSheet,
  };

  return (
    <>
      <Field energy={pulse.value == null ? 0.25 : pulse.value / 100} burst={burst} />
      <div className="app">
        <header className="top">
          <Brand sub={tab === 'warroom' ? null : TABS.find(t => t.id === tab)?.label} />
          <span className={`live live-${market?.status === 'OK' ? 'on' : 'off'}`}>
            <i aria-hidden="true" />{market?.status === 'OK' ? 'Live · différé' : market?.status === 'OFFLINE' ? 'Hors ligne' : '…'}
          </span>
        </header>
        <main className="view">
          {!trade ? <p className="empty center">{st.error ? `Impossible de charger les données : ${st.error.message}` : 'Chargement…'}</p> : (
            <>
              {tab === 'warroom' && <WarRoom {...ctx} />}
              {tab === 'market' && <Market {...ctx} />}
              {tab === 'fund' && <Fundamentals fund={fund} />}
              {tab === 'intel' && <Intel alerts={alerts} news={news} openSheet={setSheet} />}
              {tab === 'trade' && trade && <Trade {...ctx} />}
            </>
          )}
        </main>
      </div>

      <TabBar current={tab} onChange={go} badge={alerts.some(x => x.level !== 'INFORMATION' && !x.acknowledged) ? 'intel' : null} />

      <Sheet open={!!sheet} onClose={closeSheet}>
        {shown?.type === 'pulse' && <PulseDetail pulse={pulse} />}
        {shown?.type === 'alert' && <AlertDetail alert={shown.alert} />}
        {shown?.type === 'news' && <NewsDetail event={shown.event} />}
        {shown?.type === 'brief' && sheet && <BriefSheet {...ctx} />}
        {shown?.type === 'confluence' && <ConfluenceDetail analysis={analysis.data} direction={trade?.product.direction} />}
      </Sheet>

      <Takeover alert={critical} onLater={() => ack(critical.id)} onReview={() => { ack(critical.id); go(critical.category === 'RISK' || critical.category === 'TRADE' ? 'trade' : 'market'); }} />

      {tip && <div className="tip" role="tooltip" style={{ left: tip.x, top: tip.y }}><b>{tip.title}</b>{tip.text}</div>}
    </>
  );
}
