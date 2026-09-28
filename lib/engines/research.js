// "Research mission": a prompt asking an external AI (with web search) for missing figures, in a strict
// format, and the checks run on what it sends back. Nothing enters the score until the user has opened
// the source and validated each figure.
import { MANUAL } from './fundamentals.js';

export const KEY = 'cocoa_war_room_data';

const OFFICIAL = /(^|\.)(theice\.com|ice\.com|icco\.org|cocobod\.gh|conseilcafecacao\.ci|eurococoa\.(org|com)|candyusa\.com|cocoaasia\.org|cftc\.gov|noaa\.gov)$/i;
const PRESS = /(^|\.)(reuters\.com|bloomberg\.com|ft\.com|wsj\.com|barchart\.com|nasdaq\.com|agricensus\.com|confectionerynews\.com|ecofinagency\.com|agenceecofin\.com|myjoyonline\.com|graphic\.com\.gh|fratmat\.info|lesechos\.fr|jeuneafrique\.com)$/i;

export function sourceKind(url) {
  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { return 'invalid'; }
  return OFFICIAL.test(host) ? 'official' : PRESS.test(host) ? 'press' : 'other';
}

// The metrics to research: never entered, or older than their validity.
export function researchTargets(factors = []) {
  return Object.entries(MANUAL).map(([k, def]) => {
    const f = factors.find(x => x.key === k);
    return { metric: k, name: def.name, unit: def.unit, regions: def.regions, labels: def.labels, state: !f || f.fresh === 'na' ? 'manquante' : f.fresh === 'stale' ? 'trop ancienne' : 'à jour' };
  });
}

export function researchPrompt(factors, now = new Date()) {
  const targets = researchTargets(factors);
  const todo = targets.filter(t => t.state !== 'à jour');
  const list = (todo.length ? todo : targets).map(t => `- metric "${t.metric}" (${t.name}, ${t.state}) · regions possibles : ${t.regions.map(r => `"${r}"`).join(', ')} · "value" = ${t.labels.value.toLowerCase()} · "previous" = ${t.labels.previous.toLowerCase()} · unité ${t.unit}`).join('\n');
  return `# COCOA WAR ROOM — mission de recherche de données
Date : ${now.toLocaleDateString('fr-FR', { dateStyle: 'long' })}.

Tu dois RECHERCHER SUR INTERNET les chiffres les plus récents ci-dessous, pour le marché du cacao. Active la recherche web. Si tu ne peux pas naviguer, réponds seulement : "RECHERCHE WEB INDISPONIBLE".

## Données à trouver
${list}

## Règles strictes
- Uniquement des chiffres lus sur une page que tu as réellement ouverte. Jamais de chiffre de mémoire, jamais d'estimation personnelle.
- Pour chaque chiffre : le lien exact de la page et une citation exacte (copiée mot pour mot) qui contient ce chiffre et, si possible, sa date.
- Priorité aux sources officielles : ICE (stocks certifiés), ICCO, COCOBOD, Conseil du Café-Cacao, ECA / NCA / CAA (grindings). Sinon presse économique reconnue (Reuters, Bloomberg…).
- "official": true seulement si la page est celle de l'organisme qui publie le chiffre. Une estimation d'analyste ou d'exportateurs relayée par la presse = false.
- Si tu ne trouves pas une donnée avec certitude, ne la mets pas. Moins de données mais vraies.
- Les nombres sans séparateur de milliers (1820000, pas 1,82 M ni 1 820 000). "published" au format AAAA-MM-JJ.

## Format de réponse OBLIGATOIRE
Un seul bloc JSON, rien d'autre :
\`\`\`json
{"${KEY}": [
  {"metric": "stocks", "region": "ICE_US", "value": 1820000, "previous": 1760000, "unit": "sacs", "period": "semaine du 22 sept. 2026", "published": "2026-09-26", "source": "ICE", "url": "https://…", "quote": "citation exacte contenant les chiffres", "official": true}
]}
\`\`\`
`;
}

// Finds the JSON block in whatever the AI answered (code fences, text around it…).
export function extractPayload(text) {
  const raw = String(text || '');
  // phones and chat apps often turn " into typographic quotes, which JSON refuses
  for (const s of [raw, raw.replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')]) {
    const found = parsePayload(s);
    if (found) return found;
  }
  throw new Error('Aucun bloc de données reconnu. Colle la réponse complète de l’IA, avec le bloc JSON.');
}

function parsePayload(s) {
  const candidates = [...s.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map(m => m[1]);
  const i = s.indexOf(`"${KEY}"`);
  if (i >= 0) { const start = s.lastIndexOf('{', i); const end = s.lastIndexOf('}'); if (start >= 0 && end > start) candidates.push(s.slice(start, end + 1)); }
  candidates.push(s);
  for (const c of candidates) {
    try { const j = JSON.parse(c.trim()); if (Array.isArray(j?.[KEY])) return j[KEY]; if (Array.isArray(j)) return j; } catch { /* try next */ }
  }
  return null;
}

const num = v => (typeof v === 'number' ? v : Number(String(v ?? '').replace(/[\s ,]/g, '').replace(/[^0-9.-]/g, '')));
const digits = x => String(Math.round(x));

// Each proposal gets errors (cannot be imported) and warnings (check carefully).
export function checkProposals(items, now = Date.now()) {
  return (items || []).map((raw, idx) => {
    const errors = [], warnings = [];
    const def = MANUAL[raw?.metric];
    if (!def) errors.push(`Donnée inconnue : ${raw?.metric}`);
    if (def && !def.regions.includes(raw.region)) errors.push(`Région invalide pour ${def.name} : ${raw.region}`);
    const value = num(raw?.value), previous = num(raw?.previous);
    if (!(value > 0)) errors.push('Valeur manquante ou invalide');
    if (!(previous > 0)) errors.push('Valeur précédente manquante : la variation ne peut pas être calculée');
    const kind = sourceKind(raw?.url);
    if (kind === 'invalid') errors.push('Lien de la source manquant ou invalide');
    if (!String(raw?.quote || '').trim()) errors.push('Citation exacte manquante');
    const published = Date.parse(raw?.published || '');
    if (!Number.isFinite(published)) warnings.push('Date de publication absente : à relever sur la page');
    else if (published > now + 86400e3) errors.push('Date de publication dans le futur');
    else if (def && now - published > def.validDays * 86400e3) warnings.push(`Donnée déjà ancienne (plus de ${def.validDays} jours)`);
    if (kind === 'other') warnings.push('Source ni officielle ni presse reconnue');
    if (kind === 'press' && raw?.official) warnings.push('Marquée officielle mais publiée par un média');
    // the figure must appear in the quote (allowing 1,820,000 / 1.82 million style differences is left to the user)
    const q = String(raw?.quote || '').replace(/[\s ,.]/g, '');
    const forms = value > 0 ? [digits(value), digits(value / 1000), (value / 1e6).toFixed(2).replace('.', ''), (value / 1e6).toFixed(1).replace('.', '')].filter(f => f.length >= 2 && f !== '00') : [];
    if (value > 0 && q && !forms.some(f => q.includes(f))) warnings.push('Le chiffre n’apparaît pas dans la citation');
    return {
      idx, metric: raw?.metric, name: def?.name ?? raw?.metric, region: raw?.region, unit: def?.unit ?? raw?.unit,
      value, previous, change: value > 0 && previous > 0 ? (value / previous - 1) * 100 : null,
      period: raw?.period ?? null, published: Number.isFinite(published) ? new Date(published).toISOString().slice(0, 10) : null,
      source: String(raw?.source || '').slice(0, 100), url: raw?.url, quote: String(raw?.quote || '').slice(0, 600),
      official: !!raw?.official && kind === 'official', kind, errors, warnings, ok: !errors.length,
    };
  });
}
