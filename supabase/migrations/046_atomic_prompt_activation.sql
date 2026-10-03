-- SPEC-049 AC-2: Atomic prompt version activation and rollback.
-- Both operations run in a single function call (implicit transaction),
-- ensuring no intermediate state with 0 or 2 active versions.

CREATE OR REPLACE FUNCTION activate_prompt_version(
  p_version_id UUID,
  p_identity TEXT
)
RETURNS TABLE (
  previous_id UUID,
  activated_id UUID,
  activated_version INTEGER
) AS $$
DECLARE
  v_personality_id UUID;
  v_target_version INTEGER;
  v_previous_id UUID;
BEGIN
  SELECT personality_id, version INTO v_personality_id, v_target_version
  FROM ccp_prompt_versions WHERE id = p_version_id;

  IF v_personality_id IS NULL THEN
    RAISE EXCEPTION 'Prompt version not found: %', p_version_id;
  END IF;

  SELECT id INTO v_previous_id
  FROM ccp_prompt_versions
  WHERE personality_id = v_personality_id AND is_active = true;

  IF v_previous_id IS NOT NULL THEN
    UPDATE ccp_prompt_versions
    SET is_active = false
    WHERE id = v_previous_id;
  END IF;

  UPDATE ccp_prompt_versions
  SET is_active = true,
      activated_at = now(),
      activated_by = p_identity
  WHERE id = p_version_id;

  RETURN QUERY SELECT v_previous_id, p_version_id, v_target_version;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION rollback_prompt_version(
  p_personality_id UUID,
  p_identity TEXT
)
RETURNS TABLE (
  previous_id UUID,
  rolled_back_to_id UUID,
  rolled_back_to_version INTEGER
) AS $$
DECLARE
  v_current_id UUID;
  v_previous_id UUID;
  v_previous_version INTEGER;
BEGIN
  SELECT id INTO v_current_id
  FROM ccp_prompt_versions
  WHERE personality_id = p_personality_id AND is_active = true;

  SELECT id, version INTO v_previous_id, v_previous_version
  FROM ccp_prompt_versions
  WHERE personality_id = p_personality_id AND is_active = false
  ORDER BY activated_at DESC NULLS LAST
  LIMIT 1;

  IF v_previous_id IS NULL THEN
    RAISE EXCEPTION 'No previous prompt version to rollback to';
  END IF;

  IF v_current_id IS NOT NULL THEN
    UPDATE ccp_prompt_versions
    SET is_active = false
    WHERE id = v_current_id;
  END IF;

  UPDATE ccp_prompt_versions
  SET is_active = true,
      activated_at = now(),
      activated_by = p_identity
  WHERE id = v_previous_id;

  RETURN QUERY SELECT v_current_id, v_previous_id, v_previous_version;
END;
$$ LANGUAGE plpgsql;

-- SPEC-044: Revoke from anon/authenticated
REVOKE EXECUTE ON FUNCTION activate_prompt_version(UUID, TEXT) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION rollback_prompt_version(UUID, TEXT) FROM anon, authenticated;
