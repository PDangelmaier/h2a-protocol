-- SPEC-031: Consent-Kanon — 14 Typen (D-017)
-- Fügt 5 fehlende ENUM-Werte hinzu und migriert deprecated Typen.
-- PostgreSQL kann keine ENUM-Werte entfernen — voice_recording und location_tracking
-- bleiben im Typ, werden aber auf Application-Layer abgelehnt.

-- AC-1: 5 neue Consent-Typen hinzufügen
ALTER TYPE consent_type ADD VALUE IF NOT EXISTS 'memory_storage';
ALTER TYPE consent_type ADD VALUE IF NOT EXISTS 'data_processing';
ALTER TYPE consent_type ADD VALUE IF NOT EXISTS 'vehicle_data';
ALTER TYPE consent_type ADD VALUE IF NOT EXISTS 'vehicle_control';
ALTER TYPE consent_type ADD VALUE IF NOT EXISTS 'location_services';

-- AC-2: Traceability-Spalte für migrierte Records
ALTER TABLE consent_records
  ADD COLUMN IF NOT EXISTS original_consent_type TEXT;

COMMENT ON COLUMN consent_records.original_consent_type
  IS 'Ursprünglicher Consent-Typ vor Migration (z.B. voice_recording). NULL = nie migriert.';

-- AC-2: voice_recording → ai_personalization (ai_personalization existiert bereits)
UPDATE consent_records
SET consent_type = 'ai_personalization',
    original_consent_type = 'voice_recording'
WHERE consent_type = 'voice_recording';

-- AC-2: location_tracking → location_services
UPDATE consent_records
SET consent_type = 'location_services',
    original_consent_type = 'location_tracking'
WHERE consent_type = 'location_tracking';

-- AC-6: risk_level Spalte für agent_tools (Grundlage für PIN/HITL)
ALTER TABLE agent_tools
  ADD COLUMN IF NOT EXISTS risk_level TEXT DEFAULT 'normal'
  CHECK (risk_level IN ('normal', 'elevated', 'high', 'critical'));

COMMENT ON COLUMN agent_tools.risk_level
  IS 'Risikostufe: normal=Standard, elevated=Review, high=PIN/HITL nötig, critical=Admin-only';
