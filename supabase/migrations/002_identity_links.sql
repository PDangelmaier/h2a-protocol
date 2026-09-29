CREATE TABLE identity_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, -- 'anonymous', 'google', 'apple', 'amazon', 'mercedes_me'
  external_id TEXT NOT NULL,
  confidence REAL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  metadata JSONB DEFAULT '{}',
  linked_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(provider, external_id)
);

CREATE INDEX idx_identity_profile ON identity_links(profile_id);
