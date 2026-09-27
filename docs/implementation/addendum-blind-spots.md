# H2A Doktorarbeiten — Addendum: Geschlossene Lücken

**Datum:** 2026-09-26
**Kontext:** Cross-Reference-Audit beider Doktorarbeiten identifizierte 7 blinde Flecken. Dieses Addendum schließt sie.

---

## 1. Terminologie-Glossar

| Begriff | Alias | Definition |
|---------|-------|-----------|
| **Agentic Tool Loop** | ReAct Loop, Tool Use Loop | Iterativer Zyklus: LLM-Antwort → Tool-Aufruf → Ergebnis-Einspeisung → nächste LLM-Antwort. Max 5 Runden. stopReason: `tool_use` triggert nächste Iteration. |
| **Golden Tests** | Golden Test Cases | Semantische Evaluation von LLM-Outputs. Ein Prompt + erwartetes Verhalten (nicht exakter Text) + LLM-as-Judge Bewertung. Promptfoo/DeepEval als Framework. |
| **PID Score** | Identity Score | 0–100 Punkteskala für Kundenidentität. 5 Tiers: anonymous (<20), recognized (20–39), soft_login (40–59), identified (60–79), premium (80–100). Bestimmt Tool-Zugriff und Personalisierungstiefe. |
| **CCP** | Contextual Conversation Personality | 9-Layer System Prompt der die Agent-Persönlichkeit steuert. Layer 1 (Core) bis Layer 9 (Compliance). Layer 10 (Identity Nudge) geplant für Phase 2. |
| **ISP** | Intent Signal Processing | Echtzeit-Analyse von 22 gewichteten Signalen mit exponentiellem Decay (λ=0.1). Bestimmt Journey-Phase und nächste Agent-Aktion. |
| **Nexus Gateway** | GenAI Nexus | Mercedes-Benz Multi-Cloud LLM Gateway. Endpoint: `genai-nexus.emea.api.corpinter.net`. **Bedrock Converse API Format** (NICHT Anthropic Messages). SHORT-FORM Model IDs: `claude-sonnet-4-6`. |
| **Consent-Typen** | — | 11 granulare Einwilligungsarten (5 Basis + 6 via Migration 018): ai_personalization, cross_channel, proactive_contact, analytics, marketing, ai_autonomy, voice_recording, data_retention, profiling_art22, cross_device, location_tracking. |
| **SSE Frame Protocol** | — | Server-Sent Events Streaming-Format für H2A Chat. Events: `token`, `tool_start`, `tool_end`, `done`, `error`. Latenz-Budget: <2s bis zum ersten Token. |
| **RAG** | Retrieval-Augmented Generation | Hybrid Search (Vector + Keyword) mit Parent-Child Chunking und Cohere Rerank. 5 Domains: Fahrzeuge, Service, Konfiguration, Finanzierung, Allgemein. |

---

## 2. Multi-Market & i18n Strategy

### 2.1 CCP System Prompt Übersetzung

Die 9 CCP-Layer verwenden ein **Template-System mit locale-Variable** — keine hartcodierten Übersetzungen:

```
Layer 3 (Brand Persona):
  de-AT: "Du bist der Mercedes-Benz Assistent für Österreich..."
  de-DE: "Du bist der Mercedes-Benz Assistent für Deutschland..."
  fr-FR: "Tu es l'assistant Mercedes-Benz pour la France..."
```

**Strategie:** Jeder Layer hat eine `locale`-spezifische Variante in der `personalities`-Tabelle. Die `resolvePersonality()`-Funktion selektiert automatisch nach `CustomerContext.locale`. Neue Märkte erfordern nur neue Datensätze, keinen Code-Change.

### 2.2 RAG für mehrere Sprachen

| Komponente | Strategie |
|-----------|-----------|
| Embedding-Modell | Multilingual: `cohere-embed-multilingual-v3` (107 Sprachen) |
| Vektor-Datenbank | Separierte Namespaces pro Markt (nicht pro Sprache) |
| Chunking | Sprachunabhängig (Token-basiert, nicht Zeichen-basiert) |
| Reranking | `cohere-rerank-multilingual-v3` |
| Knowledge Base | Pro Markt: Fahrzeugdaten, Preise, Händler, Finanzierung |

### 2.3 Brand Voice pro Markt

CCP Layer 3 (Brand Persona) hat locale-Varianten:

| Markt | Tonalität | Besonderheiten |
|-------|-----------|----------------|
| AT | Formal-freundlich, "Sie" | Österreichische Begriffe (Jänner, Autohaus) |
| DE | Professionell, "Sie" | Standard-Hochdeutsch, sachlich |
| CH | Formal, "Sie" | CHF-Preise, Schweizer Rechtsbegriffe |
| FR | Elegant, "vous" | Luxus-Fokus, française Automobilkultur |
| IT | Warmherzig, "Lei" | Emotionaler, Design-Fokus |
| ES | Professionell, "usted" | Marktspezifische Finanzierungsmodelle |

### 2.4 LLM-Sprachqualität

| Sprache | Claude Qualität | Strategie |
|---------|----------------|-----------|
| DE, EN | ★★★★★ | Primär-Support |
| FR | ★★★★☆ | Voller Support |
| IT, ES | ★★★☆☆ | Support mit Quality-Monitoring |
| PT, NL, PL | ★★★☆☆ | Phase 3, mit Fallback auf EN |

**Fallback:** Wenn die LLM-Antwortqualität unter einen Schwellwert fällt (gemessen via Golden Tests pro Sprache) → Fallback auf englische Antwort + Disclaimer.

### 2.5 Rollout-Reihenfolge

| Phase | Märkte | Zeitraum |
|-------|--------|----------|
| 1 | AT (Pilot) | Monat 1–4 |
| 2 | DE, CH | Monat 5–8 |
| 3 | FR, IT, ES | Monat 9–12 |
| 4 | Weitere EU + UK | Jahr 2 |

---

## 3. API Contract & Developer Onboarding

### 3.1 REST Endpoints (Supabase Edge Functions)

| Method | Endpoint | Auth | PID Min | Beschreibung |
|--------|----------|------|---------|-------------|
| POST | `/v1/chat` | Bearer Token | 0 | Chat-Nachricht senden, SSE Response |
| GET | `/v1/session/{id}` | Bearer Token | 0 | Session-Daten abrufen |
| POST | `/v1/session` | Optional | 0 | Neue Session erstellen |
| GET | `/v1/consent/{customer_id}` | Bearer Token | 40 | Consent-Status abrufen |
| POST | `/v1/consent` | Bearer Token | 40 | Consent erteilen/widerrufen |
| GET | `/v1/profile/{customer_id}` | Bearer Token | 60 | Kundenprofil abrufen |
| DELETE | `/v1/profile/{customer_id}` | Bearer Token | 60 | DSGVO Art. 17: Löschung |
| GET | `/v1/health` | None | 0 | Health Check |

### 3.2 Error Contract

```json
{
  "error": {
    "code": "CONSENT_REQUIRED",
    "message": "Dieses Tool erfordert die Einwilligung 'ai_personalization'",
    "details": {
      "required_consent": "ai_personalization",
      "tool": "get_vehicle_recommendations"
    }
  }
}
```

| HTTP Code | Bedeutung | Typischer Fehler |
|-----------|-----------|-----------------|
| 400 | Bad Request | Fehlende Parameter, ungültiges Format |
| 401 | Unauthorized | Token fehlt oder abgelaufen |
| 403 | Forbidden | PID-Score zu niedrig für Tool |
| 404 | Not Found | Session/Profil existiert nicht |
| 429 | Too Many Requests | Rate Limit überschritten |
| 500 | Internal Server Error | Nexus/LLM Fehler |
| 503 | Service Unavailable | Graceful Degradation aktiv |

### 3.3 Rate Limiting

| Tier | Limit | Basis |
|------|-------|-------|
| Anonym (PID < 20) | 60 req/min | IP-basiert |
| Authentifiziert (PID ≥ 40) | 120 req/min | Customer-ID-basiert |
| Tool-Aufrufe | 10 req/min | Pro Session |
| Streaming (SSE) | 1 aktive Verbindung | Pro Session |

### 3.4 SDK-Strategie

| SDK | Zielgruppe | Status |
|-----|-----------|--------|
| `@h2a/react` | Frontend-Teams (Widget) | Phase 1 |
| `@h2a/api-client` | TypeScript Backend-Integration | Phase 1 |
| REST API | Drittanbieter, andere Sprachen | Phase 1 |
| `@h2a/mbux-sdk` | MBUX-Integration | Phase 2 |

### 3.5 API Versioning

- Prefix: `/v1/`
- Deprecation Policy: 6 Monate Vorlauf vor Breaking Changes
- Strategie: Neue Felder = non-breaking, Feld-Entfernung = neue Version

---

## 4. Prompt Governance & Content Ops

### 4.1 Verantwortlichkeiten

| Layer | Owner | Reviewer | Update-Frequenz |
|-------|-------|----------|----------------|
| Layer 1 (Core Identity) | PO | AI Architect | Quartalsweise |
| Layer 2 (Channel) | Channel-Team | PO | Bei neuem Kanal |
| Layer 3 (Brand Persona) | Brand Team | PO + UX | Monatlich |
| Layer 4–6 (Context) | AI Engineer | PO | Wöchentlich (datengetrieben) |
| Layer 7–9 (Safety/Compliance) | Security/Legal | Mandatory Review | Bei Regulierung |

### 4.2 Prompt Change Process

```
1. Prompt-Änderung als PR in Supabase Seed Data (personalities Tabelle)
2. CI: Automatische Golden Tests gegen Änderung
3. Review: 4-Augen-Prinzip (AI Engineer + PO)
4. Staging: A/B Test gegen aktuelle Version (min. 100 Conversations)
5. Merge: Version Hash + Timestamp + Author in prompt_versions Tabelle
6. Production: Canary Rollout (5% → 25% → 100%)
7. Monitoring: Quality Score Dashboard, Regression Alert bei >5% Drop
```

### 4.3 A/B Testing für Prompts

- **Framework:** Feature Flags pro CCP-Layer-Variante
- **Evaluation:** Bayesian A/B mit Thompson Sampling für schnellere Konvergenz
- **Metriken:** CSAT, Aufgaben-Erfolgsrate, Conversation Length, PID Conversion
- **Mindestgröße:** 100 Conversations pro Variante vor Entscheidung
- **Guardrail:** Keine A/B Tests auf Layer 7–9 (Safety/Compliance)

### 4.4 Knowledge Base Content Ops

| Prozess | Trigger | Verantwortlich |
|---------|---------|---------------|
| Fahrzeugdaten-Update | Neues Modell / Facelift | Produktmanagement → Auto-Import |
| Preisdaten-Update | Preisänderung | Vertrieb → Auto-Import |
| Händlerdaten-Update | Händler-Onboarding | Dealer Ops → Manual + API |
| Content-Re-Index | Wöchentlich (Sonntag 02:00) | Cron Job |
| Emergency-Update | Rückruf / Sicherheit | PO → Manuell, sofort |

---

## 5. Disaster Recovery & Degradation

### 5.1 Ausfallszenarien

| Szenario | Impact | Mitigation |
|----------|--------|-----------|
| Nexus/LLM Down | Kein AI-Chat | Graceful Degradation → Cached FAQ |
| Supabase Down (Reads) | Kein Profil/Consent | Read-Replica Failover |
| Supabase Down (Writes) | Kein Session-Save | Write Queue (Redis) → Retry |
| CDN Down | Widget lädt nicht | Multi-CDN Failover |
| Edge Function Timeout | Langsame Antwort | Circuit Breaker → Fallback |

### 5.2 Degradation Path

```
Stufe 0: Full Agent (LLM + Tools + RAG + Personalization)
  ↓ LLM Latenz > 5s
Stufe 1: Cached Agent (Häufige Fragen aus Cache, LLM für Rest)
  ↓ LLM nicht erreichbar
Stufe 2: Static FAQ (Vordefinierte Antworten, kein LLM)
  ↓ Edge Functions nicht erreichbar
Stufe 3: Redirect ("Bitte kontaktieren Sie uns unter mercedes-benz.at/kontakt")
```

### 5.3 RTO/RPO Ziele

| System | RTO | RPO | Begründung |
|--------|-----|-----|-----------|
| Chat (Conversations) | 15 Min | 0 (Event-basiert) | Jede Nachricht ist ein Event |
| Kundenprofile | 1 Stunde | 1 Stunde | Supabase Daily Backup + WAL |
| Analytics | 4 Stunden | 1 Stunde | Batch-Processing toleriert Lücken |
| Consent Records | 15 Min | 0 | Rechtsverbindlich, kein Datenverlust |

### 5.4 Backup-Strategie

| Komponente | Methode | Frequenz | Retention |
|-----------|---------|----------|-----------|
| Supabase DB | pg_dump + WAL Streaming | Kontinuierlich | 30 Tage |
| Vektor-DB | Snapshot | Täglich | 14 Tage |
| Prompt Versionen | Git (Supabase Seed) | Jeder Commit | Unbegrenzt |
| LLM Conversation Logs | S3 | Real-Time | 90 Tage (DSGVO) |

---

## 6. Kreuzreferenz-Matrix

### Produkt → Implementation

| Produkt-Dokument | Korrespondierendes Implementation-Dokument | Verbindung |
|------------------|-------------------------------------------|-----------|
| Part I: Identity Conversion | IR-5: Skill Architecture (Identity Nudge Skill) | Nudge-Strategie → Skill-Implementierung |
| Part II: Systemarchitektur | IR-1: Claude Code Mastery + IR-5: Skill Architecture | Architektur-Design → Tool-Implementierung |
| Part III: Frontend & UX | IR-5: H2A Skill Architecture (Widget Skill) | UX-Design → Widget-Skill |
| Part IV: DSGVO & Sicherheit | IR-7: DevOps/MLOps (Security Pipeline) + IR-3: Testing (Red Teaming) | Privacy-Design → Security CI/CD + Test |
| Part V: Testing & Deployment | IR-3: Testing & Quality + IR-7: DevOps/MLOps | Test-Strategie → Golden Test Framework + CI/CD |
| DR-1: Agentic AI | IR-2: Multi-Agent Development | Agentic Patterns → Agent Orchestration |
| DR-2: Personalization | IR-4: AI Dev Process (A/B Testing) | Personalization-Design → LLMOps Workflow |
| DR-3: Identity & Trust | IR-5: Skill Architecture (PID Skill) | Auth-Design → Skill-Implementierung |
| DR-4: Multimodal & Voice | IR-6: Blueprint (Phase 3: Channels) | Voice-Design → Channel-Sprint |
| DR-5: Safety & Alignment | IR-3: Testing (Red Teaming) + IR-7: DevOps (Guardrail CI) | Safety-Design → Automated Testing |
| DR-6: Luxury & Scale | IR-6: Blueprint (ROI, Roadmap) | Business Case → Sprint-Planung |
| DR-7: Streaming | IR-7: DevOps/MLOps (Observability) | Streaming-Design → Monitoring Setup |
| DR-8: Behavioral Science | IR-5: Skill Architecture (Nudge Engine) | Behavioral Patterns → Agent-Behavior |
| DR-9: RAG & Knowledge | IR-3: Testing (RAGAS Evaluation) | RAG-Design → RAG-Evaluation |
| DR-10: Privacy-Preserving AI | IR-7: DevOps (Security, Compliance CI) | Privacy-Design → Automated Compliance |

### Implementation → Produkt

| Impl-Dokument | Referenziert Produkt | Ergänzt |
|---------------|---------------------|---------|
| IR-1: Claude Code Mastery | Part II (Tool Loop) | WIE der Tool Loop mit Skills gebaut wird |
| IR-2: Multi-Agent Development | DR-1 (Agentic AI) | WIE Agents orchestriert werden |
| IR-3: Testing & Quality | Part V (Testing), DR-5 (Safety) | WIE Golden Tests und Red Teaming automatisiert werden |
| IR-4: AI Dev Process | Part V (Deployment), DR-2 (Personalization) | WIE LLMOps und Prompt Versioning funktionieren |
| IR-5: H2A Skill Architecture | Part II (Architektur), Part I (Identity) | WIE jede Architektur-Schicht als Skill realisiert wird |
| IR-6: Implementation Blueprint | Alle (Roadmap) | WIE der 16-Wochen-Plan die 12 Lücken schließt |
| IR-7: DevOps/MLOps | Part V (Deployment), DR-5 (Safety) | WIE CI/CD, Observability und Security automatisiert werden |

---

## 7. Mobile SDK & App-Integration (Kurzfassung)

| Aspekt | Entscheidung | Begründung |
|--------|-------------|-----------|
| Rendering | WebView mit `@h2a/react` Widget | Konsistenz über alle Kanäle, schnelleres Update |
| Native Bridge | JavaScript Interface für App-spezifische Features | Push Notifications, Biometrie, Location |
| Push Notifications | Firebase Cloud Messaging (Android) + APNs (iOS) | Proaktive Agent-Nachrichten (mit Consent `proactive_contact`) |
| Offline | Cached FAQ (Stufe 2 aus DR-Strategie) | Kein LLM ohne Netz, aber statische Hilfe verfügbar |
| Deep Links | `mercedes-benz://h2a/chat?context=service` | App → H2A mit Kontext |

---

## 8. Legacy-Migration (Kurzfassung)

| Phase | Aufgabe | Risiko |
|-------|---------|--------|
| Analyse | Bestehende Chatbot-Daten inventarisieren | Gering — nur Lesen |
| Parallel-Betrieb | H2A neben Legacy (Feature Flag) | Mittel — zwei Systeme gleichzeitig |
| Daten-Migration | Kundenprofile aus Legacy → Supabase (PID Mapping) | Hoch — Datenqualität, Consent-Neuerteilung |
| Cutover | Legacy abschalten, H2A als primär | Mittel — Rollback-Plan nötig |
| Feature Parity | Tracking: Legacy-Features → H2A-Äquivalent | Gering — Dashboard |

**Kritisch:** Consent muss neu erteilt werden. Bestehende Legacy-Consents sind NICHT automatisch auf H2A übertragbar (DSGVO Art. 7: Einwilligung muss spezifisch sein).
