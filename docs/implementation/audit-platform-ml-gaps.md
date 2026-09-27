# Audit: Platform Architecture & ML/Personalization Gaps

**Auditor:** Platform Architect + ML/Personalization Lead
**Datum:** 2026-09-26
**Scope:** Research-Doktorarbeit (DR-1 bis DR-7) + Implementation-Doktorarbeit (IR-1 bis IR-7) + Bible Part II + Manifest v3.0
**Methodik:** Jeder Prüfpunkt wurde gegen die Quell-Dokumente verifiziert. Nur echte Lücken mit Quellenverweis.

---

## Zusammenfassung

6 Prüfpunkte, **8 Gaps** identifiziert (2 KRITISCH, 3 HOCH, 3 MITTEL).

Die Forschungs-Doktorarbeit definiert ambitionierte ML- und Skalierungsziele (Neural CF, Contextual Bandits, User Embeddings, 4-Layer-Caching, Multi-Region). Die Implementation-Doktorarbeit adressiert diese nur teilweise — der 16-Wochen-Plan priorisiert korrekt Foundation → Intelligence → Channels → Production, lässt aber ML-Themen und Caching-Infrastruktur ohne konkreten Implementierungsplan.

---

### GAP-PLT-1: Supabase Single-Region vs. Multi-Region-Anspruch

**Severity:** HOCH
**Betroffene Docs:** DR-6 (Kap. 4.1–4.5), IR-6 (Phase 4), Bible Part II (Kap. 15)
**Problem:** DR-6 definiert eine 4-stufige Skalierungstreppe (AT → DACH → Europa → Global) mit Multi-Region Supabase und Read-Replicas ab Stufe 3. Die Bible Part II und IR-6 bauen die gesamte Architektur auf einem einzigen Supabase-Projekt in eu-central-1 auf. Der 16-Wochen-Plan (Manifest Kap. 9) enthält keinen Meilenstein für Multi-Region-Setup. Der Load Test in Woche 15 (1.000 concurrent) testet nur Single-Region.
**Fix:** Phase 4 um einen Multi-Region-Readiness-Check ergänzen: (1) Supabase Read-Replica Konfiguration dokumentieren, (2) Latenz-Budget für ap-northeast-1 und us-east-1 definieren, (3) Edge-Function-Routing für regionale Endpunkte vorbereiten. Umsetzung erst bei Stufe 2 (DACH), aber Architektur-Entscheidungen jetzt treffen (DB-Schema darf keine Region-Assumptions haben).

---

### GAP-PLT-2: Event-Driven vs. Request-Response — Widerspruch zwischen DR-6 und Bible Part II

**Severity:** MITTEL
**Betroffene Docs:** DR-6 (Kap. 3.2–3.4), DR-7 (Kap. 2–3), Bible Part II (Kap. 15)
**Problem:** DR-6 und DR-7 definieren Event Sourcing, CQRS und Saga Patterns als Architektur-Fundament. Bible Part II implementiert eine synchrone Request-Response-Pipeline (POST → Edge Function → reasoningLoop → Nexus → SSE). DR-7 selbst erkennt den Widerspruch und empfiehlt einen "Hybrid-Ansatz" (Supabase als Primärspeicher + Append-Only Event-Tabelle für Audit/Analytics). Aber weder IR-6 noch das Manifest setzen diesen Hybrid um — es gibt keinen Sprint-Task für `conversation_events` oder CDC.
**Fix:** Kein Widerspruch im Design (der Hybrid-Ansatz ist korrekt), aber eine Implementierungslücke: Die `conversation_events`-Tabelle aus DR-7 Kap. 2.2 in Phase 1 (Woche 2–3) aufnehmen. Saga Pattern erst für Phase 3 (WhatsApp Templates, Service-Buchung) relevant — dort einplanen.

---

### GAP-PLT-3: ML-Personalization bleibt vollständig rules-based

**Severity:** KRITISCH
**Betroffene Docs:** DR-2 (Kap. 2.3–2.6, 3.1–3.2), IR-6 (Phase 2), Manifest (Kap. 9)
**Problem:** DR-2 definiert 5 ML-Ansätze: Neural Collaborative Filtering, Contextual Bandits (LinUCB), GRU4Rec, User Embeddings und Reinforcement Learning. KEINER davon erscheint im Implementation Blueprint oder Manifest. Phase 2 (Intelligence, Woche 5–8) implementiert ISP mit statischen Signal-Gewichtungen und regelbasierter Proactivity. Das ISP-System nutzt hardcodierte Multiplikatoren und Decay-Funktionen — kein lernendes System. DR-2 Kap. 2.5 schlägt explizit vor, die ISP-Proactivity durch Contextual Bandits zu ersetzen ("Statt statische Proactivity-Regeln → lernendes Contextual Bandit System").
**Fix:** Zwei-Stufen-Ansatz: (1) Für den 16-Wochen-Plan ist rules-based ISP korrekt — ML braucht Daten die erst durch Nutzung entstehen. (2) ABER: Eine "Data Collection Phase" fehlt. Ab Woche 4 müssen alle ISP-Signale und User-Interaktionen in einem Format geloggt werden, das späteres Offline-RL und Bandit-Training ermöglicht. Konkreter Vorschlag: `isp_signal_log`-Tabelle mit Kontext, Aktion und Outcome als Training-Dataset. ML-Personalization als Phase 5 (Woche 17–24) in die Roadmap aufnehmen.

---

### GAP-PLT-4: User Embeddings — Design ohne Implementierungspfad

**Severity:** KRITISCH
**Betroffene Docs:** DR-2 (Kap. 3.1), IR-6 (alle Phasen)
**Problem:** DR-2 definiert ein detailliertes `UserEmbedding`-Interface (17 Dimensionen inkl. vehiclePreferences, conversationPatterns, purchaseSignals, channelPreferences) mit Exponential Moving Average Updates. Dieses Embedding ist die Grundlage für Neural CF, GRU4Rec und personalisierte Empfehlungen. IR-6 hat keine Implementierung dafür — weder als DB-Schema, noch als Computation-Pipeline, noch als pgvector-Integration. Das Memory-System (Phase 2, Woche 6) speichert textuelle Memories, aber keine numerischen Embedding-Vektoren pro User.
**Fix:** (1) Kurzfristig: Das bestehende CCP/ISP-System kann die wichtigsten Dimensionen (communicationStyle, technicalExpertise, vehiclePreferences) als JSON in `customer_profiles` speichern — kein ML nötig, regelbasierte Extraktion aus Konversation. (2) Mittelfristig: pgvector ist bereits in Supabase verfügbar. User-Embedding-Tabelle anlegen, initial aus ISP-Signalen befüllen, später durch trainiertes Modell ersetzen. (3) In Phase 5 Roadmap: Echte Embedding-Pipeline mit Offline-Training.

---

### GAP-PLT-5: Multi-Market CCP-Skalierung — 1 Markt definiert, 20+ geplant

**Severity:** HOCH
**Betroffene Docs:** DR-6 (Kap. 4.2–4.3), IR-6 (Phase 3), Bible Part II (Kap. 15, CCP-System)
**Problem:** DR-6 dokumentiert detailliert die kulturellen Unterschiede über 7 Dimensionen (Anrede, Direktheit, Preis-Kommunikation, Proaktivität, Entscheidungsstil, Humor, Formalität) für DE, JP, USA. Die CCP-Personalities im Implementation Blueprint sind ausschließlich für DE/AT definiert (9 CCP-Layer + Personas "freundlich-österreich", "professionell-deutsch" etc.). Der Manifest-Fahrplan plant nur 1 Markt (AT als Pilot). DR-6 schreibt explizit: "Jeder Markt braucht eigene CCP-Personalities — nicht nur übersetzte Prompts, sondern kulturell adaptierte Kommunikationsmuster."
**Fix:** (1) Das CCP-System muss von Anfang an Market-parametrisiert sein: `ccp_market_configs`-Tabelle statt hardcodierter Personas. (2) In Phase 1 (Woche 3) die CCP-Layer-Architektur so bauen, dass Layer 2 (Market Adaptation) und Layer 3 (Channel Rules) aus einer DB-Tabelle geladen werden, nicht aus TypeScript-Konstanten. (3) Für Stufe 2 (DACH-Expansion) ein "CCP Market Onboarding Kit" erstellen: Template mit 7 Hofstede-Dimensionen pro Markt, Review durch lokale MB-Teams.

---

### GAP-PLT-6: 4-Layer-Caching definiert, 0 Layer implementiert

**Severity:** HOCH
**Betroffene Docs:** DR-7 (Kap. 6.1–6.3), IR-6 (Phase 4), IR-7 (Kap. 1–6)
**Problem:** DR-7 definiert ein 4-Layer-Caching-System: (1) Client-Side Cache, (2) Edge Cache (Cloudflare KV), (3) Application Cache (Redis/Supabase KV) mit Tool-spezifischen TTLs, (4) Semantic Cache (pgvector für ähnliche Fragen). Zusätzlich Prompt Caching mit 67% Ersparnis auf System-Prompt-Kosten. IR-6 erwähnt Caching nur in 2 Zeilen: "CCP Caching — Personality nur 1x pro Session laden" und als Risiko-Mitigation. IR-7 fokussiert auf CI/CD und Observability, nicht auf Caching-Infrastruktur. Der Manifest-Fahrplan hat keinen Caching-Meilenstein.
**Fix:** (1) Prompt Caching (Bedrock) ist ein Quick Win — in Phase 1 (Woche 1) aktivieren, spart sofort 67% System-Prompt-Kosten. (2) Tool-Result-Cache mit TTLs aus DR-7 Kap. 6.2 in Phase 2 (Woche 5) implementieren — `enrichment_cache`-Tabelle existiert laut Bible Part II bereits, muss aber befüllt und invalidiert werden. (3) Semantic Cache (pgvector) als Phase 4 Feature (Woche 14) einplanen — erst sinnvoll mit genug Traffic-Daten. (4) CDN/Edge-Cache erst bei Stufe 2 (DACH).

---

### GAP-PLT-7: Regulatory Divergenz China/GCC nicht im Implementierungsplan

**Severity:** MITTEL
**Betroffene Docs:** DR-6 (Kap. 4.3), Manifest (Kap. 9)
**Problem:** DR-6 dokumentiert, dass Claude/Bedrock in China nicht verfügbar ist (lokales LLM nötig: Qwen, DeepSeek), arabische Märkte RTL-UI brauchen und GCC-Märkte andere Payment-Methoden erfordern. Der Implementierungsplan adressiert ausschließlich EU/DACH. Für China wäre ein separater LLM-Stack nötig — dies ist architekturrelevant, da das Nexus-Gateway aktuell nur Bedrock unterstützt.
**Fix:** (1) Für den 16-Wochen-Plan ist dies irrelevant (AT-Pilot). (2) Nexus-Gateway-Abstraktion sicherstellen: Das Interface zwischen reasoning.ts und dem LLM-Gateway muss provider-agnostisch bleiben (Bedrock Converse API ist bereits eine Abstraktion, aber die Nexus-spezifischen Headers müssen abstrahierbar sein). (3) China/GCC als separate Architektur-Entscheidung in der Roadmap ab Stufe 4 planen. Kein aktiver Handlungsbedarf jetzt.

---

### GAP-PLT-8: Keine Offline-RL/A/B-Testing-Infrastruktur geplant

**Severity:** MITTEL
**Betroffene Docs:** DR-2 (Kap. 2.5–2.6), IR-7 (Kap. 1–6), Manifest (Kap. 9)
**Problem:** DR-2 definiert Contextual Bandits und Offline-RL als Personalization-Methode. Um diese zu trainieren, braucht man (1) strukturiertes Logging aller Agent-Entscheidungen mit Kontext und Outcome, (2) eine A/B-Testing-Infrastruktur für Prompt-Varianten, (3) ein Offline-RL-Training-Environment. IR-7 (DevOps/MLOps) beschreibt Prompt-as-Code, Golden Tests und Langfuse — aber keine Experiment-Infrastruktur. Der Manifest-Fahrplan enthält keinen A/B-Testing-Meilenstein.
**Fix:** (1) Langfuse (Phase 4, Woche 13) kann als Basis dienen — Traces enthalten bereits Kontext und Response. (2) `experiment_assignments`-Tabelle in Phase 4 hinzufügen (Session → Variante-Mapping). (3) Canary Deployment (Woche 16) um Prompt-Varianten-Routing erweitern. (4) Offline-RL-Training als Phase 5 planen — erst nach 3+ Monaten Produktionsdaten sinnvoll.

---

## Priorisierte Empfehlungen

| Priorität | GAP | Aktion | Wann |
|-----------|-----|--------|------|
| 1 | GAP-PLT-6 | Prompt Caching (Bedrock) aktivieren | Woche 1 |
| 2 | GAP-PLT-3 | ISP Signal-Log Tabelle für ML-Training | Woche 4 |
| 3 | GAP-PLT-4 | User-Preference-Vektor in customer_profiles | Woche 6 |
| 4 | GAP-PLT-5 | CCP Market-Config aus DB statt Konstanten | Woche 3 |
| 5 | GAP-PLT-2 | conversation_events Append-Only Tabelle | Woche 2–3 |
| 6 | GAP-PLT-6 | Tool-Result-Cache mit TTLs | Woche 5 |
| 7 | GAP-PLT-8 | Experiment-Assignments in Langfuse | Woche 13 |
| 8 | GAP-PLT-1 | Multi-Region Readiness Check | Woche 15 |
| 9 | GAP-PLT-7 | Nexus-Abstraktion provider-agnostisch prüfen | Woche 1 |
