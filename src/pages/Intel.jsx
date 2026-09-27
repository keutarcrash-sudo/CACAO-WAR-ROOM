import { Pending } from '../components/Pending.jsx';
import { Icon } from '../components/Icon.jsx';
import { dateShort, hhmm } from '../lib/format.js';

const ROWS = [
  { name: 'Veille news', source: 'Google News RSS et flux spécialisés, sources officielles en priorité' },
  { name: 'Dédoublonnage', source: 'Une information reprise par douze médias = un seul événement' },
  { name: 'Classification et importance', source: 'Catégorie, direction, confiance, score 0–100' },
  { name: 'Alertes Telegram', source: 'Critiques seulement, anti-spam, cooldown 30 min, mode silencieux' },
];

export function Intel({ alerts, openSheet }) {
  const important = alerts.filter(a => a.level !== 'INFORMATION');
  return (
    <Pending eyebrow="News et alertes" title="Intelligence" phase="phase 3"
      lead="Telegram servira d’alarme, pas de flux d’actualités : seules les informations capables de changer la thèse te dérangeront."
      rows={ROWS}>
      <header className="section-head"><h2>Événements importants</h2><span className="meta">déjà détectés par la War Room</span></header>
      {!important.length && <p className="empty">Aucun événement important ou critique pour l’instant.</p>}
      <ul className="rows">
        {important.map(a => (
          <li key={a.id} className="clickable" onClick={() => openSheet({ type: 'alert', alert: a })}>
            <span className={`lvl-ico lvl-text-${a.level.toLowerCase()}`}><Icon name={a.category} /></span>
            <span className="row-main">{a.title}<small className="num">{dateShort(a.at)} · {hhmm(a.at)} · {a.source}</small></span>
            <span className={`row-side lvl-text-${a.level.toLowerCase()}`}>{a.level === 'CRITICAL' ? 'critique' : 'important'}</span>
          </li>
        ))}
      </ul>
    </Pending>
  );
}
