-- SPEC-031: Consent-Kanon — 14 Typen (D-017)
-- Part 1: Neue ENUM-Werte hinzufügen.
-- Muss in eigener Transaktion laufen, da PostgreSQL neue ENUM-Werte
-- erst nach COMMIT in DML-Statements erlaubt.

ALTER TYPE consent_type ADD VALUE IF NOT EXISTS 'memory_storage';
ALTER TYPE consent_type ADD VALUE IF NOT EXISTS 'data_processing';
ALTER TYPE consent_type ADD VALUE IF NOT EXISTS 'vehicle_data';
ALTER TYPE consent_type ADD VALUE IF NOT EXISTS 'vehicle_control';
ALTER TYPE consent_type ADD VALUE IF NOT EXISTS 'location_services';
