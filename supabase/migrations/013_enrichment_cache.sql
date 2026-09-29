CREATE TABLE enrichment_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT UNIQUE NOT NULL,
  source TEXT NOT NULL,
  data JSONB NOT NULL,
  fetched_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  hit_count INTEGER DEFAULT 0
);

CREATE INDEX idx_cache_key ON enrichment_cache(cache_key);
CREATE INDEX idx_cache_expires ON enrichment_cache(expires_at);
