CREATE TABLE ccp_personalities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL, -- 'sales_advisor', 'service_companion', 'brand_ambassador'
  display_name TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT NOT NULL,
  temperature REAL DEFAULT 0.7,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE ccp_routing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  personality_id UUID NOT NULL REFERENCES ccp_personalities(id),
  priority INTEGER DEFAULT 0,
  channel channel_type,
  journey_phase journey_phase,
  intent_min INTEGER,
  pid_min INTEGER,
  market TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_routing_active ON ccp_routing_rules(is_active, priority DESC);

CREATE TYPE deployment_slot AS ENUM ('green', 'blue', 'red');

CREATE TABLE ccp_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  personality_id UUID NOT NULL REFERENCES ccp_personalities(id),
  slot deployment_slot NOT NULL,
  system_prompt TEXT NOT NULL,
  temperature REAL DEFAULT 0.7,
  config JSONB DEFAULT '{}',
  canary_percent INTEGER DEFAULT 0 CHECK (canary_percent >= 0 AND canary_percent <= 100),
  deployed_at TIMESTAMPTZ DEFAULT now(),
  deployed_by TEXT,
  is_active BOOLEAN DEFAULT true,
  UNIQUE(personality_id, slot)
);
