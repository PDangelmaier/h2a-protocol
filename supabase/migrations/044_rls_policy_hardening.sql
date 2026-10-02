-- SPEC-044: Close open RLS policies and harden function grants.
--
-- B1: session_state and ab_experiments have policies using (true) without
--     role binding → readable and writable by anon/authenticated.
-- AC-7: ccp_prompt_versions and conversation_summaries use
--     current_setting('request.jwt.claim.role') which never fires for
--     service_role (BYPASSRLS) and blocks all others only via RLS default.
--     Replace with proper service_role-only policies.
-- AC-4: Revoke function EXECUTE from anon/authenticated (the stubs grant
--     it via DEFAULT PRIVILEGES to replicate real Supabase).

-- ── B1: Fix session_state ───────────────────────────────────────────
DROP POLICY IF EXISTS "service_role_all" ON session_state;
CREATE POLICY "service_role_all" ON session_state
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── B1: Fix ab_experiments ──────────────────────────────────────────
DROP POLICY IF EXISTS "service_role_all" ON ab_experiments;
CREATE POLICY "service_role_all" ON ab_experiments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── AC-7: Fix ccp_prompt_versions (from 033) ────────────────────────
DROP POLICY IF EXISTS "service_role_full_access" ON ccp_prompt_versions;
CREATE POLICY "service_role_all" ON ccp_prompt_versions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── AC-7: Fix conversation_summaries (from 035) ────────────────────
DROP POLICY IF EXISTS "service_role_full_access" ON conversation_summaries;
CREATE POLICY "service_role_all" ON conversation_summaries
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── AC-4: Revoke EXECUTE from anon/authenticated on all functions ───
-- The CI stubs now grant function EXECUTE via DEFAULT PRIVILEGES
-- (matching real Supabase). Migration 043 revokes from PUBLIC.
-- This migration revokes from anon and authenticated individually.
REVOKE EXECUTE ON FUNCTION increment_session_cost(TEXT, NUMERIC, BIGINT) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION update_updated_at() FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
