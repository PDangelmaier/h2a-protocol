# Audit: Architecture & Core Gaps

**Auditor:** Chief AI Architect + Backend Lead
**Datum:** 2026-09-26
**Scope:** Product-Doktorarbeit (Part II, DR-1, DR-7) × Implementation-Doktorarbeit (IR-6, IR-7, Manifest)
**Methode:** Cross-Reference der 8 Prüfpunkte mit Source-Zitat

---

### GAP-ARCH-1: CCP Layer-Nummern divergieren zwischen 3 Dokumenten

**Severity:** HOCH
**Betroffene Docs:** Part II Kap.16, IR-7 (DevOps), Implementation Manifest Gebot V
**Problem:** Part II definiert CCP als 9 Layer (1: Persönlichkeit … 9: Compliance). IR-7 definiert im Prompt-as-Code-Verzeichnis 9 Layer mit ANDERER Nummerierung: Layer 3 = Persona-Routing (Part II: Kanal-Regeln), Layer 4 = Safety (Part II: Journey-Phase), Layer 5 = Tools (Part II: Proaktivität). Das Manifest (Gebot V) wiederum nutzt eine dritte Nummerierung (layer-06-identity-pid.ts). Alle drei Dokumente sagen "9 Layer", aber die Zuordnung Name→Nummer ist inkonsistent.
**Fix:** Eine kanonische CCP-Layer-Tabelle in Part II, Kap.16 als Single Source of Truth. IR-7 und Manifest referenzieren diese Tabelle per Kapitel-Link, statt eigene Nummerierungen zu erfinden. Empfehlung: Part II Nummerierung ist die korrekte (älteste, detaillierteste).

---

### GAP-ARCH-2: CCP Layer 10 (Nudge) — Referenziert aber nicht architektonisch verankert

**Severity:** MITTEL
**Betroffene Docs:** Part II Kap.16.7, IR-6 (Blueprint Woche 7), Manifest Fahrplan Woche 7
**Problem:** Part II Kap.16.7 sagt: "CCP braucht einen 10. Layer für Identity-Nudges". IR-6 sagt `src/ccp.ts → CCP Layer 10 hinzufügen`. Aber Part II Kap.16.2 (die kanonische 9-Layer-Grafik) enthält Layer 10 NICHT. IR-7 Verzeichnisstruktur endet bei `layer-09-nudge.ts` — d.h. die DevOps-Datei hat Nudge bereits als Layer 9, während Part II Nudge als Layer 10 definiert. Es gibt keine konsistente Aussage ob CCP 9 oder 10 Layer hat.
**Fix:** Part II Kap.16.2 Grafik auf 10 Layer erweitern. Oder: Layer 9 (Compliance) und Layer 10 (Nudge) zusammenlegen in "Compliance & Nudge". Alle Dokumente müssen dieselbe Layer-Anzahl nennen.

---

### GAP-ARCH-3: Tool-Zählung inkonsistent — 24 vs. 24+12 vs. 36

**Severity:** MITTEL
**Betroffene Docs:** Part II Kap.18.5, Part II Kap.18.6, IR-6 Woche 1-2
**Problem:** Part II Kap.18.5 listet 24 Tools (Lifecycle-Abdeckung). Kap.18.6 listet 12 ZUSÄTZLICHE Tools ("Was noch gebaut werden muss"). IR-6 spricht aber nur von "5+ Tools" in Woche 1-2 und plant lediglich 5 Adapter (vehicle-catalog, configurator, test-drive, financing, charging). Die anderen 19 aus Part II und alle 12 zukünftigen Tools haben KEINEN Zeitslot im 16-Wochen-Plan.
**Fix:** IR-6 braucht eine Tool-Implementierungs-Roadmap: Welche der 36 Tools in welcher Phase. Mindestens die 7 Public-PID-0-Tools müssen in Phase 1 fertig sein (Kap.18.3 zeigt 7 Tools für PID=0, IR-6 plant nur 5).

---

### GAP-ARCH-4: Latenz-Budget widerspricht sich zwischen Part II und DR-7

**Severity:** KRITISCH
**Betroffene Docs:** Part II Kap.15.3, DR-7 (Streaming Architecture) Kap.9
**Problem:** Part II definiert: `<1200ms first-token, <2500ms 1-tool, <5000ms 5-tools`. DR-7 definiert: `<2000ms first-token` (Ziel) mit `~1600ms actual` (geschätzt). DR-7 zeigt auch `TOTAL Complete (mit Tool): <5000ms Ziel, ~6300ms actual ❌`. Es gibt zwei verschiedene first-token-Ziele (1200ms vs. 2000ms) und DR-7's eigene Schätzung zeigt bereits, dass das 5-Tool-Budget nicht erreichbar ist. IR-7 nutzt `p95_latency > 5000` als Rollback-Kriterium (Canary) und `p95_latency > 10s` als Switch-to-Fallback — das sind drei verschiedene Latenz-Schwellwerte ohne klare Hierarchie.
**Fix:** Ein einziges Latenz-Budget-Dokument als Appendix in Part II, das SLA-Tiers definiert: P50/P95/P99 für no-tool, 1-tool, 5-tool. DR-7 und IR-7 Schwellwerte müssen darauf gemappt werden. Das 6.3s-Problem bei Tools braucht explizite Mitigation im Sprint-Plan (Prompt Caching, Parallel Tool Execution).

---

### GAP-ARCH-5: Memory-System — DR-1 empfiehlt Features die IR-6 nicht plant

**Severity:** HOCH
**Betroffene Docs:** DR-1 Kap.2 (MemGPT), Part II Kap.19, IR-6 Woche 4+6
**Problem:** DR-1 identifiziert 5 kritische Memory-Verbesserungen: (1) Embedding-basiertes Retrieval via pgvector, (2) Agent-initiierte Memory-Updates (memory.save Tool), (3) Memory Consolidation, (4) Episodic Memory, (5) Memory Decay mit Reaktivierung. IR-6 plant in Woche 4 nur "Basis-Memory (Session-basiert)" und in Woche 6 "5 Typen, Extraction, Pruning". Embedding-Retrieval (pgvector) hat KEINEN Zeitslot. Agent-initiierte Updates haben KEINEN Zeitslot. Die Generative-Agents-Score-Formel `0.3*recency + 0.3*importance + 0.4*relevance` wird in DR-1 empfohlen, aber in IR-6 nicht eingeplant.
**Fix:** IR-6 Phase 2 (Woche 6) muss pgvector-Retrieval und `memory.save` Tool einplanen. Episodic Memory und Consolidation können Phase 3+ sein, aber das Embedding-basierte Retrieval ist fundamental für Memory-Qualität und muss in Phase 2.

---

### GAP-ARCH-6: Nexus Model-IDs — Format konsistent, aber Version-Pinning fehlt

**Severity:** MITTEL
**Betroffene Docs:** Part II, IR-7, IR-6, Manifest
**Problem:** Alle Dokumente verwenden konsistent SHORT-FORM: `claude-sonnet-4-6`, `claude-opus-4-6`, `claude-haiku-4-5`. Das ist korrekt. ABER: Die Modellversionen sind fest verdrahtet (z.B. `claude-sonnet-4-6`). Wenn Anthropic Sonnet 5 released oder Opus 5 kommt, ändert sich die ID. Es gibt KEINEN Model-Pinning-Mechanismus in der Architektur. Part II Kap.21 referenziert `/model/claude-sonnet-4-6/converse` als URL — was bedeutet: Model-Update = URL-Change = Code-Change. IR-7 erwähnt Pinning nur als Konzept, nicht als Implementation.
**Fix:** Ein `model_config` in Supabase oder Umgebungsvariable, nicht hardcoded. IR-6 sollte in Phase 2 (Multi-Model-Routing, Woche 5-6) einen Model-Registry-Service einplanen, der Model-IDs aus Config liest.

---

### GAP-ARCH-7: Fehler-Kaskade — Part II detailliert, IR-7 oberflächlich, Part V fehlt

**Severity:** HOCH
**Betroffene Docs:** Part II Kap.15.5, IR-7 Kap.1.5, Part V (Testing/Deployment)
**Problem:** Part II Kap.15.5 hat eine vollständige Fehler-Kaskade (4 Schichten mit konkreten Actions). IR-7 hat Canary Rollback-Conditions und Feature Flags, aber KEINE Mapping auf Part II's Fehler-Kaskade. Welcher Canary-Threshold entspricht welchem Part-II-Fehlertyp? Part V (Testing/Deployment) hat nur eine Checklist-Zeile ("Error Paths: 429, Timeout, Tool-Fehler korrekt behandelt") ohne Details. Der Fallback-Modell-Mechanismus (`config.nexus.fallbackModel` in Part II) hat in IR-7 ein anderes Fallback (`claude-haiku-4-5` in Part V vs. `claude-sonnet-4-6` als allgemeiner Fallback in IR-7). Welches Modell ist der Fallback?
**Fix:** Einheitliche Fallback-Tabelle: Primary → Fallback → Emergency. Part V muss die Part-II-Fehler-Kaskade als Test-Matrix aufnehmen (jeder Fehlertyp → erwartetes Verhalten → Test).

---

### GAP-ARCH-8: Supabase-Migrationen — Nummerierung OK, aber Schemaänderungen unvollständig

**Severity:** MITTEL
**Betroffene Docs:** IR-6 Kap.10 (Migrationen), Part II Kap.18 (Tabellen)
**Problem:** IR-6 listet: 019_consent_enhanced.sql, 020_nudge_tracking.sql, 021_journey_events.sql. Die Nummerierung (019-021) folgt auf die bestehenden 18 Migrationen. Das ist konsistent. ABER: Part II Kap.18 beschreibt 24 Tools mit PID-Score-Anforderungen, und IR-6's Migrationen decken nur Consent (019) und Nudge (020) ab. Es gibt KEINE Migration für: Tool-Execution-Logging (welche Tools wurden aufgerufen, mit welchen Ergebnissen), Memory-Embeddings (pgvector-Column für semantische Suche), Agent-Metrics (Token-Verbrauch, Kosten pro Session), Model-Routing-Decisions (welches Modell gewählt und warum).
**Fix:** Mindestens 3 weitere Migrationen planen: 022_tool_execution_log.sql, 023_memory_embeddings.sql, 024_agent_metrics.sql. Diese in IR-6 Phase 2 einordnen.

---

### GAP-ARCH-9: ISP 22 Signale — Keine Mapping-Tabelle in Implementation

**Severity:** MITTEL
**Betroffene Docs:** Part II Kap.17.2, IR-6 Woche 5
**Problem:** Part II Kap.17.2 definiert 22 Intent-Signale im ISP. IR-6 plant "22 Signale, Decay, Phase-Multiplikatoren" für Woche 5 — aber enthält KEINE Liste welche 22 Signale das sind, keine Priorisierung (alle 22 in Woche 5?), und kein Mapping Signal→Tool→CCP-Effect. Die Implementation-Doktorarbeit verweist auf Part II, aber kopiert die Signal-Liste nicht. Ein Implementierer müsste ständig zwischen beiden Doktorarbeiten wechseln.
**Fix:** IR-6 Woche 5 braucht eine Tabelle: Die 22 Signale mit Implementation-Status (welche zuerst, welche können warten), Storage-Anforderung, und Computing-Effort. Mindestens die Top-10 Signale für Phase 2, Rest in Phase 3+.

---

### GAP-ARCH-10: PID 5 Tiers — Konsistent, aber Schwellwerte nicht final

**Severity:** MITTEL
**Betroffene Docs:** Part II Kap.18.3, IR-6, Manifest Decisions #1
**Problem:** PID-Score-Bereiche werden konsistent als 0/30/40/50/60/70/80 referenziert. ABER: Die PID-Tier-Namen divergieren leicht — Part II verwendet numerische Bereiche, das Manifest verwendet "anonymous/recognized/identified/premium", und IR-6 verwendet wiederum "soft_login/identified/identified+/premium−/premium". Es gibt kein kanonisches Mapping PID-Score → Tier-Name → Berechtigungen.
**Fix:** Kanonische PID-Tier-Tabelle mit exakten Schwellwerten, Tier-Namen, und Tool-Berechtigungen. Ein Ort, alle anderen referenzieren.

---

## Zusammenfassung

| # | Severity | Kurzfassung |
|---|----------|-------------|
| 1 | HOCH | CCP Layer-Nummerierung 3× unterschiedlich |
| 2 | MITTEL | CCP Layer 10 (Nudge) nicht in kanonischer Grafik |
| 3 | MITTEL | 36 Tools geplant, nur 5 im Sprint-Plan |
| 4 | KRITISCH | Latenz-Budget: 1200ms vs 2000ms first-token, 5-Tool überschritten |
| 5 | HOCH | Memory pgvector/agent-save nicht im Sprint-Plan |
| 6 | MITTEL | Model-IDs konsistent, aber kein Pinning-Mechanismus |
| 7 | HOCH | Fehler-Kaskade/Fallback-Modell divergiert zwischen Docs |
| 8 | MITTEL | Migrationen für Tool-Log, Embeddings, Metrics fehlen |
| 9 | MITTEL | 22 ISP-Signale nicht priorisiert/gemappt für Implementation |
| 10 | MITTEL | PID-Tier-Namen inkonsistent |

**Kritische Blocker:** GAP-ARCH-4 (Latenz) muss VOR Phase 1 geklärt werden — ohne klares Latenz-Budget kann kein Performance-Test definiert werden.

**Quick Wins:** GAP-ARCH-1 (Layer-Tabelle), GAP-ARCH-10 (PID-Tabelle), GAP-ARCH-6 (Model-Config) sind reine Dokumentations-Fixes.
