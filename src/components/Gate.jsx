import { useState } from 'react';
import { Brand } from './Brand.jsx';

export function Login({ onDone }) {
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async e => {
    e.preventDefault();
    setBusy(true); setErr('');
    try { await onDone(pw); } catch (x) { setErr(x.message || 'Connexion impossible'); setBusy(false); }
  };
  return (
    <main className="gate">
      <Brand large state="live" />
      <form className="gate-form surface-3" onSubmit={submit}>
        <label htmlFor="pw" className="eyebrow">Mot de passe</label>
        <div className="pw-row">
          <input id="pw" type={show ? 'text' : 'password'} autoComplete="current-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={pw} onChange={e => setPw(e.target.value)} autoFocus />
          <button type="button" className="link" onClick={() => setShow(!show)} aria-pressed={show}>{show ? 'Masquer' : 'Afficher'}</button>
        </div>
        {err && <p className="msg bad">{err}</p>}
        <button className="btn primary" disabled={!pw || busy}>{busy ? 'Connexion…' : 'Entrer'}</button>
      </form>
    </main>
  );
}

// Shown when the server is missing its settings: says exactly what to add and where.
export function Setup({ missing, detail, tech }) {
  return (
    <main className="gate">
      <Brand large />
      <section className="surface-3 gate-setup">
        <h1>Configuration à terminer</h1>
        {detail ? <p className="msg bad">{detail}</p> : <p>Il manque {missing.join(' et ')} dans les variables d’environnement Vercel.</p>}
        <ol>
          <li>Vercel → ton projet → <b>Settings → Environment Variables</b>.</li>
          {missing.includes('la base de données') && <li><b>DATABASE_URL</b> : Supabase → <b>Connect</b> → <i>Transaction pooler</i> → copie l’adresse et remplace <code>[YOUR-PASSWORD]</code> par le mot de passe de la base.</li>}
          {missing.includes('le mot de passe') && <li><b>APP_PASSWORD</b> : le mot de passe que tu taperas pour ouvrir l’app. <b>SESSION_SECRET</b> : une longue phrase aléatoire (40 caractères ou plus).</li>}
          <li>Onglet <b>Deployments</b> → <b>Redeploy</b>.</li>
        </ol>
        <p className="fine">Les tables sont créées automatiquement au premier lancement.</p>
        <button className="btn block" onClick={() => location.reload()}>Réessayer</button>
        {tech && (
          <details className="tech" open>
            <summary>Détails techniques (sans le mot de passe)</summary>
            <dl>
              {Object.entries(tech).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{String(v)}</dd></div>)}
            </dl>
          </details>
        )}
      </section>
    </main>
  );
}
