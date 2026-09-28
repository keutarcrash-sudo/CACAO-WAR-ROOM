// Canvas renderer for the weather reading: a schematic map of the cocoa belt on top (camera moves from
// the whole region to one country), the daily rain against its 2001-2020 normal underneath.
// Country shapes: Natural Earth 1:50m via world-atlas (public domain), clipped to West Africa.
import GEO from './westAfrica.json';

const C = { ink: '230,233,238', ink3: '109,119,134', ink4: '58,67,81', data: '98,198,222', dry: '216,160,76', dryX: '229,120,74', calm: '138,147,161', struct: '156,143,245' };
const rgba = (c, a) => `rgba(${c},${a})`;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// Rain anomaly (%) -> colour: amber when dry, cyan when wet, grey when close to normal.
// Neither colour means "bullish" or "bearish": the reading text says what it implies.
export function anomalyColor(p) {
  if (p == null) return C.calm;
  if (Math.abs(p) < 10) return C.calm;
  return p < 0 ? (p < -30 ? C.dryX : C.dry) : C.data;
}

// Max temperature anomaly (°C) -> colour: orange when hotter than normal, cyan when cooler.
export function heatColor(a) {
  if (a == null || Math.abs(a) < 0.4) return C.calm;
  return a > 0 ? (a > 1.5 ? C.dryX : C.dry) : C.data;
}

const bboxOf = rings => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rings) for (let i = 0; i < r.length; i += 2) { x0 = Math.min(x0, r[i]); x1 = Math.max(x1, r[i]); y0 = Math.min(y0, r[i + 1]); y1 = Math.max(y1, r[i + 1]); }
  return [x0, y0, x1, y1];
};
const COUNTRY_BOX = Object.fromEntries(GEO.countries.filter(c => c.id).map(c => [c.id, bboxOf(c.rings)]));
COUNTRY_BOX.ALL = [-9, 1.6, 16.2, 11.2];

// Camera that frames a country (or the whole belt) inside a W x H area.
export function cameraFor(id, W, H) {
  const [x0, y0, x1, y1] = COUNTRY_BOX[id] || COUNTRY_BOX.ALL;
  const pad = id === 'ALL' ? 1.02 : 1.35;
  const scale = Math.min(W / ((x1 - x0) * pad), H / ((y1 - y0) * pad));
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, scale };
}

export function drawWeather(ctx, W, H, m, S) {
  ctx.clearRect(0, 0, W, H);
  if (!m) return;
  const mapH = Math.round(H * 0.57), chartTop = mapH + 14;
  drawMap(ctx, W, mapH, m, S);
  drawChart(ctx, 0, chartTop, W, H - chartTop, m, S);
}

function drawMap(ctx, W, H, m, S) {
  const cam = S.cam;
  const P = (lon, lat) => [W / 2 + (lon - cam.cx) * cam.scale, H / 2 - (lat - cam.cy) * cam.scale];
  ctx.save();
  ctx.beginPath(); roundRect(ctx, 0, 0, W, H, 16); ctx.clip();
  // sea
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(14,22,34,1)'); g.addColorStop(1, 'rgba(9,24,36,1)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // graticule: equator and every 5 degrees, very faint
  ctx.strokeStyle = rgba(C.ink3, 0.08); ctx.lineWidth = 1;
  for (let lat = 0; lat <= 15; lat += 5) { const [, y] = P(0, lat); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  for (let lon = -15; lon <= 20; lon += 5) { const [x] = P(lon, 0); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }

  // land
  for (const c of GEO.countries) {
    const hl = c.id ? S.hl[c.id] ?? 0 : 0;
    const producer = !!c.id;
    ctx.beginPath();
    for (const r of c.rings) {
      for (let i = 0; i < r.length; i += 2) { const [x, y] = P(r[i], r[i + 1]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.closePath();
    }
    ctx.fillStyle = producer ? `rgba(${lerpRgb('30,40,54', '44,62,80', hl)},1)` : 'rgba(22,30,41,1)';
    ctx.fill();
    ctx.strokeStyle = producer ? rgba(C.data, 0.12 + 0.5 * hl) : rgba(C.ink3, 0.18);
    ctx.lineWidth = producer ? 1 + hl * 0.6 : 0.7;
    ctx.stroke();
  }

  // country names on the overview
  ctx.font = '500 10px "Geist Variable", system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const [id, meta] of Object.entries(m.countries)) {
    const a = clamp(1 - S.zoom, 0, 1) * 0.75 + (S.hl[id] ?? 0) * 0.25;
    if (a < 0.03) continue;
    const [x0, y0, x1, y1] = COUNTRY_BOX[id];
    const [x, y] = P((x0 + x1) / 2, y1 - (y1 - y0) * 0.22);
    ctx.fillStyle = rgba(C.ink, 0.55 * a);
    ctx.fillText(meta.name.toUpperCase(), x, y);
  }

  // zones: size and colour from the rain anomaly (observed 30 d, or forecast 14 d)
  for (const z of m.zones) {
    const p = z.past30 == null && z.next14 == null ? null : lerpNull(z.past30, z.next14, S.fc);
    const [x, y] = P(z.lon, z.lat);
    const focus = S.hl[z.country] ?? 0;
    const heat = S.heat > 0.5, ha = z.heat?.anom ?? null;
    const r = 3.5 + (heat ? clamp(Math.abs(ha ?? 0) * 3, 0, 6) : clamp(Math.abs(p ?? 0) / 12, 0, 6)) + focus * 1.5;
    const col = heat ? heatColor(ha) : anomalyColor(p);
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2);
    glow.addColorStop(0, rgba(col, 0.45)); glow.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, r * 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = rgba(col, 0.95); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(6,9,16,.8)'; ctx.lineWidth = 1; ctx.stroke();
    // names only once zoomed on the country: on the overview they would pile up
    const la = clamp((focus * S.zoom - 0.4) / 0.6, 0, 1);
    if (la > 0.02) {
      const left = x > W - 110;
      const tx = left ? x - r - 6 : x + r + 6;
      ctx.globalAlpha = la;
      ctx.font = '500 11px "Geist Variable", system-ui, sans-serif'; ctx.textAlign = left ? 'right' : 'left';
      ctx.fillStyle = rgba(C.ink, 0.9); ctx.fillText(z.name, tx, y - 6);
      ctx.font = '11px "Geist Mono Variable", ui-monospace, monospace';
      ctx.fillStyle = rgba(col, 1); ctx.fillText(p == null ? 'normale en calcul' : `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.round(Math.abs(p))} %`, tx, y + 8);
      ctx.globalAlpha = 1;
    }
  }

  // legend
  ctx.font = '10px "Geist Mono Variable", ui-monospace, monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const lx = 12, ly = H - 16, lw = 64;
  const lg = ctx.createLinearGradient(lx, 0, lx + lw, 0);
  lg.addColorStop(0, rgba(C.dryX, 1)); lg.addColorStop(0.5, rgba(C.calm, 1)); lg.addColorStop(1, rgba(C.data, 1));
  ctx.fillStyle = lg; ctx.fillRect(lx, ly - 2, lw, 4);
  ctx.fillStyle = rgba(C.ink3, 1);
  if (S.heat > 0.5) {
    const hg = ctx.createLinearGradient(lx, 0, lx + lw, 0);
    hg.addColorStop(0, rgba(C.data, 1)); hg.addColorStop(0.5, rgba(C.calm, 1)); hg.addColorStop(1, rgba(C.dryX, 1));
    ctx.fillStyle = hg; ctx.fillRect(lx, ly - 2, lw, 4); ctx.fillStyle = rgba(C.ink3, 1);
  }
  ctx.fillText(S.heat > 0.5 ? 'frais · Tmax 30 j vs normale · chaud' : S.fc > 0.5 ? 'sec · prévision 14 j · humide' : 'sec · pluie 30 j vs normale · humide', lx + lw + 8, ly);
  ctx.restore();
}

function drawChart(ctx, X0, Y0, W, H, m, S) {
  const d = S.series;
  if (!d?.length) return;
  const h = S.heat || 0;
  if (h < 0.99) { ctx.save(); ctx.globalAlpha = 1 - h; drawRain(ctx, X0, Y0, W, H, d, S); ctx.restore(); }
  if (h > 0.01) { ctx.save(); ctx.globalAlpha = h; drawHeat(ctx, X0, Y0, W, H, d); ctx.restore(); }
}

// Sunshine hours as bars against their normal, max temperature as a line with the heat-stress landmark.
function drawHeat(ctx, X0, Y0, W, H, d) {
  const pad = { l: 4, r: 40, t: 16, b: 16 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b, step = iw / d.length;
  const X = i => X0 + pad.l + i * step + step / 2;
  const firstFc = d.findIndex(x => x.fc);
  ctx.font = '10px "Geist Mono Variable", ui-monospace, monospace'; ctx.textBaseline = 'middle';
  const sunMax = Math.max(8, ...d.map(k => Math.max(k.sun ?? 0, k.sunN ?? 0))) * 1.15;
  const SY = v => Y0 + pad.t + ih - (v / sunMax) * ih;
  for (let i = 0; i < d.length; i++) {
    const k = d[i];
    if (k.sun == null) continue;
    const a = k.fc ? 0.45 * (1 - (i - firstFc) / 22) : 0.75;
    const bw = Math.max(1.5, step * 0.62), y = SY(k.sun);
    ctx.fillStyle = rgba(C.dry, clamp(a, 0.08, 1)); ctx.fillRect(X(i) - bw / 2, y, bw, SY(0) - y);
  }
  dashed(ctx, d.map((k, i) => (k.sunN == null ? null : [X(i), SY(k.sunN)])), rgba(C.ink, 0.5));
  ctx.fillStyle = rgba(C.dry, 1); ctx.textAlign = 'left';
  ctx.fillText(`${Math.round(sunMax / 2)} h`, X0 + W - pad.r + 6, SY(sunMax / 2));
  // temperature on its own scale
  const tv = d.flatMap(k => [k.tmax, k.tmaxN]).filter(v => v != null);
  if (tv.length > 5) {
    const lo = Math.min(...tv, 28) - 0.5, hi = Math.max(...tv, 34) + 0.5;
    const TY = v => Y0 + pad.t + (1 - (v - lo) / (hi - lo)) * ih * 0.7;
    const y33 = Math.round(TY(33)) + 0.5;
    ctx.strokeStyle = rgba(C.dryX, 0.45); ctx.setLineDash([2, 4]);
    ctx.beginPath(); ctx.moveTo(X0 + pad.l, y33); ctx.lineTo(X0 + W - pad.r, y33); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = rgba(C.dryX, 0.9); ctx.textAlign = 'left'; ctx.fillText('33 °C', X0 + W - pad.r + 6, y33);
    dashed(ctx, d.map((k, i) => (k.tmaxN == null ? null : [X(i), TY(k.tmaxN)])), rgba(C.dryX, 0.4));
    ctx.strokeStyle = rgba(C.dryX, 0.95); ctx.lineWidth = 1.8; ctx.beginPath();
    let started = false;
    d.forEach((k, i) => { if (k.tmax == null) { started = false; return; } if (started) ctx.lineTo(X(i), TY(k.tmax)); else { ctx.moveTo(X(i), TY(k.tmax)); started = true; } });
    ctx.stroke(); ctx.lineWidth = 1;
  }
  if (firstFc > 0) {
    const x = Math.round(X0 + pad.l + firstFc * step) + 0.5;
    ctx.strokeStyle = rgba(C.ink, 0.35); ctx.beginPath(); ctx.moveTo(x, Y0 + 4); ctx.lineTo(x, Y0 + H - pad.b); ctx.stroke();
  }
  ctx.fillStyle = rgba(C.ink3, 1); ctx.textAlign = 'left';
  ctx.fillText('ligne : Tmax · barres : soleil (h) · — — normales', X0 + pad.l, Y0 + H - 4);
}

function dashed(ctx, pts, color) {
  if (!pts.some(Boolean)) return;
  ctx.strokeStyle = color; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.2;
  ctx.beginPath(); let started = false;
  for (const p of pts) { if (!p) { started = false; continue; } if (started) ctx.lineTo(p[0], p[1]); else { ctx.moveTo(p[0], p[1]); started = true; } }
  ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
}

function drawRain(ctx, X0, Y0, W, H, d, S) {
  const pad = { l: 4, r: 40, t: 16, b: 16 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b, step = iw / d.length;
  const max = Math.max(8, ...d.map(x => Math.max(x.rain ?? 0, x.normal ?? 0))) * 1.1;
  const X = i => X0 + pad.l + i * step + step / 2;
  const Y = v => Y0 + pad.t + ih - (v / max) * ih;
  ctx.font = '10px "Geist Mono Variable", ui-monospace, monospace'; ctx.textBaseline = 'middle';

  // scale
  for (const v of [0, max / 2]) {
    const y = Math.round(Y(v)) + 0.5;
    ctx.strokeStyle = rgba(C.ink3, 0.12); ctx.beginPath(); ctx.moveTo(X0 + pad.l, y); ctx.lineTo(X0 + W - pad.r, y); ctx.stroke();
    ctx.fillStyle = rgba(C.ink3, 0.9); ctx.textAlign = 'left'; ctx.fillText(`${Math.round(v)} mm`, X0 + W - pad.r + 6, y);
  }

  // bars: observed solid, forecast fading with lead time (a 16-day forecast is much less reliable than day 1)
  const firstFc = d.findIndex(x => x.fc);
  for (let i = 0; i < d.length; i++) {
    const k = d[i];
    if (k.rain == null) continue;
    const lead = k.fc ? i - firstFc : -1;
    const a = k.fc ? (0.25 + 0.6 * S.fc) * (1 - lead / 22) : 0.85 - 0.5 * S.fc;
    const bw = Math.max(1.5, step * 0.62), y = Y(k.rain);
    ctx.fillStyle = rgba(C.data, clamp(a, 0.08, 1));
    ctx.fillRect(X(i) - bw / 2, y, bw, Y(0) - y);
  }

  // normal as a smooth dashed line
  const pts = d.map((k, i) => (k.normal == null ? null : [X(i), Y(k.normal)]));
  if (pts.some(Boolean)) {
    ctx.strokeStyle = rgba(C.ink, 0.55); ctx.setLineDash([4, 3]); ctx.lineWidth = 1.2;
    ctx.beginPath(); let started = false;
    for (const p of pts) { if (!p) { started = false; continue; } if (started) ctx.lineTo(p[0], p[1]); else { ctx.moveTo(p[0], p[1]); started = true; } }
    ctx.stroke(); ctx.setLineDash([]);
  }

  // soil moisture (own scale, trend only)
  if (S.soil > 0.02) {
    const sv = d.map(k => k.soil).filter(v => v != null);
    if (sv.length > 5) {
      const lo = Math.min(...sv), hi = Math.max(...sv), span = hi - lo || 0.01;
      const SY = v => Y0 + pad.t + ih * 0.1 + (1 - (v - lo) / span) * ih * 0.5;
      ctx.save(); ctx.globalAlpha = S.soil; ctx.strokeStyle = rgba(C.struct, 0.95); ctx.lineWidth = 1.6;
      ctx.beginPath(); let started = false;
      d.forEach((k, i) => { if (k.soil == null) { started = false; return; } if (started) ctx.lineTo(X(i), SY(k.soil)); else { ctx.moveTo(X(i), SY(k.soil)); started = true; } });
      ctx.stroke();
      ctx.fillStyle = rgba(C.struct, 1); ctx.textAlign = 'left';
      ctx.fillText('sol', X0 + pad.l + 2, SY(sv[0]) - 9);
      ctx.restore();
    }
  }

  // today
  if (firstFc > 0) {
    const x = Math.round(X0 + pad.l + firstFc * step) + 0.5;
    ctx.strokeStyle = rgba(C.ink, 0.35); ctx.beginPath(); ctx.moveTo(x, Y0 + 4); ctx.lineTo(x, Y0 + H - pad.b); ctx.stroke();
    ctx.fillStyle = rgba(C.ink3, 1); ctx.textAlign = 'right'; ctx.fillText('observé', x - 6, Y0 + 6);
    ctx.textAlign = 'left'; ctx.fillText('prévision', x + 6, Y0 + 6);
  }
  ctx.fillStyle = rgba(C.ink3, 1); ctx.textAlign = 'left';
  ctx.fillText('— — normale 2001–2020', X0 + pad.l, Y0 + H - 4);
}

const lerpNull = (a, b, t) => (a == null ? b : b == null ? a : a + (b - a) * t);
function lerpRgb(a, b, t) {
  const A = a.split(',').map(Number), B = b.split(',').map(Number);
  return A.map((x, i) => Math.round(x + (B[i] - x) * clamp(t, 0, 1))).join(',');
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
