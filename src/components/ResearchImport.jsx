import { useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { researchPrompt, extractPayload, checkProposals } from '../../lib/engines/research.js';
import { num } from '../lib/format.js';

const KIND = { official: ['source officielle', 'up'], press: ['presse reconnue', 'warn'], other: ['source inconnue', 'down'] };
const REGION = { CI: 'Côte d’Ivoire', GH: 'Ghana', NG: 'Nigeria', CM: 'Cameroun', WORLD: 'Monde', ICE_US: 'ICE New York', ICE_EU: 'ICE Londres', EU: 'Europe', NA: 'Amérique du Nord', ASIA: 'Asie' };

// External AI finds the figures, the user checks each source, then validates. Only validated figures count.
export function ResearchImport({ fund }) {
  const [copied, setCopied] = useState(false);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [checked, setChecked] = useState({});
  const [done, setDone] = useState({});
  const [busy, setBusy] = useState(null);
  const prompt = useMemo(() => researchPrompt(fund.data?.factors || []), [fund.data]);
  // parsing is pure: its error is derived, not stored
  const { proposals, parseError } = useMemo(() => {
    if (!text.trim()) return { proposals: null, parseError: '' };
    try { return { proposals: checkProposals(extractPayload(text)), parseError: '' }; } catch (e) { return { proposals: null, parseError: e.message }; }
  }, [text]);

  const copy = async () => { try { await navigator.clipboard.writeText(prompt); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { setErr('Copie impossible : sélectionne le texte à la main.'); } };
  const validate = async p => {
    setBusy(p.idx);
    try {
      const r = await api.addFundamental({
        metric: p.metric, region: p.region, value: p.value, previous: p.previous, period: p.period, date: p.published,
        source: `${p.source || 'source'} (via IA, vérifié)`, sourceUrl: p.url, isEstimate: !p.official, notes: `Citation : ${p.quote}`,
      });
      fund.set(r); setDone(d => ({ ...d, [p.idx]: true }));
    } catch (e) { setErr(e.message); } finally { setBusy(null); }
  };

  return (
    <section>
      <header className="section-head"><h2>Recherche par une IA</h2><span className="meta">gratuit · vérifié par toi</span></header>
      <ol className="steps">
        <li>Copie la mission et colle-la dans une IA qui peut chercher sur internet (ChatGPT, Claude, Perplexity…), recherche web activée.</li>
        <li>Colle sa réponse ci-dessous : l’app vérifie le format et signale les problèmes.</li>
        <li>Pour chaque chiffre, ouvre le lien, vérifie qu’il y figure avec sa date, puis valide.</li>
      </ol>
      <button className="btn block" onClick={copy}>{copied ? 'Mission copiée ✓' : 'Copier la mission de recherche'}</button>
      <details className="tech"><summary>Voir la mission</summary><pre className="brief">{prompt}</pre></details>
      <label className="field" htmlFor="ai-research" style={{ marginTop: 14 }}>
        <span className="field-label">Réponse de l’IA</span>
        <textarea id="ai-research" rows={4} value={text} onChange={e => { setText(e.target.value); setChecked({}); setDone({}); }} placeholder="Colle ici la réponse complète" />
      </label>
      {(parseError || err) && <p className="msg bad">{parseError || err}</p>}
      {proposals && !proposals.length && <p className="empty">L’IA n’a proposé aucune donnée.</p>}
      {proposals?.map(p => {
        const [kl, kc] = KIND[p.kind] || KIND.other;
        return (
          <article key={p.idx} className={`glass surface-2 proposal ${p.ok ? '' : 'is-bad'}`}>
            <p className="eyebrow">{p.name} · {REGION[p.region] || p.region || '?'}{p.period ? ` · ${p.period}` : ''}</p>
            <p className="proposal-fig num">{num(p.value)} <span className="faint">{p.unit}</span> <small className="faint">vs {num(p.previous)}{p.change != null ? ` (${p.change > 0 ? '+' : ''}${num(p.change, 1)} %)` : ''}</small></p>
            <p className="proposal-src"><span className={kc}>{kl}</span> · {p.source || 'source ?'} · publié {p.published || 'date inconnue'} · {p.official ? 'officiel' : 'estimation / relais'}</p>
            {p.url && p.kind !== 'invalid' && <a className="link" href={p.url} target="_blank" rel="noopener noreferrer">Ouvrir la source ↗</a>}
            {p.quote && <blockquote className="quote">« {p.quote} »</blockquote>}
            {p.errors.map(e => <p key={e} className="msg bad">✕ {e}</p>)}
            {p.warnings.map(w => <p key={w} className="msg warn">! {w}</p>)}
            {p.ok && !done[p.idx] && (
              <>
                <label className="override" htmlFor={`chk-${p.idx}`}>
                  <input id={`chk-${p.idx}`} type="checkbox" checked={!!checked[p.idx]} onChange={e => setChecked(c => ({ ...c, [p.idx]: e.target.checked }))} />
                  <span>J’ai ouvert le lien : le chiffre et la date y figurent.</span>
                </label>
                <button className="btn primary" disabled={!checked[p.idx] || busy === p.idx} onClick={() => validate(p)}>{busy === p.idx ? 'Enregistrement…' : 'Valider cette donnée'}</button>
              </>
            )}
            {done[p.idx] && <p className="msg ok">✓ Enregistrée avec sa source. Le score fondamental est recalculé.</p>}
          </article>
        );
      })}
      <p className="fine">Une IA peut se tromper ou inventer un lien. Rien n’est enregistré sans ta validation, et chaque donnée garde son lien et sa citation.</p>
    </section>
  );
}
