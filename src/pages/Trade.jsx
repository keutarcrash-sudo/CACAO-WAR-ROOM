import { useMemo, useState } from 'react';
import { Num } from '../components/Num.jsx';
import { Freshness } from '../components/Freshness.jsx';
import { usePolling } from '../hooks/usePolling.js';
import { api } from '../lib/api.js';
import { eur, money, num, pct, dateShort, hhmm } from '../lib/format.js';
import { checkEntry, maxQuantity, isTurbo, turboValue, underlyingForTurboPrice } from '../../lib/engines/trade.js';
import { atr } from '../../lib/engines/technical.js';
import { SetupHistory } from '../components/SetupHistory.jsx';

const parse = s => {
  if (s === '' || s == null) return null;
  const v = Number(String(s).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(v) ? v : null;
};
const today = () => new Date().toISOString().slice(0, 10);
const SYM = { USD: '$', GBP: '£', EUR: '€' };
const KIND = { cfd: 'CFD / levier', spot: 'sans levier', turbo: 'Turbo' };
const flagClass = f => (f === 'VALID' || f === 'OK' ? 'up' : f === 'WARNING' ? 'warn' : 'down');

// Runs a server action and exposes its pending state and error message.
function useAction(mutate) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (action, payload) => {
    setBusy(true); setError('');
    try { return await mutate(action, payload); } catch (e) { setError(e.message); throw e; } finally { setBusy(false); }
  };
  return { run, busy, error, setError };
}

export function Trade({ trade, mutate, position, tradePrice, eurPerUnit, market, fx, pulse }) {
  const cur = trade.product.priceCurrency;
  return (
    <>
      <section className="glass surface-3 position-card trade-hero">
        <p className="eyebrow">{trade.product.direction === 'SHORT' ? 'Short' : 'Long'} cacao · {KIND[trade.product.kind]}{isTurbo(trade.product) ? ` ${trade.product.direction === 'SHORT' ? 'Put' : 'Call'} ${num(trade.product.strike)} $` : ''}</p>
        <div className="pos-top">
          <span className="pos-cap num">€{num(position.capital)}<span className="faint"> / €{trade.plan.plannedCapital}</span></span>
          <span className={`pos-pnl num ${position.pnl > 0 ? 'up' : position.pnl < 0 ? 'down' : 'faint'}`}>{position.pnl != null ? <Num value={position.pnl} format={x => eur(x, 2, true)} /> : '—'}</span>
        </div>
        <div className="alloc" style={{ gridTemplateColumns: trade.plan.split.map(s => `${s}fr`).join(' ') }} aria-hidden="true">
          {trade.plan.split.map((_, i) => <i key={i} className={trade.entries[i] ? 'on' : ''} />)}
        </div>
        <div className="alloc-lab" style={{ gridTemplateColumns: trade.plan.split.map(s => `${s}fr`).join(' ') }}>
          {trade.plan.split.map((s, i) => <span key={i}>E{i + 1} · €{s}{trade.entries[i] ? ' ✓' : ''}</span>)}
        </div>
        <span className="state-chip">{position.status}</span>
      </section>

      <ul className="rows figures">
        <li><span className="row-main">Prix moyen<small>pondéré par la quantité</small></span><span className="row-side num big">{money(position.avg, cur, 1)}</span></li>
        <li><span className="row-main">Prix actuel<small>{trade.priceSource === 'manual' ? (trade.manualPrice ? `saisi à ${hhmm(trade.manualPrice.at)}` : 'à saisir dans Produit et plan') : <Freshness market={market} />}</small></span>
          <span className="row-side num big">{tradePrice != null ? <Num value={tradePrice} format={x => money(x, cur, 1)} /> : '—'}</span></li>
        <li><span className="row-main">Rendement<small>{position.roi != null ? `ROI ${pct(position.roi)}` : eurPerUnit == null && position.entriesCount ? 'taux de change indisponible' : '—'}</small></span>
          <span className="row-side num big">{position.rMultiple != null ? `${position.rMultiple >= 0 ? '+' : ''}${num(position.rMultiple, 2)} R` : '—'}</span></li>
        <li><span className="row-main">Exposition<small>{isTurbo(trade.product) ? `${num(position.qty)} turbos · équivalent ${num(position.qty / trade.product.parity, 2)} t` : `${num(position.qty, 3)} unités × prix`}</small></span><span className="row-side num big">{eur(position.exposure)}</span></li>
      </ul>

      <section className="glass surface-2 risk">
        <div className="risk-top"><span>Perte si le stop est touché</span><b className="num">{position.lossAtStop != null ? `${eur(position.lossAtStop)} / €${trade.plan.maxLoss}` : '—'}</b></div>
        <div className="gauge"><i style={{ width: `${Math.min(100, Math.max(0, (position.lossAtStop || 0) / trade.plan.maxLoss * 100))}%` }} /></div>
        <dl className="facts facts-3">
          <div><dt>Technique</dt><dd className={flagClass(position.flags.technical)}>{position.flags.technical}</dd></div>
          <div><dt>Risque</dt><dd className={flagClass(position.flags.risk)}>{position.flags.risk}</dd></div>
          <div><dt>Distance au stop</dt><dd className={position.flags.stopDefined ? '' : 'down'}>{position.flags.stopDefined ? (position.distToStopPct != null ? `${num(position.distToStopPct, 1)} %` : 'défini') : 'aucun stop'}</dd></div>
        </dl>
      </section>

      {isTurbo(trade.product) && <TurboOrders trade={trade} tradePrice={tradePrice} eurPerUnit={eurPerUnit} market={market} position={position} />}
      <Levels trade={trade} mutate={mutate} position={position} cur={cur} />
      <Entries trade={trade} mutate={mutate} eurPerUnit={eurPerUnit} cur={cur} tradePrice={tradePrice} />
      <Journal snapshot={() => ({ price: tradePrice, cur, pnl: position.pnl, status: position.status, capital: position.capital, avg: position.avg, pulse: pulse?.value ?? null })} />
      <SetupHistory />
      <Settings trade={trade} mutate={mutate} fx={fx} />
      <DataTools trade={trade} mutate={mutate} />
      <p className="foot">Données enregistrées dans ta base Supabase. L’app ne passe aucun ordre.</p>
    </>
  );
}

// Turbo: what each cocoa level means in turbo price, i.e. what to type in the broker's orders.
// Estimates from the delayed New York price and the ECB rate; the broker's quote is what executes.
function TurboOrders({ trade, tradePrice, eurPerUnit, market, position }) {
  const p = trade.product;
  const next = trade.entries.length < 3 ? trade.plan.split[trade.entries.length] : null;
  const [level, setLevel] = useState('');
  const a = market?.candles?.length ? atr(market.candles) : null;
  const barrier = p.barrier ?? p.strike;
  const at = lv => (lv == null || eurPerUnit == null ? null : turboValue(p, lv) * eurPerUnit);
  const now = at(tradePrice);
  const dist = tradePrice != null ? (tradePrice - barrier) * (p.direction === 'SHORT' ? -1 : 1) : null;
  const lv = parse(level) ?? tradePrice;
  const buy = at(lv);
  const qty = buy > 0 && next ? Math.floor(next / buy) : null;
  const size = trade.stop != null ? maxQuantity({ entries: trade.entries, plan: trade.plan, product: p, stop: trade.stop, eurPerUnit }, lv) : null;
  const atStop = at(trade.stop);
  const lossAtStop = qty && buy != null && atStop != null ? qty * (buy - atStop) : null;
  const age = p.strikeAt ? Math.floor((Date.now() - p.strikeAt) / 86400e3) : null;
  return (
    <section>
      <header className="section-head"><h2>Ordres BoursoBank</h2><span className="meta">{p.name || 'turbo'}{p.isin ? ` · ${p.isin}` : ''}</span></header>
      {!p.confirmed && <p className="msg warn">Valeurs provisoires : confirme la parité, la barrière et le prix d’exercice sur la fiche du turbo, puis coche « confirmé » dans Produit et plan.</p>}
      <ul className="rows">
        <li><span className="row-main">Valeur estimée du turbo<small>au cours New York différé · compare au prix BoursoBank</small></span><span className="row-side num big">{now != null ? `${num(now, 2)} €` : '—'}</span></li>
        <li><span className="row-main">Barrière {num(barrier)} $<small>{dist != null ? `à ${num(dist)} $ (${num(dist / tradePrice * 100, 1)} %)${a ? ` · ${num(dist / a, 1)} ATR` : ''}` : '—'} · touchée = turbo à 0, définitivement</small></span>
          <span className={`row-side num ${dist != null && a && dist < 2 * a ? 'down' : ''}`}>{dist != null && a ? (dist < a ? 'danger' : dist < 2 * a ? 'proche' : 'loin') : ''}</span></li>
      </ul>
      <div className="glass surface-2 add-entry">
        <p className="eyebrow">Calculer un ordre d’achat</p>
        <div className="form-grid">
          <Field id="t-level" label="Niveau du cacao visé" value={level} onChange={setLevel} placeholder={tradePrice != null ? String(Math.round(tradePrice)) : ''} suffix="$" />
        </div>
        <ul className="rows">
          <li><span className="row-main">Prix limite à saisir<small>ordre d’achat à cours limité sur le turbo</small></span><span className="row-side num big">{buy != null ? `${num(buy, 2)} €` : '—'}</span></li>
          {next && <li><span className="row-main">Quantité pour l’entrée {trade.entries.length + 1} (€{next})<small>{size ? `maximum ${Math.floor(size.qty)} turbos pour rester sous €${trade.plan.maxLoss} au stop` : trade.stop == null ? 'fixe ton stop pour vérifier le risque' : ''}</small></span><span className="row-side num big">{qty == null ? '—' : qty === 0 ? <small className="warn">1 turbo &gt; €{next}</small> : `${qty} turbos`}</span></li>}
          {trade.stop != null && <li><span className="row-main">Ordre stop à saisir<small>niveau d’invalidation {num(trade.stop)} $ · perte ≈ {lossAtStop != null ? `${num(lossAtStop, 2)} €` : '—'} sur cette entrée</small></span><span className="row-side num big">{atStop != null ? `${num(atStop, 2)} €` : '—'}</span></li>}
          {trade.targets.map((t, i) => <li key={t}><span className="row-main">Vente à l’objectif {i + 1}<small>{num(t)} $ · ordre de vente à cours limité</small></span><span className="row-side num">{at(t) != null ? `${num(at(t), 2)} €` : '—'}</span></li>)}
        </ul>
      </div>
      <p className="fine">
        Estimations : cours New York différé, taux BCE du jour, sans l’écart achat/vente de l’émetteur. Le prix d’exercice monte un peu chaque jour (financement){age != null ? ` : saisi il y a ${age} jour${age > 1 ? 's' : ''}` : ''}. Si la valeur estimée s’écarte de plus de 3 % du prix BoursoBank, mets à jour le prix d’exercice.
        {position.entriesCount > 0 && position.knockedOut ? ' Ce turbo a touché sa barrière.' : ''}
      </p>
    </section>
  );
}

function Field({ id, label, value, onChange, placeholder, suffix, type = 'text' }) {
  return (
    <label className="field" htmlFor={id}>
      <span className="field-label">{label}</span>
      <span className="field-in">
        <input id={id} type={type} inputMode={type === 'text' ? 'decimal' : undefined} value={value ?? ''} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
        {suffix && <span className="suffix">{suffix}</span>}
      </span>
    </label>
  );
}

function Levels({ trade, mutate, position, cur }) {
  const [stop, setStop] = useState(trade.stop ?? '');
  const [tps, setTps] = useState([trade.targets[0] ?? '', trade.targets[1] ?? '']);
  const act = useAction(mutate);
  const dirty = parse(stop) !== trade.stop || tps.map(parse).filter(x => x != null).join() !== trade.targets.join();
  const s = parse(stop);
  const widened = trade.stop != null && s != null && position.entriesCount > 0 && (trade.product.direction === 'SHORT' ? s > trade.stop : s < trade.stop);
  return (
    <section>
      <header className="section-head"><h2>Invalidation et objectifs</h2><span className="meta">{SYM[cur]} par tonne</span></header>
      <div className="form-grid">
        <Field id="stop" label="Stop / invalidation" value={stop} onChange={setStop} placeholder="ex. 6900" suffix={SYM[cur]} />
        <Field id="tp1" label="Objectif 1" value={tps[0]} onChange={v => setTps([v, tps[1]])} placeholder="optionnel" suffix={SYM[cur]} />
        <Field id="tp2" label="Objectif 2" value={tps[1]} onChange={v => setTps([tps[0], v])} placeholder="optionnel" suffix={SYM[cur]} />
      </div>
      {widened && <p className="msg warn">Tu éloignes le stop d’une position ouverte. C’est souvent le début d’une martingale : le risque augmente sans nouvelle confirmation.</p>}
      {position.targets?.length > 0 && (
        <ul className="rows">
          {position.targets.map((t, i) => (
            <li key={i}><span className="row-main">Objectif {i + 1} · {money(t.price, cur)}<small>distance {pct(t.distPct, 1)}</small></span><span className="row-side num">{eur(t.rewardEur, 2, true)}{t.rr != null ? ` · ${num(t.rr, 1)} R` : ''}</span></li>
          ))}
        </ul>
      )}
      {act.error && <p className="msg bad">{act.error}</p>}
      <button className="btn block" disabled={!dirty || act.busy} onClick={() => act.run('levels', { stop: parse(stop), targets: tps.map(parse) }).catch(() => {})}>{act.busy ? 'Enregistrement…' : 'Enregistrer les niveaux'}</button>
    </section>
  );
}

function Entries({ trade, mutate, eurPerUnit, cur, tradePrice }) {
  const n = trade.entries.length + 1;
  const planned = trade.plan.split[n - 1];
  const [form, setForm] = useState({ price: '', qty: '', capitalEur: '', feesEur: '', date: today(), turboEur: '' });
  const [override, setOverride] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const act = useAction(mutate);
  const turbo = isTurbo(trade.product);
  // a turbo is entered with its own price (€) and a number of turbos; the cocoa level it stands for is derived
  const tEur = parse(form.turboEur);
  const cand = turbo
    ? { price: tEur != null ? underlyingForTurboPrice(trade.product, tEur, eurPerUnit) : null, qty: parse(form.qty), capitalEur: tEur != null && parse(form.qty) != null ? Math.round(tEur * parse(form.qty) * 100) / 100 : 0, feesEur: parse(form.feesEur) ?? 0 }
    : { price: parse(form.price), qty: parse(form.qty), capitalEur: parse(form.capitalEur) ?? planned ?? 0, feesEur: parse(form.feesEur) ?? 0 };
  const filled = cand.price != null && cand.qty != null;
  // live feedback, the server applies the same rules again when saving
  const check = useMemo(() => (filled ? checkEntry({ entries: trade.entries, plan: trade.plan, product: trade.product, stop: trade.stop, eurPerUnit }, cand) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filled, form, trade, eurPerUnit]);

  // sizing: the largest quantity that keeps the loss at the stop within the plan
  const sizeAt = cand.price ?? tradePrice;
  const size = maxQuantity({ entries: trade.entries, plan: trade.plan, product: trade.product, stop: trade.stop, eurPerUnit }, sizeAt);

  const add = async () => {
    try {
      await act.run('addEntry', { ...cand, date: form.date, override: check && !check.ok ? override : false });
      setForm({ price: '', qty: '', capitalEur: '', feesEur: '', date: today(), turboEur: '' }); setOverride(false);
    } catch { /* shown by useAction */ }
  };

  return (
    <section>
      <header className="section-head"><h2>Entrées</h2><span className="meta">jamais en martingale</span></header>
      <ul className="rows">
        {trade.entries.map(e => (
          <li key={e.id}>
            <span className="entry-n">E{e.n}</span>
            <span className="row-main num">{turbo ? `${num(e.qty)} turbos à ${num(e.capitalEur / e.qty, 2)} € · cacao ${money(e.price, cur)}` : `${money(e.price, cur, 1)} · ${num(e.qty, 3)} u.`}<small>{dateShort(Date.parse(e.date))} · €{num(e.capitalEur)}{e.feesEur ? ` · frais €${num(e.feesEur, 2)}` : ''}{e.offRules ? ' · hors règles' : ''}</small></span>
            {confirmDel === e.id
              ? <span className="row-actions"><button className="link down" onClick={() => act.run('deleteEntry', { id: e.id }).catch(() => {}).finally(() => setConfirmDel(null))}>Supprimer</button><button className="link" onClick={() => setConfirmDel(null)}>Annuler</button></span>
              : <button className="link faint" onClick={() => setConfirmDel(e.id)} aria-label={`Retirer l’entrée ${e.n}`}>Retirer</button>}
          </li>
        ))}
      </ul>
      {trade.closed ? <p className="empty">Position clôturée. Ouvre une nouvelle position dans « Données ».</p> : n <= 3 ? (
        <div className="glass surface-2 add-entry">
          <p className="eyebrow">Enregistrer l’entrée {n} · plan €{planned}</p>
          {turbo ? (
            <div className="form-grid">
              <Field id="e-teur" label="Prix payé par turbo" value={form.turboEur} onChange={v => setForm({ ...form, turboEur: v })} placeholder="ex. 10,10" suffix="€" />
              <Field id="e-qty" label="Nombre de turbos" value={form.qty} onChange={v => setForm({ ...form, qty: v })} placeholder="ex. 3" />
              <Field id="e-fees" label="Frais" value={form.feesEur} onChange={v => setForm({ ...form, feesEur: v })} placeholder="0" suffix="€" />
              <Field id="e-date" label="Date" type="date" value={form.date} onChange={v => setForm({ ...form, date: v })} />
              {cand.price != null && <p className="fine">Soit €{num(cand.capitalEur, 2)} engagés, et un cacao équivalent à {num(cand.price)} $.</p>}
            </div>
          ) : (
          <div className="form-grid">
            <Field id="e-price" label="Prix d’exécution" value={form.price} onChange={v => setForm({ ...form, price: v })} suffix={SYM[cur]} />
            <Field id="e-qty" label="Quantité" value={form.qty} onChange={v => setForm({ ...form, qty: v })} placeholder="ex. 0,04" suffix="u." />
            <Field id="e-cap" label="Capital engagé" value={form.capitalEur} onChange={v => setForm({ ...form, capitalEur: v })} placeholder={String(planned)} suffix="€" />
            <Field id="e-fees" label="Frais" value={form.feesEur} onChange={v => setForm({ ...form, feesEur: v })} placeholder="0" suffix="€" />
            <Field id="e-date" label="Date" type="date" value={form.date} onChange={v => setForm({ ...form, date: v })} />
          </div>
          )}
          <div className="sizing">
            {trade.stop == null ? <p className="msg note">Définis d’abord ton stop : la taille maximale en dépend.</p>
              : eurPerUnit == null ? <p className="msg note">Taux de change indisponible : taille maximale non calculable.</p>
              : !size ? <p className="msg warn">Au prix {sizeAt != null ? money(sizeAt, cur) : '—'}, ton stop n’est pas du bon côté : aucune taille possible.</p>
              : (
                <p className="msg note">
                  Taille maximale à {money(sizeAt, cur)} : <b className="num">{turbo ? `${Math.floor(size.qty)} turbos` : `${num(Math.floor(size.qty * 1000) / 1000, 3)} u.`}</b> pour rester sous €{trade.plan.maxLoss} de perte au stop
                  {' '}(reste €{num(size.room, 2)} de risque · €{num(size.perUnit, 2)} par unité).
                  {size.qty > 0 && <button className="link" onClick={() => setForm({ ...form, qty: turbo ? String(Math.floor(size.qty)) : String(Math.floor(size.qty * 1000) / 1000).replace('.', ',') })}>Utiliser</button>}
                </p>
              )}
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
              <span>Je l’ai quand même passée chez mon courtier. L’entrée sera marquée « hors règles » et notée au journal.</span>
            </label>
          )}
          {act.error && <p className="msg bad">{act.error}</p>}
          <button className="btn primary block" disabled={!filled || act.busy || (check && !check.ok && !override)} onClick={add}>{act.busy ? 'Enregistrement…' : `Enregistrer l’entrée ${n}`}</button>
        </div>
      ) : <p className="empty">Les trois entrées sont utilisées.</p>}
    </section>
  );
}

const QUESTIONS = [
  ['why', 'Pourquoi suis-je entré ?'],
  ['thesis', 'Quelle était la thèse ?'],
  ['saw', 'Qu’ai-je vu ?'],
  ['market', 'Qu’a fait le marché ?'],
  ['ai', 'Qu’a dit l’IA ?'],
];

function Journal({ snapshot }) {
  const j = usePolling(api.journal, 300e3);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const notes = j.data?.journal || [];
  const save = async () => {
    setBusy(true); setErr('');
    try { const r = await api.addNote(form, snapshot()); j.set(d => ({ ...d, journal: [r.note, ...(d?.journal || [])] })); setForm({}); setOpen(false); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const hasText = Object.values(form).some(v => v?.trim());
  return (
    <section>
      <header className="section-head"><h2>Journal</h2><span className="meta">{notes.length} note{notes.length > 1 ? 's' : ''}</span></header>
      {!open && <button className="btn block" onClick={() => setOpen(true)}>Nouvelle note</button>}
      {open && (
        <div className="glass surface-2 journal-form">
          {QUESTIONS.map(([k, q]) => (
            <label className="field" key={k} htmlFor={`j-${k}`}>
              <span className="field-label">{q}</span>
              <textarea id={`j-${k}`} rows={2} value={form[k] || ''} onChange={e => setForm({ ...form, [k]: e.target.value })} />
            </label>
          ))}
          <p className="fine">Le prix, le P&amp;L, le statut et le Market Pulse du moment sont joints automatiquement.</p>
          {err && <p className="msg bad">{err}</p>}
          <div className="btn-row"><button className="btn" onClick={() => setOpen(false)}>Annuler</button><button className="btn primary" disabled={!hasText || busy} onClick={save}>Enregistrer</button></div>
        </div>
      )}
      <div className="notes">
        {notes.map(n => (
          <article className="note" key={n.id}>
            <p className="note-meta num">{new Date(n.at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}{n.snap?.price != null ? ` · ${money(n.snap.price, n.snap.cur || 'USD')}` : ''}{n.snap?.pnl != null ? ` · P&L ${eur(n.snap.pnl, 2, true)}` : ''}{n.snap?.status ? ` · ${n.snap.status}` : ''}</p>
            {n.text && <p>{n.text}</p>}
            {n.answers && QUESTIONS.filter(([k]) => n.answers[k]?.trim()).map(([k, q]) => <p key={k}><span className="faint">{q}</span><br />{n.answers[k]}</p>)}
          </article>
        ))}
      </div>
    </section>
  );
}

function Settings({ trade, mutate, fx }) {
  const [open, setOpen] = useState(!trade.entries.length);
  const [manual, setManual] = useState(trade.manualPrice?.price ?? '');
  const [pv, setPv] = useState(trade.product.pointValue);
  const [budget, setBudget] = useState(trade.plan.plannedCapital);
  const [maxLoss, setMaxLoss] = useState(trade.plan.maxLoss);
  const act = useAction(mutate);
  const p = trade.product;
  const save = patch => act.run('settings', patch).catch(() => {});
  const [tb, setTb] = useState({ name: p.name ?? '', isin: p.isin ?? '', strike: p.strike ?? '', barrier: p.barrier ?? '', parity: p.parity ?? 100, confirmed: !!p.confirmed });
  return (
    <section>
      <header className="section-head"><h2>Produit et plan</h2><button className="link" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Masquer' : 'Modifier'}</button></header>
      <p className="empty">{KIND[p.kind]}{isTurbo(p) ? ` ${p.name || ''} · prix d’exercice ${num(p.strike)} $ · parité ${p.parity}${p.confirmed ? '' : ' (provisoire)'}` : ''} · {p.direction} · coté en {p.priceCurrency} · 1 point × 1 unité = {p.pointValue} {p.priceCurrency} · prix {trade.priceSource === 'manual' ? 'saisi à la main' : 'New York (auto, différé)'}</p>
      {open && (
        <div className="glass surface-2 settings">
          <Seg label="Sens" value={p.direction} options={[['LONG', 'Long'], ['SHORT', 'Short']]} onChange={v => save({ product: { direction: v } })} />
          <Seg label="Type de produit" value={p.kind} options={[['turbo', 'Turbo'], ['cfd', 'CFD / levier'], ['spot', 'Sans levier']]} onChange={v => save({ product: v === 'turbo' ? { kind: v, strike: p.strike ?? 4490.51, barrier: p.barrier ?? 4490.51, parity: p.parity ?? 100, name: p.name || 'Turbo Call SG Cocoa 4 490', direction: 'LONG' } : { kind: v } })} />
          {isTurbo(p) && (
            <>
              <div className="form-grid">
                <Field id="t-name" label="Nom" value={tb.name} onChange={v => setTb({ ...tb, name: v })} placeholder="Turbo Call SG Cocoa" />
                <Field id="t-isin" label="ISIN" value={tb.isin} onChange={v => setTb({ ...tb, isin: v })} placeholder="FR00…" />
                <Field id="t-strike" label="Prix d’exercice actuel" value={tb.strike} onChange={v => setTb({ ...tb, strike: v })} suffix="$" />
                <Field id="t-barrier" label="Barrière" value={tb.barrier} onChange={v => setTb({ ...tb, barrier: v })} suffix="$" />
                <Field id="t-parity" label="Parité" value={tb.parity} onChange={v => setTb({ ...tb, parity: v })} placeholder="100" />
              </div>
              <label className="override" htmlFor="t-conf">
                <input id="t-conf" type="checkbox" checked={tb.confirmed} onChange={e => setTb({ ...tb, confirmed: e.target.checked })} />
                <span>Ces valeurs sont confirmées sur la fiche du turbo.</span>
              </label>
              <button className="btn" disabled={act.busy} onClick={() => save({ product: { ...tb, strike: parse(tb.strike), barrier: parse(tb.barrier), parity: parse(tb.parity) } })}>Enregistrer le turbo</button>
            </>
          )}
          {!isTurbo(p) && <Seg label="Devise de cotation" value={p.priceCurrency} options={[['USD', '$ USD'], ['GBP', '£ GBP'], ['EUR', '€ EUR']]} onChange={v => save({ product: { priceCurrency: v } })} />}
          <Seg label="Prix actuel" value={trade.priceSource} options={[['NY_COCOA', 'New York auto'], ['manual', 'Saisi à la main']]} onChange={v => save({ priceSource: v })} disabled={p.priceCurrency !== 'USD' ? ['NY_COCOA'] : []} />
          {trade.priceSource === 'manual' && (
            <div className="form-grid">
              <Field id="manual" label="Prix actuel chez ton courtier" value={manual} onChange={setManual} suffix={SYM[p.priceCurrency]} />
              <button className="btn" disabled={act.busy} onClick={() => act.run('manualPrice', { price: parse(manual) }).catch(() => {})}>Mettre à jour</button>
            </div>
          )}
          <div className="form-grid">
            {!isTurbo(p) && <Field id="pv" label="Valeur du point" value={pv} onChange={setPv} />}
            <Field id="budget" label="Budget maximum" value={budget} onChange={setBudget} suffix="€" />
            <Field id="maxloss" label="Perte maximale" value={maxLoss} onChange={setMaxLoss} suffix="€" />
          </div>
          <button className="btn" disabled={act.busy} onClick={() => save({ product: isTurbo(p) ? {} : { pointValue: parse(pv) }, plan: { plannedCapital: parse(budget), maxLoss: parse(maxLoss) } })}>Enregistrer le plan</button>
          {act.error && <p className="msg bad">{act.error}</p>}
          <p className="fine">Taux BCE {fx.data?.date ? `du ${fx.data.date}` : 'indisponible'} : 1 € = {num(fx.data?.raw?.EURUSD, 4)} $ · {num(fx.data?.raw?.EURGBP, 4)} £. Pour un CFD cacao coté par tonne, la valeur du point vaut en général 1 et la quantité est en tonnes : vérifie la fiche du produit chez ton courtier.</p>
        </div>
      )}
    </section>
  );
}

function Seg({ label, value, options, onChange, disabled = [] }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="seg">
        {options.map(([v, l]) => <button key={v} aria-pressed={v === value} disabled={disabled.includes(v)} onClick={() => v !== value && onChange(v)}>{l}</button>)}
      </div>
    </div>
  );
}

function DataTools({ trade, mutate }) {
  const [confirm, setConfirm] = useState(null);
  const act = useAction(mutate);
  const run = (a, payload) => act.run(a, payload).catch(() => {}).finally(() => setConfirm(null));
  return (
    <section>
      <header className="section-head"><h2>Données</h2><span className="meta">base Supabase</span></header>
      <div className="btn-row">
        <a className="btn" href="/api/state?export=1" download>Exporter tout</a>
        {confirm === 'close'
          ? <><button className="btn danger" onClick={() => run('close')}>Confirmer la clôture</button><button className="btn" onClick={() => setConfirm(null)}>Annuler</button></>
          : <button className="btn" disabled={!trade.entries.length || trade.closed} onClick={() => setConfirm('close')}>Clôturer la position</button>}
        {confirm === 'new'
          ? <><button className="btn danger" onClick={() => run('newPosition')}>Archiver et repartir</button><button className="btn" onClick={() => setConfirm(null)}>Annuler</button></>
          : <button className="btn" onClick={() => setConfirm('new')}>Nouvelle position</button>}
      </div>
      {act.error && <p className="msg bad">{act.error}</p>}
      <p className="fine">« Nouvelle position » archive la position actuelle (elle reste dans la base et dans l’export) et en ouvre une vide avec le même produit et le même plan.</p>
    </section>
  );
}
