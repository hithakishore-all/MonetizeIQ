-- MonetizeIQ tables. Safe to re-run: drops and recreates the schema's tables.
SET search_path = monetizeiq;

DROP VIEW IF EXISTS monetizeiq.v_outcome_evidence;
DROP VIEW IF EXISTS monetizeiq.v_account_book;
DROP TABLE IF EXISTS monetizeiq.audit_log, monetizeiq.decisions, monetizeiq.outcome_events,
  monetizeiq.accounts, monetizeiq.owners, monetizeiq.categories, monetizeiq.app_config CASCADE;

-- Pinned demo settings, including the demo's "today" so freshness checks are reproducible.
CREATE TABLE monetizeiq.app_config (
  key   text PRIMARY KEY,
  value text NOT NULL
);

-- One row per AI category. "definition" holds the full playbook and pricing defaults from data/catalog.json.
CREATE TABLE monetizeiq.categories (
  id         text PRIMARY KEY,
  name       text NOT NULL,
  family     text NOT NULL,
  meter      text NOT NULL CHECK (meter IN ('effort', 'output', 'event', 'lift')),
  definition jsonb NOT NULL
);

-- Fictional account owners. Only an account's owner may approve a pricing decision for it.
CREATE TABLE monetizeiq.owners (
  id    text PRIMARY KEY,
  name  text NOT NULL,
  email text NOT NULL UNIQUE,
  role  text NOT NULL
);

CREATE TABLE monetizeiq.accounts (
  id              text PRIMARY KEY,
  category_id     text NOT NULL REFERENCES monetizeiq.categories(id),
  name            text NOT NULL,
  segment         text NOT NULL CHECK (segment IN ('Enterprise', 'Mid-market', 'SMB')),
  seats           integer NOT NULL CHECK (seats > 0),
  tasks_per_month integer NOT NULL CHECK (tasks_per_month > 0),
  success_rate    numeric(6,4) NOT NULL CHECK (success_rate > 0 AND success_rate < 1),
  renews          text NOT NULL,
  usage_as_of     date NOT NULL,
  owner_id        text NOT NULL REFERENCES monetizeiq.owners(id),
  data_flag       text CHECK (data_flag IN ('stale', 'missing')),
  scenario        text
);
CREATE INDEX accounts_category_idx ON monetizeiq.accounts (category_id);

-- Append-only outcome events: the audit trail behind every billed outcome.
CREATE TABLE monetizeiq.outcome_events (
  event_id      text PRIMARY KEY,
  account_id    text NOT NULL REFERENCES monetizeiq.accounts(id),
  category_id   text NOT NULL REFERENCES monetizeiq.categories(id),
  source_record text NOT NULL,
  occurred_at   timestamptz NOT NULL,
  tokens        integer NOT NULL,
  cost_to_serve numeric(10,4) NOT NULL,
  status        text NOT NULL CHECK (status IN ('verified', 'excluded', 'disputed', 'pending', 'no_signal')),
  reason        text,
  rule_version  text NOT NULL,
  billed        numeric(10,2) NOT NULL DEFAULT 0,
  evidence_id   text NOT NULL
);
CREATE INDEX outcome_events_account_idx ON monetizeiq.outcome_events (account_id, occurred_at DESC);

-- Approved pricing decisions. Recording a decision never changes billing.
CREATE TABLE monetizeiq.decisions (
  id              bigserial PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE,
  account_id      text NOT NULL REFERENCES monetizeiq.accounts(id),
  model           text NOT NULL CHECK (model IN ('seat', 'credit', 'hybrid', 'outcome')),
  approver_id     text NOT NULL REFERENCES monetizeiq.owners(id),
  inputs          jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Every recommendation, refusal and approval is written here.
CREATE TABLE monetizeiq.audit_log (
  id         bigserial PRIMARY KEY,
  at         timestamptz NOT NULL DEFAULT now(),
  actor      text NOT NULL,
  action     text NOT NULL,
  account_id text,
  detail     jsonb NOT NULL DEFAULT '{}'::jsonb
);
