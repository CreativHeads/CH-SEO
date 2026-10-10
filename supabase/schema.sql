-- SEO Studio database for Supabase (Postgres).
-- Run once in Supabase: SQL Editor -> New query -> paste this file -> Run.
-- Safe to run again: it only creates what is missing.

CREATE TABLE IF NOT EXISTS audit_log (
  id text PRIMARY KEY,
  client_id text,
  actor text NOT NULL,
  action text NOT NULL,
  target text NOT NULL,
  detail text NOT NULL,
  created_at text NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_client_date ON audit_log (client_id, created_at);

CREATE TABLE IF NOT EXISTS clients (
  id text PRIMARY KEY,
  name text NOT NULL,
  url text NOT NULL,
  platform text NOT NULL,
  data text NOT NULL DEFAULT '{}',
  archived integer NOT NULL DEFAULT 0,
  revision integer NOT NULL DEFAULT 1,
  created_at text NOT NULL,
  updated_at text NOT NULL
);

CREATE TABLE IF NOT EXISTS connections (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES clients(id),
  provider text NOT NULL,
  status text NOT NULL,
  detail text NOT NULL,
  checked_at text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS connections_client_provider ON connections (client_id, provider);

CREATE TABLE IF NOT EXISTS records (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES clients(id),
  kind text NOT NULL,
  title text NOT NULL,
  status text NOT NULL,
  data text NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  created_by text NOT NULL,
  created_at text NOT NULL,
  updated_at text NOT NULL
);
CREATE INDEX IF NOT EXISTS records_client_kind ON records (client_id, kind);
CREATE INDEX IF NOT EXISTS records_kind_status ON records (kind, status);

CREATE TABLE IF NOT EXISTS record_history (
  id text PRIMARY KEY,
  record_id text NOT NULL REFERENCES records(id),
  revision integer NOT NULL,
  data text NOT NULL,
  actor text NOT NULL,
  created_at text NOT NULL
);
CREATE INDEX IF NOT EXISTS history_record ON record_history (record_id);

CREATE TABLE IF NOT EXISTS jobs (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES clients(id),
  kind text NOT NULL,
  status text NOT NULL,
  input text NOT NULL,
  result text NOT NULL DEFAULT '{}',
  error text,
  dedupe text NOT NULL,
  actor text NOT NULL,
  created_at text NOT NULL,
  updated_at text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS jobs_dedupe ON jobs (dedupe);
CREATE INDEX IF NOT EXISTS jobs_client ON jobs (client_id);

CREATE TABLE IF NOT EXISTS members (
  id text PRIMARY KEY,
  email text NOT NULL,
  name text NOT NULL,
  role text NOT NULL,
  active integer NOT NULL DEFAULT 1,
  created_at text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS members_email ON members (email);

CREATE TABLE IF NOT EXISTS client_secrets (
  client_id text PRIMARY KEY REFERENCES clients(id),
  cipher text NOT NULL,
  updated_at text NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY,
  value text NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_log (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES clients(id),
  provider text NOT NULL,
  purpose text NOT NULL,
  reserved_micros bigint NOT NULL,
  actual_micros bigint,
  status text NOT NULL,
  month text NOT NULL,
  created_at text NOT NULL
);
CREATE INDEX IF NOT EXISTS usage_provider_month ON usage_log (provider, month);

-- Security: Supabase publishes tables in "public" through its REST API.
-- Row Level Security with no policies blocks that API completely.
-- SEO Studio itself connects directly to the database and is not affected.
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE records ENABLE ROW LEVEL SECURITY;
ALTER TABLE record_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_log ENABLE ROW LEVEL SECURITY;
