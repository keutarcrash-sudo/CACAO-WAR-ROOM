import { useEffect, useRef } from 'react';
import { createChart, CandlestickSeries, LineStyle } from 'lightweight-charts';

const COLORS = {
  text: '#6D7786', grid: 'rgba(160,185,215,0.06)', up: 'rgba(76,195,138,0.85)', down: 'rgba(229,87,79,0.8)',
};

// Candles + horizontal levels. Levels fade in/out by being added or removed as a group.
export function Chart({ candles, levels = [], height = 320 }) {
  const box = useRef(null);
  const chart = useRef(null);
  const series = useRef(null);
  const lines = useRef([]);

  useEffect(() => {
    const c = createChart(box.current, {
      height,
      layout: { background: { color: 'transparent' }, textColor: COLORS.text, fontFamily: "'Geist Mono Variable', ui-monospace, monospace", fontSize: 10, attributionLogo: false },
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
    chart.current = c;
    return () => { c.remove(); chart.current = null; series.current = null; lines.current = []; };
  }, [height]);

  useEffect(() => {
    if (!series.current || !candles) return;
    series.current.setData(candles.map(k => ({ time: k.t, open: k.o, high: k.h, low: k.l, close: k.c })));
    chart.current.timeScale().fitContent();
  }, [candles]);

  useEffect(() => {
    const s = series.current;
    if (!s) return;
    lines.current.forEach(l => s.removePriceLine(l));
    lines.current = levels.filter(l => l.price != null && Number.isFinite(l.price)).map(l => s.createPriceLine({
      price: l.price, color: l.color, lineWidth: 1, lineStyle: l.style ?? LineStyle.Dashed, axisLabelVisible: true, title: l.title,
    }));
  }, [levels, candles]);

  return <div ref={box} className="chart-box" style={{ height }} />;
}
