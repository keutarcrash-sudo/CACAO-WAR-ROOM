// Collects headlines, groups duplicates into one master event, scores it, raises events when it matters.
import * as repo from '../db/repo.js';
import { emit } from './notify.js';
import { fetchNews } from '../providers/news/googlenews.js';
import { isRelevant, classify, importance, tokens, matchEvent } from '../engines/news.js';

const MIN_INTERVAL = 10 * 60e3;

export async function refreshNews(sql, { force = false, now = Date.now() } = {}) {
  const last = await repo.getCache(sql, 'news:last');
  if (!force && last && now - last.fetchedAt < MIN_INTERVAL) return { skipped: true };
  let items;
  try { items = await fetchNews(); }
  catch (e) { await repo.setCache(sql, 'news:last', { ok: false, error: String(e.message || e) }); return { error: String(e.message || e) }; }
  await repo.setCache(sql, 'news:last', { ok: true, count: items.length });

  const fresh = items.filter(i => isRelevant(i.title) && now - i.publishedAt < 72 * 3600e3);
  const known = await repo.knownNewsUrls(sql, fresh.map(i => i.url));
  const events = await repo.recentNewsEvents(sql);
  const trade = await repo.getActiveTrade(sql);
  const hasPosition = trade.entries.length > 0 && !trade.closed;
  let created = 0, merged = 0;

  for (const item of fresh.sort((a, b) => a.publishedAt - b.publishedAt)) {
    if (known.has(item.url)) continue;
    known.add(item.url);
    const tk = tokens(item.title);
    const src = { name: item.source, url: item.url, publishedAt: item.publishedAt };
    const match = matchEvent(tk, events);
    if (match) {
      if (match.sources.some(s => s.name === src.name)) { await repo.addNewsItem(sql, item, match.id); continue; }
      const sources = [...match.sources, src];
      const imp = importance({ title: match.title, category: match.category, sources, hasPosition });
      const before = match.level;
      await repo.updateNewsEvent(sql, match.id, { sources, importance: imp.importance, level: imp.level });
      Object.assign(match, { sources, importance: imp.importance, level: imp.level });
      await repo.addNewsItem(sql, item, match.id);
      merged++;
      if (imp.level !== before && imp.level !== 'INFORMATION') await raise(sql, match);
    } else {
      const c = classify(item.title);
      const imp = importance({ title: item.title, category: c.category, sources: [src], hasPosition });
      const ev = await repo.createNewsEvent(sql, { title: item.title, ...c, importance: imp.importance, level: imp.level, sources: [src], tokens: tk, firstSeen: item.publishedAt });
      events.push(ev);
      await repo.addNewsItem(sql, item, ev.id);
      created++;
      if (ev.level !== 'INFORMATION') await raise(sql, ev);
    }
  }
  return { fetched: items.length, relevant: fresh.length, created, merged };
}

// One alert per event and level: an escalation (IMPORTANT → CRITICAL) is a new alert, a repeat is not.
function raise(sql, ev) {
  const dir = { BULLISH: 'impact potentiel haussier', BEARISH: 'impact potentiel baissier', NEUTRAL: 'impact non déterminé' }[ev.direction];
  return emit(sql, {
    category: 'NEWS', level: ev.level, importance: ev.importance, title: ev.title,
    message: `${ev.category} · ${dir} (classement par mots-clés, confiance faible) · ${ev.sources.length} source${ev.sources.length > 1 ? 's' : ''} : ${ev.sources.map(s => s.name).join(', ')}.`,
    source: ev.sources[0]?.name, fingerprint: `news:${ev.id}:${ev.level}`, data: { eventId: ev.id, url: ev.sources[0]?.url },
  });
}
