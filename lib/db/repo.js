// Data access. Every function takes the `sql` client first so tests can use a local database.
import { DEFAULT_PLAN, DEFAULT_PRODUCT } from '../engines/trade.js';

const ms = d => (d ? new Date(d).getTime() : null);

/* ---------- settings ---------- */
export async function getSetting(sql, key, fallback = null) {
  const [r] = await sql`select value from settings where key = ${key}`;
  return r ? r.value : fallback;
}
export async function setSetting(sql, key, value) {
  await sql`insert into settings (key, value) values (${key}, ${sql.json(value)})
            on conflict (key) do update set value = excluded.value, updated_at = now()`;
}

/* ---------- trade ---------- */
function mapEntry(r) {
  return {
    id: r.id, n: r.entry_number, price: r.price, qty: r.quantity, capitalEur: r.capital_eur,
    feesEur: r.fees_eur, date: r.executed_on instanceof Date ? r.executed_on.toISOString().slice(0, 10) : String(r.executed_on),
    offRules: r.off_rules, ruleErrors: r.rule_errors,
  };
}
function mapPosition(p, entries) {
  return {
    id: p.id,
    product: p.product,
    plan: p.plan,
    priceSource: p.price_source,
    manualPrice: p.manual_price != null ? { price: p.manual_price, at: ms(p.manual_price_at) } : null,
    stop: p.stop_price,
    targets: p.targets,
    stopHistory: p.stop_history,
    closed: p.closed,
    closePrice: p.close_price,
    closedAt: ms(p.closed_at),
    createdAt: ms(p.created_at),
    entries: entries.map(mapEntry),
  };
}

export async function getActiveTrade(sql) {
  let [p] = await sql`select * from trade_positions where is_active`;
  if (!p) {
    [p] = await sql`insert into trade_positions (product, plan) values (${sql.json(DEFAULT_PRODUCT)}, ${sql.json(DEFAULT_PLAN)})
                    on conflict do nothing returning *`;
    if (!p) [p] = await sql`select * from trade_positions where is_active`; // created concurrently
  }
  const entries = await sql`select * from trade_entries where position_id = ${p.id} order by entry_number`;
  return mapPosition(p, entries);
}

const FIELDS = {
  product: v => ['product', v], plan: v => ['plan', v], priceSource: v => ['price_source', v],
  stop: v => ['stop_price', v], targets: v => ['targets', v], stopHistory: v => ['stop_history', v],
  closed: v => ['closed', v], closePrice: v => ['close_price', v],
};

export async function updateTrade(sql, id, patch) {
  const row = {};
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'manualPrice') { row.manual_price = v?.price ?? null; row.manual_price_at = v ? new Date(v.at ?? Date.now()) : null; continue; }
    if (k === 'closedAt') { row.closed_at = v ? new Date(v) : null; continue; }
    const f = FIELDS[k];
    if (!f) continue;
    const [col, val] = f(v);
    row[col] = val !== null && typeof val === 'object' ? sql.json(val) : val;
  }
  if (!Object.keys(row).length) return;
  row.updated_at = new Date();
  await sql`update trade_positions set ${sql(row)} where id = ${id}`;
}

export async function addEntry(sql, positionId, e) {
  const [r] = await sql`insert into trade_entries ${sql({
    position_id: positionId, entry_number: e.n, price: e.price, quantity: e.qty, capital_eur: e.capitalEur ?? 0,
    fees_eur: e.feesEur ?? 0, executed_on: e.date, off_rules: !!e.offRules, rule_errors: sql.json(e.ruleErrors || []),
  })} returning *`;
  return mapEntry(r);
}

export async function deleteEntry(sql, positionId, entryId) {
  await sql.begin(async t => {
    await t`delete from trade_entries where id = ${entryId} and position_id = ${positionId}`;
    const rest = await t`select id from trade_entries where position_id = ${positionId} order by entry_number`;
    for (let i = 0; i < rest.length; i++) await t`update trade_entries set entry_number = ${i + 1} where id = ${rest[i].id}`;
  });
}

// Archives the active position and opens a fresh one with the same product and plan.
export async function newPosition(sql) {
  return sql.begin(async t => {
    const [cur] = await t`update trade_positions set is_active = false, updated_at = now() where is_active returning product, plan`;
    const [p] = await t`insert into trade_positions (product, plan) values (${t.json(cur?.product || DEFAULT_PRODUCT)}, ${t.json(cur?.plan || DEFAULT_PLAN)}) returning *`;
    return mapPosition(p, []);
  });
}

/* ---------- journal ---------- */
function mapNote(r) {
  return { id: r.id, at: ms(r.written_at), answers: r.answers, text: r.text, auto: r.auto, snap: r.snapshot, positionId: r.position_id };
}
export async function listJournal(sql, limit = 100) {
  return (await sql`select * from trade_journal order by written_at desc limit ${limit}`).map(mapNote);
}
export async function addNote(sql, { positionId = null, answers = null, text = null, auto = false, snapshot = null }) {
  const [r] = await sql`insert into trade_journal ${sql({ position_id: positionId, answers: answers ? sql.json(answers) : null, text, auto, snapshot: snapshot ? sql.json(snapshot) : null })} returning *`;
  return mapNote(r);
}

/* ---------- market ---------- */
export async function recordPrice(sql, { instrumentId, price, changePct, dataTime, source, delayed }) {
  if (price == null || !dataTime) return;
  await sql`insert into market_prices ${sql({ instrument_id: instrumentId, price, change_pct: changePct, data_time: new Date(dataTime), source, is_delayed: delayed })}
            on conflict (instrument_id, data_time) do nothing`;
}

// Returns the status stored before this call, so the caller can detect a transition.
export async function setSourceStatus(sql, source, ok, error = null) {
  const [prev] = await sql`select status from data_source_status where source = ${source}`;
  if (ok) {
    await sql`insert into data_source_status (source, status, last_success_at) values (${source}, 'OK', now())
              on conflict (source) do update set status = 'OK', last_success_at = now()`;
  } else {
    await sql`insert into data_source_status (source, status, last_error_at, last_error) values (${source}, 'OFFLINE', now(), ${error})
              on conflict (source) do update set status = 'OFFLINE', last_error_at = now(), last_error = excluded.last_error`;
  }
  return prev?.status ?? null;
}

/* ---------- alerts ---------- */
function mapAlert(r) {
  return { id: r.id, at: ms(r.created_at), category: r.category, level: r.level, importance: r.importance, title: r.title, message: r.message, source: r.source, data: r.data, acknowledged: !!r.acknowledged_at };
}
// The fingerprint makes an event idempotent: the same fact is never stored twice.
export async function addAlert(sql, a) {
  const [r] = await sql`insert into alerts ${sql({ category: a.category, level: a.level, importance: a.importance, title: a.title, message: a.message ?? null, source: a.source ?? null, fingerprint: a.fingerprint ?? null, data: a.data ? sql.json(a.data) : null })}
                        on conflict (fingerprint) do nothing returning *`;
  return r ? mapAlert(r) : null;
}
export async function listAlerts(sql, limit = 40) {
  return (await sql`select * from alerts order by created_at desc, id desc limit ${limit}`).map(mapAlert);
}
export async function acknowledgeAlert(sql, id) {
  await sql`update alerts set acknowledged_at = now() where id = ${id} and acknowledged_at is null`;
}

/* ---------- export ---------- */
export async function exportAll(sql) {
  const [positions, entries, journal, alerts, settings] = await Promise.all([
    sql`select * from trade_positions order by id`, sql`select * from trade_entries order by id`,
    sql`select * from trade_journal order by id`, sql`select * from alerts order by id`, sql`select * from settings`,
  ]);
  return { app: 'cocoa-war-room', exportedAt: new Date().toISOString(), positions, entries, journal, alerts, settings };
}

/* ---------- external data cache ---------- */
export async function getCache(sql, key) {
  const [r] = await sql`select value, fetched_at, last_error, last_error_at from data_cache where key = ${key}`;
  return r ? { value: r.value, fetchedAt: ms(r.fetched_at), error: r.last_error, errorAt: ms(r.last_error_at) } : null;
}
export async function setCache(sql, key, value) {
  await sql`insert into data_cache (key, value) values (${key}, ${sql.json(value)})
            on conflict (key) do update set value = excluded.value, fetched_at = now(), last_error = null, last_error_at = null`;
}
export async function setCacheError(sql, key, error) {
  await sql`update data_cache set last_error = ${error}, last_error_at = now() where key = ${key}`;
}

/* ---------- fundamentals (manual entries) ---------- */
function mapFund(r) {
  return { id: r.id, metric: r.metric, region: r.region, value: r.value, previous: r.previous_value, period: r.period, dataTime: ms(r.data_time), source: r.source, sourceUrl: r.source_url, isEstimate: r.is_estimate, notes: r.notes, createdAt: ms(r.created_at) };
}
export async function listFundamentals(sql, limit = 200) {
  return (await sql`select * from fundamentals order by data_time desc, id desc limit ${limit}`).map(mapFund);
}
export async function addFundamental(sql, f) {
  const [r] = await sql`insert into fundamentals ${sql({ metric: f.metric, region: f.region, value: f.value, previous_value: f.previous ?? null, period: f.period ?? null, data_time: new Date(f.dataTime), source: f.source, source_url: f.sourceUrl ?? null, is_estimate: !!f.isEstimate, notes: f.notes ?? null })} returning *`;
  return mapFund(r);
}
export async function deleteFundamental(sql, id) {
  await sql`delete from fundamentals where id = ${id}`;
}

/* ---------- fundamental score history ---------- */
export async function lastScore(sql) {
  const [r] = await sql`select * from fundamental_scores order by computed_at desc, id desc limit 1`;
  return r ? { total: r.total, bias: r.bias, coverage: r.coverage, at: ms(r.computed_at) } : null;
}
export async function recordScore(sql, s, components) {
  await sql`insert into fundamental_scores ${sql({ total: s.total, bias: s.bias, coverage: s.coverage, components: sql.json(components) })}`;
}

/* ---------- telegram log ---------- */
export async function logNotification(sql, { alertId, family, importance, status }) {
  await sql`insert into telegram_notifications ${sql({ alert_id: alertId, fingerprint: family, importance, status })}`;
}
export async function recentNotifications(sql) {
  return (await sql`select fingerprint, importance, status, sent_at from telegram_notifications where sent_at > now() - interval '1 day' order by sent_at desc`)
    .map(r => ({ family: r.fingerprint, importance: r.importance, status: r.status, sentAt: ms(r.sent_at) }));
}

/* ---------- news ---------- */
function mapEvent(r) {
  return { id: r.id, title: r.title, category: r.category, direction: r.direction, confidence: r.confidence, method: r.method, importance: r.importance, level: r.level, sources: r.sources, tokens: r.tokens, firstSeen: ms(r.first_seen_at), updatedAt: ms(r.last_updated_at) };
}
export async function knownNewsUrls(sql, urls) {
  if (!urls.length) return new Set();
  return new Set((await sql`select url from news where url in ${sql(urls)}`).map(r => r.url));
}
export async function recentNewsEvents(sql, hours = 72, limit = 200) {
  return (await sql`select * from news_events where last_updated_at > now() - make_interval(hours => ${hours}) order by importance desc, last_updated_at desc limit ${limit}`).map(mapEvent);
}
export async function createNewsEvent(sql, e) {
  const [r] = await sql`insert into news_events ${sql({ title: e.title, category: e.category, direction: e.direction, confidence: e.confidence, method: e.method, importance: e.importance, level: e.level, sources: sql.json(e.sources), tokens: sql.json(e.tokens), first_seen_at: new Date(e.firstSeen) })} returning *`;
  return mapEvent(r);
}
export async function updateNewsEvent(sql, id, { sources, importance, level }) {
  await sql`update news_events set sources = ${sql.json(sources)}, importance = ${importance}, level = ${level}, last_updated_at = now() where id = ${id}`;
}
export async function addNewsItem(sql, i, eventId) {
  await sql`insert into news ${sql({ url: i.url, title: i.title, source_name: i.source, published_at: new Date(i.publishedAt), event_id: eventId })} on conflict (url) do nothing`;
}
