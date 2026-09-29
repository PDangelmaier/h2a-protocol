CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

CREATE TYPE identity_tier AS ENUM ('anonymous', 'recognized', 'soft_login', 'identified', 'premium');
CREATE TYPE profile_status AS ENUM ('active', 'merged', 'deleted');

CREATE TABLE customer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mercedes_me_id TEXT UNIQUE,
  email TEXT,
  phone TEXT,
  display_name TEXT,
  locale TEXT DEFAULT 'de-AT',
  pid_score INTEGER DEFAULT 0 CHECK (pid_score >= 0 AND pid_score <= 100),
  pid_factors JSONB DEFAULT '{}',
  identity_tier identity_tier DEFAULT 'anonymous',
  status profile_status DEFAULT 'active',
  merged_into UUID REFERENCES customer_profiles(id),
  total_sessions INTEGER DEFAULT 0,
  first_seen_at TIMESTAMPTZ DEFAULT now(),
  last_active_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_profiles_mercedes_me ON customer_profiles(mercedes_me_id) WHERE mercedes_me_id IS NOT NULL;
CREATE INDEX idx_profiles_email ON customer_profiles(email) WHERE email IS NOT NULL;
CREATE INDEX idx_profiles_phone ON customer_profiles(phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_profiles_pid ON customer_profiles(pid_score);
