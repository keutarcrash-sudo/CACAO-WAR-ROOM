// Runs the real schema and queries against an in-process Postgres (PGlite) through the wire protocol.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { connect, migrate, parseDatabaseUrl } from '../lib/db/client.js';
import * as repo from '../lib/db/repo.js';
import { runAction } from '../lib/services/trade.js';

let pg, server, sql;
const ctx = { eurPerUnitFor: async () => 0.85 };

beforeAll(async () => {
  pg = await PGlite.create();
  server = new PGLiteSocketServer({ db: pg, port: 55433 });
  await server.start();
  sql = connect('postgres://postgres:postgres@127.0.0.1:55433/postgres');
  await migrate(sql);
  await migrate(sql); // idempotent
}, 30000);

afterAll(async () => { await sql?.end(); await server?.stop(); await pg?.close(); });

describe('schema', () => {
  it('records the migration once', async () => {
    const v = await sql`select version from schema_version`;
    expect(v.map(r => r.version)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe('login failures', () => {
  it('counts failed attempts per address and in total, over a window', async () => {
    await repo.addLoginFailure(sql, '1.1.1.1');
    await repo.addLoginFailure(sql, '1.1.1.1');
    await repo.addLoginFailure(sql, '2.2.2.2');
    expect(await repo.loginFailures(sql, '1.1.1.1', 15 * 60e3)).toEqual({ total: 3, ip: 2 });
    await sql`update login_failures set at = now() - interval '20 minutes' where ip = '1.1.1.1'`;
    expect(await repo.loginFailures(sql, '1.1.1.1', 15 * 60e3)).toEqual({ total: 1, ip: 0 });
  });
});

describe('trade flow', () => {
  it('creates one active position on first read', async () => {
    const a = await repo.getActiveTrade(sql), b = await repo.getActiveTrade(sql);
    expect(a.id).toBe(b.id);
    expect(a.entries).toEqual([]);
    expect(a.plan.plannedCapital).toBe(150);
  });

  it('refuses an entry without stop, then accepts it once the stop is set', async () => {
    await expect(runAction(sql, { action: 'addEntry', price: 6950, qty: 0.05, capitalEur: 30 }, ctx)).rejects.toMatchObject({ status: 422 });
    await runAction(sql, { action: 'levels', stop: 6500, targets: [7600, ''] }, ctx);
    const t = await runAction(sql, { action: 'addEntry', price: 6950, qty: 0.05, capitalEur: 30, date: '2026-09-20' }, ctx);
    expect(t.stop).toBe(6500);
    expect(t.targets).toEqual([7600]);
    expect(t.entries).toHaveLength(1);
    expect(t.entries[0]).toMatchObject({ n: 1, price: 6950, qty: 0.05, capitalEur: 30, date: '2026-09-20', offRules: false });
  });

  it('stores an off-rules entry only with override, and journals it', async () => {
    const body = { action: 'addEntry', price: 6800, qty: 5, capitalEur: 50 };
    await expect(runAction(sql, body, ctx)).rejects.toMatchObject({ status: 422 });
    const t = await runAction(sql, { ...body, override: true }, ctx);
    expect(t.entries[1].offRules).toBe(true);
    const notes = await repo.listJournal(sql);
    expect(notes[0].auto).toBe(true);
  });

  it('renumbers entries after a delete', async () => {
    let t = await repo.getActiveTrade(sql);
    t = await runAction(sql, { action: 'deleteEntry', id: t.entries[0].id }, ctx);
    expect(t.entries.map(e => e.n)).toEqual([1]);
  });

  it('logs stop moves and flags a widened stop', async () => {
    await runAction(sql, { action: 'levels', stop: 6000, targets: [] }, ctx);
    const alerts = await repo.listAlerts(sql);
    expect(alerts[0].title).toBe('Stop éloigné');
    const t = await repo.getActiveTrade(sql);
    expect(t.stopHistory.map(h => h.to)).toEqual([6500, 6000]);
  });

  it('forces manual price for non-USD products', async () => {
    const t = await runAction(sql, { action: 'settings', product: { priceCurrency: 'GBP' }, priceSource: 'NY_COCOA' }, ctx);
    expect(t.priceSource).toBe('manual');
    const t2 = await runAction(sql, { action: 'manualPrice', price: 4231 }, ctx);
    expect(t2.manualPrice.price).toBe(4231);
  });

  it('closes then opens a new position keeping product and plan', async () => {
    await runAction(sql, { action: 'close' }, ctx);
    const t = await runAction(sql, { action: 'newPosition' }, ctx);
    expect(t.entries).toEqual([]);
    expect(t.product.priceCurrency).toBe('GBP');
    const actives = await sql`select count(*)::int as n from trade_positions where is_active`;
    expect(actives[0].n).toBe(1);
  });
});

describe('alerts and market', () => {
  it('deduplicates alerts by fingerprint', async () => {
    const a = { category: 'MARKET', level: 'IMPORTANT', importance: 45, title: 'x', fingerprint: 'fp-1' };
    expect(await repo.addAlert(sql, a)).not.toBeNull();
    expect(await repo.addAlert(sql, a)).toBeNull();
  });
  it('acknowledges alerts', async () => {
    const a = await repo.addAlert(sql, { category: 'RISK', level: 'CRITICAL', importance: 90, title: 'y', fingerprint: 'fp-2' });
    await repo.acknowledgeAlert(sql, a.id);
    expect((await repo.listAlerts(sql)).find(x => x.id === a.id).acknowledged).toBe(true);
  });
  it('reports the previous source status', async () => {
    expect(await repo.setSourceStatus(sql, 'src', true)).toBeNull();
    expect(await repo.setSourceStatus(sql, 'src', false, 'boom')).toBe('OK');
  });
  it('keeps one price per data time', async () => {
    const p = { instrumentId: 'NY_COCOA', price: 7000, changePct: 1, dataTime: 1790000000000, source: 's', delayed: true };
    await repo.recordPrice(sql, p); await repo.recordPrice(sql, p);
    expect((await sql`select count(*)::int as n from market_prices`)[0].n).toBe(1);
  });
  it('stores settings', async () => {
    await repo.setSetting(sql, 'last_visit', { price: 1 });
    await repo.setSetting(sql, 'last_visit', { price: 2 });
    expect(await repo.getSetting(sql, 'last_visit')).toEqual({ price: 2 });
  });
});

describe('DATABASE_URL parsing', () => {
  const base = 'postgres.abc:PASS@aws-0-eu-central-1.pooler.supabase.com:6543/postgres';
  const pw = u => parseDatabaseUrl(`postgresql://${u}`).password;
  it('reads a normal Supabase pooler URL', () => {
    expect(parseDatabaseUrl(`postgresql://${base}`)).toEqual({ host: 'aws-0-eu-central-1.pooler.supabase.com', port: 6543, database: 'postgres', username: 'postgres.abc', password: 'PASS' });
  });
  it('tolerates brackets, raw special characters, encoding and spaces', () => {
    expect(pw(base.replace('PASS', '[Secret42]'))).toBe('Secret42');
    expect(pw(base.replace('PASS', 'a@b#c/d?e'))).toBe('a@b#c/d?e');
    expect(pw(base.replace('PASS', 'a%40b'))).toBe('a@b');
    expect(pw(base.replace('PASS', '100%sure'))).toBe('100%sure');
    expect(parseDatabaseUrl(`  postgresql://${base}\n`).port).toBe(6543);
  });
  it('rejects something that is not a connection string', () => {
    expect(() => parseDatabaseUrl('https://abc.supabase.co')).toThrow();
  });
});

describe('fundamentals service', () => {
  it('works with every source offline, then with manual entries', async () => {
    const { loadFundamentals } = await import('../lib/services/fundamentals.js');
    const real = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error('offline'); };
    try {
      let r = await loadFundamentals(sql);
      expect(r.score.bias).toBe('INSUFFICIENT');
      expect(r.factors.every(f => f.score == null)).toBe(true);
      expect(r.cot.status).toBe('OFFLINE');
      await repo.addFundamental(sql, { metric: 'production', region: 'GH', value: 620, previous: 760, dataTime: new Date().toISOString(), source: 'COCOBOD' });
      await repo.addFundamental(sql, { metric: 'stocks', region: 'ICE_US', value: 90, previous: 100, dataTime: new Date().toISOString(), source: 'ICE' });
      await repo.addFundamental(sql, { metric: 'grindings', region: 'EU', value: 105, previous: 100, dataTime: new Date().toISOString(), source: 'ECA' });
      r = await loadFundamentals(sql);
      expect(r.score.coverage).toBe(3);
      expect(r.score.bias).toBe('BULLISH');
      expect((await repo.listAlerts(sql)).some(a => a.category === 'FUNDAMENTALS')).toBe(true);
    } finally { globalThis.fetch = real; }
  });
});

describe('news service', () => {
  it('stores master events, merges duplicates, raises alerts once', async () => {
    const { refreshNews } = await import('../lib/services/news.js');
    const real = globalThis.fetch;
    const now = Date.now();
    const rss = items => `<rss><channel>${items.map(([t, s, u]) => `<item><title>${t} - ${s}</title><link>${u}</link><pubDate>${new Date(now - 3600e3).toUTCString()}</pubDate><source url="x">${s}</source></item>`).join('')}</channel></rss>`;
    let feed = rss([['Ghana cuts cocoa crop forecast by 18%', 'Reuters', 'https://n/1']]);
    globalThis.fetch = async () => new Response(feed, { status: 200 });
    try {
      let r = await refreshNews(sql, { force: true });
      expect(r.created).toBe(1);
      feed = rss([['Ghana cuts cocoa crop forecast by 18%', 'Reuters', 'https://n/1'], ['Ghana cuts cocoa crop forecast 18 percent', 'Bloomberg', 'https://n/2']]);
      r = await refreshNews(sql, { force: true });
      expect(r).toMatchObject({ created: 0, merged: 1 });
      const ev = await repo.recentNewsEvents(sql);
      expect(ev[0].sources.map(s => s.name)).toEqual(['Reuters', 'Bloomberg']);
      expect(ev[0].level).toBe('CRITICAL');
      const alerts = (await repo.listAlerts(sql)).filter(a => a.category === 'NEWS');
      expect(alerts.map(a => a.level)).toEqual(['CRITICAL']); // Reuters alone is already reliable; the merge adds no new alert
      const log = await repo.recentNotifications(sql);
      expect(log[0].status).toBe('NOT_CONFIGURED');
    } finally { globalThis.fetch = real; }
  });
});
