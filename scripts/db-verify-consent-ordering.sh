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

echo ""
echo "--- AC-1: seq-Spalte existiert als BIGINT GENERATED ALWAYS AS IDENTITY ---"
SEQ_EXISTS=$($PSQL <<'SQL'
SELECT count(*) FROM information_schema.columns
WHERE table_name = 'consent_records' AND column_name = 'seq';
SQL
)
if [ "$SEQ_EXISTS" -eq 1 ]; then
  echo "  ok   seq-Spalte existiert"
else
  echo "  FAIL seq-Spalte fehlt"
  ((FAIL++))
fi

SEQ_IDENTITY=$($PSQL <<'SQL'
SELECT is_identity FROM information_schema.columns
WHERE table_name = 'consent_records' AND column_name = 'seq';
SQL
)
if [ "$SEQ_IDENTITY" = "YES" ]; then
  echo "  ok   seq ist IDENTITY-Spalte"
else
  echo "  FAIL seq ist keine IDENTITY-Spalte: $SEQ_IDENTITY"
  ((FAIL++))
fi

echo ""
echo "--- AC-1: Index idx_consent_ordering existiert ---"
IDX_EXISTS=$($PSQL <<'SQL'
SELECT count(*) FROM pg_indexes
WHERE indexname = 'idx_consent_ordering';
SQL
)
if [ "$IDX_EXISTS" -eq 1 ]; then
  echo "  ok   idx_consent_ordering existiert"
else
  echo "  FAIL idx_consent_ordering fehlt"
  ((FAIL++))
fi

PROFILE_ID="00000000-0000-0000-0000-000000000035"

$PSQL <<SQL >/dev/null
INSERT INTO customer_profiles (id, mercedes_me_id, first_seen_at, identity_tier)
VALUES ('$PROFILE_ID', 'test-spec035', now(), 'anonymous')
ON CONFLICT (id) DO NOTHING;
SQL

echo ""
echo "--- AC-4 Fall 1: Widerruf per revoked_at ---"
$PSQL <<SQL >/dev/null
INSERT INTO consent_records (customer_id, consent_type, granted, granted_at, revoked_at)
VALUES ('$PROFILE_ID', 'marketing', true, now() - interval '30 days', now() - interval '1 day');
SQL
REVOKED_COUNT=$($PSQL <<SQL
SELECT count(*) FROM consent_records
WHERE customer_id = '$PROFILE_ID' AND consent_type = 'marketing'
  AND granted = true AND revoked_at IS NOT NULL;
SQL
)
if [ "$REVOKED_COUNT" -ge 1 ]; then
  echo "  ok   Widerruf per revoked_at gespeichert"
else
  echo "  FAIL Widerruf per revoked_at nicht gefunden"
  ((FAIL++))
fi

echo ""
echo "--- AC-4 Fall 2: Widerruf per granted=false neue Zeile ---"
$PSQL <<SQL >/dev/null
INSERT INTO consent_records (customer_id, consent_type, granted, granted_at)
VALUES ('$PROFILE_ID', 'analytics', true, now() - interval '30 days');
INSERT INTO consent_records (customer_id, consent_type, granted, granted_at)
VALUES ('$PROFILE_ID', 'analytics', false, now() - interval '1 day');
SQL
LATEST_ANALYTICS=$($PSQL <<SQL
SELECT granted FROM consent_records
WHERE customer_id = '$PROFILE_ID' AND consent_type = 'analytics'
ORDER BY seq DESC LIMIT 1;
SQL
)
if [ "$LATEST_ANALYTICS" = "f" ]; then
  echo "  ok   Letzte Zeile per seq ist granted=false"
else
  echo "  FAIL Letzte Zeile per seq ist nicht granted=false: $LATEST_ANALYTICS"
  ((FAIL++))
fi

echo ""
echo "--- AC-4 Fall 3: Seq ist monoton steigend bei gleicher Transaktion ---"
$PSQL <<SQL >/dev/null
INSERT INTO consent_records (customer_id, consent_type, granted, granted_at)
VALUES ('$PROFILE_ID', 'vehicle_data', true, now());
INSERT INTO consent_records (customer_id, consent_type, granted, granted_at)
VALUES ('$PROFILE_ID', 'vehicle_data', false, now());
SQL
SEQ_ORDER=$($PSQL <<SQL
SELECT string_agg(granted::text, ',' ORDER BY seq DESC) FROM consent_records
WHERE customer_id = '$PROFILE_ID' AND consent_type = 'vehicle_data';
SQL
)
if echo "$SEQ_ORDER" | grep -qE "^(f|false),(t|true)"; then
  echo "  ok   Seq-Ordnung korrekt: neueste Zeile (granted=false) hat höchste seq"
else
  echo "  FAIL Seq-Ordnung falsch: $SEQ_ORDER"
  ((FAIL++))
fi

echo ""
echo "--- AC-4 Fall 4: Re-Grant nach Widerruf ---"
$PSQL <<SQL >/dev/null
INSERT INTO consent_records (customer_id, consent_type, granted, granted_at)
VALUES ('$PROFILE_ID', 'proactive_contact', true, now() - interval '60 days');
INSERT INTO consent_records (customer_id, consent_type, granted, granted_at)
VALUES ('$PROFILE_ID', 'proactive_contact', false, now() - interval '30 days');
INSERT INTO consent_records (customer_id, consent_type, granted, granted_at)
VALUES ('$PROFILE_ID', 'proactive_contact', true, now());
SQL
LATEST_PROACTIVE=$($PSQL <<SQL
SELECT granted FROM consent_records
WHERE customer_id = '$PROFILE_ID' AND consent_type = 'proactive_contact'
ORDER BY seq DESC LIMIT 1;
SQL
)
if [ "$LATEST_PROACTIVE" = "t" ]; then
  echo "  ok   Re-Grant: letzte Zeile per seq ist granted=true"
else
  echo "  FAIL Re-Grant: letzte Zeile ist nicht granted=true: $LATEST_PROACTIVE"
  ((FAIL++))
fi

echo ""
if [ "$FAIL" -gt 0 ]; then
  echo "FAIL: $FAIL Prüfung(en) fehlgeschlagen."
  exit 1
else
  echo "ALL PASSED: Consent-Ordering DB-Verifikation erfolgreich."
  exit 0
fi
