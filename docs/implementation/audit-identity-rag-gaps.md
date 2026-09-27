# Audit: Identity, Trust & Knowledge/RAG Gaps

**Auditor:** Head of Identity + Knowledge/RAG Lead
**Datum:** 2026-09-26
**Scope:** Product-Doktorarbeit (Part I–IV) + Implementation Blueprint (IR-6)
**Methode:** Cross-Reference aller PID-, Merge-, Passkey-, RAG-, Knowledge- und EUDI-Abschnitte

---

## Identity & Trust Gaps

### GAP-ID-1: PID-Score-Formel fehlt als formale Spezifikation

**Severity:** HOCH
**Betroffene Docs:** Part II Kap. 18, Part IV Kap. 28, Part I Kap. 6
**Problem:** Die PID-Gewichtungen werden nur implizit durch Beispiele kommuniziert (Part IV Zeile 104: `email=8, link=3, session=1+recent=10`; Zeile 110: `mercedesMe=20`; Zeile 115: `vehicle=25`). Es gibt keine formale Formel `calculatePidScore()` die alle Faktoren, Gewichte, Caps und Normalisierung auf 0–100 definiert. `pid_factors JSONB` in der DB speichert `{identity: 20, vehicle: 30, ...}` — aber diese Kategorien matchen nicht 1:1 mit den Beispiel-Aufschlüsselungen.
**Fix:** Eigenes Kapitel "PID Score Calculation Specification" in Part II oder Part IV mit: (a) vollständige Faktor-Tabelle (Faktor → Gewicht → Cap), (b) Normalisierungsformel auf 0–100, (c) Tier-Schwellwerte (anonymous: 0–9, recognized: 10–19, soft_login: 20–39, identified: 40–79, premium: 80–100), (d) Recalculation-Trigger. Die Beispiele in Part IV Zeile 96–117 müssen gegen diese Formel validierbar sein.

### GAP-ID-2: Identity-Merge-Algorithmus unspezifiziert

**Severity:** KRITISCH
**Betroffene Docs:** Part II Kap. 20.7, Part IV Kap. 28.3
**Problem:** Part II Kap. 20.7 nennt "Multi-Session-Merge" explizit als fehlend: *"Was passiert wenn ein anonymer Nutzer sich anmeldet und bereits Daten als anonymer Nutzer hatte? → Identity Merge muss beide Profile zusammenführen."* Part IV Kap. 28.3 gibt einen 3-Schritt-Pseudocode (status=merged, umhängen, PID neu berechnen), aber kritische Edge Cases fehlen:
- Zwei anonyme Profile auf verschiedenen Geräten → ein Mercedes-me-Login: Welches Profil "gewinnt"?
- Konflikt bei Memories/Preferences (Profil A: "bevorzugt Schwarz", Profil B: "bevorzugt Weiß")?
- Race Condition: gleichzeitiger Login auf zwei Kanälen?
- Merge-Rollback bei Fehlzuordnung?
- Der Implementation Blueprint (IR-6) adressiert Identity Merge in keiner der 16 Wochen.
**Fix:** (a) Merge-Algorithmus in Part II Kap. 20 als formale Spezifikation (Winner-Heuristik, Conflict-Resolution, Atomicity). (b) IR-6 Phase 1 oder 2: Dedicated Woche für `identity-merge.ts` Implementation + Tests für alle Edge Cases. Ohne Merge-Spezifikation ist das gesamte Cross-Channel-Versprechen fragil.

### GAP-ID-3: Passkey/FIDO2 Implementation fehlt komplett im Blueprint

**Severity:** KRITISCH
**Betroffene Docs:** DR-3 (Kap. 1), Part I Kap. 8, IR-6
**Problem:** DR-3 liefert exzellente Analyse zu Passkeys (caBLE, Conditional UI, Device-Bound vs. Synced, CXP). Part I definiert Passkeys als Teil der "One-Click Technologies". Aber der 16-Wochen-Implementation-Blueprint (IR-6) enthält **kein einziges Wort** zu Passkey/FIDO2/WebAuthn. Woche 14 "Security Hardening" behandelt Prompt Injection, Rate Limiting, JWT — aber keine Authentifizierungsmethode. Der gesamte Auth-Flow basiert auf Mercedes me OAuth + Social Login (Google/Apple/Amazon), Passkeys werden nicht implementiert.
**Fix:** Passkey-Integration als dedizierte Aufgabe in Phase 2 (Wochen 5–8) oder Phase 3 einplanen: (a) WebAuthn Registration/Authentication Endpoints, (b) Conditional UI im Chat-Widget, (c) caBLE für Smart Storefront → Smartphone, (d) Credential Management in Supabase Auth. Mindestaufwand: 1 Woche Coder + Tester.

### GAP-ID-4: EUDI-Wallet / eIDAS 2.0 — blinder Fleck im 16-Wochen-Plan

**Severity:** MITTEL
**Betroffene Docs:** DR-3 (Kap. 2.2), IR-6
**Problem:** DR-3 Kap. 2.2 beschreibt EUDI-Wallet ausführlich: Pflicht ab 2026, Verifiable Credentials, Führerschein-Verifikation für Probefahrten, Ownership Proof, Selective Disclosure. Sogar ein konkretes VC-JSON-Beispiel (`MercedesMeOwnership`) existiert. Der 16-Wochen-Plan ignoriert EUDI-Wallet vollständig — kein Verifier-Endpoint, kein VC-Issuing, keine DID-Registrierung.
**Fix:** EUDI-Wallet ist für den initialen Launch nicht zwingend (Soft Launch AT/DE reicht ohne). Aber als Roadmap-Item nach Woche 16 explizit einplanen: (a) `did:web:mercedes-benz.com` Registrierung, (b) VC Issuer für Ownership Proof, (c) EUDIW Verifier für Probefahrt-Führerscheinprüfung. Zeitrahmen: Q2 2027 (wenn EUDIW in AT/DE live ist). Im Blueprint mindestens als "Phase 5: Future" Section vermerken.

---

## Knowledge / RAG Gaps

### GAP-ID-5: RAG-Architektur in IR-6 nicht adressiert

**Severity:** KRITISCH
**Betroffene Docs:** DR-9 (Kap. 11), IR-6 Phase 1–4
**Problem:** DR-9 definiert eine vollständige RAG-Architektur: 5 Wissensdomänen (~165K Chunks), Multi-Index-Strategie, Parent-Child-Chunking, pgvector + HNSW, Ingest Pipeline, Query Pipeline mit RRF-Fusion + Reranking, Latenz-Budget (<500ms), Evaluation via RAGAS. **Nichts davon taucht im 16-Wochen-Implementation-Blueprint auf.** IR-6 implementiert Tool Adapters (Woche 1–2) die direkt MB-APIs aufrufen — aber kein Retrieval für Produktdokumentation, Betriebsanleitungen, FAQ, oder Rechtsdokumente. Der Agent kann Tools aufrufen, aber kann keine Wissensfragen beantworten.
**Fix:** RAG als eigene Phase einfügen oder in Phase 2 integrieren: (a) Woche N: pgvector Setup + Embedding-Pipeline für Produktkatalog + FAQ, (b) Woche N+1: RAG-Router + Hybrid Search + Reranking, (c) Woche N+2: Ingest-Pipeline für Betriebsanleitungen (ColPali/PDF), (d) RAGAS-Evaluation in CI. Ohne RAG ist der Agent auf Tool-basierte Antworten beschränkt und kann keine freien Wissensfragen beantworten.

### GAP-ID-6: Knowledge-Base-Datenquellen nicht in Tool-Adapter-Schicht abgebildet

**Severity:** HOCH
**Betroffene Docs:** DR-9 (Kap. 1.2, 11.3), Part II Kap. 22, IR-6 Woche 1–2
**Problem:** DR-9 Kap. 1.2 listet 6 Wissenstypen die RAG erfordern: Produktkatalog-API, Preis-API, Händler-API, Betriebsanleitung, Rechtsdokumente, FAQ. DR-9 Kap. 11.3 definiert eine Ingest Pipeline (MB Produkt-API → ETL → Chunking → Embedding → pgvector). IR-6 Woche 1–2 implementiert Tool Adapters (vehicle-catalog, configurator, test-drive, financing, charging), aber diese sind Live-API-Aufrufe, keine RAG-Retrieval-Quellen. Die **statische** Wissensbasis (Betriebsanleitungen, FAQ, Garantiebedingungen, technische Daten) hat keinen Adapter und keine Ingest-Pipeline.
**Fix:** Zwei Adapter-Typen unterscheiden: (a) **Live-API-Adapter** (bestehend: vehicle-catalog, configurator, etc.) für transaktionale Aktionen, (b) **RAG-Knowledge-Adapter** (NEU) für Wissensfragen. Mindestens `knowledge-retriever.ts` als Adapter der den RAG-Router aufruft. In IR-6 Phase 1 oder 2 integrieren.

### GAP-ID-7: Vector DB, Embedding-Modell und Knowledge Graph — keine Implementierungsentscheidung

**Severity:** HOCH
**Betroffene Docs:** DR-9 (Kap. 2–6), IR-6
**Problem:** DR-9 evaluiert umfassend: pgvector vs. Qdrant vs. Pinecone (Empfehlung: pgvector), Cohere embed-v4 vs. Amazon Titan (Empfehlung: Cohere oder Titan), GraphRAG/LightRAG für Phase 2. IR-6 trifft keine einzige dieser Entscheidungen und plant keine Implementierung. Supabase (pgvector) ist zwar als Infrastruktur vorhanden, aber es gibt keine Migration für Vector-Indizes, kein Embedding-Pipeline-Setup, keine Entscheidung welches Embedding-Modell über Nexus/Bedrock aufgerufen wird.
**Fix:** Architekturentscheidung dokumentieren und in IR-6 als ADR (Architecture Decision Record) festhalten: (a) pgvector + HNSW Index in Supabase, (b) Amazon Titan v2 Embeddings via Bedrock/Nexus (kein zusätzlicher API-Provider), (c) Cohere Rerank als optionale Phase 2. Dann Migration `021_pgvector_setup.sql` in Phase 1 einplanen.

### GAP-ID-8: Automotive Knowledge Base — Datenquelle und Sync-Mechanismus fehlen

**Severity:** HOCH
**Betroffene Docs:** DR-9 (Kap. 11.1), IR-6 Woche 1–2
**Problem:** DR-9 Kap. 11.1 definiert 5 Wissensdomänen mit konkreten Volumina (~30K Chunks Produktkatalog, ~100K Chunks Betriebsanleitungen). Aber weder DR-9 noch IR-6 spezifizieren: (a) Welche MB-API liefert Produktkatalog-Daten (Endpoint, Auth, Rate Limits, Format)? (b) Woher kommen Betriebsanleitungen als PDF/Source? (c) Wie funktioniert der Sync-Mechanismus (Cron? Webhook? Event-basiert?)? (d) Wer ist Data Owner bei MB für diese Quellen?
**Fix:** Kapitel "Data Source Integration Specification" in IR-6 oder Part II mit: Pro Domäne: (a) Datenquelle + API-Endpoint, (b) Auth-Methode (Nexus?), (c) Update-Frequenz, (d) Verantwortlicher Data Owner bei MB. Für den Soft Launch reicht eine Subset-Strategie: FAQ + Preise + Top-10-Modelle zuerst.

---

## Cross-Cutting Gap

### GAP-ID-9: Part I Magic Moments nicht im Blueprint verdrahtet

**Severity:** MITTEL
**Betroffene Docs:** Part I Kap. 7, IR-6 Woche 7
**Problem:** Part I definiert 12 Magic Moments für Identity-Conversion mit detaillierten Multiplikatoren und Kanal-spezifischen Strategien. IR-6 Woche 7 implementiert die "Identity Nudge Engine" mit 8 Nudge Patterns. Aber die 12 Magic Moments aus Part I werden nicht explizit auf die 8 Patterns gemappt. Unklar ist: Sind 4 Magic Moments bewusst gestrichen oder vergessen? Sind die Conversion-Zahlen aus Part I (z.B. Duolingo 2× höhere Signup-Completion) als Zielwerte in IR-6 übernommen?
**Fix:** Mapping-Tabelle: 12 Magic Moments → 8 Nudge Patterns (welche Moments triggern welches Pattern). Fehlende 4 Moments entweder als zusätzliche Patterns aufnehmen oder begründet ausschließen. Conversion-Zielwerte aus Part I als KPIs in IR-6 Nudge-A/B-Testing übernehmen.

---

## Zusammenfassung

| ID | Titel | Severity | Aufwand |
|----|-------|----------|---------|
| GAP-ID-1 | PID-Score-Formel formalisieren | HOCH | 1 Tag (Spec) |
| GAP-ID-2 | Identity-Merge-Algorithmus | KRITISCH | 3 Tage (Spec + Impl) |
| GAP-ID-3 | Passkey/FIDO2 Implementation | KRITISCH | 5 Tage (1 Woche Sprint) |
| GAP-ID-4 | EUDI-Wallet Roadmap | MITTEL | 0,5 Tage (Roadmap-Section) |
| GAP-ID-5 | RAG-Architektur im Blueprint | KRITISCH | 10 Tage (2 Wochen Sprint) |
| GAP-ID-6 | Knowledge-Adapter-Schicht | HOCH | 3 Tage (Spec + Impl) |
| GAP-ID-7 | Vector DB/Embedding ADR | HOCH | 1 Tag (ADR + Migration) |
| GAP-ID-8 | Automotive Data Sources | HOCH | 2 Tage (Spec + MB-Klärung) |
| GAP-ID-9 | Magic Moments → Nudge Mapping | MITTEL | 0,5 Tage (Mapping-Tabelle) |

**3 KRITISCHE Gaps** erfordern sofortige Aufmerksamkeit: Identity Merge (GAP-ID-2), Passkey-Integration (GAP-ID-3), und RAG im Blueprint (GAP-ID-5). Ohne diese drei ist der H2A-Agent weder sicher authentifizierbar, noch cross-channel-fähig, noch in der Lage Wissensfragen zu beantworten.
