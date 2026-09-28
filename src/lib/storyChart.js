// Canvas renderer for the scroll story. Each layer has its own opacity so the story can
// reveal price, structure, liquidity, pivots and the position one after the other.
const C = {
  up: '76,195,138', down: '229,87,79', data: '98,198,222', struct: '156,143,245', ink: '230,233,238', ink3: '109,119,134', risk: '229,87,79', ok: '76,195,138',
};
const rgba = (c, a) => `rgba(${c},${a})`;

export function drawStory(ctx, W, H, m, A, reveal = 1) {
  ctx.clearRect(0, 0, W, H);
  if (!m?.candles?.length) return;
  const pad = { l: 8, r: 58, t: 18, b: 18 };
  const ks = m.candles;
  const vals = ks.flatMap(k => [k.h, k.l]);
  for (const v of [m.lv?.PDH, m.lv?.PDL, m.lv?.PWH, m.lv?.PWL, m.piv?.R1, m.piv?.S1, m.pos?.stop, m.pos?.avg, ...(m.pos?.targets || [])]) if (Number.isFinite(v)) vals.push(v);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const span = hi - lo || 1; lo -= span * 0.05; hi += span * 0.05;
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b, step = iw / ks.length;
  const X = i => pad.l + i * step + step / 2;
  const Y = p => pad.t + ((hi - p) / (hi - lo)) * ih;
  ctx.font = '10px "Geist Mono Variable", ui-monospace, monospace';
  ctx.textBaseline = 'middle';

  // price scale
  const tick = niceStep((hi - lo) / 4);
  for (let p = Math.ceil(lo / tick) * tick; p < hi; p += tick) {
    const y = Math.round(Y(p)) + 0.5;
    ctx.strokeStyle = rgba(C.ink3, 0.12); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
    ctx.fillStyle = rgba(C.ink3, 0.9); ctx.textAlign = 'left';
    ctx.fillText(Math.round(p).toLocaleString('en-US'), W - pad.r + 8, y);
  }

  // ATR band around the last price (pivots layer)
  if (A.piv > 0.01 && m.atr) {
    const last = ks.at(-1).c;
    ctx.fillStyle = rgba(C.data, 0.07 * A.piv);
    ctx.fillRect(pad.l, Y(last + m.atr), iw, Y(last - m.atr) - Y(last + m.atr));
  }

  // candles, drawn progressively on first reveal
  const n = Math.max(1, Math.round(ks.length * reveal));
  for (let i = 0; i < n; i++) {
    const k = ks[i], up = k.c >= k.o, x = X(i), bw = Math.max(1.5, step * 0.6);
    const col = up ? C.up : C.down, a = 0.85 * A.price;
    ctx.strokeStyle = rgba(col, a); ctx.fillStyle = rgba(col, a);
    ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, Y(k.h)); ctx.lineTo(Math.round(x) + 0.5, Y(k.l)); ctx.stroke();
    const y1 = Y(Math.max(k.o, k.c)), y2 = Y(Math.min(k.o, k.c));
    ctx.fillRect(x - bw / 2, y1, bw, Math.max(1, y2 - y1));
  }

  const used = []; // label positions already taken, so close levels do not print on top of each other
  const line = (p, col, a, dash, label, below = false) => {
    if (!Number.isFinite(p) || a <= 0.01) return;
    const y = Math.round(Y(p)) + 0.5;
    let ly = y + (below ? 9 : -8);
    while (used.some(u => Math.abs(u - ly) < 12)) ly += below ? 12 : -12;
    used.push(ly);
    ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = rgba(col, 1); ctx.setLineDash(dash); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
    ctx.setLineDash([]); ctx.fillStyle = rgba(col, 1); ctx.textAlign = 'right';
    ctx.fillText(label, W - pad.r - 6, ly);
    ctx.restore();
  };

  // structure: swing points and the two last highs / lows joined
  if (A.structure > 0.01 && m.swings) {
    ctx.save(); ctx.globalAlpha = A.structure;
    for (const s of m.swings) {
      ctx.fillStyle = rgba(C.struct, 1);
      ctx.beginPath(); ctx.arc(X(s.i), Y(s.price) + (s.type === 'H' ? -7 : 7), 2.4, 0, Math.PI * 2); ctx.fill();
    }
    for (const type of ['H', 'L']) {
      const pts = m.swings.filter(s => s.type === type).slice(-2);
      if (pts.length === 2) {
        ctx.strokeStyle = rgba(C.struct, 0.8); ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(X(pts[0].i), Y(pts[0].price)); ctx.lineTo(X(pts[1].i), Y(pts[1].price)); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }

  // ICT zones (FVG, order blocks) and events (sweeps, BOS / CHoCH)
  if (A.ict > 0.01) {
    ctx.save(); ctx.globalAlpha = A.ict;
    for (const z of m.zones || []) {
      const x = Math.max(pad.l, X(z.x) - step / 2), y1 = Y(z.top), y2 = Y(z.bottom);
      const col = z.dir === 'BULLISH' ? C.data : C.risk;
      ctx.fillStyle = rgba(col, z.kind === 'OB' ? 0.1 : 0.14);
      ctx.fillRect(x, y1, W - pad.r - x, Math.max(2, y2 - y1));
      ctx.strokeStyle = rgba(col, 0.55); ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y1 + 0.5, W - pad.r - x - 1, Math.max(1, y2 - y1 - 1));
      ctx.fillStyle = rgba(col, 1); ctx.textAlign = 'left';
      ctx.fillText(`${z.kind} ${z.tf}`, x + 4, (y1 + y2) / 2);
    }
    for (const mk of m.marks || []) {
      const x = X(mk.x), y = Y(mk.price), up = mk.dir === 'BULLISH';
      const col = mk.kind === 'sweep' ? C.data : C.struct;
      ctx.fillStyle = rgba(col, 1);
      ctx.beginPath();
      if (up) { ctx.moveTo(x, y + 6); ctx.lineTo(x - 4, y + 13); ctx.lineTo(x + 4, y + 13); }
      else { ctx.moveTo(x, y - 6); ctx.lineTo(x - 4, y - 13); ctx.lineTo(x + 4, y - 13); }
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.fillText(mk.label, x, Math.min(H - 6, Math.max(10, up ? y + 22 : y - 20)));
    }
    ctx.restore();
  }

  // estimated liquidity
  if (m.lv) {
    const px = ks.at(-1).c;
    line(m.lv.PWH, C.data, A.liquidity * 0.65, [8, 5], `PWH ${fmt(m.lv.PWH)}${px > m.lv.PWH ? ' · pris' : ''}`);
    line(m.lv.PDH, C.data, A.liquidity, [4, 4], `PDH ${fmt(m.lv.PDH)}${px > m.lv.PDH ? ' · pris' : ''}`);
    line(m.lv.PDL, C.data, A.liquidity, [4, 4], `PDL ${fmt(m.lv.PDL)}${px < m.lv.PDL ? ' · pris' : ''}`, true);
    line(m.lv.PWL, C.data, A.liquidity * 0.65, [8, 5], `PWL ${fmt(m.lv.PWL)}${px < m.lv.PWL ? ' · pris' : ''}`, true);
  }
  if (m.piv) {
    line(m.piv.R1, C.ink3, A.piv, [2, 4], `R1 ${fmt(m.piv.R1)}`);
    line(m.piv.P, C.ink3, A.piv, [2, 4], `P ${fmt(m.piv.P)}`);
    line(m.piv.S1, C.ink3, A.piv, [2, 4], `S1 ${fmt(m.piv.S1)}`, true);
  }
  if (m.pos) {
    line(m.pos.avg, C.ink, A.position, [], `Moyenne ${fmt(m.pos.avg)}`);
    line(m.pos.stop, C.risk, A.position, [5, 3], `Stop ${fmt(m.pos.stop)}`, true);
    (m.pos.targets || []).forEach((t, i) => line(t, C.ok, A.position, [5, 3], `TP${i + 1} ${fmt(t)}`));
  }

  // last price tag
  if (reveal >= 1) {
    const last = ks.at(-1).c, y = Math.round(Y(last)) + 0.5;
    ctx.save(); ctx.globalAlpha = A.price;
    ctx.strokeStyle = rgba(C.data, 0.6); ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = rgba(C.data, 1);
    roundRect(ctx, W - pad.r + 2, y - 9, pad.r - 4, 18, 5); ctx.fill();
    ctx.fillStyle = '#070A0F'; ctx.textAlign = 'left'; ctx.fillText(fmt(last), W - pad.r + 7, y);
    ctx.restore();
  }
}

const fmt = x => Math.round(x).toLocaleString('en-US');
function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
