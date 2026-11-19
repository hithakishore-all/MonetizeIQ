-- MonetizeIQ setup: schema and a least-privilege application role.
-- Run as the database owner:  psql "$DATABASE_URL" -f db/01_setup.sql
-- The app role is created without a password and cannot log in until you set one yourself
-- (see docs/SETUP_POSTGRES.md, step 4). No secrets live in this repo.

CREATE SCHEMA IF NOT EXISTS monetizeiq;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'monetizeiq_app') THEN
    CREATE ROLE monetizeiq_app NOLOGIN;
  END IF;
END
$$;
