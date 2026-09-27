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
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  return postgres(url, { max: local ? 1 : 3, prepare: false, ssl: local ? false : 'require', idle_timeout: 20, connect_timeout: 10 });
}

export async function migrate(db) {
  await db.begin(async t => {
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
export async function db() {
  if (!sql) sql = connect();
  if (!ready) ready = migrate(sql).catch(e => { ready = null; throw e; });
  await ready;
  return sql;
}

// For tests.
export function useDb(instance) {
  sql = instance;
  ready = migrate(instance);
  return ready;
}
