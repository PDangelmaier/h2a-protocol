CREATE TABLE saved_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  model_name TEXT,
  configuration JSONB NOT NULL, -- full config: engine, color, interior, packages, price
  source_channel channel_type,
  total_price_cents BIGINT,
  monthly_rate_cents BIGINT,
  is_shared BOOLEAN DEFAULT false,
  share_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_configs_customer ON saved_configurations(customer_id);
