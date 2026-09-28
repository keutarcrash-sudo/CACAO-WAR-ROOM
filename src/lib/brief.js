// Builds a self-contained analysis brief (facts only, with sources and times) to paste into any AI chat.
// The app never calls a paid AI: the user chooses where to paste it.
import { previousLevels, structure, volatilityRatio, rangePosition } from '../../lib/engines/technical.js';
import { api } from './api.js';

const n = (x, d = 0) => (x == null || Number.isNaN(x) ? 'N/D' : Number(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const sign = x => (x == null ? 'N/D' : x > 0 ? `+${x}` : `${x}`);
const dt = ms => (ms ? new Date(ms).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'medium', timeStyle: 'short' }) : 'N/D');
const day = t => new Date(t * 1000).toISOString().slice(0, 10);

async function structures(market) {
  const tfs = ['W1', 'D1', '4H', '1H', '15M'];
  const res = await Promise.all(tfs.map(t => (t === 'D1' ? Promise.resolve(market) : api.market('NY_COCOA', t).catch(() => null))));
  return tfs.map((t, i) => `${t} : ${res[i]?.candles?.length ? structure(res[i].candles).label : 'N/D'}`).join(' · ');
}

export async function buildBrief({ market, daily, atr14, fund, news, alerts, trade, position, war }) {
  const q = market?.quote || {};
  const lv = daily ? previousLevels(daily) : null;
  const vr = daily ? volatilityRatio(daily) : null;
  const rp = daily && q.price != null ? rangePosition(daily, q.price, 20) : null;
  const f = fund?.data;
  const cur = trade.product.priceCurrency;
  const L = [];
  const h = t => L.push('', `## ${t}`);

  L.push('# COCOA WAR ROOM — brief d’analyse', `Généré le ${dt(Date.now())} (heure de Paris).`);

  h('Consignes pour toi (l’IA)');
  L.push(
    '- Tu es l’analyste d’un trade spéculatif personnel sur le cacao. Utilise UNIQUEMENT les données ci-dessous. N’invente aucun chiffre, aucune news, aucun niveau.',
    '- Sépare clairement les FAITS (repris du brief) et ton INTERPRÉTATION.',
    '- « Ne rien faire » est une réponse valable et souvent la bonne. Une forte confluence n’est jamais une certitude.',
    '- Donne toujours les facteurs qui contredisent le scénario.',
    '- Respecte le plan de risque : budget maximum 150 €, entrées 30 € / 50 € / 70 € seulement si les conditions sont réunies, perte maximale 50 €, jamais de martingale, une baisse de prix n’est pas une raison de renforcer, le 5M ne change jamais le contexte Daily.',
    '- Ne formule jamais « achète maintenant » ou « vends maintenant » : décris des conditions.',
    '- Si une donnée manque ou est ancienne, dis-le et tiens-en compte.',
  );

  h('Marché : New York Cocoa (ICE Futures U.S.)');
  L.push(`Source : ${market?.source?.name || 'N/D'}, différé d’environ ${q.delayMinutes ?? '?'} min, statut ${market?.status || 'N/D'}. Dernière cotation : ${dt(q.dataTime)}.`);
  L.push(`Prix : ${n(q.price)} $/t · séance ${q.changePct != null ? `${sign(Number(q.changePct.toFixed(2)))} %` : 'N/D'} (${n(q.change)} $).`);
  L.push(`ATR 14 jours : ${n(atr14)} $ · volatilité ${vr != null ? `${n(vr, 2)}× sa moyenne 20 j` : 'N/D'} · position dans le range 20 jours : ${rp ? `${Math.round(rp.pos * 100)} % (bas ${n(rp.lo)}, haut ${n(rp.hi)})` : 'N/D'}.`);
  if (lv) {
    L.push(`Niveaux (liquidité estimée d’après la structure, pas de données de liquidation) : veille haut ${n(lv.PDH)} / bas ${n(lv.PDL)} · semaine passée haut ${n(lv.PWH)} / bas ${n(lv.PWL)}.`);
    L.push(`Pivots du jour : P ${n(lv.dailyPivots.P)} · R1 ${n(lv.dailyPivots.R1)} · R2 ${n(lv.dailyPivots.R2)} · S1 ${n(lv.dailyPivots.S1)} · S2 ${n(lv.dailyPivots.S2)}.`);
  }
  L.push(`Structure simplifiée (deux derniers sommets et creux) : ${market ? await structures(market) : 'N/D'}.`);
  L.push('London Cocoa (ICE Europe) : indisponible (pas de source gratuite fiable).');
  if (daily?.length) {
    L.push('', '30 dernières bougies Daily (date · ouverture · haut · bas · clôture) :');
    for (const k of daily.slice(-30)) L.push(`${day(k.t)} · ${n(k.o)} · ${n(k.h)} · ${n(k.l)} · ${n(k.c)}`);
  }

  h('Fondamentaux');
  if (!f) L.push('Indisponibles.');
  else {
    L.push(`Score fondamental : ${sign(f.score.total)} sur une échelle de −10 à +10 · biais ${f.score.bias} · ${f.score.coverage}/${f.score.of} facteurs disponibles (facteur manquant = non compté, donnée ancienne = moitié du poids).`);
    for (const x of f.factors) {
      L.push(`- ${x.name} : ${x.score == null ? 'non compté' : `note ${sign(x.score)}`} · ${x.value}${x.prev ? ` · ${x.prev}` : ''}${x.note ? ` · ${x.note}` : ''} · source ${x.source || 'N/D'} · fraîcheur ${x.fresh}${x.estimate ? ' · estimation' : ''}.`);
    }
    if (f.weather?.zones) L.push('', 'Pluie 30 jours vs normale ' + (f.weather.normalYears || '') + ' : ' + f.weather.zones.map(z => `${z.name} (${z.country}) ${z.past30 == null ? 'N/D' : `${sign(Math.round(z.past30))} %`}, prévision 14 j ${z.next14 == null ? 'N/D' : `${sign(Math.round(z.next14))} %`}`).join(' ; ') + '.');
    if (f.enso?.oni) L.push(`ENSO (NOAA) : ${f.enso.label}, ONI ${f.enso.oni.season} ${f.enso.oni.year} ${sign(f.enso.oni.anom)} °C, Niño 3.4 hebdo ${sign(f.enso.weekly?.nino34)} °C.`);
    if (f.cot?.mmNet != null) L.push(`Positioning (CFTC, données du ${f.cot.date}) : Managed Money net ${n(f.cot.mmNet)} contrats, percentile ${f.cot.percentile} % sur ${Math.round(f.cot.weeks / 52)} ans, variation 1 semaine ${n(f.cot.change1w)}, 4 semaines ${n(f.cot.change4w)}.`);
  }

  h('News (72 dernières heures, importance ≥ 40)');
  const ev = (news?.data?.events || []).filter(e => e.importance >= 40).slice(0, 15);
  if (!ev.length) L.push('Aucune news importante collectée.');
  for (const e of ev) L.push(`- [${dt(e.firstSeen)}] ${e.title} · catégorie ${e.category} · direction par mots-clés ${e.direction} (confiance faible) · importance ${e.importance}/100 · sources : ${e.sources.map(s => s.name).join(', ')}`);
  L.push('(Seuls les titres sont disponibles, pas le texte des articles.)');

  h('Événements récents détectés par la War Room');
  const al = (alerts || []).slice(0, 12);
  if (!al.length) L.push('Aucun.');
  for (const a of al) L.push(`- [${dt(a.at)}] ${a.level} · ${a.title}${a.message ? ` — ${a.message}` : ''}`);

  h('Position et plan');
  L.push(`Produit : ${trade.product.kind === 'cfd' ? 'CFD / levier' : 'sans levier'}, sens ${trade.product.direction}, coté en ${cur}, valeur du point ${trade.product.pointValue}. Prix utilisé : ${trade.priceSource === 'manual' ? 'saisi à la main' : 'New York différé'}.`);
  L.push(`Plan : budget ${trade.plan.plannedCapital} €, entrées ${trade.plan.split.join(' / ')} €, perte maximale ${trade.plan.maxLoss} €.`);
  L.push(`Statut : ${position.status}. Engagé ${n(position.capital)} € · restant ${n(position.remaining)} €.`);
  for (const e of trade.entries) L.push(`- Entrée ${e.n} : ${n(e.price, 1)} × ${e.qty} u., ${e.capitalEur} €, le ${e.date}${e.offRules ? ' (HORS RÈGLES)' : ''}.`);
  if (trade.entries.length) {
    L.push(`Prix moyen ${n(position.avg, 1)} · P&L ${position.pnl != null ? `${n(position.pnl, 2)} €` : 'N/D'} · perte si stop touché ${position.lossAtStop != null ? `${n(position.lossAtStop, 2)} €` : 'N/D'} · R ${position.rMultiple != null ? n(position.rMultiple, 2) : 'N/D'}.`);
  }
  L.push(`Stop / invalidation : ${trade.stop ?? 'non défini'} · objectifs : ${trade.targets.length ? trade.targets.join(', ') : 'aucun'} · drapeaux : technique ${position.flags.technical}, risque ${position.flags.risk}.`);

  h('Statut actuel de la War Room');
  L.push(`${war.doNothing ? 'RIEN À FAIRE' : war.status}. Raisons : ${war.reasons.map(r => r.t).join(' ')}`);
  L.push('Pas encore calculé par l’app : détection ICT complète (sweeps, BOS/CHoCH, FVG, order blocks) et score de confluence.');

  h('Questions');
  L.push(
    '1. Qu’est-ce qui a changé récemment, d’après ces données ?',
    '2. Est-ce que cela renforce ou affaiblit un scénario haussier sur le cacao ? Donne les arguments pour et contre.',
    '3. Le prix est-il dans une zone où plusieurs facteurs convergent ? Lesquels, et lesquels manquent ?',
    '4. Que faudrait-il observer avant d’envisager la prochaine entrée prévue par le plan ?',
    '5. Qu’est-ce qui invaliderait complètement le scénario ?',
    '6. Verdict en une ligne : RIEN À FAIRE, SURVEILLER, ou SETUP EN FORMATION, avec ton niveau de confiance (faible, moyen, élevé).',
  );
  return L.join('\n');
}
