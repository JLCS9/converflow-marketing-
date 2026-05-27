-- =====================================================================
-- converflow.ai — Row Level Security policies
--
-- Strategy:
--   - Every tenant-scoped table has RLS enabled with FORCE.
--   - Per-request, the API sets:  SET LOCAL app.tenant_id = '<id>';
--   - For platform/admin operations: SET LOCAL app.bypass_rls = 'on';
--   - Policies match on tenant_id OR bypass flag.
--
-- This file is idempotent — safe to re-run after migrations.
-- =====================================================================

-- Helper functions ----------------------------------------------------

CREATE OR REPLACE FUNCTION current_tenant_id()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT current_setting('app.tenant_id', true)
$$;

CREATE OR REPLACE FUNCTION rls_bypass_enabled()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(current_setting('app.bypass_rls', true) = 'on', false)
$$;

-- Reusable macro: drop and recreate a policy on a table keyed by tenant_id
-- (Postgres doesn't have macros; we expand inline below.)

-- ---------------------------------------------------------------------
-- tenants: id is the tenant id itself
-- ---------------------------------------------------------------------
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_self_access ON tenants;
CREATE POLICY tenant_self_access ON tenants
  FOR ALL
  USING (rls_bypass_enabled() OR id = current_tenant_id())
  WITH CHECK (rls_bypass_enabled() OR id = current_tenant_id());

-- ---------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON users;
CREATE POLICY tenant_isolation ON users
  FOR ALL
  USING (rls_bypass_enabled() OR tenant_id = current_tenant_id())
  WITH CHECK (rls_bypass_enabled() OR tenant_id = current_tenant_id());

-- ---------------------------------------------------------------------
-- user_sessions
-- ---------------------------------------------------------------------
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON user_sessions;
CREATE POLICY tenant_isolation ON user_sessions
  FOR ALL
  USING (rls_bypass_enabled() OR tenant_id = current_tenant_id())
  WITH CHECK (rls_bypass_enabled() OR tenant_id = current_tenant_id());

-- ---------------------------------------------------------------------
-- tenant_invitations
-- ---------------------------------------------------------------------
ALTER TABLE tenant_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_invitations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tenant_invitations;
CREATE POLICY tenant_isolation ON tenant_invitations
  FOR ALL
  USING (rls_bypass_enabled() OR tenant_id = current_tenant_id())
  WITH CHECK (rls_bypass_enabled() OR tenant_id = current_tenant_id());

-- ---------------------------------------------------------------------
-- access_logs
-- ---------------------------------------------------------------------
ALTER TABLE access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON access_logs;
CREATE POLICY tenant_isolation ON access_logs
  FOR ALL
  USING (rls_bypass_enabled() OR tenant_id = current_tenant_id())
  WITH CHECK (rls_bypass_enabled() OR tenant_id = current_tenant_id());

-- ---------------------------------------------------------------------
-- bots
-- ---------------------------------------------------------------------
ALTER TABLE bots ENABLE ROW LEVEL SECURITY;
ALTER TABLE bots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON bots;
CREATE POLICY tenant_isolation ON bots
  FOR ALL
  USING (rls_bypass_enabled() OR tenant_id = current_tenant_id())
  WITH CHECK (rls_bypass_enabled() OR tenant_id = current_tenant_id());

-- ---------------------------------------------------------------------
-- bot_sessions
-- ---------------------------------------------------------------------
ALTER TABLE bot_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_sessions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON bot_sessions;
CREATE POLICY tenant_isolation ON bot_sessions
  FOR ALL
  USING (rls_bypass_enabled() OR tenant_id = current_tenant_id())
  WITH CHECK (rls_bypass_enabled() OR tenant_id = current_tenant_id());

-- ---------------------------------------------------------------------
-- agents
-- ---------------------------------------------------------------------
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON agents;
CREATE POLICY tenant_isolation ON agents
  FOR ALL
  USING (rls_bypass_enabled() OR tenant_id = current_tenant_id())
  WITH CHECK (rls_bypass_enabled() OR tenant_id = current_tenant_id());
