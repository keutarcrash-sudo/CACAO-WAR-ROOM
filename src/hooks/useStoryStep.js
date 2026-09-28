import { useEffect, useState } from 'react';

// Which step of a scroll story is being read. The reading line depends on the layout:
// - stage pinned above the text (phone, tablet portrait): middle of the space left below the stage;
// - stage beside the text (wide screens): middle of the screen.
// The active step is the one whose centre is closest to that line, so the visual changes
// when its text is actually in front of the eyes, not when it first peeks in.
export function useStoryStep(stageRef, stepsRef, count) {
  const [active, setActive] = useState(0);
  useEffect(() => {
    let raf = 0;
    const measure = () => {
      raf = 0;
      const stage = stageRef.current, els = stepsRef.current.slice(0, count).filter(Boolean);
      if (!stage || !els.length) return;
      const s = stage.getBoundingClientRect(), first = els[0].getBoundingClientRect();
      const beside = first.left >= s.right - 1;
      const bottomBar = 96; // floating tab bar
      const line = beside ? innerHeight / 2 : s.bottom + (innerHeight - bottomBar - s.bottom) * 0.45;
      let best = 0, dist = Infinity;
      els.forEach((el, i) => {
        const r = el.getBoundingClientRect();
        // centre of the text block, not of the whole (tall) step
        const body = el.querySelector('h3') || el;
        const b = body.getBoundingClientRect();
        const c = (b.top + Math.min(r.bottom, b.top + 160)) / 2;
        const d = Math.abs(c - line);
        if (d < dist) { dist = d; best = i; }
      });
      setActive(a => (a === best ? a : best));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(measure); };
    measure();
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
    return () => { cancelAnimationFrame(raf); removeEventListener('scroll', onScroll); removeEventListener('resize', onScroll); };
  }, [stageRef, stepsRef, count]);
  return active;
}
