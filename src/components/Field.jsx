import { useEffect, useRef } from 'react';
import { useReducedMotion } from '../hooks/useReducedMotion.js';

// Background layer 1: slow light fields (what the glass refracts) and the market "flow" lines.
// Speed and brightness follow the Market Pulse. `burst` (a counter) makes the lines converge once,
// used when a critical event lands. Rendered at 1x resolution: it is blurry by nature and cheap.
export function Field({ energy = 0.3, burst = 0 }) {
  const ref = useRef(null);
  const target = useRef(energy);
  const conv = useRef({ value: 0, target: 0 });
  const rm = useReducedMotion();
  target.current = energy;

  useEffect(() => {
    if (!burst || rm) return undefined;
    conv.current.target = 1;
    const t = setTimeout(() => { conv.current.target = 0; }, 1600);
    return () => clearTimeout(t);
  }, [burst, rm]);

  useEffect(() => {
    const c = ref.current, ctx = c.getContext('2d');
    let w = 0, h = 0, t = 0, last = 0, e = target.current, raf = 0;
    const blobs = [
      { color: [22, 92, 118], r: 0.75, fx: 0.07, fy: 0.05, px: 0.2, py: 0.15, ph: 0 },
      { color: [30, 52, 104], r: 0.9, fx: 0.05, fy: 0.08, px: 0.85, py: 0.55, ph: 2.1 },
      { color: [70, 150, 170], r: 0.45, fx: 0.09, fy: 0.06, px: 0.5, py: 0.95, ph: 4.2 },
    ];
    const lines = Array.from({ length: 13 }, (_, i) => ({ y: (i + 0.5) / 13, a: 10 + (i * 7) % 18, f: 0.6 + (i * 0.37) % 0.9, ph: i * 1.7, o: 0.04 + (i % 4) * 0.014 }));
    const size = () => { w = c.width = innerWidth; h = c.height = innerHeight; };
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const m = Math.max(w, h), k = conv.current.value;
      for (const b of blobs) {
        const x = (b.px + Math.sin(t * b.fx * 6 + b.ph) * 0.18) * w;
        const y = (b.py + Math.cos(t * b.fy * 6 + b.ph) * 0.14) * h;
        const g = ctx.createRadialGradient(x, y, 0, x, y, b.r * m);
        const a = 0.16 + e * 0.14 + k * 0.08;
        g.addColorStop(0, `rgba(${b.color.join(',')},${a})`);
        g.addColorStop(1, `rgba(${b.color.join(',')},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
      const par = (scrollY || 0) * 0.06;
      for (const L of lines) {
        ctx.beginPath();
        for (let x = -10; x <= w + 10; x += 14) {
          const base = L.y * h - (par % h);
          const yb = base + (h * 0.42 - base) * k * (0.6 + 0.4 * Math.sin((x / w) * Math.PI));
          const y = yb + Math.sin((x / w) * 6.3 * L.f + t * L.f + L.ph) * L.a * (1 - k * 0.6) + Math.sin(x / 190 + t * 0.6 + L.ph) * 4;
          x === -10 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(120,210,232,${L.o + e * 0.03 + k * 0.06})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    };
    const loop = now => {
      raf = requestAnimationFrame(loop);
      if (now - last < 40) return; // 25 fps is plenty for an ambient layer
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      e += (target.current - e) * 0.03;
      conv.current.value += (conv.current.target - conv.current.value) * 0.06;
      t += dt * (0.08 + e * 0.55);
      draw();
    };
    const start = () => { if (!raf && !rm) { last = performance.now(); raf = requestAnimationFrame(loop); } };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };
    const onVis = () => (document.hidden ? stop() : start());
    const onResize = () => { size(); draw(); };
    size(); draw(); start();
    addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); removeEventListener('resize', onResize); document.removeEventListener('visibilitychange', onVis); };
  }, [rm]);

  return <canvas className="bg-field" ref={ref} aria-hidden="true" />;
}
