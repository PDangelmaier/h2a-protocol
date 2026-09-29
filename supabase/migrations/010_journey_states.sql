CREATE TABLE journey_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID UNIQUE NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
  current_phase journey_phase DEFAULT 'awareness',
  primary_interest TEXT, -- model_id
  purchase_intent REAL DEFAULT 0,
  phase_entered_at TIMESTAMPTZ DEFAULT now(),
  previous_phases JSONB DEFAULT '[]', -- [{phase, entered_at, exited_at}]
  updated_at TIMESTAMPTZ DEFAULT now()
);
