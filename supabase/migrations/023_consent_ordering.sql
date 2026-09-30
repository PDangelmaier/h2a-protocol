-- SPEC-035: Eindeutige Consent-Reihenfolge per seq-Spalte
-- seq ist monoton steigend, DB-generiert, unabhängig von Zeitstempel-Genauigkeit.
-- Bestehende Zeilen erhalten automatisch gültige seq-Werte.

ALTER TABLE consent_records
  ADD COLUMN seq BIGINT GENERATED ALWAYS AS IDENTITY;

CREATE INDEX idx_consent_ordering
  ON consent_records (customer_id, consent_type, seq DESC);
