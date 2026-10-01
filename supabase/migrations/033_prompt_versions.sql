-- SPEC-007: Prompt-Versionierung und Rollback ohne Deploy
CREATE TABLE ccp_prompt_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  personality_id UUID NOT NULL REFERENCES ccp_personalities(id),
  version INTEGER NOT NULL,
  static_prompt TEXT NOT NULL,
  is_active BOOLEAN DEFAULT false,
  activated_at TIMESTAMPTZ,
  activated_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(personality_id, version)
);

CREATE UNIQUE INDEX idx_prompt_version_active
  ON ccp_prompt_versions(personality_id)
  WHERE is_active = true;

CREATE INDEX idx_prompt_versions_personality ON ccp_prompt_versions(personality_id, is_active);

-- Seed: migrate existing prompts as version 1
INSERT INTO ccp_prompt_versions (personality_id, version, static_prompt, is_active, activated_at, activated_by)
SELECT id, 1, system_prompt, true, now(), 'migration-033'
FROM ccp_personalities;

-- RLS (SPEC-041)
ALTER TABLE ccp_prompt_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_full_access" ON ccp_prompt_versions FOR ALL USING (current_setting('request.jwt.claim.role', true) = 'service_role');

-- AC-4: turn trace contains prompt version
ALTER TABLE conversation_turns ADD COLUMN prompt_version INTEGER;
