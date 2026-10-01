-- SPEC-035: Eindeutige Consent-Reihenfolge per seq-Spalte
-- seq ist monoton steigend, DB-generiert, unabhängig von Zeitstempel-Genauigkeit.
-- Bestehende Zeilen werden zeitlich nummeriert (granted_at, id als Tiebreaker).

-- 1) Spalte hinzufügen (nullable zunächst, erlaubt UPDATE)
ALTER TABLE consent_records ADD COLUMN seq BIGINT;

-- 2) Bestehende Zeilen in zeitlicher Reihenfolge nummerieren
WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY granted_at, id) AS rn
  FROM consent_records
)
UPDATE consent_records SET seq = numbered.rn
FROM numbered WHERE consent_records.id = numbered.id;

-- 3) Sequence erstellen, startet nach der höchsten vergebenen seq
DO $$
DECLARE
  max_seq BIGINT;
BEGIN
  SELECT coalesce(max(seq), 0) INTO max_seq FROM consent_records;
  EXECUTE format('CREATE SEQUENCE consent_records_seq_seq START WITH %s', max_seq + 1);
END $$;

-- 4) NOT NULL + DEFAULT (neue Zeilen auto-nummeriert)
ALTER TABLE consent_records
  ALTER COLUMN seq SET NOT NULL,
  ALTER COLUMN seq SET DEFAULT nextval('consent_records_seq_seq');

-- 5) Index für Ordering-Queries
CREATE INDEX idx_consent_ordering
  ON consent_records (customer_id, consent_type, seq DESC);
