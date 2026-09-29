CREATE TABLE analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  profile_id UUID REFERENCES customer_profiles(id),
  session_id UUID REFERENCES sessions(id),
  channel channel_type,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_analytics_type ON analytics_events(event_type, created_at DESC);
CREATE INDEX idx_analytics_profile ON analytics_events(profile_id) WHERE profile_id IS NOT NULL;
