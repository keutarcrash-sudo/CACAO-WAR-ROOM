import { useEffect, useRef, useState } from 'react';
import { buildBrief } from '../lib/brief.js';
import { api } from '../lib/api.js';

// Free "AI analyst": the app prepares the facts, the user pastes them in the chat of their choice,
// then pastes the answer back so it lands in the journal with the moment's snapshot.
export function BriefSheet(ctx) {
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const [answer, setAnswer] = useState('');
  const [saved, setSaved] = useState(false);
  const pre = useRef(null);

  useEffect(() => {
    let alive = true;
    buildBrief(ctx).then(t => alive && setText(t)).catch(e => alive && setErr(e.message));
    return () => { alive = false; };
    // built once when the sheet opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    catch {
      // fallback: select the text so the user can copy it by hand
      const r = document.createRange(); r.selectNodeContents(pre.current);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    }
  };
  const save = async () => {
    try {
      await api.addNote({ ai: answer, saw: 'Brief envoyé à une IA externe (données de l’app à cet instant).' }, { price: ctx.tradePrice, cur: ctx.trade.product.priceCurrency, pnl: ctx.position.pnl, status: ctx.position.status, capital: ctx.position.capital, avg: ctx.position.avg, pulse: ctx.pulse?.value ?? null });
      setSaved(true); setAnswer('');
    } catch (e) { setErr(e.message); }
  };

  return (
    <>
      <p className="eyebrow">Analyse externe, gratuite</p>
      <h2 id="sheet-title">Brief pour une IA</h2>
      <ol className="steps">
        <li>Copie le brief : toutes les données actuelles, avec leurs sources et leurs heures.</li>
        <li>Colle-le dans une conversation Claude, ChatGPT ou autre.</li>
        <li>Recolle sa réponse ici : elle rejoint ton journal avec le prix et la position du moment.</li>
      </ol>
      {err && <p className="msg bad">{err}</p>}
      <button className="btn primary block" disabled={!text} onClick={copy}>{!text ? 'Préparation…' : copied ? 'Copié ✓' : `Copier le brief (${Math.round(text.length / 100) / 10}k caractères)`}</button>
      <pre ref={pre} className="brief">{text || '…'}</pre>
      <label className="field" htmlFor="ai-answer" style={{ marginTop: 16 }}>
        <span className="field-label">Réponse de l’IA</span>
        <textarea id="ai-answer" rows={5} value={answer} onChange={e => { setAnswer(e.target.value); setSaved(false); }} placeholder="Colle ici la réponse" />
      </label>
      <button className="btn block" disabled={!answer.trim()} onClick={save}>{saved ? 'Ajouté au journal ✓' : 'Ajouter au journal'}</button>
      <p className="fine">Aucune IA payante n’est appelée par l’app. L’avis d’une IA reste une interprétation : les faits sont dans le brief, la décision est la tienne.</p>
    </>
  );
}
