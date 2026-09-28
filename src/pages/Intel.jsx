import { useState } from 'react';
import { Icon } from '../components/Icon.jsx';
import { Freshness } from '../components/Freshness.jsx';
import { usePolling } from '../hooks/usePolling.js';
import { api } from '../lib/api.js';
import { ago, dateShort, hhmm } from '../lib/format.js';

const CAT = { WEATHER: 'Météo', PRODUCTION: 'Production', SUPPLY: 'Offre', DEMAND: 'Demande', STOCKS: 'Stocks', EXPORTS: 'Exports', GRINDINGS: 'Grindings', POSITIONING: 'Positioning', MACRO: 'Macro', POLITICS: 'Politique', LOGISTICS: 'Logistique', DISEASE: 'Maladies', MARKET: 'Marché', OTHER: 'Autre' };
const DIR = { BULLISH: ['Haussier', 'up'], BEARISH: ['Baissier', 'down'], NEUTRAL: ['Indéterminé', 'faint'] };
const LVL = { CRITICAL: 'critique', IMPORTANT: 'important', INFORMATION: 'info' };
const FILTERS = [['all', 'Tout'], ['important', 'Important'], ['PRODUCTION', 'Production'], ['WEATHER', 'Météo'], ['STOCKS', 'Stocks'], ['MARKET', 'Marché']];

export function Intel({ news, openSheet }) {
  const [filter, setFilter] = useState('important');
  const [busy, setBusy] = useState(false);
  const events = news.data?.events || [];
  const shown = events.filter(e => filter === 'all' || (filter === 'important' ? e.level !== 'INFORMATION' : e.category === filter));
  const refresh = async () => { setBusy(true); try { news.set(await api.news(true)); } catch { /* shown by status */ } setBusy(false); };
  const lf = news.data?.lastFetch;

  return (
    <>
      <section className="page-hero">
        <p className="eyebrow">News et alertes</p>
        <h1 className="page-title">Intelligence</h1>
        <p className="lead">Une information reprise par plusieurs médias devient un seul événement. Telegram ne reçoit que ce qui est critique.</p>
      </section>

      <TelegramCard />
      <MonitorCard />

      <section>
        <header className="section-head"><h2>News</h2><button className="link" onClick={refresh} disabled={busy}>{busy ? 'Collecte…' : 'Actualiser'}</button></header>
        {lf && (lf.ok === false
          ? <Freshness info={{ key: 'offline', label: `Collecte en échec · ${lf.error}` }} />
          : <Freshness info={{ key: 'ok', label: `Collecte ${ago(lf.at)} · Google News · 72 dernières heures` }} />)}
        <div className="chips no-swipe">
          {FILTERS.map(([k, l]) => <button key={k} className="toggle" style={{ '--c': 'var(--data)' }} aria-pressed={filter === k} onClick={() => setFilter(k)}><i />{l}</button>)}
        </div>
        {!shown.length && <p className="empty">{news.loading ? 'Chargement…' : 'Aucune information pour ce filtre.'}</p>}
        <ul className="rows news">
          {shown.map((e, i) => {
            const [dl, dc] = DIR[e.direction];
            return (
              <li key={e.id} className="clickable enter-row" style={{ '--i': Math.min(i, 8) }} onClick={() => openSheet({ type: 'news', event: e })}>
                <span className="row-main">
                  <span className="news-meta"><span className={`lvl-text-${e.level.toLowerCase()}`}>{LVL[e.level]}</span> · {CAT[e.category]} · {dateShort(e.firstSeen)} {hhmm(e.firstSeen)}</span>
                  {e.title}
                  <small><span className={dc}>{dl}</span> · {e.sources.length} source{e.sources.length > 1 ? 's' : ''} · {e.sources.slice(0, 3).map(s => s.name).join(', ')}</small>
                  <span className="bar"><i style={{ width: `${e.importance}%`, background: e.level === 'CRITICAL' ? 'var(--risk)' : e.level === 'IMPORTANT' ? 'var(--watch)' : 'var(--ink-3)' }} /></span>
                </span>
                <span className="row-side num">{e.importance}</span>
              </li>
            );
          })}
        </ul>
        <p className="fine">Classement automatique par mots-clés, confiance faible : la direction n’est indiquée que quand le titre est explicite. L’analyse par IA viendra affiner ce classement.</p>
      </section>
    </>
  );
}

export function NewsDetail({ event: e }) {
  if (!e) return null;
  const [dl, dc] = DIR[e.direction];
  return (
    <>
      <p className="eyebrow">{CAT[e.category]} · {new Date(e.firstSeen).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}</p>
      <h2 id="sheet-title">{e.title}</h2>
      <dl className="facts">
        <div><dt>Importance</dt><dd className={`lvl-text-${e.level.toLowerCase()}`}>{e.importance}/100 · {LVL[e.level]}</dd></div>
        <div><dt>Direction</dt><dd className={dc}>{dl}</dd></div>
        <div><dt>Confiance</dt><dd>{e.confidence} ({e.method})</dd></div>
        <div><dt>Sources</dt><dd>{e.sources.length}</dd></div>
      </dl>
      <ul className="rows">
        {e.sources.map(s => (
          <li key={s.url}><span className="row-main"><a href={s.url} target="_blank" rel="noopener noreferrer">{s.name}</a><small>{dateShort(s.publishedAt)} · {hhmm(s.publishedAt)}</small></span></li>
        ))}
      </ul>
    </>
  );
}

function TelegramCard() {
  const t = usePolling(() => api.telegram(), 300e3);
  const [busy, setBusy] = useState(null);
  const act = async a => { setBusy(a); try { t.set(await api.telegram(a)); } catch (e) { t.set(d => ({ ...d, error: e.message })); } setBusy(null); };
  const d = t.data;
  const ready = d?.tokenSet && d?.chatIdSet && d?.webhookSet;
  return (
    <section className="glass surface-2 setup-card">
      <header className="section-head"><h2>Telegram</h2><span className={`meta ${ready ? 'up' : ''}`}>{!d ? '…' : ready ? `connecté${d.bot ? ` · @${d.bot}` : ''}` : 'à configurer'}</span></header>
      {d && !d.tokenSet && (
        <ol className="steps">
          <li>Dans Telegram, ouvre <b>@BotFather</b>, envoie <code>/newbot</code>, choisis un nom (ex. <i>Cocoa War Room</i>) et un identifiant finissant par <i>bot</i>.</li>
          <li>BotFather te donne un <b>token</b>. Colle-le dans Vercel → Settings → Environment Variables sous le nom <b>TELEGRAM_BOT_TOKEN</b>, puis Redeploy.</li>
          <li>Reviens ici et touche <b>Connecter</b>.</li>
        </ol>
      )}
      {d?.tokenSet && !d.webhookSet && <p className="empty">Token trouvé. Touche <b>Connecter</b> pour relier le bot à l’app.</p>}
      {d?.tokenSet && d.webhookSet && !d.chatIdSet && (
        <ol className="steps">
          <li>Ouvre ton bot {d.bot ? <b>@{d.bot}</b> : ''} dans Telegram et envoie <code>/start</code>.</li>
          <li>Il te répond avec ton identifiant. Ajoute-le dans Vercel sous le nom <b>TELEGRAM_CHAT_ID</b>, puis Redeploy.</li>
        </ol>
      )}
      {d?.webhookError && <p className="msg warn">Telegram signale : {d.webhookError}</p>}
      {d?.error && <p className="msg bad">{d.error}</p>}
      <div className="btn-row">
        {d?.tokenSet && <button className="btn" disabled={!!busy} onClick={() => act('setup')}>{busy === 'setup' ? 'Connexion…' : d.webhookSet ? 'Reconnecter' : 'Connecter'}</button>}
        {ready && <button className="btn" disabled={!!busy} onClick={() => act('test')}>{busy === 'test' ? 'Envoi…' : 'Envoyer un test'}</button>}
        {ready && <button className="btn" disabled={!!busy} onClick={() => act(d.silent ? 'resume' : 'silent')}>{d.silent ? '🔔 Réactiver' : '🔕 Mode silencieux'}</button>}
      </div>
      {ready && (
        <div className="summaries">
          <span className="field-label">Résumés automatiques (désactivés par défaut)</span>
          <div className="chips">
            <button className="toggle" style={{ '--c': 'var(--data)' }} aria-pressed={!!d.summaries?.morning} disabled={!!busy} onClick={() => act(`summaries&morning=${d.summaries?.morning ? 0 : 1}&evening=${d.summaries?.evening ? 1 : 0}`)}><i />Matin · 8 h</button>
            <button className="toggle" style={{ '--c': 'var(--data)' }} aria-pressed={!!d.summaries?.evening} disabled={!!busy} onClick={() => act(`summaries&morning=${d.summaries?.morning ? 1 : 0}&evening=${d.summaries?.evening ? 0 : 1}`)}><i />Soir · 18 h</button>
          </div>
          <p className="fine">Envoyés par la surveillance continue (à activer ci-dessous), heure de Paris.</p>
        </div>
      )}
      {d?.recent?.length > 0 && (
        <ul className="rows compact">
          {d.recent.map((r, i) => <li key={i}><span className="row-main">{r.family.split(':').slice(1).join(':')}<small>{hhmm(r.sentAt)} · importance {r.importance}</small></span><span className="row-side">{STATUS[r.status] || r.status}</span></li>)}
        </ul>
      )}
      <p className="fine">Seules les alertes critiques (70/100 et plus) partent, avec un délai de 30 minutes entre deux alertes du même type et au maximum 6 par jour. En mode silencieux, seules les alertes de risque les plus graves passent.</p>
    </section>
  );
}
const STATUS = { SENT: 'envoyée', SUPPRESSED_COOLDOWN: 'bloquée · délai', SUPPRESSED_SILENT: 'bloquée · silencieux', SUPPRESSED_CAP: 'bloquée · quota', NOT_CONFIGURED: 'non configuré', FAILED: 'échec' };

function MonitorCard() {
  const m = usePolling(() => api.monitor(), 300e3);
  const [busy, setBusy] = useState(null);
  const act = async a => { setBusy(a); try { const r = await api.monitor(a); m.set(r.status === 'ERROR' ? { ...m.data, error: r.error, manualSql: r.manualSql } : r); if (a !== 'run') m.reload(); } catch (e) { m.set(d => ({ ...d, error: e.message })); } setBusy(null); };
  const d = m.data;
  return (
    <section className="glass surface-2 setup-card">
      <header className="section-head"><h2>Surveillance continue</h2><span className={`meta ${d?.scheduled ? 'up' : ''}`}>{!d ? '…' : d.scheduled ? 'active · toutes les 5 min' : 'inactive'}</span></header>
      <p className="empty">{d?.scheduled
        ? 'Supabase réveille la War Room toutes les 5 minutes : prix, niveaux, risque, fondamentaux et news sont vérifiés même app fermée.'
        : 'Sans elle, les événements ne sont calculés que quand l’app est ouverte. L’activation crée une tâche planifiée dans ta base Supabase.'}</p>
      {d?.lastRun && <Freshness info={{ key: 'ok', label: `Dernier passage ${ago(d.lastRun.at)}${d.lastRun.manual ? ' (manuel)' : ''}` }} />}
      {d?.error && <p className="msg bad">{d.error}</p>}
      {d?.manualSql && <details className="tech"><summary>Activation manuelle (SQL Editor de Supabase)</summary><pre className="sql">{d.manualSql}</pre></details>}
      <div className="btn-row">
        {d && !d.scheduled && <button className="btn primary" disabled={!!busy} onClick={() => act('install')}>{busy === 'install' ? 'Activation…' : 'Activer'}</button>}
        {d?.scheduled && <button className="btn" disabled={!!busy} onClick={() => act('uninstall')}>{busy === 'uninstall' ? '…' : 'Désactiver'}</button>}
        <button className="btn" disabled={!!busy} onClick={() => act('run')}>{busy === 'run' ? 'Passage en cours…' : 'Lancer un passage'}</button>
      </div>
    </section>
  );
}
