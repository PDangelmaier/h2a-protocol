#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="h2a-db-verify"
DB_NAME="h2a_verify"
DB_USER="postgres"

PSQL="docker exec -i $CONTAINER_NAME psql -U $DB_USER -d $DB_NAME -v ON_ERROR_STOP=1 -t -A"

echo "=== SPEC-031: Consent-Kanon DB-Verifikation ==="
echo "(Voraussetzung: db:verify muss vorher gelaufen sein und Container noch aktiv)"

if ! docker exec "$CONTAINER_NAME" pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
  echo "FAIL: Container $CONTAINER_NAME nicht erreichbar. Erst db:verify.sh mit KEEP_CONTAINER=1 starten."
  exit 1
fi

FAIL=0

echo ""
echo "--- AC-1: Alle 14 Consent-Typen als Wert speicherbar ---"
CONSENT_TYPES=(
  ai_personalization memory_storage ai_autonomy profiling_art22
  data_processing analytics data_retention cross_channel
  cross_device vehicle_data vehicle_control location_services
  marketing proactive_contact
)

$PSQL <<'SQL' >/dev/null
INSERT INTO customer_profiles (id, mercedes_me_id, first_seen_at, identity_tier)
VALUES ('00000000-0000-0000-0000-000000000001', 'test-consent-verify', now(), 'anonymous')
ON CONFLICT (id) DO NOTHING;
SQL

for ct in "${CONSENT_TYPES[@]}"; do
  result=$($PSQL <<SQL 2>&1 || true
INSERT INTO consent_records (customer_id, consent_type, granted, granted_at)
VALUES ('00000000-0000-0000-0000-000000000001', '$ct', true, now())
RETURNING consent_type;
SQL
  )
  if echo "$result" | grep -q "$ct"; then
    echo "  ok   $ct"
  else
    echo "  FAIL $ct: $result"
    ((FAIL++))
  fi
done

STORED_COUNT=$($PSQL <<'SQL'
SELECT count(DISTINCT consent_type) FROM consent_records
WHERE customer_id = '00000000-0000-0000-0000-000000000001';
SQL
)
echo "  Gespeicherte Typen: $STORED_COUNT (erwartet: 14)"
if [ "$STORED_COUNT" -ne 14 ]; then
  echo "  FAIL: Nicht alle 14 Typen gespeichert"
  ((FAIL++))
fi

echo ""
echo "--- AC-2: Deprecated Typen migrierbar (voice_recording → ai_personalization) ---"

$PSQL <<'SQL' >/dev/null
INSERT INTO consent_records (customer_id, consent_type, granted, granted_at)
VALUES ('00000000-0000-0000-0000-000000000001', 'voice_recording', true, now());
SQL

UPDATE_RESULT=$($PSQL <<'SQL'
UPDATE consent_records
SET consent_type = 'ai_personalization',
    original_consent_type = 'voice_recording'
WHERE consent_type = 'voice_recording'
  AND customer_id = '00000000-0000-0000-0000-000000000001'
RETURNING original_consent_type;
SQL
)
if echo "$UPDATE_RESULT" | grep -q "voice_recording"; then
  echo "  ok   voice_recording → ai_personalization (original_consent_type preserved)"
else
  echo "  FAIL voice_recording migration: $UPDATE_RESULT"
  ((FAIL++))
fi

$PSQL <<'SQL' >/dev/null
INSERT INTO consent_records (customer_id, consent_type, granted, granted_at)
VALUES ('00000000-0000-0000-0000-000000000001', 'location_tracking', true, now());
SQL

UPDATE_RESULT2=$($PSQL <<'SQL'
UPDATE consent_records
SET consent_type = 'location_services',
    original_consent_type = 'location_tracking'
WHERE consent_type = 'location_tracking'
  AND customer_id = '00000000-0000-0000-0000-000000000001'
RETURNING original_consent_type;
SQL
)
if echo "$UPDATE_RESULT2" | grep -q "location_tracking"; then
  echo "  ok   location_tracking → location_services (original_consent_type preserved)"
else
  echo "  FAIL location_tracking migration: $UPDATE_RESULT2"
  ((FAIL++))
fi

echo ""
echo "--- AC-6: risk_level Spalte auf agent_tools ---"

HIGH_RISK_COUNT=$($PSQL <<'SQL'
SELECT count(*) FROM agent_tools WHERE risk_level = 'high';
SQL
)
echo "  Tools mit risk_level=high: $HIGH_RISK_COUNT (erwartet: 2)"
if [ "$HIGH_RISK_COUNT" -ne 2 ]; then
  echo "  FAIL: Erwartete 2 high-risk Tools"
  ((FAIL++))
fi

ELEVATED_COUNT=$($PSQL <<'SQL'
SELECT count(*) FROM agent_tools WHERE risk_level = 'elevated';
SQL
)
echo "  Tools mit risk_level=elevated: $ELEVATED_COUNT (erwartet: 2)"
if [ "$ELEVATED_COUNT" -ne 2 ]; then
  echo "  FAIL: Erwartete 2 elevated Tools"
  ((FAIL++))
fi

echo ""
if [ "$FAIL" -gt 0 ]; then
  echo "FAIL: $FAIL Prüfung(en) fehlgeschlagen."
  exit 1
else
  echo "ALL PASSED: Consent-Kanon DB-Verifikation erfolgreich."
  exit 0
fi
