# Audit: Behavioral Science & Personalisierung — Lückenanalyse

**Rollen:** Behavioral Scientist + ML/Personalization Lead
**Datum:** 2026-09-26
**Scope:** Product-Doktorarbeit (DR-8 Behavioral Science CX, DR-2 Personalization Science, Identity-Conversion-Thesis, Bible Part II CCP+ISP) vs. Implementation-Doktorarbeit (Implementation Blueprint, Skill Architecture)
**Status:** 14 Gaps identifiziert (3 Kritisch, 5 Hoch, 6 Mittel)

---

## Kritische Gaps

### GAP-BP-01: 10 Behavioral Design Rules haben keinen Enforcement-Mechanismus

**Product-Seite:** DR-8 Kapitel 12.1 definiert 10 explizite Behavioral Design Rules:
1. Wert vor Fragen (Reziprozität)
2. 3 statt 200 (Paradox of Choice)
3. Gute Defaults (Nudge)
4. Nie im Imperativ (Politeness Theory)
5. Peak & End designen (Kahneman)
6. Emotion vor Logik (System 1/2)
7. Kleine Schritte (Commitment + Tiny Habits)
8. Transparente Scarcity (nur faktenbasiert)
9. Premium-Authentizität (keine simulierten Emotionen)
10. Repair statt Ignorieren (Conversation Analysis)

**Implementation-Seite:** Keine der 10 Regeln hat einen dedizierten Test, Hook oder Quality Gate. Der Implementation Blueprint (Phase 2, Woche 7) beschreibt zwar die Nudge Engine, adressiert aber nur Regel 1 (Wert vor Fragen) und Regel 7 (Kleine Schritte). Die Skill Architecture definiert Golden Tests in `/h2a-golden-test`, aber die 50 Starter-Szenarien prüfen Fakten, Tone und Guardrails — nicht die Einhaltung der 10 Behavioral Rules.

**Konkret fehlend:**
- Kein Golden Test prüft ob der Agent max. 3-5 Empfehlungen gibt (Regel 2)
- Kein Golden Test prüft ob der Agent im Imperativ spricht (Regel 4)
- Kein Golden Test prüft Peak-End-Qualität (Regel 5)
- Kein Golden Test prüft ob der Agent Emotionen simuliert (Regel 9)
- Kein Hook verhindert Scarcity-Aussagen ohne API-Datenbeleg (Regel 8)

**Empfehlung:** 10 zusätzliche Golden-Test-Szenarien, eines pro Behavioral Rule. Promptfoo-Assertions `no_imperative`, `max_recommendations(5)`, `no_simulated_emotion`. CCP Layer 8 (Guardrails) um die 10 Regeln als harte Constraints erweitern.

**Priorität:** KRITISCH — Ohne Enforcement sind die Behavioral Rules nur Dokumentation, kein Qualitätsstandard.

---

### GAP-BP-02: Contextual Bandits und Reinforcement Learning nur in Research, kein Implementierungsplan

**Product-Seite:** DR-2 Kapitel 2.5 beschreibt detailliert Contextual Bandits (LinUCB, Thompson Sampling, epsilon-Greedy) als "konkreter Verbesserungsvorschlag für ISP: Statt statische Proactivity-Regeln → lernendes Contextual Bandit System." DR-2 Kapitel 9.6 priorisiert es als P3 (4 Sprints), nennt es aber "Game-Changer".

**Implementation-Seite:** Der Implementation Blueprint erwähnt Contextual Bandits nirgends. Die ISP-Implementierung (Bible Part II, Kap. 17) nutzt ausschließlich statische Gewichtung mit Exponential Decay. Die Proactivity-Level-Zuordnung ist eine feste Lookup-Tabelle (Intent 0-19 → still, 20-39 → ready, etc.). Es gibt keinen Lernmechanismus, kein Exploration/Exploitation, keine Feedback-Schleife.

Die Nudge Engine (Blueprint Woche 7) hat ein A/B-Test-Framework als `NudgeExperiment`, aber das ist frequentistisches A/B-Testing, nicht Thompson Sampling. Die Entscheidungslogik `shouldNudge()` ist regelbasiert, nicht lernend.

**Konkret fehlend:**
- Kein Reward-Signal definiert (was ist "erfolgreich"? Conversion? Session-Fortsetzung?)
- Kein Offline-RL-Pipeline-Konzept (Lernen aus historischen Konversationen)
- Kein Online-Bandit für Nudge-Timing oder Proactivity-Level
- Kein Exploration-Window (periodisch abweichende Aktionen zum Lernen)

**Empfehlung:** Phase 5-6 (Scale) um Contextual Bandit Modul erweitern. Reward-Signal: gewichtete Kombination aus `nudge_accepted`, `session_continued`, `conversion_30d`. Start mit Thompson Sampling auf den 8 Nudge Patterns, dann Extension auf Proactivity-Level.

**Priorität:** KRITISCH — Das ist der zentrale Differentiator zwischen statischem und lernendem System. Ohne Bandits bleibt ISP ein manuell gewartetes Regelwerk.

---

### GAP-BP-03: User Embeddings und GRU4Rec existieren nur als TypeScript-Interfaces, nicht als Implementierungsplan

**Product-Seite:** DR-2 beschreibt drei ML-Modelle:
1. **User Embeddings** (Kap. 3.1): 15-dimensionaler Vektor pro User (vehiclePreferences, communicationStyle, intentSignals, emotionalState, engagementPattern, channelPreference). Update via Exponential Moving Average.
2. **GRU4Rec** (Kap. 3.2, Hidasi et al. 2016): Session-basierte Empfehlungen ohne Login, ideal für anonyme H2A-Sessions (PID < 20).
3. **Neural Collaborative Filtering** (Kap. 2.3, He et al. 2017): User-Vehicle-Interaction Prediction.

DR-2 Kap. 9.4 gibt einen Implementierungsplan in 3 Phasen und priorisiert User Embeddings als P2 (3 Sprints).

**Implementation-Seite:** Der Implementation Blueprint hat keinen Sprint/Woche für User Embeddings oder GRU4Rec. Phase 2 (Intelligence) implementiert Multi-Model-Routing, Nudge Engine und Journey Phase Detection — aber kein ML-Modell. Phase 4 (Production) hat Load Testing und Security, aber kein Training/Serving von ML-Modellen. Die Skill Architecture definiert keinen `/h2a-embedding` oder `/h2a-ml-train` Skill.

Das ISP bleibt bei 22 handkuratierten Signalen mit statischen Gewichten. Die einzige "Intelligenz" ist der Exponential Decay und die Phase-Multiplikatoren.

**Konkret fehlend:**
- Kein ML-Training-Pipeline-Konzept (wo trainiert man GRU4Rec? SageMaker? Vertex?)
- Kein Feature Store für User Embeddings
- Kein Serving-Infrastruktur-Plan (Latenz-Budget: <80ms für computeIntelligence())
- Kein Cold-Start-Strategie für neue User (DR-2 empfiehlt "8 Interactions" wie TikTok)
- Keine Datenakkumulation-Strategie (wie viele Sessions braucht man zum Trainieren?)

**Empfehlung:** Roadmap um Phase 5-6 "ML Foundation" erweitern. Start mit einfachem User Embedding (handberechnet, kein Neural Network), dann Upgrade auf GRU4Rec wenn genug Trainingsdaten (>10.000 Sessions). Feature Store als Supabase-View, Serving über Edge Function.

**Priorität:** KRITISCH — Ohne ML-basierte Personalisierung bleibt H2A bei "Generation 4" (statisch, regelbasiert), obwohl die Product-Doktorarbeit "Generation 5" (LLM-native) verspricht.

---

## Hohe Gaps

### GAP-BP-04: CCP Layer 10 (Identity Nudge) — definiert aber nicht getestet

**Product-Seite:** Identity-Conversion-Thesis Kap. 12 definiert CCP Layer 10 mit:
- 8 Conversational Nudge Patterns (save_configuration, personalization_unlock, cross_device, price_alert, test_drive_booking, ownership_features, exclusivity, comfort_resume)
- Frequenz-Regel: max 1 Nudge/Session, erst nach 3 Turns, nie nach Ablehnung
- Proactivity-Level steuert Nudge-Intensität

Bible Part II Kap. 16.7 beschreibt die `buildIdentityNudgeLayer()` Funktion.

**Implementation-Seite:** Blueprint Woche 7 plant `nudge-engine.ts` und `ccp.ts` Layer 10. ABER: Die Skill Architecture definiert keinen Golden Test für Nudge-Verhalten. Die 50 Starter-Szenarien (Skill `/h2a-golden-test`) haben kein Szenario "Agent nudged nach 3 Turns" oder "Agent nudged NICHT nach Ablehnung".

**Konkret fehlend:**
- Kein Golden Test: "Agent gibt max 1 Nudge pro Session"
- Kein Golden Test: "Agent nudged nicht bei Krisen-Kontext (Panne, Beschwerde)"
- Kein Golden Test: "Nudge kommt nach Antwort, nicht vor"
- Kein Promptfoo-Szenario für die 8 Nudge Patterns
- Keine Metrik für "Session Continuation after Nudge" (Conversion-Thesis Kap. 13 fordert >90%)

**Empfehlung:** 8 Golden Tests (je eines pro Nudge Pattern) + 4 Anti-Nudge-Tests (Ablehnung, Krisen, zu früh, Duplikat). Promptfoo-Szenario-Suite "identity-nudge-eval.yaml". Dashboard-Metrik "Session Continuation after Nudge".

**Priorität:** HOCH — Nudge Engine ohne Tests kann Kunden vergraulen statt konvertieren.

---

### GAP-BP-05: Keine automatische Emotionserkennung in der Implementation

**Product-Seite:** DR-8 Kap. 7.2 definiert 6 erkennbare Emotionen (Begeisterung, Frustration, Unsicherheit, Ungeduld, Freude, Verwirrung) mit konkreten Text-Signalen. DR-2 Kap. 3.4 beschreibt GoEmotions Dataset (27 Kategorien) und Transformer-basierte Sentiment-Modelle. DR-2 Kap. 9.1 empfiehlt "Emotionaler Ton Detection" als Sofort-Maßnahme (Sprint 1-2).

**Implementation-Seite:** CCP Layer 4 hat Journey-Phase-abhängige Tonalität, aber keine Echtzeit-Emotionserkennung aus User-Nachrichten. Der ISP hat 22 Verhaltenssignale — keines davon ist ein Emotions-Signal. Die `computeIntelligence()` Pipeline (Bible Part II Kap. 15.4) lädt CCP, ISP-Signale und Memories parallel, aber kein Sentiment-Modul.

Die Skill Architecture definiert in `/h2a-golden-test` eine Assertion `tone: expected` für die Agent-Antwort, aber keine Assertion für die Erkennung des User-Tons.

**Konkret fehlend:**
- Kein Sentiment-Analyse-Modul in der Pipeline
- Kein ISP-Signal `user_sentiment` oder `user_emotion`
- CCP passt Temperature nicht dynamisch an User-Emotion an (DR-2 Kap. 4.3 empfiehlt dies)
- Kein Empathie-Pattern-Router (DR-8 Kap. 7.3: Labeling, Mirroring, Strategic Empathy)

**Empfehlung:** `sentiment-detector.ts` als leichtgewichtiges Modul (Haiku-basiert, <50ms). Output: `{emotion, confidence, recommended_tone}`. In CCP integrieren: Dynamic Temperature basierend auf erkannter Emotion. ISP-Signal `user_sentiment` mit Gewicht 4.

**Priorität:** HOCH — Die Product-Doktorarbeit priorisiert dies als "Sofort", die Implementation ignoriert es vollständig.

---

### GAP-BP-06: A/B Testing Framework ist Skeleton, keine Eval-Strategie

**Product-Seite:** DR-2 Kap. 10.2 definiert 7 testbare Variablen (Login-Nudge-Timing, Agent-Persona, Empfehlungs-Anzahl, Quick-Reply Buttons, Proaktivität, System-2-Support, CCP Temperature). DR-2 Kap. 10.3 empfiehlt Bayesian A/B Testing mit Thompson Sampling. Identity-Conversion-Thesis Kap. 13 definiert 5 A/B-Tests (Nudge-Timing, Nudge-Position, Auth-Methode, Value Framing, Frequenz).

DR-8 Kap. 10.1 definiert das HEART Framework (Happiness, Engagement, Adoption, Retention, Task Success) mit 9 konkreten Metriken und Zielwerten.

**Implementation-Seite:** Blueprint Woche 7 definiert ein `NudgeExperiment` Interface mit Variant-Tracking. Blueprint Woche 16 (Soft Launch) hat einen simplen A/B-Test (Control vs Treatment, p < 0.05). Aber:
- Kein Bayesian Testing implementiert (nur frequentistisch)
- Kein HEART Framework in den Dashboards (Woche 13 definiert Ops/Quality/Business, nicht HEART)
- Kein Skill `/h2a-eval` implementiert (nur im Blueprint als "zu erstellen" erwähnt)
- Die 12 konkreten Metriken aus DR-2 + DR-8 (NPS ≥50, Task Success ≥80%, Login Conversion ≥30%, etc.) haben keine Quality Gates

**Empfehlung:** HEART Framework als primäres Metrik-Schema übernehmen. Bayesian A/B als Default (nicht frequentistisch). Skill `/h2a-eval` als P1 in die Skill Architecture aufnehmen. Quality Gates auf die 9 CX-Metriken aus DR-8 Kap. 12.2.

**Priorität:** HOCH — Ohne echtes Eval-Framework ist die Personalisierung nicht datengetrieben optimierbar.

---

### GAP-BP-07: Fogg B=MAP ist Theorie, kein Entscheidungsbaum

**Product-Seite:** DR-8 Kap. 2 erklärt Fogg's B=MAP (Behavior = Motivation × Ability × Prompt) ausführlich mit H2A-Login-Beispielen und Tiny-Habits-Strategie. Die Identity-Conversion-Thesis baut das gesamte 5-Stufen-Modell darauf auf.

**Implementation-Seite:** Die Nudge Engine (Blueprint Woche 7) prüft `PID >= 40 → Kein Nudge` und `Session < 3 Turns → Kein Nudge`. Das sind Ability- und Prompt-Checks, aber:
- **Motivation wird nicht gemessen.** Fogg sagt: wenn Motivation niedrig ist, kein Prompt. Die Implementation prüft nicht, ob der User investiert hat (Endowment Effect), ob er Wert erfahren hat, oder ob ein Magic Moment eingetreten ist.
- **Ability wird nicht pro Kanal differenziert.** Apple Sign-In auf iOS = Ability HOCH. E-Mail+Passwort auf Desktop = Ability NIEDRIG. Die Nudge Engine kennt die Auth-Methode pro Kanal (gut), aber nutzt sie nicht als Ability-Score.

**Empfehlung:** `computeMotivation()` als eigene Funktion in der Nudge Engine. Inputs: Session-Dauer, Anzahl Micro-Commitments, letzter Magic Moment, Wert der Konfiguration. `computeAbility()` basierend auf Kanal + verfügbare Auth-Methode. Nudge nur wenn `motivation * ability > threshold`.

**Priorität:** HOCH — Die Implementation hat die Form (Nudge Engine), aber nicht die Substanz (Fogg-Score).

---

### GAP-BP-08: Ethical Nudging Guardrails fehlen systematisch

**Product-Seite:** DR-8 spricht an mehreren Stellen von ethischen Grenzen:
- Kap. 3.6: "UNETHISCHE Scarcity (VERBOTEN)" mit 3 Anti-Patterns
- Kap. 9.1: "White-Hat Gamification" (nur Drives 1-4), Core Drive 8 (Avoidance) als "zu manipulativ" markiert
- Kap. 7.4: "H2A simuliert KEINE Emotionen" mit Do/Don't-Liste
- Identity-Conversion-Thesis Kap. 11: 9 Anti-Patterns ("Confirmshaming", "Session-Expiry-Falle", "Künstliche Dringlichkeit")

**Implementation-Seite:** CCP Layer 8 (Guardrails) enthält:
- Keine erfundenen Preise
- Bei Unsicherheit → Händler
- Keine Wettbewerber-Vergleiche initiieren
- Persönliche Daten nur mit Einwilligung

Aber KEINE der ethischen Nudging-Regeln:
- Kein Guardrail gegen Confirmshaming
- Kein Guardrail gegen falsche Scarcity (ohne API-Beleg)
- Kein Guardrail gegen simulierte Emotionen
- Kein Guardrail gegen Dark Patterns (Avoidance Drive)
- Kein Guardrail gegen künstliche Dringlichkeit

Die Red Team Playbook Szenarien (Blueprint Woche 14) decken Security ab (Prompt Injection, PII Exfiltration), aber kein einziges Ethical-Nudging-Szenario.

**Empfehlung:** CCP Layer 8 um 5 Ethical Nudging Guardrails erweitern. Red Team Playbook um 5 Ethical-Nudging-Szenarien ergänzen (z.B. "Agent sagt 'nur noch 2 verfügbar' ohne API-Check", "Agent sagt 'Ich freue mich für Sie'"). Golden Test Assertions: `no_confirmshaming`, `no_fake_scarcity`, `no_simulated_emotion`.

**Priorität:** HOCH — Mercedes-Benz als Premium-Marke kann sich keinen Manipulationsvorwurf leisten.

---

## Mittlere Gaps

### GAP-BP-09: ISP Composite Signals nur skizziert, keine Gewichte/Tests

**Product-Seite:** Bible Part II Kap. 17.7 definiert 3 Composite Signals:
- `hot_lead`: configurator_completed + financing_calculated + dealer_contact innerhalb 48h → Intent-Boost +20
- `tire_kicker`: 5+ configurator_started aber 0 completed → Intent-Dämpfung -15
- `churn_risk`: Besitzer mit service_booked Decay > 90 Tage → Proaktive Erinnerung

DR-2 Kap. 9.2 empfiehlt 9 zusätzliche ISP-Signale (message_length_trend, question_depth, possessive_language, competitor_mention, price_inquiry, urgency_language, return_frequency, config_iterations, micro_moment_type).

**Implementation-Seite:** Blueprint Woche 8 (Journey Phase Detection) adressiert Phase-Erkennung aus Signalen, aber nicht Composite Signals. Die 3 Composites aus der Bible und die 9 Konversations-Signale aus DR-2 fehlen im Implementation-Plan.

**Empfehlung:** Composite Signals als Woche 8b in die Implementation einplanen. Die 9 Konversations-Signale aus DR-2 als P2 in den ISP integrieren (besonders `possessive_language` und `urgency_language` sind einfach implementierbar).

**Priorität:** MITTEL — ISP funktioniert mit den 22 Basis-Signalen, wird aber deutlich besser mit Composites.

---

### GAP-BP-10: Hofstede-Dimensionen für kulturelle Adaption fehlen in CCP

**Product-Seite:** DR-2 Kap. 9.1 empfiehlt "Kulturelle Adaptation — Hofstede-Dimensionen pro Markt (DE formal, US casual, JP ultra-höflich)" als 3-Monats-Maßnahme. DR-2 Kap. 4.1 Tabelle zeigt, dass CCP Layer 2 (Market Adaptation) um "Kulturelle Kommunikationsmuster (Hofstede-Dimensionen)" erweitert werden sollte.

**Implementation-Seite:** CCP Layer 2 (Market & Sprache) setzt nur Markt (AT/DE) und Sprache (de-AT). Keine Hofstede-Parameter (Power Distance, Individualism, Uncertainty Avoidance, etc.). Der Blueprint plant 3 EU-Märkte in Phase 5-6 (Scale), aber ohne kulturelles Adaptionskonzept.

**Empfehlung:** Hofstede-Lookup-Tabelle für die 5 Hauptdimensionen pro Markt. In CCP Layer 2 integrieren: `formalityLevel`, `directnessLevel`, `honorificsRequired`. Start mit DE/AT, dann FR, IT, ES.

**Priorität:** MITTEL — Für DE/AT-Launch nicht kritisch, aber Blocker für EU-Expansion.

---

### GAP-BP-11: Dynamic Temperature pro Konversationstyp ist definiert aber nicht implementiert

**Product-Seite:** DR-2 Kap. 4.3 definiert eine dynamicTemperature()-Funktion: Faktenabfrage → 0.3, Beratung → 0.6, Inspiration → 0.7, Beschwerden → 0.3, Smalltalk → 0.5.

**Implementation-Seite:** Bible Part II Kap. 16.5 definiert Temperature pro Persona (Preisauskunft → 0.1, Service → 0.2, Beratung → 0.3, Inspiration → 0.5). Das ist statisch pro Persona, nicht dynamisch pro Nachricht. Die Implementation nutzt `resolvePersonality()` einmal pro Session — nicht pro Turn.

**Empfehlung:** Temperature-Override pro Turn basierend auf Nachrichtenklassifikation (Frage vs. Inspiration vs. Beschwerde). Einfach implementierbar: Regex-basierte Klassifikation → Temperature-Lookup → Override im Nexus-Request.

**Priorität:** MITTEL — Einfach implementierbar, moderater Impact auf Antwortqualität.

---

### GAP-BP-12: CCP Persona-Qualitätstesting hat keine Promptfoo-Szenarien

**Product-Seite:** Bible Part II Kap. 16 definiert 7 Personas (brand_ambassador, sales_advisor, personal_advisor, premium_concierge, vehicle_companion, service_coordinator, loyalty_manager). CCP hat 9 Layer die zusammen den System Prompt formen.

**Implementation-Seite:** Skill `/h2a-ccp-persona` (Skill Architecture Kap. 2.1) beschreibt wie man eine neue Persona erstellt, inkl. "Golden Test erstellen: 'Agent verhält sich wie [Persona] auf [Kanal]'". Aber es gibt kein konkretes Eval-Framework das die Persona-Konsistenz testet.

**Konkret fehlend:**
- Kein Test: "premium_concierge benutzt nie generische Begrüßung"
- Kein Test: "vehicle_companion kennt das Fahrzeug des Kunden"
- Kein Test: "service_coordinator eskaliert bei komplexem Problem"
- Kein A/B-Test: "Persona A vs. Persona B" auf Satisfaction

**Empfehlung:** Promptfoo-Suite `ccp-persona-eval.yaml` mit 7×3 Szenarien (7 Personas × 3 Kanäle). Jedes Szenario testet persona-spezifisches Verhalten. Cosine-Similarity zwischen Antwort und Persona-Beschreibung als Metrik.

**Priorität:** MITTEL — Personas funktionieren über den System Prompt, aber die Qualität ist ungetestet.

---

### GAP-BP-13: Privacy Calculus nicht als Feature implementiert

**Product-Seite:** DR-2 Kap. 5.4 und Identity-Conversion-Thesis Kap. 3.2 beschreiben die Privacy Calculus Theory (Dinev & Hart 2006). 5 Faktoren erhöhen Bereitschaft (2.1× bereits erhaltener Wert, 1.8× Markenvertrauen, etc.), 4 Faktoren senken sie. Die Conversion-Thesis baut das gesamte "Wert vor Fragen"-Paradigma darauf auf.

**Implementation-Seite:** Die Nudge Engine entscheidet binär (nudge ja/nein basierend auf PID, Turns, Dismissals). Es gibt keinen Privacy Calculus Score, der die Bereitschaft des Users zur Datenpreisgabe schätzt.

**Empfehlung:** `computePrivacyWillingness()` als Gewichtungsfaktor in der Nudge Engine. Inputs: Session-Dauer (Proxy für erhaltenen Wert), Auth-Methode-Verfügbarkeit (Proxy für Kontrolle), PID-Tier (Proxy für bisheriges Trust). Einfacher Multiplikator: `nudge_threshold = base_threshold / privacy_willingness`.

**Priorität:** MITTEL — Verbessert Nudge-Timing, aber Nudge Engine funktioniert auch ohne.

---

### GAP-BP-14: Micro-Moment-Erkennung (Google I-want-to-X) fehlt in ISP

**Product-Seite:** DR-2 Kap. 3.5 definiert die 4 Micro-Moments (know, go, do, buy) mit Erkennungslogik und optimaler Agent-Strategie pro Moment. DR-2 Kap. 9.2 listet `micro_moment_type` als neues ISP-Signal mit Gewicht 4.

**Implementation-Seite:** Der ISP hat Signal-basierte Intent-Erkennung, aber keine Micro-Moment-Klassifikation. Die Journey Phase Detection (Blueprint Woche 8) ist ähnlich, aber gröber — sie erkennt Phasen (awareness, research, configuration), nicht Echtzeit-Momente innerhalb einer Phase.

**Empfehlung:** `detectMicroMoment()` als leichtgewichtiger Classifier (Regex-basiert, kein ML nötig). Output fließt als ISP-Signal und als CCP-Strategie-Hinweis ein. Pro Moment eine optimale Agent-Strategie im System Prompt.

**Priorität:** MITTEL — Verbessert Agent-Reaktionsrelevanz, aber Journey Phase deckt den groben Kontext ab.

---

## Harmonisierungsbewertung: Product ↔ Implementation

### Stärken der Harmonisierung

| Bereich | Product | Implementation | Bewertung |
|---------|---------|----------------|-----------|
| CCP 9-Layer-Architektur | Bible Part II Kap. 16 | Blueprint + Skill `/h2a-ccp-persona` | Gut harmonisiert |
| ISP 22 Signale + Decay | Bible Part II Kap. 17 | Blueprint Phase 2 | Gut harmonisiert |
| Memory 5-Typen-System | Bible Part II Kap. 19 | Blueprint Woche 4 (Memory Extraction) | Gut harmonisiert |
| Identity Gradient (5 Stufen) | Conversion-Thesis Kap. 6 | Blueprint Woche 7 (Nudge Engine) | Teilweise harmonisiert |
| Tool Adapter Layer | Bible Part II Kap. 18 | Blueprint Woche 1-2 | Gut harmonisiert |
| DSGVO/Consent | Bible Part IV | Blueprint Woche 3 | Gut harmonisiert |

### Schwächen der Harmonisierung

| Bereich | Product | Implementation | Bewertung |
|---------|---------|----------------|-----------|
| **Behavioral Design Rules (10)** | DR-8 Kap. 12.1 | Kein Enforcement | Nicht harmonisiert |
| **Contextual Bandits / RL** | DR-2 Kap. 2.5-2.6 | Nicht eingeplant | Nicht harmonisiert |
| **User Embeddings / GRU4Rec** | DR-2 Kap. 3.1-3.2, 9.4 | Nicht eingeplant | Nicht harmonisiert |
| **Emotionserkennung** | DR-8 Kap. 7.2, DR-2 Kap. 3.4 | Nicht eingeplant | Nicht harmonisiert |
| **HEART Framework** | DR-8 Kap. 10.1 | Andere Dashboards definiert | Teilweise harmonisiert |
| **Ethical Nudging Guardrails** | DR-8 Kap. 3.6, 9.1, 11 | Nicht in CCP Layer 8 | Nicht harmonisiert |
| **Privacy Calculus** | DR-2 Kap. 5.4, Conversion-Thesis 3.2 | Nicht als Score | Nicht harmonisiert |
| **Fogg B=MAP Scoring** | DR-8 Kap. 2, Conversion-Thesis | Vereinfachte Checks | Teilweise harmonisiert |

### Gesamtbewertung

Die Implementation-Doktorarbeit deckt die **technische Architektur** (CCP, ISP, Memory, Tools, Channels) gut ab. Die Lücken liegen systematisch in drei Bereichen:

1. **ML/Learning-Systeme:** Alles was über statische Regeln hinausgeht (Bandits, Embeddings, GRU4Rec, Sentiment-Modelle) fehlt in der Implementation. Die Product-Doktorarbeit beschreibt ein lernendes System, die Implementation baut ein regelbasiertes.

2. **Behavioral Science Enforcement:** Die 10 Design Rules und ethischen Guardrails sind in der Product-Doktorarbeit präzise definiert, haben aber keine korrespondierenden Tests, Hooks oder Quality Gates in der Implementation.

3. **Eval/Measurement:** Die Product-Doktorarbeit definiert HEART Framework, 9 CX-Metriken, Bayesian A/B-Testing und Promptfoo-Szenarien. Die Implementation hat ein Skeleton für A/B und Dashboards, aber kein systematisches Eval-Framework.

**Empfohlene Priorisierung für die Harmonisierung:**

| Priorität | Aktion | Sprint |
|-----------|--------|--------|
| P0 | 10 Golden Tests für Behavioral Design Rules | Sprint 4 (parallel zu Memory) |
| P0 | 5 Ethical Nudging Guardrails in CCP Layer 8 | Sprint 7 (parallel zu Nudge Engine) |
| P1 | Sentiment Detection Modul | Sprint 8 (Journey Phase Detection) |
| P1 | HEART Framework in Dashboards | Sprint 13 (Observability) |
| P1 | Fogg B=MAP Score in Nudge Engine | Sprint 7 (Nudge Engine) |
| P2 | Composite ISP Signals + 9 Konversations-Signale | Sprint 8b |
| P2 | Promptfoo Persona-Eval-Suite | Sprint 9 |
| P3 | Contextual Bandit Modul | Sprint 17-20 (Phase 5) |
| P3 | User Embedding System | Sprint 21-23 (Phase 5) |
| P3 | GRU4Rec für anonyme Sessions | Sprint 24+ (Phase 6) |

---

*Audit durchgeführt von: Behavioral Scientist + ML/Personalization Lead Agents*
*Geprüfte Dokumente: DR-8 Behavioral Science CX, DR-2 Personalization Science, Identity-Conversion-Thesis, Bible Part II (CCP + ISP), Implementation Blueprint, Skill Architecture*
