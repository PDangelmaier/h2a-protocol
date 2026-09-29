-- Composite indexes for common query patterns
CREATE INDEX idx_sessions_customer_recent ON sessions(customer_id, created_at DESC);
CREATE INDEX idx_conversations_profile_recent ON conversations(profile_id, created_at DESC);
CREATE INDEX idx_signals_customer_30d ON behavioral_signals(customer_id, created_at DESC) WHERE created_at > now() - interval '30 days';

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON customer_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_prefs_updated_at BEFORE UPDATE ON customer_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_configs_updated_at BEFORE UPDATE ON saved_configurations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_journey_updated_at BEFORE UPDATE ON journey_states FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_ccp_updated_at BEFORE UPDATE ON ccp_personalities FOR EACH ROW EXECUTE FUNCTION update_updated_at();
