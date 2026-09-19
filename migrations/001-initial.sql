CREATE TABLE IF NOT EXISTS app_users (
  id text PRIMARY KEY,
  email text,
  profile jsonb NOT NULL,
  alert_settings jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS jobs (
  id serial PRIMARY KEY,
  dedup_key text NOT NULL UNIQUE,
  content_key text NOT NULL UNIQUE,
  source text NOT NULL,
  source_job_id text,
  title text NOT NULL,
  company text NOT NULL,
  url text NOT NULL,
  posted_at timestamptz,
  tags jsonb NOT NULL DEFAULT '[]',
  remote boolean NOT NULL DEFAULT false,
  salary text,
  description text,
  alt_sources jsonb NOT NULL DEFAULT '[]',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jobs_posted_idx ON jobs(posted_at DESC);
CREATE INDEX IF NOT EXISTS jobs_seen_idx ON jobs(first_seen_at DESC);
CREATE TABLE IF NOT EXISTS user_jobs (
  user_id text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  job_id integer NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('New','Reviewing','Applied','Skipped')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, job_id)
);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id serial PRIMARY KEY,
  user_id text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  subscription jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS notification_outbox (
  id serial PRIMARY KEY,
  user_id text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  job_id integer NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email','discord','slack','push')),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed','canceled')),
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  lease_token text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE(user_id, job_id, channel)
);
CREATE INDEX IF NOT EXISTS outbox_due_idx ON notification_outbox(status, available_at);
CREATE TABLE IF NOT EXISTS ingestion_state (
  source text PRIMARY KEY,
  cursor integer NOT NULL DEFAULT 0,
  lease_until timestamptz,
  lease_token text,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  last_error text
);
CREATE TABLE IF NOT EXISTS rate_limits (
  key text PRIMARY KEY,
  next_allowed_at timestamptz NOT NULL
);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS discovery_eligible boolean NOT NULL DEFAULT false;
