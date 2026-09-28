import { useEffect, useRef, useState } from 'react';
import { RadarMark } from './Brand.jsx';

const MIN = 1500;   // the sequence never flashes by
const EXTRA = 4000; // optional modules are waited for at most this long

// Entry sequence after the password: the radar scans while the real data arrives, each line
// ticks when its source has answered, then the rings open onto the dashboard.
// Nothing here is decorative timing: a line is checked only when its data is really there.
export function Entry({ checks, onOpen }) {
  const start = useRef(Date.now());
  const [phase, setPhase] = useState('scan'); // scan -> open -> done
  const [, tick] = useState(0);
  const required = checks.filter(c => c.required).every(c => c.ok);
  const all = checks.every(c => c.ok);

  // re-evaluate the timers while waiting
  useEffect(() => {
    if (phase !== 'scan') return undefined;
    const t = setInterval(() => tick(x => x + 1), 200);
    return () => clearInterval(t);
  }, [phase]);

  const elapsed = Date.now() - start.current;
  const ready = required && elapsed >= MIN && (all || elapsed >= MIN + EXTRA);
  useEffect(() => {
    if (!ready || phase !== 'scan') return undefined;
    const rm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const a = setTimeout(() => setPhase('open'), rm ? 0 : 250);
    return () => clearTimeout(a);
  }, [ready, phase]);
  // the dashboard starts appearing as the rings open; the overlay leaves once they are gone
  useEffect(() => {
    if (phase !== 'open') return undefined;
    onOpen();
    const b = setTimeout(() => setPhase('done'), matchMedia('(prefers-reduced-motion: reduce)').matches ? 150 : 950);
    return () => clearTimeout(b);
  }, [phase, onOpen]);

  if (phase === 'done') return null;
  return (
    <div className={`entry entry-${phase}`} role="status" aria-live="polite">
      <div className="entry-core">
        <div className="entry-radar">
          <i className="entry-wave" /><i className="entry-wave w2" /><i className="entry-wave w3" />
          <RadarMark className="entry-mark" state="live" level="entry" />
        </div>
        <p className="eyebrow entry-title">Accès au plan</p>
        <ul className="entry-checks">
          {checks.map((c, i) => (
            <li key={c.k} className={c.ok ? 'ok' : ''} style={{ '--d': `${i * 110}ms` }}>
              <span className="entry-dot" aria-hidden="true" />
              <span>{c.k}</span>
              <span className="entry-state num">{c.ok ? (c.error ? 'hors ligne' : 'ok') : '···'}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
