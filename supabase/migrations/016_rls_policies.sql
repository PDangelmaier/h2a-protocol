-- Row Level Security policies
-- Edge Functions use service_role key, so RLS is for direct client access safety

ALTER TABLE customer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE behavioral_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS, anon role gets nothing
-- Authenticated users can only see their own data (future: when direct client access is needed)
