import { useEffect, useRef } from 'react';
import { useReducedMotion } from '../hooks/useReducedMotion.js';

// Ambient background. Its speed follows the Market Pulse, never a random "activity".
export function Flow({ energy = 0.3 }) {
  const ref = useRef(null);
  const target = useRef(energy);
  const rm = useReducedMotion();
  target.current = energy;

  useEffect(() => {
    const c = ref.current, ctx = c.getContext('2d');
    let w = 0, h = 0, t = 0, last = 0, e = target.current, raf = 0;
    const lines = Array.from({ length: 13 }, (_, i) => ({ y: (i + 0.5) / 13, a: 10 + (i * 7) % 18, f: 0.6 + (i * 0.37) % 0.9, ph: i * 1.7, o: 0.035 + (i % 4) * 0.012 }));
    const size = () => {
      const dpr = Math.min(2, devicePixelRatio || 1);
      w = innerWidth; h = innerHeight; c.width = w * dpr; c.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const par = (scrollY || 0) * 0.06;
      for (const L of lines) {
        ctx.beginPath();
        for (let x = -10; x <= w + 10; x += 14) {
          const y = L.y * h - (par % h) + Math.sin((x / w) * 6.3 * L.f + t * L.f + L.ph) * L.a + Math.sin(x / 190 + t * 0.6 + L.ph) * 4;
          x === -10 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(98,198,222,${L.o})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    };
    const loop = now => {
      raf = requestAnimationFrame(loop);
      if (now - last < 33) return;
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      e += (target.current - e) * 0.03;
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

  return <canvas id="flow" ref={ref} aria-hidden="true" />;
}
