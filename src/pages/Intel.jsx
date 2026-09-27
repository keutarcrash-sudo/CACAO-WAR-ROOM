import { Pending } from '../components/Pending.jsx';

const ROWS = [
  { name: 'Veille news', source: 'Google News RSS + flux spécialisés, sources officielles en priorité' },
  { name: 'Dédoublonnage', source: 'Une information reprise par 12 médias = un seul événement' },
  { name: 'Classification et importance', source: 'Catégorie, direction, confiance, score 0–100' },
  { name: 'Alertes Telegram', source: 'Critiques seulement, anti-spam, cooldown 30 min, mode silencieux' },
  { name: 'Commande /status', source: 'Résumé instantané depuis Telegram' },
];

export function Intel() {
  return (
    <Pending
      eyebrow="News et alertes"
      title="Intelligence"
      phase="phase 3"
      lead="Telegram servira d’alarme, pas de flux d’actualités : seules les informations capables de changer la thèse te dérangeront."
      rows={ROWS}
    />
  );
}
