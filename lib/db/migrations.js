// Schema, applied automatically on first use (no SQL to paste by hand).
// Each step runs once; the version is recorded in schema_version.
// Row Level Security is on everywhere with no public policy: only the server (DATABASE_URL) reads and writes.

export const MIGRATIONS = [
  {
    version: 1,
    name: 'initial schema',
    sql: `
create table if not exists settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists trade_positions (
  id integer generated always as identity primary key,
  is_active boolean not null default true,
  product jsonb not null,
  plan jsonb not null,
  price_source text not null default 'NY_COCOA',
  manual_price double precision,
  manual_price_at timestamptz,
  stop_price double precision,
  targets jsonb not null default '[]',
  stop_history jsonb not null default '[]',
  closed boolean not null default false,
  close_price double precision,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists one_active_position on trade_positions (is_active) where is_active;

create table if not exists trade_entries (
  id integer generated always as identity primary key,
  position_id integer not null references trade_positions(id) on delete cascade,
  entry_number integer not null check (entry_number between 1 and 3),
  price double precision not null,
  quantity double precision not null,
  capital_eur double precision not null default 0,
  fees_eur double precision not null default 0,
  executed_on date not null,
  off_rules boolean not null default false,
  rule_errors jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table if not exists trade_journal (
  id integer generated always as identity primary key,
  position_id integer references trade_positions(id) on delete set null,
  written_at timestamptz not null default now(),
  answers jsonb,
  text text,
  auto boolean not null default false,
  snapshot jsonb
);

create table if not exists market_prices (
  id integer generated always as identity primary key,
  instrument_id text not null,
  price double precision not null,
  change_pct double precision,
  data_time timestamptz not null,
  fetched_at timestamptz not null default now(),
  source text not null,
  is_delayed boolean not null,
  unique (instrument_id, data_time)
);

create table if not exists data_source_status (
  source text primary key,
  status text not null,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error text
);

create table if not exists alerts (
  id integer generated always as identity primary key,
  created_at timestamptz not null default now(),
  category text not null,
  level text not null,
  importance integer not null,
  title text not null,
  message text,
  source text,
  fingerprint text unique,
  data jsonb,
  acknowledged_at timestamptz
);
create index if not exists alerts_created on alerts (created_at desc);

create table if not exists telegram_notifications (
  id integer generated always as identity primary key,
  alert_id integer references alerts(id) on delete set null,
  fingerprint text,
  importance integer,
  sent_at timestamptz not null default now(),
  telegram_message_id bigint,
  status text not null
);

alter table settings enable row level security;
alter table trade_positions enable row level security;
alter table trade_entries enable row level security;
alter table trade_journal enable row level security;
alter table market_prices enable row level security;
alter table data_source_status enable row level security;
alter table alerts enable row level security;
alter table telegram_notifications enable row level security;
`,
  },
  {
    version: 2,
    name: 'remove move alerts computed with a wrong previous close',
    sql: `
delete from alerts where fingerprint like 'move:%';
update market_prices set change_pct = null;
`,
  },
];
