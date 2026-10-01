-- SPEC-014: Step-Up-Auth für High-Risk-Tools
ALTER TABLE sessions
  ADD COLUMN auth_tier TEXT DEFAULT 'anonymous',
  ADD COLUMN last_auth_at TIMESTAMPTZ,
  ADD COLUMN device_fingerprint TEXT;

CREATE INDEX idx_sessions_auth_tier ON sessions(auth_tier);
