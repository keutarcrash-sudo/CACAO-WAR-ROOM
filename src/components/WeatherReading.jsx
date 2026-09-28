import { useEffect, useMemo, useRef } from 'react';
import { cameraFor, drawWeather } from '../lib/weatherStory.js';
import { useReducedMotion } from '../hooks/useReducedMotion.js';
import { useStoryStep } from '../hooks/useStoryStep.js';
import { num } from '../lib/format.js';

const ORDER = ['CI', 'GH', 'NG', 'CM'];
const KEYS = ['rain', 'normal', 'soil', 'tmax', 'tmaxN', 'sun', 'sunN', 'et0', 'et0N'];
const HOT = 33; // °C: max temperature above which cocoa trees are commonly described as heat-stressed

// Heat over the last 30 observed days: mean max temperature against its normal, and hot days.
export function heatOf(days) {
  const obs = days.filter(d => !d.fc && d.tmax != null).slice(-30);
  if (obs.length < 20) return null;
  const withN = obs.filter(d => d.tmaxN != null);
  const mean = obs.reduce((s, d) => s + d.tmax, 0) / obs.length;
  const anom = withN.length >= 20 ? withN.reduce((s, d) => s + d.tmax - d.tmaxN, 0) / withN.length : null;
  const next = days.filter(d => d.fc && d.tmax != null).slice(0, 14);
  return { mean, anom, hot: obs.filter(d => d.tmax >= HOT).length, hotNext: next.filter(d => d.tmax >= HOT).length, days: obs.length };
}
const p0 = x => (x == null ? '—' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.round(Math.abs(x))} %`);

// Same scroll storytelling as the market reading: the map stays pinned and moves from the whole
// cocoa belt to each country while the text unfolds. Every figure comes from Open-Meteo.
export function WeatherReading({ fund }) {
  const rm = useReducedMotion();
  const w = fund.data?.weather;
  const factors = fund.data?.factors;
  const canvas = useRef(null);
  const steps = useRef([]);
  const stage = useRef(null);
  const S = useRef(null);

  const model = useMemo(() => {
    if (!w?.zones?.length || !w.zones[0].days?.length) return null;
    const meta = w.countryMeta || {};
    const countries = Object.fromEntries(ORDER.filter(c => w.zones.some(z => z.country === c)).map(c => [c, meta[c] || { name: c, weight: 0 }]));
    // aggregated daily series: zones averaged within a country, countries weighted by their share of production
    const series = pick => {
      const zs = w.zones.filter(pick);
      const wt = z => (countries[z.country]?.weight || 0.1) / w.zones.filter(x => x.country === z.country).length;
      return zs[0].days.map((d, i) => {
        const avg = key => {
          let s = 0, n = 0;
          for (const z of zs) { const v = z.days[i]?.[key]; if (v != null) { s += v * wt(z); n += wt(z); } }
          return n ? s / n : null;
        };
        return { date: d.date, fc: d.fc, ...Object.fromEntries(KEYS.map(k => [k, avg(k)])) };
      });
    };
    return {
      zones: w.zones.map(z => ({ ...z, heat: heatOf(z.days) })), countries,
      series: { ALL: series(() => true), ...Object.fromEntries(Object.keys(countries).map(c => [c, series(z => z.country === c)])) },
    };
  }, [w]);

  const STEPS = useMemo(() => (model ? buildSteps(model, w, factors) : []), [model, w, factors]);

  const active = Math.min(useStoryStep(stage, steps, STEPS.length), Math.max(0, STEPS.length - 1));

  useEffect(() => {
    const c = canvas.current;
    const step = STEPS[active];
    if (!c || !model || !step) return undefined;
    let raf = 0;
    const size = () => {
      const dpr = Math.min(2, devicePixelRatio || 1), W = c.clientWidth, H = c.clientHeight;
      if (c.width !== Math.round(W * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
      return { dpr, W, H, mapH: Math.round(H * 0.57) };
    };
    const target = ({ W, mapH }) => ({
      cam: cameraFor(step.cam, W, mapH),
      hl: Object.fromEntries(Object.keys(model.countries).map(k => [k, step.cam === k ? 1 : step.cam === 'ALL' ? 0.35 : 0])),
      zoom: step.cam === 'ALL' ? 0 : 1, fc: step.fc ? 1 : 0, soil: step.soil ? 1 : 0, heat: step.heat ? 1 : 0,
      series: model.series[step.series] || model.series.ALL,
    });
    const first = size();
    if (!S.current) S.current = { ...target(first), series: target(first).series.map(d => ({ ...d, rain: 0 })) };
    const paint = ({ dpr, W, H }) => {
      const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawWeather(ctx, W, H, model, S.current);
    };
    const tick = () => {
      const sz = size(), T = target(sz), s = S.current, k = rm ? 1 : 0.12;
      let moving = false;
      const go = (a, b) => { const d = b - a; if (Math.abs(d) > 1e-3 * Math.max(1, Math.abs(b))) moving = true; return a + d * k; };
      s.cam = { cx: go(s.cam.cx, T.cam.cx), cy: go(s.cam.cy, T.cam.cy), scale: Math.exp(go(Math.log(s.cam.scale), Math.log(T.cam.scale))) };
      for (const id of Object.keys(T.hl)) s.hl[id] = go(s.hl[id] ?? 0, T.hl[id]);
      s.zoom = go(s.zoom, T.zoom); s.fc = go(s.fc, T.fc); s.soil = go(s.soil, T.soil); s.heat = go(s.heat ?? 0, T.heat);
      // bars morph from one series to the next
      s.series = T.series.map((d, i) => {
        const o = s.series[i] || d;
        const mix = key => (d[key] == null ? null : o[key] == null ? d[key] : go(o[key], d[key]));
        return { ...d, ...Object.fromEntries(KEYS.map(k => [k, mix(k)])) };
      });
      paint(sz);
      raf = moving ? requestAnimationFrame(tick) : 0;
    };
    raf = requestAnimationFrame(tick);
    const onResize = () => paint(size());
    addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', onResize); };
  }, [active, model, STEPS, rm]);

  if (!model) return null;
  return (
    <section className="story story-weather" aria-label="Lecture météo">
      <div className="story-stage" ref={stage}>
        <div className="story-head">
          <span className="eyebrow">Lecture météo · zones de production</span>
          <span className="story-count num">{String(active + 1).padStart(2, '0')} / {String(STEPS.length).padStart(2, '0')}</span>
        </div>
        <canvas ref={canvas} className="story-canvas weather-canvas" role="img" aria-label={STEPS[active]?.title} />
        <div className="story-progress" aria-hidden="true">{STEPS.map((s, i) => <i key={s.key} className={i <= active ? 'on' : ''} />)}</div>
      </div>
      <div className="story-steps">
        {STEPS.map((s, i) => (
          <article key={s.key} ref={el => { steps.current[i] = el; }} data-i={i} className={`story-step ${i === active ? 'is-active' : ''}`}>
            <span className="step-n num">{String(i + 1).padStart(2, '0')}</span>
            <h3>{s.title}</h3>
            <p>{s.text}</p>
            {s.foot && <p className="fine">{s.foot}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}

const signC = x => `${x > 0 ? '+' : x < 0 ? '−' : ''}${num(Math.abs(x), 1)} °C`;
function heatLine(h, long = false) {
  if (!h) return '';
  return `${long ? 'Température maximale' : 'Tmax'} moyenne sur 30 jours : ${num(h.mean, 1)} °C${h.anom != null ? ` (${signC(h.anom)} vs normale)` : ''}, ${h.hot} jour${h.hot > 1 ? 's' : ''} à ${HOT} °C ou plus${long ? `, ${h.hotNext} prévu${h.hotNext > 1 ? 's' : ''} sur 14 jours` : ''}.`;
}

function soilTrend(series) {
  const obs = series.filter(d => !d.fc && d.soil != null);
  if (obs.length < 11) return null;
  const now = obs.at(-1).soil, before = obs.at(-11).soil;
  const ch = (now / before - 1) * 100;
  return { now, before, ch, word: Math.abs(ch) < 3 ? 'stable' : ch < 0 ? 'en baisse' : 'en hausse' };
}

function sums(series) {
  const past = series.filter(d => !d.fc), next = series.filter(d => d.fc).slice(0, 14);
  const s = (a, k) => a.reduce((t, d) => t + (d[k] ?? 0), 0);
  const hasN = past.some(d => d.normal != null);
  return { rain30: s(past, 'rain'), normal30: hasN ? s(past, 'normal') : null, rain14: s(next, 'rain'), normal14: hasN ? s(next, 'normal') : null };
}

// General cocoa calendar for Côte d'Ivoire and Ghana: a landmark, not data.
function season(month) {
  if (month <= 2) return 'Janvier–mars : fin de la récolte principale, saison sèche et harmattan. Un déficit de pluie ou un harmattan fort abîme les fleurs et jeunes cabosses de la mi-récolte (avril–septembre).';
  if (month <= 5) return 'Avril–juin : mi-récolte en cours ; les grandes pluies nourrissent la floraison et les cabosses de la future récolte principale.';
  if (month <= 8) return 'Juillet–septembre : petite saison sèche puis retour des pluies ; les pluies de septembre–octobre remplissent les cabosses de la récolte principale, qui démarre le 1er octobre.';
  return 'Octobre–décembre : récolte principale en cours ; la pluie joue sur les dernières cabosses et le séchage, puis la saison sèche et l’harmattan s’installent en décembre.';
}

// the forecast's % vs normal is corrected by the model / ERA5 ratio measured on recent days
function biasText(zones) {
  const b = zones.map(z => z.bias).filter(x => x != null);
  if (!b.length) return ', non recalée sur les observations';
  const r = b.reduce((s, x) => s + x, 0) / b.length;
  return Math.abs(r - 1) < 0.05 ? ', en accord avec les observations récentes' : `, recalée : le modèle a ${r > 1 ? 'surestimé' : 'sous-estimé'} la pluie récente d’environ ${Math.round(Math.abs(r - 1) * 100)} %, l’écart vs normale en tient compte`;
}

function driest(zones) {
  const z = zones.filter(x => x.next14 != null).sort((a, b) => a.next14 - b.next14).slice(0, 2);
  if (!z.length) return '';
  return `${z[0].next14 < 0 ? 'Les plus sèches annoncées' : 'Les moins arrosées annoncées'} : ${z.map(x => `${x.name} ${p0(x.next14)}`).join(', ')}.`;
}

function buildSteps(m, w, factors) {
  const S = [];
  const all = sums(m.series.ALL);
  const wf = factors?.find(f => f.key === 'weather'), ef = factors?.find(f => f.key === 'enso');
  const ranked = m.zones.filter(z => z.past30 != null).sort((a, b) => a.past30 - b.past30);
  const pending = w.pendingNormals ? ` Normales encore en calcul pour ${w.pendingNormals} zone(s) sur ${m.zones.length}.` : '';

  S.push({
    key: 'all', title: 'La ceinture du cacao', cam: 'ALL', series: 'ALL',
    text: wf?.pct != null
      ? `Sur 30 jours, il est tombé ${num(all.rain30)} mm en moyenne pondérée, soit ${p0(wf.pct)} par rapport à la normale ${w.normalYears}.${ranked.length ? ` Zone la ${ranked[0].past30 < 0 ? 'plus sèche' : 'moins arrosée'} : ${ranked[0].name} (${p0(ranked[0].past30)}). La plus humide : ${ranked.at(-1).name} (${p0(ranked.at(-1).past30)}).` : ''}${pending}`
      : `Pluie observée sur 30 jours : ${num(all.rain30)} mm en moyenne pondérée. La comparaison à la normale ${w.normalYears} arrive dès que les normales sont calculées.${pending}`,
    foot: `${w.method === 'era5' ? 'Pluie passée : réanalyse ERA5, la même source que les normales (environ 5 jours de retard ; les derniers jours viennent du modèle). ' : 'Pluie passée : analyse du modèle de prévision, comparée à des normales ERA5 : l’écart peut être en partie un biais de source. '}${m.zones.length} zones suivies. Moyenne pondérée par le poids retenu pour chaque pays (${Object.entries(m.countries).map(([, c]) => `${c.name} ${Math.round(c.weight * 100)} %`).join(', ')}).`,
  });

  for (const [id, c] of Object.entries(m.countries)) {
    const zs = m.zones.filter(z => z.country === id);
    const s = sums(m.series[id]);
    const soil = soilTrend(m.series[id]);
    const cw = w.countries?.[id];
    S.push({
      key: id, title: c.name, cam: id, series: id, soil: !!soil,
      text: [
        cw ? `30 jours : ${num(s.rain30)} mm, ${p0(cw.past30)} vs normale.` : `30 jours : ${num(s.rain30)} mm.`,
        zs.length > 1 ? `Par zone : ${zs.map(z => `${z.name} ${p0(z.past30)}`).join(', ')}.` : '',
        cw?.next14 != null ? `Prévision 14 jours : ${num(s.rain14)} mm, ${p0(cw.next14)} vs normale.` : '',
        heatLine(heatOf(m.series[id])),
        soil ? `Humidité du sol (${w.soil?.depth || '9–27 cm'}) ${soil.word} sur 10 jours : ${num(soil.now, 2)} m³/m³ contre ${num(soil.before, 2)}.` : '',
      ].filter(Boolean).join(' '),
      foot: `Poids dans le score météo : ${Math.round(c.weight * 100)} %${soil ? ' · ligne violette : humidité du sol, tendance seulement (pas de normale à cette profondeur)' : ''}.`,
    });
  }

  S.push({
    key: 'fc', title: 'Les 16 prochains jours', cam: 'ALL', series: 'ALL', fc: true,
    text: w.next14 != null
      ? `Les modèles prévoient ${num(all.rain14)} mm sur 14 jours en moyenne pondérée, soit ${p0(w.next14)} vs normale. ${driest(m.zones)}`
      : `Les modèles prévoient ${num(all.rain14)} mm sur 14 jours en moyenne pondérée.`,
    foot: `Prévision Open-Meteo (modèles numériques)${biasText(m.zones)}. Au-delà de 7 à 10 jours, elle devient peu fiable : les barres s’estompent avec l’échéance.`,
  });

  const hs = heatOf(m.series.ALL);
  const sunObs = m.series.ALL.filter(d => !d.fc && d.sun != null).slice(-30);
  if (hs || sunObs.length >= 20) {
    const sun = sunObs.length >= 20 ? sunObs.reduce((t, d) => t + d.sun, 0) / sunObs.length : null;
    const sunN = sunObs.filter(d => d.sunN != null);
    const sunPct = sunN.length >= 20 ? (sunN.reduce((t, d) => t + d.sun, 0) / sunN.reduce((t, d) => t + d.sunN, 0) - 1) * 100 : null;
    const obs = m.series.ALL.filter(d => !d.fc).slice(-30);
    const et0 = obs.every(d => d.et0 != null) ? obs.reduce((t, d) => t + d.et0, 0) : null;
    const hotZones = m.zones.filter(z => z.heat?.anom != null).sort((a, b) => b.heat.anom - a.heat.anom);
    S.push({
      key: 'heat', title: 'Chaleur et soleil', cam: 'ALL', series: 'ALL', heat: true,
      text: [
        heatLine(hs, true),
        sun != null ? `Ensoleillement : ${num(sun, 1)} h par jour en moyenne${sunPct != null ? `, ${p0(sunPct)} vs normale` : ''}.` : '',
        et0 != null ? `Bilan hydrique 30 jours : ${num(all.rain30)} mm de pluie pour ${num(et0)} mm d’évaporation potentielle, soit ${all.rain30 - et0 >= 0 ? '+' : '−'}${num(Math.abs(all.rain30 - et0))} mm.` : '',
        hotZones.length ? `Zone la plus chaude vs normale : ${hotZones[0].name} (${signC(hotZones[0].heat.anom)}).` : '',
      ].filter(Boolean).join(' '),
      foot: `Les arbres souffrent quand chaleur, soleil fort et air sec se cumulent : le bilan pluie − évaporation dit si le sol se recharge ou s’assèche. Seuil de ${HOT} °C : repère agronomique courant, pas une règle du score. Chaleur et soleil ne sont pas comptés dans le score météo.`,
    });
  }

  const month = Number((w.today || new Date().toISOString()).slice(5, 7)) - 1;
  S.push({
    key: 'season', title: 'Le moment de la saison', cam: 'CI', series: 'CI',
    text: season(month),
    foot: 'Repère agronomique général pour la Côte d’Ivoire et le Ghana, pas une donnée.',
  });
  S.push({
    key: 'impact', title: 'Ce que ça implique', cam: 'ALL', series: 'ALL',
    text: [
      wf?.score != null ? `Score météo : ${wf.score > 0 ? '+' : ''}${wf.score} (${wf.score > 0 ? 'haussier' : wf.score < 0 ? 'baissier' : 'neutre'}).` : 'Score météo indisponible.',
      wf?.note || '',
      ef?.note ? `ENSO : ${ef.note}.` : '',
    ].filter(Boolean).join(' '),
    foot: 'Contre-arguments : beaucoup de pluie n’est pas forcément baissier (pourriture brune), un déficit ne compte que s’il dure, et la météo n’explique qu’une partie de la récolte (maladies, vieillissement des vergers, prix bord champ).',
  });
  return S;
}
