-- =====================================================================
-- Runtime DB role for the API — SUBJECT TO RLS.
--
-- WHY: the default Postgres user (`converflow`, created by POSTGRES_USER)
-- is a SUPERUSER. Superusers bypass Row Level Security entirely, even
-- with FORCE ROW LEVEL SECURITY. Our tenant-scoped queries rely on RLS
-- for isolation (no explicit tenantId WHERE clause), so connecting the
-- API as `converflow` leaked data across tenants.
--
-- FIX: the API connects as `converflow_app` (this role) — NOSUPERUSER,
-- NOBYPASSRLS — so the RLS policies actually apply. Migrations keep
-- using `converflow` via Prisma's directUrl.
--
-- Run this AS the `converflow` superuser. Password is set separately
-- (ALTER ROLE ... PASSWORD) so it never lives in the repo.
--
-- Idempotent — safe to re-run.
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'converflow_app') THEN
    CREATE ROLE converflow_app LOGIN;
  END IF;
END $$;

ALTER ROLE converflow_app NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

GRANT CONNECT ON DATABASE converflow_ai TO converflow_app;
GRANT USAGE ON SCHEMA public TO converflow_app;

-- CRUD on all current tables + sequences.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO converflow_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO converflow_app;

-- And on any tables/sequences created later by `converflow` (e.g. via
-- `prisma db push` after a schema change).
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO converflow_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO converflow_app;

-- Helper functions used by policies are executable by PUBLIC already,
-- but make it explicit.
GRANT EXECUTE ON FUNCTION current_tenant_id() TO converflow_app;
GRANT EXECUTE ON FUNCTION rls_bypass_enabled() TO converflow_app;
