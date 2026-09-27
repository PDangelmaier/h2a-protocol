# Supplement: Identity Merge & Passkey/FIDO2 Implementation

**Status:** Nacharbeit — schließt GAP-K6 (Identity Merge) und GAP-K7 (Passkey/FIDO2)
**Datum:** 2026-09-26
**Quellen:** DR-3 (Identity & Trust), Part II Kap. 20, Part IV Kap. 28, audit-identity-trust-gaps.md, audit-identity-rag-gaps.md
**Autor:** Implementation Audit Team

---

## Zusammenfassung

Dieses Supplement adressiert zwei KRITISCHE Lücken zwischen Product- und Implementation-Doktorarbeit:

1. **Identity Merge (GAP-K6):** Part IV definiert `identity_links` und einen 3-Schritt-Pseudocode, aber kein vollständiges Merge-Schema mit Edge Cases, Consent-Transfer und Rollback. Der 16-Wochen-Blueprint (IR-6) plant Identity Merge als "Lücke #10, 3 Tage" ohne Dateien oder Schema.

2. **Passkey/FIDO2 (GAP-K7):** DR-3 beschreibt WebAuthn L3, Conditional UI und caBLE detailliert (971 Zeilen). IR-6 enthält kein einziges Wort zu Passkey/FIDO2/WebAuthn. Der gesamte Auth-Flow basiert auf Mercedes me OAuth + Social Login.

---

# Teil 1: Identity Merge — Vollständige Spezifikation

## 1.1 Das Problem

Ein Kernversprechen von H2A: Der Agent merkt sich den Kunden — auch kanalübergreifend. Aber was passiert bei diesem Flow:

```
Tag 1: Kunde öffnet Chat auf mercedes-benz.de (anonym)
       → PID 0, Session-ID abc-123
       → Konfiguriert einen EQS 450+
       → Agent merkt sich: "Bevorzugt Weiß, interessiert an AMG Line"
       → Conversation History: 15 Nachrichten
       → PID steigt auf 12 (Session + Engagement)

Tag 3: Kunde kommt zurück, loggt sich per Mercedes me ein
       → Mercedes me ID: mb-user-456
       → Bestehendes Profil in DB: PID 45 (E-Mail + Mercedes me)
       
FRAGE: Was passiert mit den 15 Nachrichten und Präferenzen von Tag 1?
```

Ohne Identity Merge: **Alles von Tag 1 geht verloren.** Der Agent fragt erneut nach Farbe und Ausstattung. Das Cross-Channel-Versprechen bricht.

## 1.2 Bestehende Infrastruktur (aus Part IV)

Part IV Kap. 28 definiert bereits Basis-Elemente:

```sql
-- customer_profiles hat:
status profile_status DEFAULT 'active',  -- active|merged|deleted
merged_into UUID                          -- FK auf neues Profil

-- identity_links existiert:
CREATE TABLE identity_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  external_id TEXT NOT NULL,
  confidence REAL DEFAULT 1.0,
  metadata JSONB DEFAULT '{}',
  linked_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(provider, external_id)
);
```

Part IV beschreibt auch den Pseudocode (Kap. 28.3, Zeile 139-142):
1. Älteres Profil → `status=merged`, `merged_into=neues_profil_id`
2. Alle `identity_links`, `sessions`, `agent_memories` → umhängen
3. `pid_score` → neu berechnen

**Was fehlt:** Edge Cases, Conflict Resolution, Consent-Transfer, Atomicity, Rollback, Race Conditions.

## 1.3 Migration: 023_identity_merge.sql

```sql
-- Migration 023: Identity Merge System
-- Erweitert customer_profiles und identity_links um Merge-Infrastruktur

-- 1. Merge-Requests: Jeder Merge-Vorgang wird geloggt
CREATE TABLE identity_merge_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_profile_id UUID NOT NULL REFERENCES customer_profiles(id),
  target_profile_id UUID NOT NULL REFERENCES customer_profiles(id),
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'login',           -- User loggt sich ein → Anonymous-Profil gefunden
    'device_match',    -- Gleicher Device Fingerprint auf zwei Profilen
    'manual',          -- Admin/Support initiiert Merge
    'cross_channel'    -- Gleicher User auf anderem Kanal identifiziert
  )),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',         -- Merge angefragt
    'in_progress',     -- Merge läuft (Daten werden migriert)
    'completed',       -- Merge erfolgreich
    'conflict',        -- Automatischer Merge nicht möglich → Nutzer entscheidet
    'failed',          -- Technischer Fehler → Rollback
    'rolled_back'      -- Manueller Rollback nach Fehlzuordnung
  )),
  merge_strategy TEXT NOT NULL DEFAULT 'auto' CHECK (merge_strategy IN (
    'auto',            -- Automatisch (Standard: authenticated wins)
    'interactive',     -- User wählt bei Konflikten
    'source_wins',     -- Source-Profil gewinnt bei Konflikten
    'target_wins'      -- Target-Profil gewinnt bei Konflikten
  )),
  conflict_data JSONB DEFAULT '[]',
  completed_at TIMESTAMPTZ,
  rolled_back_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  CHECK (source_profile_id != target_profile_id)
);

-- 2. Merge-Log: Granulares Protokoll aller migrierten Entitäten
CREATE TABLE identity_merge_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merge_request_id UUID NOT NULL REFERENCES identity_merge_requests(id),
  entity_type TEXT NOT NULL CHECK (entity_type IN (
    'conversation', 'session', 'memory', 'preference',
    'consent', 'identity_link', 'pid_factor', 'analytics_event'
  )),
  entity_id UUID NOT NULL,
  old_profile_id UUID NOT NULL,
  new_profile_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN (
    'moved',           -- Entität wurde umgehängt
    'merged',          -- Entität wurde zusammengeführt (z.B. Memories)
    'discarded',       -- Entität wurde verworfen (Duplikat)
    'conflict'         -- Entität hat einen Konflikt ausgelöst
  )),
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Merge-Version auf customer_profiles
ALTER TABLE customer_profiles 
  ADD COLUMN merge_version INTEGER DEFAULT 0;

-- 4. Indizes für Merge-Lookups
CREATE INDEX idx_merge_requests_source ON identity_merge_requests(source_profile_id);
CREATE INDEX idx_merge_requests_target ON identity_merge_requests(target_profile_id);
CREATE INDEX idx_merge_requests_status ON identity_merge_requests(status) 
  WHERE status IN ('pending', 'in_progress');
CREATE INDEX idx_merge_log_request ON identity_merge_log(merge_request_id);

-- 5. RLS
ALTER TABLE identity_merge_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_merge_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own merges" ON identity_merge_requests
  FOR SELECT USING (
    source_profile_id = auth.uid() OR target_profile_id = auth.uid()
  );

CREATE POLICY "System can insert merges" ON identity_merge_requests
  FOR INSERT WITH CHECK (true);  -- Nur Service-Role

CREATE POLICY "System can update merges" ON identity_merge_requests
  FOR UPDATE USING (true);  -- Nur Service-Role
```

## 1.4 Merge-Algorithmus: 5-Phasen-Pipeline

### Phase 1: Conversations — Immer Append

```typescript
async function mergeConversations(
  sourceId: string, 
  targetId: string, 
  mergeRequestId: string
): Promise<void> {
  const sourceConversations = await supabase
    .from('conversations')
    .select('id')
    .eq('profile_id', sourceId);

  for (const conv of sourceConversations.data ?? []) {
    await supabase
      .from('conversations')
      .update({ profile_id: targetId })
      .eq('id', conv.id);

    await logMergeAction(mergeRequestId, 'conversation', conv.id, 
      sourceId, targetId, 'moved');
  }
}
```

**Regel:** Conversation History wird **immer** zum Target-Profil verschoben. Keine Konflikte möglich — Gespräche sind append-only.

### Phase 2: Preferences — Authenticated Wins

```typescript
interface MergeConflict {
  field: string;
  sourceValue: unknown;
  targetValue: unknown;
  resolution: 'target_wins' | 'source_wins' | 'user_decides';
}

async function mergePreferences(
  sourceId: string,
  targetId: string,
  mergeRequestId: string
): Promise<MergeConflict[]> {
  const source = await getProfile(sourceId);
  const target = await getProfile(targetId);
  const conflicts: MergeConflict[] = [];

  const prefFields = [
    'preferred_language', 'preferred_channel', 'communication_style'
  ];

  for (const field of prefFields) {
    const sourceVal = source.preferences?.[field];
    const targetVal = target.preferences?.[field];

    if (!sourceVal) continue;
    if (!targetVal) {
      await updatePreference(targetId, field, sourceVal);
      await logMergeAction(mergeRequestId, 'preference', targetId,
        sourceId, targetId, 'moved', { field, value: sourceVal });
      continue;
    }

    if (sourceVal !== targetVal) {
      conflicts.push({
        field,
        sourceValue: sourceVal,
        targetValue: targetVal,
        resolution: 'target_wins'
      });
    }
  }

  return conflicts;
}
```

**Regel:** Bei Konflikten gewinnt das authentifizierte Profil (Target). Konflikte werden geloggt. Bei `merge_strategy: 'interactive'` entscheidet der User.

### Phase 3: Memories — Merge mit Relevanz-Score

```typescript
async function mergeMemories(
  sourceId: string,
  targetId: string,
  mergeRequestId: string
): Promise<void> {
  const sourceMemories = await supabase
    .from('agent_memories')
    .select('*')
    .eq('profile_id', sourceId);

  const targetMemories = await supabase
    .from('agent_memories')
    .select('*')
    .eq('profile_id', targetId);

  const targetKeySet = new Set(
    targetMemories.data?.map(m => m.memory_key) ?? []
  );

  for (const memory of sourceMemories.data ?? []) {
    if (targetKeySet.has(memory.memory_key)) {
      const targetMemory = targetMemories.data!
        .find(m => m.memory_key === memory.memory_key)!;

      if (memory.relevance_score > targetMemory.relevance_score) {
        await supabase
          .from('agent_memories')
          .update({ 
            memory_value: memory.memory_value,
            relevance_score: memory.relevance_score,
            source_conversation_id: memory.source_conversation_id 
          })
          .eq('id', targetMemory.id);

        await logMergeAction(mergeRequestId, 'memory', targetMemory.id,
          sourceId, targetId, 'merged');
      } else {
        await logMergeAction(mergeRequestId, 'memory', memory.id,
          sourceId, targetId, 'discarded');
      }
    } else {
      await supabase
        .from('agent_memories')
        .update({ profile_id: targetId })
        .eq('id', memory.id);

      await logMergeAction(mergeRequestId, 'memory', memory.id,
        sourceId, targetId, 'moved');
    }
  }
}
```

**Regel:** Gleicher `memory_key` → höherer `relevance_score` gewinnt. Neue Memories → direkt verschieben.

### Phase 4: PID Score — Neuberechnung

```typescript
async function recalculatePidScore(
  targetId: string,
  mergeRequestId: string
): Promise<number> {
  const links = await supabase
    .from('identity_links')
    .select('provider, confidence')
    .eq('profile_id', targetId);

  const memories = await supabase
    .from('agent_memories')
    .select('id')
    .eq('profile_id', targetId);

  const conversations = await supabase
    .from('conversations')
    .select('id')
    .eq('profile_id', targetId);

  const factors: Record<string, number> = {};
  for (const link of links.data ?? []) {
    factors[link.provider] = PID_WEIGHTS[link.provider] ?? 0;
  }

  if (conversations.data && conversations.data.length > 3) {
    factors.engagement = 10;
  }
  if (memories.data && memories.data.length > 5) {
    factors.profile_depth = 8;
  }

  const rawScore = Object.values(factors).reduce((a, b) => a + b, 0);
  const newPid = Math.min(100, rawScore);

  await supabase
    .from('customer_profiles')
    .update({ pid_score: newPid, pid_factors: factors })
    .eq('id', targetId);

  return newPid;
}

const PID_WEIGHTS: Record<string, number> = {
  mercedes_me: 20,
  google: 8,
  apple: 8,
  amazon: 5,
  email: 8,
  phone: 6,
  anonymous: 0,
  vehicle: 25,
  passkey: 30
};
```

**Regel:** PID wird aus den kombinierten `identity_links` und Engagement-Metriken beider Profile neu berechnet.

### Phase 5: Consent — AND-Logik

```typescript
async function mergeConsents(
  sourceId: string,
  targetId: string,
  mergeRequestId: string
): Promise<string[]> {
  const sourceConsents = await supabase
    .from('consent_records')
    .select('*')
    .eq('profile_id', sourceId)
    .eq('is_active', true);

  const targetConsents = await supabase
    .from('consent_records')
    .select('*')
    .eq('profile_id', targetId)
    .eq('is_active', true);

  const targetConsentTypes = new Set(
    targetConsents.data?.map(c => c.consent_type) ?? []
  );
  const requireReConsent: string[] = [];

  for (const consent of sourceConsents.data ?? []) {
    if (!targetConsentTypes.has(consent.consent_type)) {
      requireReConsent.push(consent.consent_type);
    }
  }

  return requireReConsent;
}
```

**Regel:** Consent wird **nicht** automatisch übertragen. DSGVO Art. 6: Die Zweckbindung ändert sich durch die Verknüpfung zweier Profile. Stattdessen:
- Bestehende Target-Consents bleiben aktiv
- Source-only Consents → Re-Consent anfordern
- Agent-Nachricht: *"Wir haben Ihre bisherigen Einstellungen übernommen. Darf ich weiterhin Ihre Vorlieben für personalisierte Empfehlungen nutzen?"*

## 1.5 Orchestrator: identity-merge.ts

```typescript
export async function executeIdentityMerge(
  sourceProfileId: string,
  targetProfileId: string,
  trigger: MergeTrigger,
  strategy: MergeStrategy = 'auto'
): Promise<MergeResult> {
  const mergeRequest = await createMergeRequest(
    sourceProfileId, targetProfileId, trigger, strategy
  );

  try {
    await updateMergeStatus(mergeRequest.id, 'in_progress');

    await acquireMergeLock(sourceProfileId, targetProfileId);

    const convResult = await mergeConversations(
      sourceProfileId, targetProfileId, mergeRequest.id
    );

    const prefConflicts = await mergePreferences(
      sourceProfileId, targetProfileId, mergeRequest.id
    );

    await mergeMemories(
      sourceProfileId, targetProfileId, mergeRequest.id
    );

    const newPid = await recalculatePidScore(
      targetProfileId, mergeRequest.id
    );

    const reConsentNeeded = await mergeConsents(
      sourceProfileId, targetProfileId, mergeRequest.id
    );

    await supabase
      .from('identity_links')
      .update({ profile_id: targetProfileId })
      .eq('profile_id', sourceProfileId);

    await supabase
      .from('customer_profiles')
      .update({ 
        status: 'merged', 
        merged_into: targetProfileId 
      })
      .eq('id', sourceProfileId);

    await updateMergeStatus(mergeRequest.id, 'completed');
    await releaseMergeLock(sourceProfileId, targetProfileId);

    return {
      mergeRequestId: mergeRequest.id,
      status: 'completed',
      newPidScore: newPid,
      conflicts: prefConflicts,
      reConsentNeeded,
      entitiesMerged: convResult.count
    };
  } catch (error) {
    await rollbackMerge(mergeRequest.id);
    await releaseMergeLock(sourceProfileId, targetProfileId);
    throw error;
  }
}
```

## 1.6 Edge Cases

### 2 Geräte, 1 Anonymous-Profil

```
Szenario: User hat mercedes-benz.de auf Laptop (Profil A) und iPhone (Profil B) besucht.
          Loggt sich auf Laptop ein → Mercedes me (Profil C existiert).
          
Problem:  Profil A → Profil C (Merge 1)
          Profil B → Profil C (Merge 2, später)
          
Lösung:   Device Fingerprint + Session-Correlation.
          Wenn Profil B auf dem iPhone auch einloggt → zweiter Merge.
          Merge 2 erkennt dass Profil A bereits merged ist → skip.
          Sequential Processing über merge_version verhindert Doppel-Merges.
```

### Race Condition: Gleichzeitiger Login

```
Szenario: User loggt sich gleichzeitig auf Web und App ein.
          Beide Requests finden Profil A (anonym) und wollen mit Profil C mergen.

Lösung:   Optimistic Locking über merge_version auf customer_profiles.
          Erster Request: merge_version 0 → 1 (Erfolg)
          Zweiter Request: merge_version 0 → 1 (Konflikt) → Retry.
          Retry sieht: Profil A ist bereits merged → skip.
```

```typescript
async function acquireMergeLock(
  sourceId: string, 
  targetId: string
): Promise<void> {
  const { data, error } = await supabase
    .from('customer_profiles')
    .update({ merge_version: supabase.raw('merge_version + 1') })
    .eq('id', sourceId)
    .eq('status', 'active')
    .select('merge_version');

  if (!data?.length) {
    throw new MergeError('ALREADY_MERGED', 
      `Profile ${sourceId} is already merged or locked`);
  }
}
```

### Rollback bei Fehlzuordnung

```typescript
async function rollbackMerge(mergeRequestId: string): Promise<void> {
  const logs = await supabase
    .from('identity_merge_log')
    .select('*')
    .eq('merge_request_id', mergeRequestId)
    .order('created_at', { ascending: false });

  for (const log of logs.data ?? []) {
    switch (log.action) {
      case 'moved':
        await supabase
          .from(getTableForEntity(log.entity_type))
          .update({ profile_id: log.old_profile_id })
          .eq('id', log.entity_id);
        break;
      case 'merged':
        if (log.old_data) {
          await supabase
            .from(getTableForEntity(log.entity_type))
            .update(log.old_data)
            .eq('id', log.entity_id);
        }
        break;
    }
  }

  await supabase
    .from('customer_profiles')
    .update({ status: 'active', merged_into: null })
    .eq('id', logs.data![0]?.old_profile_id);

  await updateMergeStatus(mergeRequestId, 'rolled_back');
}
```

## 1.7 Merge-Trigger im reasoning.ts

```typescript
async function handleIdentityEvent(
  session: Session,
  event: IdentityEvent
): Promise<void> {
  if (event.type !== 'login_completed') return;

  const currentProfile = session.profileId;
  const authenticatedProfile = await findProfileByProvider(
    event.provider, event.externalId
  );

  if (!authenticatedProfile) {
    await linkIdentity(currentProfile, event.provider, event.externalId);
    return;
  }

  if (authenticatedProfile.id === currentProfile) return;

  const isAnonymous = await isAnonymousProfile(currentProfile);
  if (!isAnonymous) return;

  const result = await executeIdentityMerge(
    currentProfile,
    authenticatedProfile.id,
    'login',
    'auto'
  );

  session.profileId = authenticatedProfile.id;

  if (result.reConsentNeeded.length > 0) {
    await queueConsentRequest(session, result.reConsentNeeded);
  }
}
```

## 1.8 Golden Tests für Identity Merge

```yaml
# tests/golden/identity-merge.yaml
tests:
  - name: "Anonymous-to-authenticated merge preserves conversation"
    setup:
      anonymous_profile:
        conversations: 3
        memories: ["prefers_white", "interested_amg"]
      authenticated_profile:
        pid_score: 45
        provider: "mercedes_me"
    action: "login_with_mercedes_me"
    assert:
      merged_profile:
        conversations_count: ">= 3"
        memory_contains: "prefers_white"
        pid_score: "> 45"
        status: "active"
      source_profile:
        status: "merged"

  - name: "Concurrent merge on two devices"
    setup:
      profile_a: { device: "laptop", status: "active" }
      profile_b: { device: "mobile", status: "active" }
      profile_c: { provider: "mercedes_me" }
    action: "simultaneous_login"
    assert:
      exactly_one_merge_completed: true
      no_data_loss: true

  - name: "Consent requires re-confirmation after merge"
    setup:
      anonymous_consents: ["ai_personalization", "analytics"]
      authenticated_consents: ["ai_personalization"]
    action: "merge"
    assert:
      active_consents: ["ai_personalization"]
      re_consent_requested: ["analytics"]

  - name: "Rollback restores original state"
    setup:
      source: { conversations: 5, memories: 3 }
      target: { conversations: 2, memories: 1 }
    action: "merge_then_rollback"
    assert:
      source_conversations: 5
      source_memories: 3
      target_conversations: 2
      target_memories: 1
      source_status: "active"
```

---

# Teil 2: Passkey/FIDO2 — Implementierungsplan

## 2.1 Warum Passkeys für H2A

DR-3 liefert die Zahlen:
- **99,3% Login-Erfolg** (vs. ~70% für Passwörter)
- **2,5× häufiger genutzt** als Passwörter wenn beide verfügbar
- **50% schnelleres Sign-in** (Kayak-Studie)
- **39% der Konsumenten** haben einen Kauf wegen vergessenem Passwort abgebrochen

Für H2A ist Passkey die Brücke zwischen Anonymous und Identified:

```
Ohne Passkey:
  Anonymous (PID 0-19) → "Bitte melden Sie sich an" → 
  Formular → Passwort → PID 60+
  ⚠️ 26% Abbruchrate bei Forced Login

Mit Passkey + Conditional UI:
  Anonymous (PID 0-19) → Agent schlägt Passkey vor →
  1 Tap + Biometrie → PID 80+
  ✅ <5% Abbruchrate
```

## 2.2 Architektur-Entscheidungen

| Entscheidung | Wahl | Begründung |
|-------------|------|-----------|
| Synced vs. Device-Bound | **Synced Passkeys** | Consumer-Facing, maximale Convenience |
| Library | **@simplewebauthn/server** + **@simplewebauthn/browser** | Open Source, TypeScript, aktiv maintained |
| Credential Storage | **Supabase** (eigene Tabelle) | Kein externer Auth-Provider nötig |
| Attestation | **None** (nicht verifizieren) | Consumer-Szenarien brauchen keine Attestation |
| User Verification | **preferred** | Biometrie wenn verfügbar, Fallback auf PIN |
| Discoverable Credentials | **required** | Für Conditional UI zwingend nötig |

## 2.3 Migration: 024_passkey_credentials.sql

```sql
-- Migration 024: WebAuthn/Passkey Credential Storage
CREATE TABLE passkey_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key BYTEA NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  transports TEXT[] DEFAULT '{}',
  device_type TEXT NOT NULL CHECK (device_type IN (
    'singleDevice',   -- Device-Bound Key
    'multiDevice'     -- Synced Passkey
  )),
  backed_up BOOLEAN DEFAULT false,
  authenticator_name TEXT,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_passkey_profile ON passkey_credentials(profile_id);
CREATE INDEX idx_passkey_credential ON passkey_credentials(credential_id);

ALTER TABLE passkey_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own passkeys" ON passkey_credentials
  FOR ALL USING (profile_id = auth.uid());

CREATE TABLE passkey_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge TEXT NOT NULL,
  profile_id UUID REFERENCES customer_profiles(id),
  type TEXT NOT NULL CHECK (type IN ('registration', 'authentication')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '5 minutes'),
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_challenge_expiry ON passkey_challenges(expires_at) 
  WHERE used = false;
```

## 2.4 Flow: Passkey Registration

```
┌─────────────┐    ┌──────────────┐    ┌───────────┐
│ Chat Widget  │    │ Edge Function │    │  Supabase  │
│ (Browser)    │    │ /auth/passkey │    │           │
└──────┬───────┘    └──────┬───────┘    └─────┬─────┘
       │                    │                   │
       │ 1. "Passkey        │                   │
       │    registrieren"   │                   │
       │───────────────────>│                   │
       │                    │ 2. Generate       │
       │                    │    Challenge       │
       │                    │──────────────────>│
       │                    │   challenge_id     │
       │                    │<──────────────────│
       │  3. Registration   │                   │
       │     Options        │                   │
       │<───────────────────│                   │
       │                    │                   │
       │ 4. navigator       │                   │
       │    .credentials    │                   │
       │    .create()       │                   │
       │    + Biometrie     │                   │
       │                    │                   │
       │ 5. Attestation     │                   │
       │    Response        │                   │
       │───────────────────>│                   │
       │                    │ 6. Verify +       │
       │                    │    Store Credential│
       │                    │──────────────────>│
       │                    │   credential_id    │
       │                    │<──────────────────│
       │  7. PID Score      │                   │
       │     Update (+30)   │                   │
       │<───────────────────│                   │
```

### Server-Side: Registration Options

```typescript
import {
  generateRegistrationOptions,
  verifyRegistrationResponse
} from '@simplewebauthn/server';

const RP_NAME = 'Mercedes-Benz H2A';
const RP_ID = 'mercedes-benz.de';
const ORIGIN = 'https://www.mercedes-benz.de';

export async function getRegistrationOptions(
  profileId: string
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const profile = await getProfile(profileId);
  const existingCredentials = await getPasskeyCredentials(profileId);

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userName: profile.display_name ?? profile.id,
    userID: new TextEncoder().encode(profile.id),
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'preferred',
    },
    excludeCredentials: existingCredentials.map(c => ({
      id: c.credential_id,
      transports: c.transports as AuthenticatorTransport[],
    })),
  });

  await storeChallenge(options.challenge, profileId, 'registration');
  return options;
}
```

### Server-Side: Verify Registration

```typescript
export async function verifyRegistration(
  profileId: string,
  response: RegistrationResponseJSON
): Promise<{ credentialId: string; newPidScore: number }> {
  const challenge = await getActiveChallenge(profileId, 'registration');

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new AuthError('PASSKEY_VERIFICATION_FAILED');
  }

  const { credential, credentialDeviceType, credentialBackedUp } = 
    verification.registrationInfo;

  const credentialRecord = await supabase
    .from('passkey_credentials')
    .insert({
      profile_id: profileId,
      credential_id: bufferToBase64url(credential.id),
      public_key: credential.publicKey,
      counter: credential.counter,
      transports: response.response.transports ?? [],
      device_type: credentialDeviceType,
      backed_up: credentialBackedUp,
    })
    .select('id')
    .single();

  await markChallengeUsed(challenge.id);

  const newPid = await addPidFactor(profileId, 'passkey', 30);

  return { 
    credentialId: credentialRecord.data!.id, 
    newPidScore: newPid 
  };
}
```

## 2.5 Flow: Passkey Authentication (Conditional UI)

### Client-Side: Conditional UI im Chat-Widget

```typescript
export async function initConditionalUI(): Promise<void> {
  if (!browserSupportsWebAuthn() || !browserSupportsConditionalUI()) {
    return;
  }

  try {
    const optionsResp = await fetch('/api/auth/passkey/authenticate', {
      method: 'POST',
      body: JSON.stringify({ conditional: true }),
    });
    const options = await optionsResp.json();

    const credential = await startAuthentication({
      optionsJSON: options,
      useBrowserAutofill: true,
    });

    const verifyResp = await fetch('/api/auth/passkey/verify', {
      method: 'POST',
      body: JSON.stringify(credential),
    });
    const result = await verifyResp.json();

    if (result.verified) {
      onPasskeyLogin(result.profileId, result.pidScore);
    }
  } catch (err) {
    // Conditional UI abgebrochen — kein Fehler, User wollte nicht
  }
}
```

**Entscheidend:** `useBrowserAutofill: true` — der Passkey erscheint als Autofill-Vorschlag, ohne dass der User einen Button klicken muss. Im Chat-Widget wird beim Öffnen `initConditionalUI()` aufgerufen.

### Server-Side: Verify Authentication

```typescript
export async function verifyAuthentication(
  response: AuthenticationResponseJSON
): Promise<{ verified: boolean; profileId: string; pidScore: number }> {
  const credentialIdBase64 = response.id;
  
  const credential = await supabase
    .from('passkey_credentials')
    .select('*, customer_profiles!inner(id, pid_score)')
    .eq('credential_id', credentialIdBase64)
    .is('revoked_at', null)
    .single();

  if (!credential.data) {
    throw new AuthError('PASSKEY_NOT_FOUND');
  }

  const challenge = await getActiveChallenge(
    credential.data.profile_id, 'authentication'
  );

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    credential: {
      id: credential.data.credential_id,
      publicKey: credential.data.public_key,
      counter: credential.data.counter,
      transports: credential.data.transports,
    },
  });

  if (!verification.verified) {
    throw new AuthError('PASSKEY_AUTH_FAILED');
  }

  await supabase
    .from('passkey_credentials')
    .update({ 
      counter: verification.authenticationInfo.newCounter,
      last_used_at: new Date().toISOString()
    })
    .eq('id', credential.data.id);

  await markChallengeUsed(challenge.id);

  return {
    verified: true,
    profileId: credential.data.profile_id,
    pidScore: credential.data.customer_profiles.pid_score
  };
}
```

## 2.6 PID Score Impact

```
Passkey-Registrierung → +30 PID-Punkte

Begründung (aus DR-3):
- Kryptographisch verifiziert (höchste Sicherheitsstufe)
- Phishing-resistent (origin-bound)
- Biometrisch bestätigt
- Stärker als Mercedes me OAuth (+20) oder E-Mail (+8)

Ergebnis:
  Anonymous (PID 0) + Passkey → PID 30 (soft_login Tier)
  Recognized (PID 15) + Passkey → PID 45 (identified Tier)
  Mercedes me (PID 45) + Passkey → PID 75 (identified, fast premium)
```

## 2.7 caBLE für Smart Storefront

DR-3 Kap. 1.3 beschreibt Cross-Device Authentication als Schlüssel für den Smart Storefront. Implementation:

```
Smart Storefront Kiosk                    Smartphone
┌─────────────────────┐                   ┌──────────────┐
│                     │                   │              │
│  QR-Code mit        │  ←── BLE ───→    │  Mercedes me │
│  caBLE-Handshake    │                   │  App         │
│                     │                   │              │
│  1. Kiosk generiert │                   │ 3. User      │
│     QR + BLE Advert │                   │    scannt QR │
│                     │                   │              │
│  4. caBLE Tunnel    │  ←── NOISE ──→   │ 5. Face ID   │
│     etabliert       │                   │    bestätigt │
│                     │                   │              │
│  6. FIDO2 Assertion │  ←── Tunnel ──   │              │
│     empfangen       │                   │              │
│                     │                   │              │
│  7. User ist        │                   │              │
│     identifiziert   │                   │              │
│     PID 80+         │                   │              │
└─────────────────────┘                   └──────────────┘
```

**Latenz:** 2-5 Sekunden vom QR-Scan bis zur Authentifizierung.
**Reichweite:** ~10 Meter BLE-Proximity.
**Integration:** Phase 3, zusammen mit Smart Storefront Channel-Adapter.

## 2.8 Sprint-Plan

| Phase | Woche | Task | Dateien | Aufwand |
|-------|-------|------|---------|---------|
| **Phase 2** | 9 | Passkey Registration Endpoint | `src/auth/passkey-registration.ts` | 2d |
| | 9 | Passkey Authentication Endpoint | `src/auth/passkey-authentication.ts` | 2d |
| | 9 | Migration 024_passkey_credentials | `supabase/migrations/024_*.sql` | 0.5d |
| | 10 | Conditional UI im Chat-Widget | `src/widget/conditional-ui.ts` | 2d |
| | 10 | PID-Score-Integration (+30) | `src/identity/pid-calculator.ts` | 1d |
| | 10 | Golden Tests Passkey | `tests/golden/passkey-*.yaml` | 1d |
| **Phase 3** | 13 | caBLE für Smart Storefront | `src/auth/cable-transport.ts` | 3d |
| | 14 | Cross-Device Sync UI | `src/widget/passkey-management.ts` | 2d |

**Dependencies:**
- Passkey setzt voraus: Mercedes me OAuth (Phase 1, Woche 3)
- caBLE setzt voraus: Smart Storefront Channel-Adapter (Phase 3)
- Identity Merge muss VOR Passkey fertig sein (Merge bei erstem Passkey-Login)

## 2.9 Fallback-Strategie

```
Phase 1 (Woche 1-8):   Mercedes me OAuth + Google/Apple Social Login
Phase 2 (Woche 9-10):  + Passkey als Alternative (opt-in)
Phase 3 (Woche 13-14): + Passkey-First (Conditional UI default)
Post-Launch:            Passkey-Only Option für Power-User
```

**Graceful Degradation:**

```typescript
export function getAvailableAuthMethods(
  channel: Channel
): AuthMethod[] {
  const methods: AuthMethod[] = ['mercedes_me_oauth'];

  if (channel === 'web' || channel === 'app') {
    if (browserSupportsWebAuthn()) {
      methods.unshift('passkey');
    }
    methods.push('google', 'apple');
  }

  if (channel === 'smart_storefront') {
    if (browserSupportsWebAuthn()) {
      methods.unshift('passkey_cable');
    }
  }

  if (channel === 'whatsapp') {
    methods.push('phone_verification');
  }

  return methods;
}
```

## 2.10 Golden Tests für Passkey

```yaml
# tests/golden/passkey-auth.yaml
tests:
  - name: "Passkey registration increases PID by 30"
    given:
      profile: { pid_score: 15, provider: "anonymous" }
    when: "passkey_registration_completed"
    then:
      pid_score: 45
      pid_factors_contains: "passkey"
      passkey_credentials_count: 1

  - name: "Conditional UI auto-login"
    given:
      profile: { pid_score: 75, passkey_registered: true }
      widget: "opened on mercedes-benz.de"
    when: "conditional_ui_triggered"
    then:
      session_authenticated: true
      no_login_form_shown: true

  - name: "caBLE Smart Storefront handoff"
    given:
      kiosk: "storefront-munich-01"
      phone: { app: "mercedes_me", passkey: true }
    when: "qr_scanned_and_biometric_confirmed"
    then:
      kiosk_session_authenticated: true
      pid_score: ">= 80"
      latency: "< 5000ms"

  - name: "Passkey not available → graceful fallback"
    given:
      browser: { webauthn_supported: false }
    when: "widget_opened"
    then:
      fallback_to: "mercedes_me_oauth"
      no_error_shown: true

  - name: "Revoked passkey cannot authenticate"
    given:
      passkey: { revoked_at: "2026-09-01" }
    when: "authentication_attempt"
    then:
      error: "PASSKEY_NOT_FOUND"
      fallback_offered: true
```

---

## Sprint-Integration: Gesamtübersicht

| Woche | Identity Merge | Passkey/FIDO2 |
|-------|---------------|---------------|
| **3** | Migration 023_identity_merge.sql | — |
| **4** | identity-merge.ts + Tests | — |
| **5** | Edge Case Tests + Rollback | — |
| **7** | Merge-Trigger in Nudge Engine | — |
| **9** | — | Registration + Authentication |
| **10** | Merge bei Passkey-Login | Conditional UI + PID Integration |
| **13** | — | caBLE für Smart Storefront |

**Kritischer Pfad:** Identity Merge (Woche 3-5) → Passkey (Woche 9-10) → Die Merge-Logik wird benötigt bevor Passkeys live gehen, weil ein Passkey-Login einen Anonymous-to-Authenticated-Merge triggern kann.

---

## Referenzen

- DR-3: Deep Research Identity, Authentication & Trust (971 Zeilen)
- Part II Kap. 20.7: Multi-Session-Merge (Zeile 961-962)
- Part IV Kap. 28.3: identity_links + Merge-Pseudocode (Zeile 119-142)
- IR-6: Implementation Blueprint, Lücke #10 (Identity Merge, 3 Tage)
- FIDO Alliance: WebAuthn Level 3 Specification
- W3C: Web Authentication API (navigator.credentials)
- @simplewebauthn: TypeScript WebAuthn Library
