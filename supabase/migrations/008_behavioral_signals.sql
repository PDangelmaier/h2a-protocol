CREATE TABLE behavioral_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
  session_id UUID REFERENCES sessions(id),
  signal_type TEXT NOT NULL,
  channel channel_type,
  payload JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_signals_customer ON behavioral_signals(customer_id);
CREATE INDEX idx_signals_type ON behavioral_signals(customer_id, signal_type);
CREATE INDEX idx_signals_recent ON behavioral_signals(customer_id, created_at DESC);
