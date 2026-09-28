import { describe, it, expect } from 'vitest';
import { parseRss } from '../lib/providers/news/googlenews.js';
import { classify, importance, tokens, matchEvent, isRelevant, sourceTier } from '../lib/engines/news.js';
import { decide } from '../lib/services/notify.js';
import { alertMessage, statusMessage } from '../lib/telegram/messages.js';

// Written from the documented Google News RSS shape (not captured live).
const RSS = `<?xml version="1.0"?><rss><channel>
<item><title>Ghana cuts cocoa crop forecast by 18% - Reuters</title><link>https://news.google.com/a</link><pubDate>Sun, 27 Sep 2026 09:14:00 GMT</pubDate><source url="https://reuters.com">Reuters</source></item>
<item><title><![CDATA[Cacao : la récolte ivoirienne en baisse &amp; les prix flambent - Les Echos]]></title><link>https://news.google.com/b</link><pubDate>Sun, 27 Sep 2026 10:00:00 GMT</pubDate><source url="https://lesechos.fr">Les Echos</source></item>
</channel></rss>`;

describe('news', () => {
  it('parses RSS and strips the source suffix', () => {
    const r = parseRss(RSS);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ title: 'Ghana cuts cocoa crop forecast by 18%', source: 'Reuters', url: 'https://news.google.com/a' });
    expect(r[1].title).toBe('Cacao : la récolte ivoirienne en baisse & les prix flambent');
  });
  it('classifies cautiously', () => {
    expect(classify('Ghana cuts cocoa crop forecast by 18%')).toMatchObject({ category: 'PRODUCTION', direction: 'BULLISH', confidence: 'LOW' });
    expect(classify('Europe cocoa grindings fall 7% in Q3').direction).toBe('BEARISH');
    expect(classify('Cocoa prices rally').direction).toBe('NEUTRAL');
    expect(isRelevant('Coffee prices slump')).toBe(false);
  });
  it('scores importance and applies rule 7', () => {
    const one = importance({ title: 'Ghana cuts cocoa crop forecast by 18%', category: 'PRODUCTION', sources: [{ name: 'Blog' }] });
    expect(one.importance).toBeLessThanOrEqual(69);
    const two = importance({ title: 'Ghana cuts cocoa crop forecast by 18%', category: 'PRODUCTION', sources: [{ name: 'Reuters' }, { name: 'Bloomberg' }] });
    expect(two.level).toBe('CRITICAL');
    expect(sourceTier('COCOBOD')).toBe(15);
  });
  it('groups the same fact reported by several media', () => {
    const ev = [{ id: 1, tokens: tokens('Ghana cuts cocoa crop forecast by 18%') }, { id: 2, tokens: tokens('Ivory Coast port strike halts shipments') }];
    expect(matchEvent(tokens('Ghana cuts its cocoa crop forecast 18% amid disease'), ev)?.id).toBe(1);
    expect(matchEvent(tokens('Chocolate makers raise prices in Europe'), ev)).toBeNull();
  });
});

describe('telegram anti-spam', () => {
  const now = 1_800_000_000_000;
  const crit = { level: 'CRITICAL', category: 'RISK', title: 'Stop proche', importance: 75 };
  it('only critical events, silent mode, cooldown with escalation, daily cap', () => {
    expect(decide({ alert: { ...crit, level: 'IMPORTANT' }, silent: false, recent: [], now })).toBe('NOT_CRITICAL');
    expect(decide({ alert: crit, silent: true, recent: [], now })).toBe('SUPPRESSED_SILENT');
    expect(decide({ alert: { ...crit, importance: 90 }, silent: true, recent: [], now })).toBe('SEND');
    const sent = [{ family: 'RISK:Stop proche', status: 'SENT', importance: 75, sentAt: now - 10 * 60e3 }];
    expect(decide({ alert: crit, silent: false, recent: sent, now })).toBe('SUPPRESSED_COOLDOWN');
    expect(decide({ alert: { ...crit, importance: 92 }, silent: false, recent: sent, now })).toBe('SEND');
    const many = Array.from({ length: 6 }, (_, i) => ({ family: `X:${i}`, status: 'SENT', importance: 80, sentAt: now - i * 3600e3 }));
    expect(decide({ alert: crit, silent: false, recent: many, now })).toBe('SUPPRESSED_CAP');
  });
  it('writes readable messages and escapes HTML', () => {
    expect(alertMessage({ level: 'CRITICAL', title: 'A <b> & B', importance: 80, category: 'NEWS', source: 'x' })).toContain('A &lt;b&gt; &amp; B');
    const s = statusMessage({ quote: { price: 5619, changePct: -1.2 }, fund: { bias: 'BULLISH', total: 7 }, war: { doNothing: true, status: 'NO_SETUP', score: 3, reasons: [{ t: 'Rien' }] }, position: { capital: 0, pnl: null, avg: null, lossAtStop: null }, trade: { plan: { plannedCapital: 150, maxLoss: 50 } } });
    expect(s).toContain('$5,619');
    expect(s).toContain('rien à faire');
  });
});
