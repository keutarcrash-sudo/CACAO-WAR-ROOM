// News without AI: relevance, category, cautious direction, importance and grouping of duplicates.
// Everything classified here is marked "mots-clés" with LOW confidence; an AI pass can refine it later.
import { levelOf } from './alerts.js';

export const CATEGORIES = ['WEATHER', 'PRODUCTION', 'SUPPLY', 'DEMAND', 'STOCKS', 'EXPORTS', 'GRINDINGS', 'POSITIONING', 'MACRO', 'POLITICS', 'LOGISTICS', 'DISEASE', 'MARKET', 'OTHER'];

const RULES = [
  ['DISEASE', /swollen shoot|black pod|pod rot|disease|virus|maladie|pourriture/i],
  ['WEATHER', /\brain|rainfall|drought|dry (spell|weather|season)|weather|harmattan|el ni[nñ]o|la ni[nñ]a|pluie|s[ée]cheresse|m[ée]t[ée]o/i],
  ['GRINDINGS', /grind|broyage/i],
  ['STOCKS', /stocks?\b|inventor|certified|warehouse|entrep[oô]t/i],
  ['EXPORTS', /arrival|export|shipment|arrivage|exportation/i],
  ['PRODUCTION', /crop|harvest|output|production|yield|mid-crop|main crop|r[ée]colte|campagne/i],
  ['POSITIONING', /\bfunds?\b|speculat|net (long|short)|hedge fund|\bcot\b/i],
  ['POLITICS', /government|regulator|farmgate|farm-gate|cocobod|conseil du caf[ée]|\bccc\b|\btax|election|gouvernement|prix bord champ|ban\b/i],
  ['LOGISTICS', /\bport\b|shipping|strike|gr[eè]ve|freight|logisti/i],
  ['DEMAND', /demand|consumption|chocolate (sales|makers|demand)|demande|consommation/i],
  ['MACRO', /dollar|\bfed\b|inflation|interest rate|recession/i],
  ['MARKET', /price|futures|rally|slump|surge|plunge|record|soar|tumble|cours|prix|hausse|baisse|flamb/i],
];

const DOWN = /cut|lower|declin|drop|fall|fell|shortfall|slump|shrink|weak|baisse|recul|chute|d[ée]ficit|poor/i;
const UP = /raise|higher|increas|rise|rising|rose|bumper|record|strong|improv|hausse|progress|abondan/i;

export function isRelevant(title) {
  return /cocoa|cacao|chocolat/i.test(title);
}

export function classify(title) {
  const category = RULES.find(([, re]) => re.test(title))?.[0] ?? 'OTHER';
  let direction = 'NEUTRAL';
  const down = DOWN.test(title), up = UP.test(title);
  if (down !== up) {
    // for supply-type news, less supply is bullish; for demand-type news, less demand is bearish
    const supply = ['PRODUCTION', 'EXPORTS', 'STOCKS', 'SUPPLY'].includes(category);
    const demand = ['GRINDINGS', 'DEMAND'].includes(category);
    if (supply) direction = down ? 'BULLISH' : 'BEARISH';
    if (demand) direction = down ? 'BEARISH' : 'BULLISH';
  }
  if (category === 'DISEASE') direction = 'BULLISH';
  if (category === 'WEATHER' && /drought|dry|s[ée]cheresse|d[ée]ficit/i.test(title)) direction = 'BULLISH';
  return { category, direction, confidence: 'LOW', method: 'mots-clés' };
}

const TIERS = [
  [15, /icco|cocobod|conseil du caf|\bice\b|intercontinental exchange|noaa|cftc|gouvernement|ministry|minist[èe]re/i],
  [13, /reuters|bloomberg|financial times|\bft\b|wall street journal|\bwsj\b|\bafp\b|associated press|\bap\b/i],
  [9, /barchart|nasdaq|agricensus|confectionery|commodity|agri|food navigator|business insider|cnbc|les [ée]chos|jeune afrique|fraternit[ée] matin/i],
];
export const sourceTier = name => TIERS.find(([, re]) => re.test(name || ''))?.[0] ?? 5;

const IMPACT = { PRODUCTION: 15, WEATHER: 15, STOCKS: 15, SUPPLY: 15, POLITICS: 13, DISEASE: 15, EXPORTS: 12, GRINDINGS: 12, POSITIONING: 12, LOGISTICS: 10, DEMAND: 10, MARKET: 8, MACRO: 6, OTHER: 3 };
const THESIS = new Set(['PRODUCTION', 'WEATHER', 'STOCKS', 'EXPORTS', 'GRINDINGS', 'POSITIONING', 'DISEASE']);

// Importance 0-100 from the components listed in the spec (§58).
export function importance({ title, category, sources, hasPosition }) {
  const tier = Math.max(...sources.map(s => sourceTier(s.name)));
  const pcts = [...title.matchAll(/(\d+(?:[.,]\d+)?)\s?%/g)].map(m => Number(m[1].replace(',', '.')));
  const magnitude = pcts.some(p => p >= 10) ? 20 : pcts.some(p => p >= 5) ? 14 : /\d/.test(title) ? 8 : 4;
  const confirmation = Math.min(10, (sources.length - 1) * 4);
  let score = tier + 15 + magnitude + (IMPACT[category] ?? 3) + (hasPosition ? 5 : 0) + confirmation + (THESIS.has(category) ? 10 : 0);
  // rule 7: one unconfirmed, non-primary source can never be critical on its own
  if (sources.length < 2 && tier < 13) score = Math.min(score, 69);
  score = Math.max(0, Math.min(100, score));
  return { importance: score, level: levelOf(score), tier };
}

const STOP = new Set('the a an of to in on for and or with as at by from is are be its it that this after amid over into du de la le les des et en au aux un une pour sur par dans avec est sont cocoa cacao prices price'.split(' '));
export function tokens(title) {
  const t = title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/(\d)[,.\s\u202f](?=\d{3}\b)/g, '$1') // 42,400 / 42 400 -> 42400
    .replace(/[^a-z0-9% ]/g, ' ')
    .replace(/([a-z])(\d)/g, '$1 $2').replace(/(\d)([a-z])/g, '$1 $2'); // GHC42400 -> ghc 42400
  return [...new Set(t.split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)))];
}

export function similarity(a, b) {
  const A = new Set(a), B = new Set(b);
  const inter = [...A].filter(x => B.has(x)).length;
  return inter / (A.size + B.size - inter || 1);
}

// Returns the event an item belongs to, or null if it is a new fact.
// Distinctive numbers (a price, a tonnage…) identify a fact better than words; years do not.
export const keyNumbers = tokens => tokens.filter(w => /^\d{3,}$/.test(w) && !(Number(w) >= 1900 && Number(w) <= 2100));

export function matchEvent(itemTokens, events, threshold = 0.45) {
  let best = null, bestScore = 0;
  const nums = keyNumbers(itemTokens);
  for (const e of events) {
    let s = similarity(itemTokens, e.tokens);
    // same distinctive figure and a few shared words: same fact told differently
    if (nums.length && keyNumbers(e.tokens).some(n => nums.includes(n)) && s >= 0.12) s = Math.max(s, threshold);
    if (s > bestScore) { bestScore = s; best = e; }
  }
  return bestScore >= threshold ? best : null;
}
