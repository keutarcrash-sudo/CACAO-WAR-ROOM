import { useMemo } from 'react';

// Intraday trace under the price, drawn once when it appears.
export function Sparkline({ candles, up }) {
  const d = useMemo(() => {
    const ks = (candles || []).slice(-48);
    if (ks.length < 3) return null;
    const cs = ks.map(k => k.c), lo = Math.min(...cs), hi = Math.max(...cs), span = hi - lo || 1;
    const pts = cs.map((c, i) => [(i / (cs.length - 1)) * 300, 38 - ((c - lo) / span) * 34]);
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    return { line, area: `${line} L300,40 L0,40 Z` };
  }, [candles]);
  if (!d) return <div className="spark spark-empty" />;
  const col = up ? 'var(--ok)' : 'var(--risk)';
  return (
    <svg className="spark" viewBox="0 0 300 40" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={col} stopOpacity=".22" />
          <stop offset="1" stopColor={col} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={d.area} fill="url(#spark-fill)" />
      <path className="spark-line" d={d.line} fill="none" stroke={col} strokeWidth="1.4" vectorEffect="non-scaling-stroke" pathLength="1" />
    </svg>
  );
}
