// Google News RSS: headlines, source name, link and date. No article text (paywalled sources stay paywalled).
export const SOURCE = { name: 'Google News RSS', url: 'https://news.google.com' };

export const FEEDS = [
  { lang: 'en', url: 'https://news.google.com/rss/search?q=cocoa+(prices+OR+futures+OR+crop+OR+Ghana+OR+%22Ivory+Coast%22+OR+grindings)+when:3d&hl=en-US&gl=US&ceid=US:en' },
  { lang: 'fr', url: 'https://news.google.com/rss/search?q=cacao+(prix+OR+r%C3%A9colte+OR+%22C%C3%B4te+d%27Ivoire%22+OR+Ghana)+when:3d&hl=fr&gl=FR&ceid=FR:fr' },
];

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export const decode = s => String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m)
  .replace(/<[^>]+>/g, '')
  .trim();

const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i')); return m ? decode(m[1]) : null; };

export function parseRss(xml) {
  const items = [];
  for (const m of String(xml).matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const it = m[1];
    const source = tag(it, 'source');
    let title = tag(it, 'title') || '';
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    const link = tag(it, 'link');
    const date = Date.parse(tag(it, 'pubDate') || '');
    if (title && link) items.push({ title, url: link, source: source || 'inconnu', publishedAt: Number.isFinite(date) ? date : Date.now() });
  }
  return items;
}

export async function fetchNews(fetchImpl = fetch) {
  const results = await Promise.allSettled(FEEDS.map(async f => {
    const res = await fetchImpl(f.url, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'Mozilla/5.0 (CocoaWarRoom)' } });
    if (!res.ok) throw new Error(`Google News HTTP ${res.status}`);
    return parseRss(await res.text()).map(i => ({ ...i, lang: f.lang }));
  }));
  const ok = results.filter(r => r.status === 'fulfilled').flatMap(r => r.value);
  if (!ok.length && results.every(r => r.status === 'rejected')) throw results[0].reason;
  return ok;
}
