import { useMemo, useRef, useState } from 'react';
import { Num } from '../components/Num.jsx';
import { Freshness } from '../components/Freshness.jsx';
import { useStored } from '../hooks/useStored.js';
import { eur, money, num, pct, dateShort, hhmm } from '../lib/format.js';
import { exportAll, importAll } from '../lib/store.js';
import { checkEntry } from '../../lib/engines/trade.js';

const parse = s => {
  if (s === '' || s == null) return null;
  const v = Number(String(s).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(v) ? v : null;
};
const today = () => new Date().toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2, 10);

const STATUS_COLOR = {
  'NO POSITION': 'var(--none)', 'ENTRY 1': 'var(--data)', 'ENTRY 2': 'var(--data)', 'ENTRY 3': 'var(--data)',
  'FULL POSITION': 'var(--data)', LOSS: 'var(--risk)', 'THESIS INVALIDATED': 'var(--risk)', CLOSED: 'var(--none)',
};

export function Trade({ trade, setTrade, position, tradePrice, eurPerUnit, market, fx }) {
  const cur = trade.product.priceCurrency;
  const [journal, setJournal] = useStored('journal', []);
  const set = patch => setTrade(t => ({ ...t, ...patch }));

  return (
    <>
      <section className="hero hero-compact">
        <div>
          <div className="label">{trade.product.direction === 'SHORT' ? 'Short' : 'Long'} cacao · {trade.product.kind === 'cfd' ? 'CFD / produit à levier' : 'Produit sans levier'}</div>
          <div className="price price-md"><span className="num">€{num(position.capital)}</span><span className="faint thin"> / €{trade.plan.plannedCapital}</span></div>
          <Alloc plan={trade.plan} entries={trade.entries} />
          <div className="chg-row" style={{ marginTop: 12 }}>
            <span className="chip" style={{ color: STATUS_COLOR[position.status] || 'var(--ink-2)' }}>{position.status}</span>
            <span className="fresh">Budget restant €{num(position.remaining)}</span>
          </div>
        </div>
      </section>

      <div className="kv">
        <div><span className="label">Prix moyen</span><b className="num">{money(position.avg, cur, 1)}</b><small>moyenne pondérée par la quantité</small></div>
        <div><span className="label">Prix actuel</span><b>{tradePrice != null ? <Num value={tradePrice} format={x => money(x, cur, 1)} /> : '—'}</b>
          <small>{trade.priceSource === 'manual' ? (trade.manualPrice ? `saisi à ${hhmm(trade.manualPrice.at)}` : 'à saisir') : <Freshness market={market} />}</small></div>
        <div><span className="label">P&amp;L</span><b className={position.pnl > 0 ? 'up' : position.pnl < 0 ? 'down' : ''}>{position.pnl != null ? <Num value={position.pnl} format={x => eur(x, 2, true)} /> : '—'}</b>
          <small>{position.roi != null ? `ROI ${pct(position.roi)}` : eurPerUnit == null && position.entriesCount ? 'taux de change indisponible' : '—'}{position.rMultiple != null ? ` · ${position.rMultiple >= 0 ? '+' : ''}${num(position.rMultiple, 2)} R` : ''}</small></div>
        <div><span className="label">Exposition</span><b className="num">{eur(position.exposure)}</b><small>{num(position.qty, 3)} unités × prix</small></div>
      </div>

      <div className="glass card" style={{ marginTop: 14 }}>
        <div className="row-between"><span className="label">Perte si le stop est touché</span><span className="mono num">{position.lossAtStop != null ? `${eur(position.lossAtStop)} / €${trade.plan.maxLoss}` : '—'}</span></div>
        <div className="risk-meter"><i style={{ width: `${Math.min(100, Math.max(0, (position.lossAtStop || 0) / trade.plan.maxLoss * 100))}%` }} /></div>
        <div className="status-grid">
          <div><span className="label">Technique</span><b className={flagClass(position.flags.technical)}>{position.flags.technical}</b></div>
          <div><span className="label">Risque</span><b className={flagClass(position.flags.risk)}>{position.flags.risk}</b></div>
          <div><span className="label">Stop</span><b className={position.flags.stopDefined ? 'up' : 'down'}>{position.flags.stopDefined ? `${num(position.distToStopPct, 1)} %` : 'AUCUN'}</b></div>
        </div>
      </div>

      <Levels trade={trade} set={set} position={position} cur={cur} />
      <Entries trade={trade} setTrade={setTrade} position={position} eurPerUnit={eurPerUnit} tradePrice={tradePrice} journal={journal} setJournal={setJournal} />
      <Journal journal={journal} setJournal={setJournal} snapshot={() => ({ at: Date.now(), price: tradePrice, cur, pnl: position.pnl, status: position.status, capital: position.capital, avg: position.avg })} />
      <Settings trade={trade} set={set} fx={fx} />
      <DataTools setTrade={setTrade} trade={trade} />
      <p className="foot">Données stockées sur cet appareil uniquement (v0.1). L’app ne passe aucun ordre.</p>
    </>
  );
}

const flagClass = f => (f === 'VALID' || f === 'OK' ? 'up' : f === 'WARNING' ? 'warn' : 'down');

function Alloc({ plan, entries }) {
  return (
    <>
      <div className="alloc" aria-hidden="true" style={{ gridTemplateColumns: plan.split.map(s => `${s}fr`).join(' ') }}>
        {plan.split.map((_, i) => <i key={i} className={entries[i] ? 'on' : ''} />)}
      </div>
      <div className="alloc-lab" style={{ gridTemplateColumns: plan.split.map(s => `${s}fr`).join(' ') }}>
        {plan.split.map((s, i) => <span key={i}>E{i + 1} · €{s}{entries[i] ? ' ✓' : ''}</span>)}
      </div>
    </>
  );
}

function Field({ id, label, value, onChange, placeholder, suffix, type = 'text', inputMode = 'decimal' }) {
  return (
    <label className="field" htmlFor={id}>
      <span className="label">{label}</span>
      <span className="field-in">
        <input id={id} type={type} inputMode={type === 'text' ? inputMode : undefined} value={value ?? ''} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
        {suffix && <span className="suffix">{suffix}</span>}
      </span>
    </label>
  );
}

function Levels({ trade, set, position, cur }) {
  const [stop, setStop] = useState(trade.stop ?? '');
  const [tps, setTps] = useState([trade.targets[0] ?? '', trade.targets[1] ?? '']);
  const sym = { USD: '$', GBP: '£', EUR: '€' }[cur];
  const dirty = parse(stop) !== trade.stop || tps.map(parse).filter(x => x != null).join() !== trade.targets.join();
  const widened = trade.stop != null && parse(stop) != null && (trade.product.direction === 'SHORT' ? parse(stop) > trade.stop : parse(stop) < trade.stop) && position.entriesCount > 0;
  const saveLevels = () => {
    const s = parse(stop);
    const history = [...(trade.stopHistory || [])];
    if (s !== trade.stop) history.push({ at: Date.now(), from: trade.stop, to: s });
    set({ stop: s, targets: tps.map(parse).filter(x => x != null), stopHistory: history });
  };
  return (
    <>
      <div className="section-head"><h2>Invalidation et objectifs</h2><span className="label">{sym} par tonne</span></div>
      <div className="glass card">
        <div className="form-grid">
          <Field id="stop" label="Stop / invalidation" value={stop} onChange={setStop} placeholder="ex. 6900" suffix={sym} />
          <Field id="tp1" label="Objectif 1" value={tps[0]} onChange={v => setTps([v, tps[1]])} placeholder="optionnel" suffix={sym} />
          <Field id="tp2" label="Objectif 2" value={tps[1]} onChange={v => setTps([tps[0], v])} placeholder="optionnel" suffix={sym} />
        </div>
        {widened && <p className="msg warn">Tu éloignes le stop d’une position ouverte. C’est souvent le début d’une martingale : le risque augmente sans nouvelle confirmation.</p>}
        {position.targets?.length > 0 && (
          <ul className="cl">
            {position.targets.map((t, i) => (
              <li key={i}><span className="mk-ok">◎</span><span>TP{i + 1} · {money(t.price, cur)}<small className="cl-sub">distance {pct(t.distPct, 1)}</small></span><span className="pts">{eur(t.rewardEur, 2, true)}{t.rr != null ? ` · ${num(t.rr, 1)}R` : ''}</span></li>
            ))}
          </ul>
        )}
        <button className="btn block" disabled={!dirty} onClick={saveLevels} style={{ marginTop: 12 }}>Enregistrer les niveaux</button>
      </div>
    </>
  );
}

function Entries({ trade, setTrade, position, eurPerUnit, tradePrice, journal, setJournal }) {
  const n = trade.entries.length + 1;
  const planned = trade.plan.split[n - 1];
  const [form, setForm] = useState({ price: '', qty: '', capitalEur: '', feesEur: '', date: today() });
  const [override, setOverride] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const cand = { price: parse(form.price), qty: parse(form.qty), capitalEur: parse(form.capitalEur) ?? planned ?? 0, feesEur: parse(form.feesEur) ?? 0 };
  const filled = cand.price != null && cand.qty != null;
  const check = useMemo(() => filled ? checkEntry({ entries: trade.entries, plan: trade.plan, product: trade.product, stop: trade.stop, eurPerUnit }, cand) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filled, form, trade, eurPerUnit]);
  const cur = trade.product.priceCurrency;

  const add = () => {
    const offRules = !check.ok;
    const entry = { id: uid(), n, ...cand, date: form.date, offRules };
    setTrade(t => ({ ...t, entries: [...t.entries, entry], closed: false }));
    if (offRules) setJournal(j => [{ id: uid(), at: Date.now(), auto: true, text: `Entrée ${n} enregistrée hors règles : ${check.errors.join(' ')}`, snap: { price: tradePrice, status: position.status } }, ...j]);
    setForm({ price: '', qty: '', capitalEur: '', feesEur: '', date: today() });
    setOverride(false);
  };
  const del = id => { setTrade(t => ({ ...t, entries: t.entries.filter(e => e.id !== id).map((e, i) => ({ ...e, n: i + 1 })) })); setConfirmDel(null); };

  return (
    <>
      <div className="section-head"><h2>Entrées</h2><span className="label">Jamais en martingale</span></div>
      <div className="glass card">
        {trade.entries.map(e => (
          <div className="entry done" key={e.id}>
            <div className="entry-n">E{e.n}</div>
            <div>{money(e.price, cur, 1)} · {num(e.qty, 3)} u.<small>{dateShort(Date.parse(e.date))} · €{num(e.capitalEur)}{e.feesEur ? ` · frais €${num(e.feesEur, 2)}` : ''}{e.offRules ? ' · hors règles' : ''}</small></div>
            {confirmDel === e.id
              ? <span className="row-actions"><button className="link down" onClick={() => del(e.id)}>Supprimer</button><button className="link" onClick={() => setConfirmDel(null)}>Annuler</button></span>
              : <button className="link faint" onClick={() => setConfirmDel(e.id)} aria-label={`Supprimer l’entrée ${e.n}`}>Retirer</button>}
          </div>
        ))}
        {n <= 3 ? (
          <div className="add-entry">
            <div className="label" style={{ marginBottom: 10 }}>Enregistrer l’entrée {n} · plan €{planned}</div>
            <div className="form-grid">
              <Field id="e-price" label="Prix d’exécution" value={form.price} onChange={v => setForm({ ...form, price: v })} suffix={{ USD: '$', GBP: '£', EUR: '€' }[cur]} />
              <Field id="e-qty" label="Quantité" value={form.qty} onChange={v => setForm({ ...form, qty: v })} placeholder="ex. 0,04" suffix="u." />
              <Field id="e-cap" label="Capital engagé" value={form.capitalEur} onChange={v => setForm({ ...form, capitalEur: v })} placeholder={String(planned)} suffix="€" />
              <Field id="e-fees" label="Frais" value={form.feesEur} onChange={v => setForm({ ...form, feesEur: v })} placeholder="0" suffix="€" />
              <Field id="e-date" label="Date" type="date" value={form.date} onChange={v => setForm({ ...form, date: v })} />
            </div>
            {check && (
              <div className="checks-box">
                {check.errors.map(t => <p key={t} className="msg bad">✕ {t}</p>)}
                {check.warnings.map(t => <p key={t} className="msg warn">! {t}</p>)}
                {check.notes.map(t => <p key={t} className="msg note">○ {t}</p>)}
                {check.ok && !check.warnings.length && <p className="msg ok">✓ Conforme aux règles de risque.</p>}
              </div>
            )}
            {check && !check.ok && (
              <label className="override" htmlFor="override">
                <input id="override" type="checkbox" checked={override} onChange={e => setOverride(e.target.checked)} />
                <span>Je l’ai quand même passée chez mon courtier. L’entrée sera marquée « hors règles » dans le journal.</span>
              </label>
            )}
            <button className="btn primary block" disabled={!filled || (!check?.ok && !override)} onClick={add}>Enregistrer l’entrée {n}</button>
          </div>
        ) : <p className="empty">Les trois entrées sont utilisées.</p>}
      </div>
    </>
  );
}

const QUESTIONS = [
  ['why', 'Pourquoi suis-je entré ?'],
  ['thesis', 'Quelle était la thèse ?'],
  ['saw', 'Qu’ai-je vu ?'],
  ['market', 'Qu’a fait le marché ?'],
  ['ai', 'Qu’a dit l’IA ?'],
];

function Journal({ journal, setJournal, snapshot }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({});
  const saveNote = () => {
    setJournal(j => [{ id: uid(), at: Date.now(), answers: form, snap: snapshot() }, ...j]);
    setForm({}); setOpen(false);
  };
  const hasText = Object.values(form).some(v => v?.trim());
  return (
    <>
      <div className="section-head"><h2>Journal</h2><span className="label">{journal.length} note{journal.length > 1 ? 's' : ''}</span></div>
      <div className="glass card">
        {!open && <button className="btn block" onClick={() => setOpen(true)}>Nouvelle note</button>}
        {open && (
          <div className="journal-form">
            {QUESTIONS.map(([k, q]) => (
              <label className="field" key={k} htmlFor={`j-${k}`}>
                <span className="label">{q}</span>
                <textarea id={`j-${k}`} rows={2} value={form[k] || ''} onChange={e => setForm({ ...form, [k]: e.target.value })} />
              </label>
            ))}
            <p className="disclaim">Le prix, le P&amp;L et le statut du moment sont joints automatiquement.</p>
            <div className="btn-row"><button className="btn" onClick={() => setOpen(false)}>Annuler</button><button className="btn primary" disabled={!hasText} onClick={saveNote}>Enregistrer</button></div>
          </div>
        )}
        {journal.map(n => (
          <article className="note" key={n.id}>
            <div className="label">{new Date(n.at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}{n.snap?.price != null ? ` · prix ${money(n.snap.price, n.snap.cur || 'USD')}` : ''}{n.snap?.pnl != null ? ` · P&L ${eur(n.snap.pnl, 2, true)}` : ''}{n.snap?.status ? ` · ${n.snap.status}` : ''}</div>
            {n.text && <p>{n.text}</p>}
            {n.answers && QUESTIONS.filter(([k]) => n.answers[k]?.trim()).map(([k, q]) => <p key={k}><span className="faint">{q}</span><br />{n.answers[k]}</p>)}
          </article>
        ))}
      </div>
    </>
  );
}

function Settings({ trade, set, fx }) {
  const [open, setOpen] = useState(!trade.entries.length);
  const [manual, setManual] = useState(trade.manualPrice?.price ?? '');
  const p = trade.product, plan = trade.plan;
  const setP = patch => set({ product: { ...p, ...patch } });
  const setPlan = patch => set({ plan: { ...plan, ...patch } });
  return (
    <>
      <div className="section-head"><h2>Produit et plan</h2><button className="link" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Masquer' : 'Modifier'}</button></div>
      <div className="glass card">
        <p className="empty" style={{ marginTop: 0 }}>
          {p.kind === 'cfd' ? 'CFD' : 'Sans levier'} · {p.direction} · coté en {p.priceCurrency} · 1 point × 1 unité = {p.pointValue} {p.priceCurrency} · prix {trade.priceSource === 'manual' ? 'saisi à la main' : 'New York (auto, différé)'}
        </p>
        {open && (
          <div className="settings">
            <Seg label="Sens" value={p.direction} options={[['LONG', 'Long'], ['SHORT', 'Short']]} onChange={v => setP({ direction: v })} />
            <Seg label="Type de produit" value={p.kind} options={[['cfd', 'CFD / levier'], ['spot', 'Sans levier (ETC…)']]} onChange={v => setP({ kind: v })} />
            <Seg label="Devise de cotation" value={p.priceCurrency} options={[['USD', '$ USD'], ['GBP', '£ GBP'], ['EUR', '€ EUR']]} onChange={v => set({ product: { ...p, priceCurrency: v }, priceSource: v === 'USD' ? trade.priceSource : 'manual' })} />
            <Field id="pv" label="Valeur du point (devise par point et par unité)" value={p.pointValue} onChange={v => setP({ pointValue: parse(v) ?? 1 })} />
            <Seg label="Prix actuel" value={trade.priceSource} options={[['NY_COCOA', 'New York auto'], ['manual', 'Saisi à la main']]} onChange={v => set({ priceSource: v })} disabled={p.priceCurrency !== 'USD' ? ['NY_COCOA'] : []} />
            {trade.priceSource === 'manual' && (
              <div className="form-grid">
                <Field id="manual" label="Prix actuel chez ton courtier" value={manual} onChange={setManual} />
                <button className="btn" onClick={() => set({ manualPrice: parse(manual) == null ? null : { price: parse(manual), at: Date.now() } })}>Mettre à jour</button>
              </div>
            )}
            <div className="form-grid">
              <Field id="budget" label="Budget maximum" value={plan.plannedCapital} onChange={v => setPlan({ plannedCapital: parse(v) ?? 150 })} suffix="€" />
              <Field id="maxloss" label="Perte maximale" value={plan.maxLoss} onChange={v => setPlan({ maxLoss: parse(v) ?? 50 })} suffix="€" />
            </div>
            <p className="disclaim">Taux BCE {fx.data?.date ? `du ${fx.data.date}` : 'indisponible'} : 1 € = {num(fx.data?.raw?.EURUSD, 4)} $ · {num(fx.data?.raw?.EURGBP, 4)} £. Pour un CFD cacao coté par tonne, la valeur du point est en général 1 et la quantité est en tonnes : vérifie la fiche du produit chez ton courtier.</p>
          </div>
        )}
      </div>
    </>
  );
}

function Seg({ label, value, options, onChange, disabled = [] }) {
  return (
    <div className="field">
      <span className="label">{label}</span>
      <div className="seg-ctl">
        {options.map(([v, l]) => <button key={v} aria-pressed={v === value} disabled={disabled.includes(v)} onClick={() => onChange(v)}>{l}</button>)}
      </div>
    </div>
  );
}

function DataTools({ setTrade, trade }) {
  const file = useRef(null);
  const [confirm, setConfirm] = useState(null);
  const [msg, setMsg] = useState('');
  const download = () => {
    const blob = new Blob([JSON.stringify(exportAll(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cocoa-war-room-${today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setMsg('Sauvegarde téléchargée.');
  };
  const upload = async e => {
    const f = e.target.files?.[0]; if (!f) return;
    try { importAll(JSON.parse(await f.text())); setMsg('Sauvegarde restaurée. Rechargement…'); setTimeout(() => location.reload(), 600); }
    catch (err) { setMsg(`Import impossible : ${err.message}`); }
  };
  return (
    <>
      <div className="section-head"><h2>Données</h2><span className="label">Sur cet appareil</span></div>
      <div className="glass card">
        <div className="btn-row">
          <button className="btn" onClick={download}>Exporter</button>
          <button className="btn" onClick={() => file.current.click()}>Importer</button>
          <input ref={file} type="file" accept="application/json" hidden onChange={upload} />
        </div>
        <div className="btn-row" style={{ marginTop: 8 }}>
          {confirm === 'close'
            ? <><button className="btn danger" onClick={() => { setTrade(t => ({ ...t, closed: true })); setConfirm(null); }}>Confirmer la clôture</button><button className="btn" onClick={() => setConfirm(null)}>Annuler</button></>
            : <button className="btn" disabled={!trade.entries.length || trade.closed} onClick={() => setConfirm('close')}>Clôturer la position</button>}
          {confirm === 'reset'
            ? <><button className="btn danger" onClick={() => { setTrade(t => ({ ...t, entries: [], stop: null, targets: [], closed: false, stopHistory: [] })); setConfirm(null); }}>Tout effacer</button><button className="btn" onClick={() => setConfirm(null)}>Annuler</button></>
            : <button className="btn" onClick={() => setConfirm('reset')}>Nouvelle position</button>}
        </div>
        {msg && <p className="disclaim">{msg}</p>}
        <p className="disclaim">« Nouvelle position » efface les entrées, le stop et les objectifs, pas le journal. Exporte d’abord si tu veux garder une trace.</p>
      </div>
    </>
  );
}
