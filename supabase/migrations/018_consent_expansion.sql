-- Phase 2: Granulare AI-Consent-Dimensionen
-- Erweitert consent_type ENUM und fügt Scope-Spalten für kanalspezifische Einwilligung hinzu.

ALTER TYPE consent_type ADD VALUE IF NOT EXISTS 'ai_autonomy';
ALTER TYPE consent_type ADD VALUE IF NOT EXISTS 'voice_recording';
ALTER TYPE consent_type ADD VALUE IF NOT EXISTS 'data_retention';
ALTER TYPE consent_type ADD VALUE IF NOT EXISTS 'profiling_art22';
ALTER TYPE consent_type ADD VALUE IF NOT EXISTS 'cross_device';
ALTER TYPE consent_type ADD VALUE IF NOT EXISTS 'location_tracking';

ALTER TABLE consent_records
  ADD COLUMN IF NOT EXISTS scope_channels TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS autonomy_level INTEGER CHECK (autonomy_level BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS retention_days INTEGER,
  ADD COLUMN IF NOT EXISTS legal_basis TEXT CHECK (legal_basis IN ('consent', 'legitimate_interest', 'contract', 'legal_obligation')),
  ADD COLUMN IF NOT EXISTS version TEXT DEFAULT '1.0',
  ADD COLUMN IF NOT EXISTS consent_text_hash TEXT;

COMMENT ON COLUMN consent_records.scope_channels IS 'Kanäle für die diese Einwilligung gilt. Leer = alle Kanäle.';
COMMENT ON COLUMN consent_records.autonomy_level IS 'AI-Autonomie: 1=nur Antworten, 2=Vorschläge, 3=proaktiv, 4=Aktionen mit Bestätigung, 5=volle Autonomie';
COMMENT ON COLUMN consent_records.retention_days IS 'Wie lange personenbezogene Daten aufbewahrt werden dürfen (NULL = Standardfrist).';
COMMENT ON COLUMN consent_records.legal_basis IS 'DSGVO Rechtsgrundlage für diese Einwilligung.';
COMMENT ON COLUMN consent_records.consent_text_hash IS 'SHA-256 Hash des zum Zeitpunkt der Einwilligung gezeigten Texts.';

CREATE INDEX IF NOT EXISTS idx_consent_scope_channels ON consent_records USING GIN (scope_channels);
CREATE INDEX IF NOT EXISTS idx_consent_legal_basis ON consent_records(legal_basis) WHERE revoked_at IS NULL;
