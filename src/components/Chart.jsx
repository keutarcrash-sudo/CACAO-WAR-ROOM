import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createChart, CandlestickSeries, LineStyle, createSeriesMarkers } from 'lightweight-charts';

const COLORS = {
  text: '#6D7786', grid: 'rgba(160,185,215,0.06)', up: 'rgba(76,195,138,0.85)', down: 'rgba(229,87,79,0.8)',
};

// Candles + horizontal levels. Levels fade in/out by being added or removed as a group.
export function Chart({ candles, levels = [], markers = [], height = 320, title = '', toolbar = null }) {
  const [full, setFull] = useState(false);
  const box = useRef(null);
  const chart = useRef(null);
  const series = useRef(null);
  const lines = useRef([]);
  const marks = useRef(null);

  useEffect(() => {
    const c = createChart(box.current, {
      height,
      layout: { background: { color: 'transparent' }, textColor: COLORS.text, fontFamily: "'Geist Mono Variable', ui-monospace, monospace", fontSize: 10, attributionLogo: true },
      grid: { vertLines: { visible: false }, horzLines: { color: COLORS.grid } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
      crosshair: { vertLine: { color: 'rgba(98,198,222,.35)', labelBackgroundColor: '#1C2634' }, horzLine: { color: 'rgba(98,198,222,.35)', labelBackgroundColor: '#1C2634' } },
      handleScroll: { vertTouchDrag: false },
      // explicit locale: some browsers report tags (e.g. en-US@posix) that Intl rejects
      localization: { locale: 'fr-FR' },
      autoSize: true,
    });
    series.current = c.addSeries(CandlestickSeries, {
      upColor: COLORS.up, downColor: COLORS.down, wickUpColor: COLORS.up, wickDownColor: COLORS.down, borderVisible: false,
      priceLineColor: '#62C6DE', priceLineStyle: LineStyle.Dotted,
      priceFormat: { type: 'price', precision: 0, minMove: 1 },
    });
    marks.current = createSeriesMarkers(series.current, []);
    chart.current = c;
    return () => { c.remove(); chart.current = null; series.current = null; lines.current = []; marks.current = null; };
    // the chart is rebuilt when it moves to / from full screen (it lives in another element then)
  }, [height, full]);

  useEffect(() => {
    if (!series.current || !candles) return;
    series.current.setData(candles.map(k => ({ time: k.t, open: k.o, high: k.h, low: k.l, close: k.c })));
    chart.current.timeScale().fitContent();
  }, [candles, full]);

  useEffect(() => {
    const s = series.current;
    if (!s) return;
    lines.current.forEach(l => s.removePriceLine(l));
    lines.current = levels.filter(l => l.price != null && Number.isFinite(l.price)).map(l => s.createPriceLine({
      price: l.price, color: l.color, lineWidth: 1, lineStyle: l.style ?? LineStyle.Dashed, axisLabelVisible: true, title: l.title,
    }));
  }, [levels, candles, full]);

  useEffect(() => {
    if (!marks.current || !candles?.length) return;
    // markers must sit on an existing bar time and be sorted
    const times = new Set(candles.map(k => k.t));
    marks.current.setMarkers(markers.filter(m => times.has(m.time)).sort((a, b) => a.time - b.time));
  }, [markers, candles, full]);

  // full screen: the chart takes the whole screen; turn the phone for a landscape view
  // (where the browser allows it, the screen is also switched to landscape automatically)
  useEffect(() => {
    if (!full) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = e => e.key === 'Escape' && setFull(false);
    addEventListener('keydown', onKey);
    const el = document.documentElement;
    if (el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen().then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
    return () => {
      document.body.style.overflow = prevOverflow;
      removeEventListener('keydown', onKey);
      try { screen.orientation?.unlock?.(); } catch { /* not supported */ }
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [full]);
  // leaving the browser's full screen (back gesture) closes ours too
  useEffect(() => {
    const onFs = () => { if (!document.fullscreenElement) setFull(false); };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);
  if (full) {
    // rendered at the root of the page: a parent with a blur effect would otherwise confine it
    return createPortal(
      <div className="chart-full no-swipe" role="dialog" aria-modal="true" aria-label={title || 'Graphique'}>
        <div className="chart-full-head">
          <span className="eyebrow">{title}</span>
          <div className="chart-full-tools">{toolbar}</div>
          <button className="chart-close" onClick={() => setFull(false)} aria-label="Quitter le plein écran">✕</button>
        </div>
        <div ref={box} className="chart-box" />
        <p className="chart-full-hint">Tourne ton téléphone pour une vue en paysage.</p>
      </div>,
      document.body,
    );
  }
  return (
    <div className="chart-frame">
      <div ref={box} className="chart-box" style={{ height }} />
      <button className="chart-expand" onClick={() => setFull(true)} aria-label="Graphique en plein écran" title="Plein écran">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
      </button>
    </div>
  );
}
