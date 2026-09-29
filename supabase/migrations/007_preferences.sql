CREATE TABLE customer_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
  category TEXT NOT NULL, -- 'vehicle', 'communication', 'budget', 'lifestyle'
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  confidence REAL DEFAULT 0.5,
  source TEXT DEFAULT 'inferred', -- 'explicit', 'inferred', 'behavioral'
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(customer_id, category, key)
);

CREATE INDEX idx_prefs_customer ON customer_preferences(customer_id);
