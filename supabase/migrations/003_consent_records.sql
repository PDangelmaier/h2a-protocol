CREATE TYPE consent_type AS ENUM ('ai_personalization', 'cross_channel', 'proactive_contact', 'analytics', 'marketing');

CREATE TABLE consent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
  consent_type consent_type NOT NULL,
  channel TEXT, -- NULL = all channels
  granted BOOLEAN NOT NULL DEFAULT false,
  granted_at TIMESTAMPTZ DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_consent_customer ON consent_records(customer_id);
CREATE INDEX idx_consent_active ON consent_records(customer_id, consent_type) WHERE revoked_at IS NULL;
