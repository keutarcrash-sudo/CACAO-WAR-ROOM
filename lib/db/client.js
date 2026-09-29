import postgres from 'postgres';
import { MIGRATIONS } from './migrations.js';

let sql = null;
let ready = null;

export class DbNotConfigured extends Error {
  constructor() { super('DATABASE_URL manquant'); this.code = 'DB_NOT_CONFIGURED'; }
}

// Supabase: use the "Transaction pooler" connection string (port 6543). It does not support
// prepared statements, hence prepare: false. Local test databases run without TLS.
export function connect(url = process.env.DATABASE_URL) {
  if (!url) throw new DbNotConfigured();
  const c = parseDatabaseUrl(url);
  const local = c.host === 'localhost' || c.host === '127.0.0.1';
  return postgres({ ...c, max: local ? 1 : 3, prepare: false, ssl: local ? false : 'require', idle_timeout: 20, connect_timeout: 10 });
}

// Reads the connection string by hand so the usual copy mistakes still work:
// brackets left around the password, special characters (@ # / ? %) not URL-encoded,
// spaces or line breaks around the value.
export function parseDatabaseUrl(raw) {
  const url = String(raw).trim();
  const m = url.match(/^postgres(?:ql)?:\/\/([^:\/]+):(.*)@([^@\/:]+)(?::(\d+))?\/([^?\s]*)/);
  if (!m) throw Object.assign(new TypeError('Invalid URL'), { code: 'BAD_URL' });
  let password = m[2].trim();
  if (/^\[.*\]$/.test(password)) password = password.slice(1, -1);
  try { password = decodeURIComponent(password); } catch { /* raw special characters: keep as typed */ }
  return { host: m[3], port: Number(m[4] || 5432), database: m[5] || 'postgres', username: decodeURIComponent(m[1]), password };
}

const LATEST = Math.max(...MIGRATIONS.map(m => m.version));

export async function migrate(db) {
  // Already up to date (the usual case): no lock at all, so a stuck session elsewhere can never
  // block a new server instance from answering.
  try {
    const [r] = await db`select max(version) as v from schema_version`;
    if (Number(r?.v) >= LATEST) return;
  } catch { /* first run: the table does not exist yet */ }
  await db.begin(async t => {
    // never wait forever for another instance's migration
    await t`set local lock_timeout = '8s'`;
    await t`select pg_advisory_xact_lock(727274)`;
    await t`create table if not exists schema_version (version integer primary key, name text, applied_at timestamptz not null default now())`;
    const done = new Set((await t`select version from schema_version`).map(r => r.version));
    for (const m of MIGRATIONS) {
      if (done.has(m.version)) continue;
      await t.unsafe(m.sql);
      await t`insert into schema_version (version, name) values (${m.version}, ${m.name})`;
    }
  });
}

// One pool per serverless instance, migrated once.
// The hosting platform freezes an instance between requests: its open connections can be dead when it
// wakes up, and a query sent on a dead socket waits forever. After a pause, check the pool first and
// start a fresh one if it does not answer quickly.
const IDLE_CHECK = 15000;
let lastUsed = 0;

const answers = s => Promise.race([
  s`select 1`.then(() => true, () => false),
  new Promise(r => setTimeout(() => r(false), 4000)),
]);

export function resetDb() {
  const old = sql;
  sql = null; ready = null;
  if (old) old.end({ timeout: 0 }).catch(() => {});
}

export async function db() {
  if (sql && ready && Date.now() - lastUsed > IDLE_CHECK && !(await answers(sql))) resetDb();
  if (!sql) sql = connect();
  if (!ready) ready = migrate(sql).catch(e => { ready = null; throw e; });
  await ready;
  lastUsed = Date.now();
  return sql;
}

// For tests.
export function useDb(instance) {
  sql = instance;
  ready = migrate(instance);
  return ready;
}
