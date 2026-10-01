#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="h2a-db-verify"
DB_NAME="h2a_verify"
DB_USER="postgres"

PSQL="docker exec -i $CONTAINER_NAME psql -U $DB_USER -d $DB_NAME -v ON_ERROR_STOP=1 -t -A"

echo "=== SPEC-035: Consent-Ordering DB-Verifikation ==="
echo "(Voraussetzung: db:verify muss vorher gelaufen sein und Container noch aktiv)"

if ! docker exec "$CONTAINER_NAME" pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
  echo "FAIL: Container $CONTAINER_NAME nicht erreichbar. Erst db:verify.sh mit KEEP_CONTAINER=1 starten."
  exit 1
fi

FAIL=0
CID="00000000-0000-0000-0000-000000000035"

$PSQL <<SQL >/dev/null
INSERT INTO customer_profiles (id, mercedes_me_id, first_seen_at, identity_tier)
VALUES ('$CID', 'test-spec035', now(), 'anonymous')
ON CONFLICT (id) DO NOTHING;
SQL

echo ""
echo "=== Schema-Checks ==="

SEQ_EXISTS=$($PSQL <<'SQL'
SELECT count(*) FROM information_schema.columns
WHERE table_name = 'consent_records' AND column_name = 'seq';
SQL
)
[ "$SEQ_EXISTS" -eq 1 ] && echo "  ok   seq-Spalte existiert" || { echo "  FAIL seq-Spalte fehlt"; ((FAIL++)); }

SEQ_NULLABLE=$($PSQL <<'SQL'
SELECT is_nullable FROM information_schema.columns
WHERE table_name = 'consent_records' AND column_name = 'seq';
SQL
)
[ "$SEQ_NULLABLE" = "NO" ] && echo "  ok   seq ist NOT NULL" || { echo "  FAIL seq ist nullable: $SEQ_NULLABLE"; ((FAIL++)); }

SEQ_DEFAULT=$($PSQL <<'SQL'
SELECT column_default FROM information_schema.columns
WHERE table_name = 'consent_records' AND column_name = 'seq';
SQL
)
echo "$SEQ_DEFAULT" | grep -q "nextval" && echo "  ok   seq hat auto-increment DEFAULT ($SEQ_DEFAULT)" || { echo "  FAIL seq DEFAULT: $SEQ_DEFAULT"; ((FAIL++)); }

IDX_EXISTS=$($PSQL <<'SQL'
SELECT count(*) FROM pg_indexes WHERE indexname = 'idx_consent_ordering';
SQL
)
[ "$IDX_EXISTS" -eq 1 ] && echo "  ok   idx_consent_ordering existiert" || { echo "  FAIL idx fehlt"; ((FAIL++)); }

echo ""
echo "=== M1: Bestehende Zeilen zeitlich nummeriert (UPDATE-Test) ==="

$PSQL <<SQL >/dev/null
DELETE FROM consent_records WHERE customer_id = '$CID' AND consent_type = 'analytics';
INSERT INTO consent_records (customer_id, consent_type, granted, granted_at)
VALUES
  ('$CID', 'analytics', true, '2026-01-01 10:00:00'),
  ('$CID', 'analytics', true, '2026-01-01 11:00:00'),
  ('$CID', 'analytics', false, '2026-01-01 12:00:00');
SQL
echo "  Drei Einträge (10:00, 11:00, 12:00)"

# UPDATE älteste Zeile → physische Reihenfolge ändert sich
$PSQL <<SQL >/dev/null
UPDATE consent_records SET retention_days = 365
WHERE customer_id = '$CID' AND consent_type = 'analytics'
  AND granted_at = '2026-01-01 10:00:00';
SQL
echo "  Älteste Zeile (10:00) per UPDATE geändert"

M1_RESULT=$($PSQL <<SQL
SELECT to_char(granted_at, 'HH24:MI') AS ts, granted, seq
FROM consent_records
WHERE customer_id = '$CID' AND consent_type = 'analytics'
ORDER BY seq ASC;
SQL
)
echo "  raw (seq ASC):"
echo "$M1_RESULT" | while IFS= read -r line; do [ -n "$line" ] && echo "    $line"; done

TS_ORDER=$($PSQL <<SQL
SELECT string_agg(to_char(granted_at, 'HH24:MI'), ',' ORDER BY seq ASC)
FROM consent_records
WHERE customer_id = '$CID' AND consent_type = 'analytics';
SQL
)
if [ "$TS_ORDER" = "10:00,11:00,12:00" ]; then
  echo "  ok   M1: seq-Reihenfolge = granted_at-Reihenfolge trotz UPDATE"
else
  echo "  FAIL M1: Erwartet 10:00,11:00,12:00 — bekommen: $TS_ORDER"
  ((FAIL++))
fi

# Endergebnis: Jüngste Zeile (12:00) granted=false → gilt nicht
LATEST_A=$($PSQL <<SQL
SELECT granted FROM consent_records
WHERE customer_id = '$CID' AND consent_type = 'analytics'
ORDER BY seq DESC LIMIT 1;
SQL
)
[ "$LATEST_A" = "f" ] && echo "  ok   Endergebnis: analytics gilt nicht (granted=false)" || { echo "  FAIL Endergebnis falsch: $LATEST_A"; ((FAIL++)); }

echo ""
echo "=== Fall (a): revoked_at → gilt nicht ==="

$PSQL <<SQL >/dev/null
DELETE FROM consent_records WHERE customer_id = '$CID' AND consent_type = 'vehicle_data';
INSERT INTO consent_records (customer_id, consent_type, granted, granted_at, revoked_at)
VALUES ('$CID', 'vehicle_data', true, now(), now());
SQL
RESULT_A=$($PSQL <<SQL
SELECT granted, revoked_at IS NOT NULL AS has_revoked, seq
FROM consent_records
WHERE customer_id = '$CID' AND consent_type = 'vehicle_data'
ORDER BY seq DESC LIMIT 1;
SQL
)
echo "  raw: $RESULT_A"
echo "$RESULT_A" | grep -qE "\|t\|" && echo "  ok   revoked_at vorhanden → gilt nicht" || { echo "  FAIL"; ((FAIL++)); }

echo ""
echo "=== Fall (b): granted=false → gilt nicht ==="

$PSQL <<SQL >/dev/null
DELETE FROM consent_records WHERE customer_id = '$CID' AND consent_type = 'marketing';
INSERT INTO consent_records (customer_id, consent_type, granted, granted_at)
VALUES ('$CID', 'marketing', false, now());
SQL
RESULT_B=$($PSQL <<SQL
SELECT granted, revoked_at IS NULL AS no_revoke, seq
FROM consent_records
WHERE customer_id = '$CID' AND consent_type = 'marketing'
ORDER BY seq DESC LIMIT 1;
SQL
)
echo "  raw: $RESULT_B"
echo "$RESULT_B" | grep -qE "^f\|" && echo "  ok   granted=false → gilt nicht" || { echo "  FAIL"; ((FAIL++)); }

echo ""
echo "=== Fall (c): Same-transaction seq ordering ==="

$PSQL <<SQL >/dev/null
DELETE FROM consent_records WHERE customer_id = '$CID' AND consent_type = 'cross_channel';
SQL

# Echte Transaktion: BEGIN/COMMIT
$PSQL <<SQL >/dev/null
BEGIN;
INSERT INTO consent_records (customer_id, consent_type, granted, granted_at)
VALUES ('$CID', 'cross_channel', true, '2026-06-15 14:00:00');
INSERT INTO consent_records (customer_id, consent_type, granted, granted_at, revoked_at)
VALUES ('$CID', 'cross_channel', true, '2026-06-15 14:00:00', '2026-06-15 14:00:00');
COMMIT;
SQL

ROWS_C=$($PSQL <<SQL
SELECT granted, revoked_at IS NOT NULL AS has_revoked, granted_at, seq
FROM consent_records
WHERE customer_id = '$CID' AND consent_type = 'cross_channel'
ORDER BY seq DESC;
SQL
)
echo "  raw (seq DESC):"
echo "$ROWS_C" | while IFS= read -r line; do [ -n "$line" ] && echo "    $line"; done

TS_COUNT=$($PSQL <<SQL
SELECT count(DISTINCT granted_at) FROM consent_records
WHERE customer_id = '$CID' AND consent_type = 'cross_channel';
SQL
)
echo "  distinct granted_at: $TS_COUNT (erwartet: 1 = gleicher Zeitstempel)"

LATEST_REVOKED=$($PSQL <<SQL
SELECT revoked_at IS NOT NULL FROM consent_records
WHERE customer_id = '$CID' AND consent_type = 'cross_channel'
ORDER BY seq DESC LIMIT 1;
SQL
)
[ "$LATEST_REVOKED" = "t" ] && echo "  ok   Fall (c): Widerruf nach Erteilung (gleiche TX) → gilt nicht" || { echo "  FAIL latest should be revoked: $LATEST_REVOKED"; ((FAIL++)); }

echo ""
echo "=== Fall (d): Re-grant nach Widerruf → gilt ==="

$PSQL <<SQL >/dev/null
DELETE FROM consent_records WHERE customer_id = '$CID' AND consent_type = 'data_retention';
INSERT INTO consent_records (customer_id, consent_type, granted, granted_at, revoked_at)
VALUES ('$CID', 'data_retention', true, now() - interval '1 hour', now() - interval '30 minutes');
INSERT INTO consent_records (customer_id, consent_type, granted, granted_at)
VALUES ('$CID', 'data_retention', true, now());
SQL
RESULT_D=$($PSQL <<SQL
SELECT granted, revoked_at IS NULL AS no_revoke, seq
FROM consent_records
WHERE customer_id = '$CID' AND consent_type = 'data_retention'
ORDER BY seq DESC LIMIT 1;
SQL
)
echo "  raw: $RESULT_D"
echo "$RESULT_D" | grep -qE "^t\|t\|" && echo "  ok   Fall (d): Re-grant → gilt" || { echo "  FAIL"; ((FAIL++)); }

echo ""
if [ "$FAIL" -gt 0 ]; then
  echo "FAIL: $FAIL Prüfung(en) fehlgeschlagen."
  exit 1
else
  echo "ALL PASSED: Consent-Ordering DB-Verifikation erfolgreich."
  exit 0
fi
