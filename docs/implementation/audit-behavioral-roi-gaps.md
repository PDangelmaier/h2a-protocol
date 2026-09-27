# Audit: Behavioral Science, ROI & Brand Gaps

**Auditor:** Behavioral Scientist + Cost Controller + Luxury Brand Strategist
**Datum:** 2026-09-26
**Scope:** Product-Doktorarbeit (19 Docs) + Implementation-Doktorarbeit (9 Docs)
**Methode:** Cross-Reference der 8 Prüfpunkte gegen Quelldokumente

---

## Zusammenfassung

| Severity | Anzahl |
|----------|--------|
| KRITISCH | 2 |
| HOCH | 3 |
| MITTEL | 4 |

---

### GAP-BEH-1: ROI-Zahlen sind inkonsistent und nicht vergleichbar
**Severity:** KRITISCH
**Betroffene Docs:** DR-6 (luxury-platform-scale), IR-6 (implementation-blueprint), Manifest (implementation-manifest)
**Problem:** Drei verschiedene ROI-Zahlen in drei Dokumenten, die nicht aufeinander aufbauen:
- DR-6: **729%** ROI auf Basis €63M Impact, €7.6M Kosten (DE+AT, 5M Besucher, Call-Center-Einsparung + Conversion Uplift + NPS)
- IR-6: **8.337%** ROI auf Basis €3.375M Marge vs. €40K Betriebskosten (nur AT, 150K Sessions, nur Lead-Conversion)
- Manifest: **3.089%** ROI auf Basis $1.7M Nutzen vs. $53.3K Kosten (Konservativ-Szenario)

Die drei Berechnungen verwenden unterschiedliche Skalen (DE+AT vs. nur AT), unterschiedliche Kostenbasen (€7.6M vs. €40K vs. $53K), und unterschiedliche Nutzenmodelle. IR-6 rechnet Entwicklungskosten von nur $3.300 — unrealistisch niedrig für 16 Wochen Entwicklung (kein Personalkosten-Ansatz, nur Tool-Lizenzen).
**Fix:** Einheitliches ROI-Modell mit drei Szenarien (konservativ/realistisch/optimistisch), gleicher Kostenbasis, gleichem Markt-Scope. IR-6 muss Personalkosten oder Opportunitätskosten einbeziehen. Alle drei Dokumente müssen auf dasselbe Modell referenzieren.

---

### GAP-BEH-2: Kosten-Modell verwendet veraltete Token-Preise
**Severity:** KRITISCH
**Betroffene Docs:** IR-6 (implementation-blueprint, Zeilen 386-424)
**Problem:** Das Multi-Model-Routing rechnet mit:
- Haiku: ~$0.0005/Request
- Sonnet: ~$0.005/Request
- Opus: ~$0.03/Request

Aktuelle Modelle sind Haiku 4.5, Sonnet 5, Opus 4.6. Die Preise basieren auf älteren Modell-Generationen. Bedrock-Pricing via Nexus Gateway kann zusätzliche Aufschläge haben. Zudem fehlt die Berechnung von Input- vs. Output-Tokens (Output ist 3-5x teurer). Bei 10K Sessions/Tag mit durchschnittlich 8 Turns und Tool Use kann die reale Token-Rechnung deutlich abweichen.
**Fix:** Aktuelle Bedrock-Preise für Haiku 4.5, Sonnet 5, Opus 4.6 einsetzen. Input/Output getrennt kalkulieren. Nexus-Markup erfragen. Reale Token-Nutzung pro Session-Typ messen (FAQ vs. Konfiguration vs. Kaufberatung).

---

### GAP-BEH-3: 4 der 12 Magic Moments ohne Implementation-Mapping
**Severity:** HOCH
**Betroffene Docs:** Part I Kap. 7 (identity-conversion-thesis), IR-6 (implementation-blueprint)
**Problem:** Part I definiert 12 Magic Moments. IR-6 Woche 7 (Nudge Engine) referenziert "12 Magic Moments" und implementiert 8 Nudge Patterns. Aber:
- Magic Moment #5 (Rückkehr nach >24h) hat kein Nudge Pattern
- Magic Moment #7 (Bestellstatus prüfen) hat kein Nudge Pattern
- Magic Moment #9 (Service fällig) hat kein Nudge Pattern
- Magic Moment #12 (Cross-Channel-Transfer) hat kein dediziertes Pattern (Pattern 3 "Cross-Device" ist ähnlich, aber nicht identisch)

Die 8 Patterns decken die Pre-Purchase Phase gut ab, aber Ownership-Phase (Moments 8-12) ist unterrepräsentiert.
**Fix:** 4 zusätzliche Nudge Patterns definieren: `return_visitor`, `order_tracking`, `service_reminder`, `channel_handoff`. Ownership-Journey in der Nudge Engine gleichwertig abbilden.

---

### GAP-BEH-4: Behavioral Science nur referenziert, nicht operationalisiert
**Severity:** HOCH
**Betroffene Docs:** DR-8 (behavioral-science-cx), IR-6 (implementation-blueprint)
**Problem:** DR-8 beschreibt umfassend Kahneman System 1/2, Fogg B=MAP, Cialdini 6+1, Grice Maximen, JTBD, Peak-End Rule, Politeness Theory, Norman's 3 Levels — insgesamt 12+ Frameworks. Aber die Operationalisierung in IR-6 beschränkt sich auf:
- Nudge Engine (Fogg-inspiriert): Gut umgesetzt
- Journey Phase Detection (JTBD-inspiriert): Gut umgesetzt
- CCP Persona (Grice + Politeness): Teilweise umgesetzt

Nicht operationalisiert:
- **System 1/2 Routing**: Keine Logik die erkennt ob eine Anfrage System-1 (emotional, Bilder) oder System-2 (analytisch, Tabellen) erfordert
- **Peak-End Rule**: Keine explizite Optimierung der letzten Nachricht einer Session
- **Cognitive Bias Handling**: 8 Biases in DR-8 tabellarisch dokumentiert, aber kein Code-Artefakt das z.B. Anchoring bei Preisdarstellung verhindert
- **Cialdini Unity**: Das stärkste Prinzip für MB (Marken-Community) fehlt im CCP komplett
**Fix:** Für jedes referenzierte Framework eine explizite "Implementierungsentscheidung" treffen: Entweder "wird in Woche X als Feature Y umgesetzt" oder "bewusst nicht umgesetzt weil Z". Mindestens System 1/2 Response-Typ-Routing und Peak-End Session-Close als Features einplanen.

---

### GAP-BEH-5: Brand Voice ohne Kanal-spezifische Differenzierung
**Severity:** HOCH
**Betroffene Docs:** DR-8 (behavioral-science-cx, CCP Abschnitt), IR-6 (implementation-blueprint, CCP Layer)
**Problem:** CCP definiert 9 Prompt-Layer und eine einheitliche Persona. DR-8 erwähnt "Marktangepasst (österreichisches Deutsch für AT)". Aber es fehlen kanal-spezifische Brand-Voice-Definitionen für die 7 Kanäle:
- **WhatsApp**: Informell, kurz (1024 Zeichen Empfehlung in IR-6), Emoji-tolerant?
- **MBUX/Voice**: Kein Markdown, keine Links, Satzlänge für TTS, Sicherheitssprache
- **Smart Storefront**: Groß-Display, weniger Text, mehr visuell
- **Dealer**: Hybrid (Agent + Mensch), Übergabe-Sprache
- **App**: Push-Notification-Tone vs. Chat-Tone
- **Web**: Standard-CCP (definiert)
- **Alexa/Voice**: Extrem kurz, keine visuellen Elemente

IR-6 Woche 9-12 implementiert Kanäle, aber CCP Layer 10 (Kanal-spezifische Persona) ist nur als Platzhalter erwähnt, nicht definiert.
**Fix:** Pro Kanal eine Brand-Voice-Definition erstellen: Maximale Antwortlänge, Tonalität, erlaubte/verbotene Elemente (Emoji, Markdown, Links), Beispiel-Antworten für identische Fragen. In CCP als kanalspezifische System-Prompt-Overrides umsetzen.

---

### GAP-BEH-6: A/B Framework für Nudges vorhanden, für CCP/Behavioral Experiments fehlend
**Severity:** MITTEL
**Betroffene Docs:** IR-6 (implementation-blueprint, Zeilen 502-518, 858)
**Problem:** IR-6 definiert ein Nudge-spezifisches A/B-Framework mit Varianten, Timing und Metriken. Aber Behavioral Experiments jenseits von Nudges fehlen:
- Kein A/B für verschiedene CCP-Personas (formell vs. freundlich)
- Kein A/B für System 1 vs. System 2 Antwort-Formate
- Kein A/B für Proactivity Levels
- Kein Multi-Armed Bandit für optimale Nudge-Selektion (nur statische Varianten)
- Keine statistische Power-Analyse (Stichprobengröße für Signifikanz)

Das Manifest erwähnt 150K Sessions/Monat AT — bei typischen Conversion-Raten braucht ein A/B-Test 4-8 Wochen für statistische Signifikanz. Das passt nicht in den 16-Wochen-Plan.
**Fix:** A/B-Framework generalisieren: NudgeExperiment → BehavioralExperiment. Multi-Armed Bandit für adaptive Optimierung einplanen. Power-Analyse dokumentieren. Experiment-Roadmap erstellen die über den 16-Wochen-Plan hinausgeht.

---

### GAP-BEH-7: Break-Even "Tag 1 nach Launch" ist unrealistisch
**Severity:** MITTEL
**Betroffene Docs:** IR-6 (implementation-blueprint, Zeile 1125)
**Problem:** IR-6 behauptet Break-Even an "Tag 1 nach Launch" mit Entwicklungskosten von nur $3.300. Das ignoriert:
- Personalkosten/Opportunitätskosten des PO (16 Wochen Vollzeit)
- Ramp-Up-Phase: Tag 1 hat nicht 10K Sessions/Tag, sondern Canary mit 5%
- Lead-to-Sale Conversion braucht Wochen/Monate (Automotive-Kaufzyklus: 3-6 Monate)
- Der 4x Lead-Conversion-Uplift (2% → 8%) ist eine unbelegte Annahme

Selbst DR-6 (konservativer) setzt €7.6M Kosten an und kommt auf 729% ROI — was realistischer ist, aber immer noch aggressiv.
**Fix:** Drei Szenarien definieren: Optimistisch (Break-Even Monat 2), Realistisch (Monat 4-6), Konservativ (Monat 9-12). Ramp-Up-Kurve modellieren. Lead-to-Sale-Zeitverzug einbeziehen. Automotive-Kaufzyklus als Lag-Faktor.

---

### GAP-BEH-8: Luxury Brand Guardrails nicht als harte Constraints implementiert
**Severity:** MITTEL
**Betroffene Docs:** DR-6 (luxury-platform-scale, Manifest), IR-6 (implementation-blueprint)
**Problem:** DR-6 definiert ein klares Luxury-Digital-Manifest mit 7 Prinzipien (Subtrahiere, Erzähle, Kuratiere, Respektiere, Verbinde, Exkludiere, Verschwinde). Aber IR-6 hat keine harten Guardrails die diese Prinzipien erzwingen:
- Kein Golden Test der prüft "Agent initiiert nie einen Rabatt"
- Kein Golden Test der prüft "Agent verwendet nie Scarcity ohne API-Daten"
- Kein Golden Test der prüft "Agent spricht nie im Imperativ zum Kunden"
- Keine CCP-Regel die ethische Cialdini-Grenzen erzwingt (DR-8 Zeile 289: "UNETHISCHE Scarcity VERBOTEN")

Die 30 OWASP-Red-Team-Szenarien decken Security ab, nicht Brand Safety.
**Fix:** 15-20 Brand-Safety Golden Tests definieren basierend auf den Anti-Patterns aus Part I Kap. 11 (9 Todsünden) und dem Luxury-Digital-Manifest. Als eigene Golden-Test-Kategorie "brand_safety" in Promptfoo integrieren.

---

### GAP-BEH-9: Cialdini Unity-Prinzip nicht in CCP operationalisiert
**Severity:** MITTEL
**Betroffene Docs:** DR-8 (behavioral-science-cx, Zeilen 297-311)
**Problem:** DR-8 beschreibt Cialdini's 7. Prinzip "Unity" (Gruppenzugehörigkeit) als besonders stark für Mercedes-Benz — "Die Mercedes-Benz Gemeinschaft". Es ist der natürlichste Login-Trigger für Luxury: Exklusivität und Zugehörigkeit. Aber:
- CCP hat kein Layer für Community-Zugehörigkeit
- Nudge Pattern #7 "Exklusivitäts-Nudge" ist das einzige Pattern das Unity anspricht
- Es gibt keine Ownership-Community-Features im 16-Wochen-Plan
- Die PID-Stufe 4 "Premium" wird beschrieben wie Rolls-Royce Whispers (DR-6), aber im Blueprint nicht konkretisiert
**Fix:** Unity als explizites CCP-Element aufnehmen. Premium-Tier (PID 80+) Features definieren: Exklusive Event-Einladungen, Vorab-Zugang, persönlicher Concierge-Modus. Mindestens als Roadmap-Item für Post-Launch.

---

## Gesamtbewertung

**Behavioral Science:** Die theoretische Grundlage in DR-8 ist exzellent (Kahneman, Fogg, Cialdini, Grice, Norman — alle korrekt dargestellt). Die Operationalisierung in IR-6 konzentriert sich auf Nudge Engine und Journey Detection — gut, aber es bleiben 5+ Frameworks als "nur referenziert" stehen. **Empfehlung:** Für jedes Framework explizit entscheiden: implementieren oder dokumentiert weglassen.

**ROI-Konsistenz:** Drei verschiedene Berechnungen in drei Dokumenten, die nicht aufeinander aufbauen. Das untergräbt die Glaubwürdigkeit gegenüber Stakeholdern. **Empfehlung:** Ein einziges ROI-Modell mit Szenarien, referenziert von allen Dokumenten.

**Brand-Alignment:** Das Luxury-Digital-Manifest (DR-6) ist stark, aber nicht als testbare Constraints in der Implementation verankert. **Empfehlung:** Brand-Safety Golden Tests als gleichwertiges Gate neben Security-Tests.
