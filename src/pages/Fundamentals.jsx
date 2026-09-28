import { useState } from 'react';
import { Freshness } from '../components/Freshness.jsx';
import { Num } from '../components/Num.jsx';
import { api } from '../lib/api.js';
import { ago, dateShort, num } from '../lib/format.js';

export const BIAS = {
  BULLISH: { label: 'Bullish', cls: 'up' },
  NEUTRAL: { label: 'Neutre', cls: 'warn' },
  BEARISH: { label: 'Bearish', cls: 'down' },
  INSUFFICIENT: { label: 'Données insuffisantes', cls: 'faint' },
};
const FRESH = { ok: ['ok', 'Frais'], stale: ['stale', 'Ancien · compte pour moitié'], na: ['na', 'Indisponible'] };
const REGION = { CI: 'Côte d’Ivoire', GH: 'Ghana', NG: 'Nigeria', CM: 'Cameroun', WORLD: 'Monde (ICCO)', ICE_US: 'ICE New York', ICE_EU: 'ICE Londres', EU: 'Europe (ECA)', NA: 'Amérique du Nord (NCA)', ASIA: 'Asie (CAA)' };
const sign = x => (x > 0 ? `+${x}` : `${x}`);
const pct = x => (x == null ? '—' : `${x > 0 ? '+' : ''}${num(x, 0)} %`);

export function Fundamentals({ fund }) {
  const [open, setOpen] = useState(null);
  const [form, setForm] = useState(null);
  const d = fund.data;
  if (!d) return <p className="empty center">{fund.error ? `Fondamentaux indisponibles : ${fund.error.message}` : 'Chargement des fondamentaux…'}</p>;
  const b = BIAS[d.score.bias];

  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">Biais fondamental</p>
        <div className="fund-head">
          <span className={`bias-num num ${b.cls}`}>{d.score.total == null ? '—' : <Num value={d.score.total} format={x => sign(Math.round(x))} />}</span>
          <span>
            <span className={`bias-chip ${b.cls}`}>{b.label}</span>
            <small className="meta">{d.score.coverage} / {d.score.of} facteurs · échelle −10 à +10</small>
          </span>
        </div>
        <p className="lead">Chaque facteur est noté de −2 à +2 par une règle écrite. Un facteur sans donnée n’est jamais compté ; une donnée ancienne compte pour moitié.</p>
      </section>

      <ul className="rows factors">
        {d.factors.map(f => {
          const [fk, fl] = FRESH[f.fresh] || FRESH.na;
          const isOpen = open === f.key;
          return (
            <li key={f.key} className={`factor ${f.score == null ? 'is-off' : ''}`}>
              <button className="factor-btn" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : f.key)}>
                <span className="row-main">{f.name}<small><i className={`dot fresh-${fk}`} aria-hidden="true" /> {f.score == null ? f.value : fl}{f.estimate ? ' · estimation' : ''}</small></span>
                <span className="divbar" aria-hidden="true">{f.score != null && <i className={f.score >= 0 ? 'pos' : 'neg'} style={{ width: `${Math.abs(f.score) * 25}%` }} />}</span>
                <span className={`row-side ${f.score > 0 ? 'up' : f.score < 0 ? 'down' : ''}`}>{f.score == null ? 'N/D' : sign(f.score)}</span>
              </button>
              {isOpen && (
                <div className="factor-body swap-in">
                  <dl className="facts facts-1">
                    <div><dt>Donnée</dt><dd>{f.value}</dd></div>
                    {f.prev && <div><dt>Contexte</dt><dd>{f.prev}</dd></div>}
                    {f.note && <div><dt>Lecture</dt><dd>{f.note}</dd></div>}
                    <div><dt>Règle</dt><dd>{f.rule}</dd></div>
                    <div><dt>Source</dt><dd>{f.source || '—'}{f.at ? ` · ${ago(f.at)}` : ''}</dd></div>
                  </dl>
                  {f.manual && <button className="btn" onClick={() => setForm({ metric: f.key })}>Saisir une donnée</button>}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <Weather w={d.weather} />
      <Enso e={d.enso} />
      <Cot c={d.cot} />
      <Manual d={d} fund={fund} form={form} setForm={setForm} />
      <p className="foot">Sources : Open-Meteo, NOAA CPC, CFTC, et tes saisies avec leur source. Aucune valeur estimée n’est présentée comme une donnée.</p>
    </>
  );
}

function SourceState({ s }) {
  if (!s) return null;
  if (s.status === 'OK') return <Freshness info={{ key: 'ok', label: `À jour · ${ago(s.fetchedAt)}` }} />;
  if (s.status === 'STALE') return <Freshness info={{ key: 'stale', label: `Source muette · dernière donnée ${ago(s.fetchedAt)}` }} />;
  return <Freshness info={{ key: 'offline', label: 'Source hors ligne' }} />;
}

function Weather({ w }) {
  const max = 60;
  return (
    <section>
      <header className="section-head"><h2>Pluie sur 30 jours</h2><span className="meta">vs normale {w?.normalYears || ''}</span></header>
      <SourceState s={w} />
      {w?.pendingNormals > 0 && <p className="fine">Calcul des normales en cours : {w.pendingNormals} zone{w.pendingNormals > 1 ? 's' : ''} restante{w.pendingNormals > 1 ? 's' : ''}, complété à chaque ouverture.</p>}
      {!w?.zones ? <p className="empty">Météo indisponible.</p> : (
        <ul className="rows zones">
          {w.zones.map(z => (
            <li key={z.id}>
              <span className="row-main">{z.name}<small>{z.country} · {num(z.rain30, 0)} mm · prévision 14 j {pct(z.next14)}</small></span>
              <span className="anom" aria-hidden="true">{z.past30 != null && <i className={z.past30 < 0 ? 'dry' : 'wet'} style={{ width: `${Math.min(50, (Math.abs(z.past30) / max) * 50)}%` }} />}</span>
              <span className={`row-side ${z.past30 < -15 ? 'warn' : ''}`}>{z.normalReady ? pct(z.past30) : '…'}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="fine">Déficit de pluie = conditions défavorables aux cacaoyers = impact potentiellement haussier. Excès de pluie : risque de pourriture brune, effet ambigu.</p>
    </section>
  );
}

function Spark({ values }) {
  if (!values?.length) return null;
  const lo = Math.min(...values, 0), hi = Math.max(...values, 0), span = hi - lo || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1 || 1)) * 100},${30 - ((v - lo) / span) * 28}`).join(' ');
  const zero = 30 - ((0 - lo) / span) * 28;
  return (
    <svg className="mini-spark" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" x2="100" y1={zero} y2={zero} className="zero" />
      <polyline points={pts} fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Enso({ e }) {
  return (
    <section>
      <header className="section-head"><h2>ENSO</h2><span className="meta">NOAA CPC</span></header>
      <SourceState s={e} />
      {!e?.oni ? <p className="empty">ENSO indisponible.</p> : (
        <div className="stat-block">
          <p className="stat-big">{e.label}</p>
          <p className="muted">ONI {e.oni.season} {e.oni.year} : {e.oni.anom > 0 ? '+' : ''}{num(e.oni.anom, 2)} °C · Niño 3.4 hebdo {e.weekly?.nino34 > 0 ? '+' : ''}{num(e.weekly?.nino34, 1)} °C ({e.weekly?.trend4w >= 0 ? '↑' : '↓'} {num(Math.abs(e.weekly?.trend4w ?? 0), 1)} sur 4 semaines)</p>
          <Spark values={e.weeklyRecent?.map(r => r.nino34)} />
          <p className="fine">Phase lue sur l’ONI avec les seuils NOAA (±0,5 °C). Compté dans le score uniquement si l’effet se voit dans la pluie réelle des zones productrices.</p>
        </div>
      )}
    </section>
  );
}

function Cot({ c }) {
  return (
    <section>
      <header className="section-head"><h2>Positioning</h2><span className="meta">CFTC · cacao New York</span></header>
      <SourceState s={c} />
      {c?.mmNet == null ? <p className="empty">Positioning indisponible.</p> : (
        <div className="stat-block">
          <p className="stat-big num">{c.mmNet > 0 ? '+' : ''}{c.mmNet.toLocaleString('fr-FR')} <small className="faint">contrats nets · fonds</small></p>
          <p className="muted">{c.change1w >= 0 ? '+' : ''}{c.change1w.toLocaleString('fr-FR')} sur 1 semaine · {c.change4w >= 0 ? '+' : ''}{c.change4w.toLocaleString('fr-FR')} sur 4 semaines · données du {c.date}</p>
          <div className="pct-gauge" aria-label={`Percentile ${c.percentile} %`}>
            <span className="zone-lo" /><span className="zone-hi" />
            <i style={{ left: `${c.percentile}%` }} />
          </div>
          <div className="pct-legend"><span>très short</span><span>percentile {c.percentile} % sur {Math.round(c.weeks / 52)} ans</span><span>très long</span></div>
          <Spark values={c.recent?.map(r => r.net)} />
          <p className="fine">Un positionnement extrême peut créer un short squeeze (fonds très vendeurs) ou un long squeeze (fonds très acheteurs). Publication chaque vendredi, données du mardi.</p>
        </div>
      )}
    </section>
  );
}

function Manual({ d, fund, form, setForm }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [confirmDel, setConfirmDel] = useState(null);
  const f = form || { metric: 'production' };
  const def = d.manual[f.metric];
  const set = patch => setForm({ ...f, ...patch });
  const parse = s => (s === '' || s == null ? null : Number(String(s).replace(/\s/g, '').replace(',', '.')));
  const value = parse(f.value), previous = parse(f.previous);
  const change = value > 0 && previous > 0 ? (value / previous - 1) * 100 : null;
  const submit = async () => {
    setBusy(true); setErr('');
    try {
      const r = await api.addFundamental({ metric: f.metric, region: f.region || def.regions[0], value, previous, period: f.period, date: f.date, source: f.source, sourceUrl: f.sourceUrl, isEstimate: !!f.isEstimate });
      fund.set(r); setForm({ metric: f.metric });
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const del = async id => { try { fund.set(await api.deleteFundamental(id)); } catch (e) { setErr(e.message); } setConfirmDel(null); };

  return (
    <section>
      <header className="section-head"><h2>Saisir une donnée</h2><span className="meta">production, arrivages, stocks, grindings</span></header>
      <p className="empty">Ces chiffres n’ont pas d’API publique fiable. Tu les recopies depuis leur source (ICCO, COCOBOD, ICE, ECA…) : l’app calcule la variation et la note.</p>
      <div className="glass surface-2 add-entry">
        <div className="seg">
          {Object.entries(d.manual).map(([k, m]) => <button key={k} aria-pressed={k === f.metric} onClick={() => setForm({ metric: k })}>{m.name.split(' ')[0]}</button>)}
        </div>
        <div className="seg">
          {def.regions.map(r => <button key={r} aria-pressed={(f.region || def.regions[0]) === r} onClick={() => set({ region: r })}>{REGION[r].split(' (')[0]}</button>)}
        </div>
        <div className="form-grid">
          <label className="field" htmlFor="m-v"><span className="field-label">{def.labels.value}</span><span className="field-in"><input id="m-v" inputMode="decimal" value={f.value ?? ''} onChange={e => set({ value: e.target.value })} /><span className="suffix">{def.unit}</span></span></label>
          <label className="field" htmlFor="m-p"><span className="field-label">{def.labels.previous}</span><span className="field-in"><input id="m-p" inputMode="decimal" value={f.previous ?? ''} onChange={e => set({ previous: e.target.value })} /><span className="suffix">{def.unit}</span></span></label>
          <label className="field" htmlFor="m-per"><span className="field-label">Période</span><input id="m-per" value={f.period ?? ''} placeholder="ex. 2025/26 ou T3 2026" onChange={e => set({ period: e.target.value })} /></label>
          <label className="field" htmlFor="m-d"><span className="field-label">Date de publication</span><input id="m-d" type="date" value={f.date ?? ''} onChange={e => set({ date: e.target.value })} /></label>
          <label className="field" htmlFor="m-s"><span className="field-label">Source</span><input id="m-s" value={f.source ?? ''} placeholder="ex. COCOBOD, Reuters" onChange={e => set({ source: e.target.value })} /></label>
          <label className="field" htmlFor="m-u"><span className="field-label">Lien (optionnel)</span><input id="m-u" inputMode="url" value={f.sourceUrl ?? ''} placeholder="https://…" onChange={e => set({ sourceUrl: e.target.value })} /></label>
        </div>
        <label className="override" htmlFor="m-est"><input id="m-est" type="checkbox" checked={!!f.isEstimate} onChange={e => set({ isEstimate: e.target.checked })} /><span>C’est une estimation (analyste, exportateurs), pas un chiffre officiel.</span></label>
        {change != null && <p className="msg note">Variation {change > 0 ? '+' : ''}{num(change, 1)} % · règle : {def.rule}</p>}
        {err && <p className="msg bad">{err}</p>}
        <button className="btn primary" disabled={busy || !(value > 0) || !(previous > 0) || !f.source?.trim()} onClick={submit}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
      </div>
      {d.entries.length > 0 && (
        <ul className="rows">
          {d.entries.slice(0, 20).map(e => (
            <li key={e.id}>
              <span className="row-main">{d.manual[e.metric]?.name} · {REGION[e.region] || e.region}<small>{num(e.value)} vs {num(e.previous)} · {e.period ? `${e.period} · ` : ''}{dateShort(e.dataTime)} · {e.source}{e.isEstimate ? ' · estimation' : ''}</small></span>
              {confirmDel === e.id
                ? <span className="row-actions"><button className="link down" onClick={() => del(e.id)}>Supprimer</button><button className="link" onClick={() => setConfirmDel(null)}>Annuler</button></span>
                : <button className="link faint" onClick={() => setConfirmDel(e.id)}>Retirer</button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
