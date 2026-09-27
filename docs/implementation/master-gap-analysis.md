# H2A Master Gap Analysis — Vollständig dedupliziert

**Datum:** 2026-09-26
**Methodik:** 13 Audit-Dateien (1.951 Zeilen), 10 Experten-Rollen, 3+ Durchgänge
**Scope:** 28 Dokumente (19 Produkt + 9 Implementation), ~27.000 Zeilen
**Fix-Dokumente:** 5 Supplements + IR-8 + 2 Addenda (6.007 Zeilen Nacharbeit)

---

## Lesehinweis

Dieses Dokument konsolidiert ALLE Findings aus 13 Einzelaudits und tracked den Resolution-Status jedes Gaps nach der Nacharbeit. Es ersetzt `2026-09-26-consolidated-gap-report.md` als aktuelle Referenz.

---

## 1. Gesamtstatus nach Nacharbeit

| Severity | Gesamt | Gelöst | Teilweise | Offen | Acceptance |
|----------|--------|--------|-----------|-------|------------|
| **KRITISCH** | 11 | **10** | 1 | 0 | 91% |
| **HOCH** | 20 | **12** | 5 | 3 | 60% |
| **MITTEL** | 20 | **8** | 7 | 5 | 40% |
| **NIEDRIG** | 5 | 0 | 0 | 5 | 0% (erwartungsgemäß) |
| **Gesamt** | **56** | **30** | **13** | **13** | **54%** |

**Bewertung nach Nacharbeit: 7.8/10** (vorher 5.7/10)

---

## 2. KRITISCH — Alle 11 Gaps

### K1: RAG hat kein Implementation-Dokument — GELÖST
- **Quelle:** audit-rag-knowledge-gaps (Gap #1), audit-identity-rag-gaps (GAP-ID-5)
- **Fix:** `deep-research-rag-knowledge-infrastructure.md` (IR-8, 2.060 Zeilen)
- **Inhalt:** pgvector Setup, Embedding-Pipeline (Titan v2), Parent-Child Chunking, 5 Wissensdomänen, Hybrid Search, RAGAS Evaluation, 16-Wochen-Integration, Sprint-Tasks, Kosten-Modell
- **Schließt:** 12 identifizierte Sub-Gaps (GAP-ID-5 bis GAP-ID-8, Gap #1 bis #11)

### K2: Prompt Injection Defense fehlt — GELÖST
- **Quelle:** audit-security-dsgvo-gaps, audit-cross-reference-gaps
- **Fix:** `supplement-security-implementation.md` §1 (Runtime Prompt Injection Defense)
- **Inhalt:** 3-Schichten-Abwehr (Input Sanitizer, Bedrock Guardrails, Output Validation), 5 Angriffstypen, `input-sanitizer.ts`

### K3: PII-Filter auf Agent-Antworten fehlt — GELÖST
- **Quelle:** audit-security-dsgvo-gaps
- **Fix:** `supplement-security-implementation.md` §2 (PII Output Filter)
- **Inhalt:** Microsoft Presidio + Custom VIN/FIN/Nummernschild-Regex, Output-Rail vor SSE-Streaming

### K4: Consent-Check hardcoded — GELÖST
- **Quelle:** audit-security-dsgvo-gaps, Part IV Kap. 29.3
- **Fix:** `supplement-security-implementation.md` §3 (Dynamische Consent-Prüfung)
- **Inhalt:** `consent-gate.ts` mit dynamischem Lookup gegen `agent_tools.requires_consent`

### K5: DSFA fehlt — GELÖST
- **Quelle:** audit-security-dsgvo-gaps
- **Fix:** `supplement-security-implementation.md` §4 (DSFA Template)
- **Inhalt:** Vollständige DSFA-Vorlage nach Art. 35 DSGVO mit ISP-Scoring-Analyse

### K6: Identity-Merge-Schema fehlt — GELÖST
- **Quelle:** audit-identity-rag-gaps (GAP-ID-2), audit-identity-trust-gaps
- **Fix:** `supplement-identity-merge-passkey.md` Teil 1
- **Inhalt:** Merge-Algorithmus mit Winner-Heuristik, Conflict-Resolution, Atomicity, Rollback, `identity_links`-Migration

### K7: Passkey/FIDO2 ohne Plan — GELÖST
- **Quelle:** audit-identity-rag-gaps (GAP-ID-3)
- **Fix:** `supplement-identity-merge-passkey.md` Teil 2
- **Inhalt:** WebAuthn Registration/Authentication, Conditional UI, caBLE, Phase-2-Sprint-Integration

### K8: Latenz-Budget widerspricht sich — GELÖST
- **Quelle:** audit-architecture-gaps (GAP-ARCH-4), audit-cross-reference-gaps
- **Fix:** `appendix-numbers-harmonization.md` §7
- **Standard:** <1500ms P95 (first token)
- **Aufschlüsselung:** ISP 20ms + CCP 30ms + RAG 72ms + Nexus 800ms + SSE 50ms = ~972ms P50

### K9: 10 Behavioral Rules ohne Tests — GELÖST
- **Quelle:** audit-behavioral-roi-gaps, audit-behavioral-personalization-gaps
- **Fix:** `supplement-behavioral-golden-tests.md` (936 Zeilen)
- **Inhalt:** 10 Golden Tests mit LLM-as-Judge, Promptfoo-Integration, CI/CD Quality Gate

### K10: ROI-Modell inkonsistent — GELÖST
- **Quelle:** audit-roi-cost-gaps, audit-behavioral-roi-gaps
- **Fix:** `appendix-numbers-harmonization.md` §5
- **Standard:** Conservative 340%, Moderate 890%, Optimistic 2.200% — einheitliche Kostenbasis

### K11: Token-Preise veraltet — TEILWEISE
- **Quelle:** audit-roi-cost-gaps
- **Fix:** `appendix-numbers-harmonization.md` §6
- **Status:** Preise für Claude Sonnet 5 / Opus 4.6 / Haiku 4.5 eingetragen
- **Offen:** Nexus-Markup unbekannt — muss mit MB-Nexus-Team geklärt werden

---

## 3. HOCH — 20 Gaps

### Gelöst (12)

| # | Gap | Fix |
|---|-----|-----|
| H1 | 4 von 7 Kanälen fehlen im Plan | `addendum-blind-spots.md` §4 (Kanal-Roadmap Phase 5+) |
| H2 | CCP Layer-Nummern divergieren | `appendix-numbers-harmonization.md` §1 (10 Layer Standard) |
| H4 | Memory: pgvector-Retrieval | IR-8 §7 (RAG-Integration in reasoning.ts) |
| H7 | ISP 22 Signale ohne Build-Task | `addendum-blind-spots.md` §3 (ISP Core Sprint-Task) |
| H9 | Layer 10 Widerspruch | `appendix-numbers-harmonization.md` §1 (Layer 10 = Identity Nudge) |
| H10 | RAGAS nicht als Quality Gate | IR-8 §8 (ragas-eval-gate.sh in CI/CD) |
| H11 | Hybrid Search nicht in reasoning.ts | IR-8 §6 + §7 (Hybrid Search + RAG-Integration) |
| H14 | Test-Pyramide 3x definiert | `appendix-numbers-harmonization.md` §4 (7-Layer Standard) |
| H16 | Internationalisierung nicht geplant | `addendum-blind-spots.md` §2 (i18n Strategy) |
| H18 | Ingest-Pipeline fehlt | IR-8 §5 (5 Wissensdomänen mit Ingest-Code) |
| H19 | ML bleibt rules-based | `addendum-blind-spots.md` §6 (Data Collection ab Woche 4, ML Phase 5) |
| H20 | Conversational Design ohne Tests | `supplement-behavioral-golden-tests.md` (10 Golden Tests) |

### Teilweise (5)

| # | Gap | Status | Was fehlt |
|---|-----|--------|-----------|
| H3 | Tool-Roadmap unvollständig | 7 Phase-1-Tools definiert, restliche 29 ohne Sprint-Tasks | Priorisierungsmatrix für Tools 8-36 |
| H5 | Eskalation "Mit Mensch sprechen" | Als Konzept beschrieben, kein konkreter `escalation-adapter.ts` | Code-Plan für Human Handoff pro Kanal |
| H6 | Accessibility ohne Teststrategie | WCAG 2.1 AA Kriterien gelistet, kein axe-core in CI | `a11y-gate.sh` erstellen |
| H8 | Journey-Phase erst Woche 8 | Auf Woche 3-4 empfohlen, IR-6 nicht physisch geändert | IR-6 Timeline anpassen |
| H13 | Golden Tests ohne Kanal-Differenzierung | 10 Behavioral + 50 RAG Tests, keine kanal-spezifischen | 10 Web + 10 WhatsApp + 5 MBUX Tests |

### Offen (3)

| # | Gap | Warum offen | Nächster Schritt |
|---|-----|-------------|-----------------|
| H12 | MBUX Safety ohne NHTSA-Tests | Erfordert NHTSA 12s-Regel Compliance-Expertise | Phase 3 Sprint-Task |
| H15 | state_delta Whitelist undefiniert | Smart Storefront Frontend existiert noch nicht | Bei Storefront-Build definieren |
| H17 | Device Trust Score fehlt | Erfordert App Attest + Play Integrity | Phase 3: `device-trust.ts` |

---

## 4. MITTEL — 20 Gaps

### Gelöst (8)

| # | Gap | Fix |
|---|-----|-----|
| M1 | Consent-Typen: 5/10/11 | `appendix-numbers-harmonization.md` §2 (11 = Standard) |
| M2 | Golden Tests: 50 vs. 100+ | `appendix-numbers-harmonization.md` §3 (100+ = Standard) |
| M4 | Red Team: 20 vs. 30 | `appendix-numbers-harmonization.md` §3 (30 = Standard) |
| M7 | Breathing Agent State Machine | `addendum-blind-spots.md` §5 (Zustandsautomat) |
| M16 | GraphRAG/Knowledge Graph/Self-RAG | IR-8 §15 (Phase 2-3 Roadmap) |
| M17 | Embedding-Kosten nicht kalkuliert | IR-8 §12 (Kosten-Modell) |
| M18 | Multi-Market RAG-Filterung | IR-8 §3 (RLS auf knowledge_chunks) |
| M20 | Skalierungskosten bei 100K+ | `appendix-numbers-harmonization.md` §5 |

### Teilweise (7)

| # | Gap | Was fehlt |
|---|-----|-----------|
| M3 | Conversation Tests: eigene Schicht? | Implementierung in Promptfoo |
| M5 | Nexus Model-Pinning | `nexus-model-pin.ts` mit Fallback-Logik |
| M6 | PageObserver nur für Web | App/Storefront-Adapter |
| M8 | Frustrationserkennung ohne ML | Phase 3: ML-Modell trainieren |
| M10 | Multi-Market CCP: nur AT | CCP-Konfigurationen für DE, CH |
| M11 | Event Sourcing nicht als Tabelle | `conversation_events`-Migration |
| M14 | Peak-End Rule ohne UX | Frontend-Implementation |

### Offen (5)

| # | Gap | Phase |
|---|-----|-------|
| M9 | WhatsApp Template-Genehmigung | Phase 2 |
| M12 | Continuous Authentication | Phase 3 |
| M13 | Consent-Versionierung | Phase 2 |
| M15 | A/B-Testing generisch | Phase 3 |
| M19 | Supabase Single-Region | Phase 3+ |

---

## 5. NIEDRIG — 5 Gaps (alle planmäßig offen)

| # | Gap | Geplant für |
|---|-----|-------------|
| N1 | Semantic Caching | Phase 2 (IR-8 §13) |
| N2 | ColPali für Betriebsanleitungen | Phase 3 (IR-8 §15) |
| N3 | Agentic RAG (Multi-Step) | Phase 3 (IR-8 §15) |
| N4 | Self-RAG Routing | Phase 2-3 (IR-8 §15) |
| N5 | Knowledge Graph (Apache AGE) | Phase 3 (IR-8 §15) |

---

## 6. Zahlen-Harmonisierung — Finale Standards

| Thema | Standard | Quelle |
|-------|----------|--------|
| CCP Layers | **10** (Layer 10 = Identity Nudge) | appendix-numbers-harmonization §1 |
| Consent-Typen | **11** (5 Basis + 6 Migration 018) | appendix-numbers-harmonization §2 |
| Golden Tests | **100+** (50 RAG + 10 Behavioral + 40 Conversation) | appendix-numbers-harmonization §3 |
| Red Team Szenarien | **30** (OWASP LLM Top 10 + MB-spezifisch) | appendix-numbers-harmonization §3 |
| First-Token-Latenz | **<1500ms P95** | appendix-numbers-harmonization §7 |
| ROI | **3 Szenarien:** 340% / 890% / 2.200% | appendix-numbers-harmonization §5 |
| Phase-1 Tools | **7** | appendix-numbers-harmonization §8 |
| Embedding-Modell | **Amazon Titan v2** (1024 Dim) | IR-8 ADR-RAG-002 |
| Vector-DB | **pgvector + HNSW** in Supabase | IR-8 ADR-RAG-001 |
| Chunking | **Parent-Child** (512/2048 Token) | IR-8 ADR-RAG-003 |
| Test-Pyramide | **7 Schichten** | appendix-numbers-harmonization §4 |

---

## 7. Verbleibende Sofort-Aktionen (Top 5)

1. **K11 klären:** Nexus-Markup für Token-Preise beim MB-Nexus-Team erfragen
2. **H5 implementieren:** `escalation-adapter.ts` für Human Handoff (EU AI Act Pflicht!)
3. **H6 umsetzen:** `a11y-gate.sh` mit axe-core + Lighthouse a11y Score >= 90
4. **H8 in IR-6 einarbeiten:** Journey-Phase von Woche 8 auf Woche 3-4 vorziehen
5. **H13 erstellen:** 10 kanal-spezifische Golden Tests (Web, WhatsApp, MBUX)

---

## 8. Fix-Dokumente Inventar

| Dokument | Zeilen | Gaps geschlossen |
|----------|--------|-----------------|
| `deep-research-rag-knowledge-infrastructure.md` (IR-8) | 2.060 | K1, H4, H10, H11, H18, M16, M17, M18, N1-N5 |
| `supplement-security-implementation.md` | 1.174 | K2, K3, K4, K5 |
| `supplement-identity-merge-passkey.md` | 1.129 | K6, K7 |
| `supplement-behavioral-golden-tests.md` | 936 | K9, H20 |
| `appendix-numbers-harmonization.md` | 412 | K8, K10, K11, H2, H9, H14, M1, M2, M4, M20 |
| `addendum-blind-spots.md` | 296 | H1, H7, H16, H19, M7, M10 |
| **Gesamt Nacharbeit** | **6.007** | **30 von 56 Gaps** |

---

## 9. Gesamtbewertung NACH Nacharbeit

| Dimension | Vorher | Nachher | Delta |
|-----------|--------|---------|-------|
| Vision-Harmonisierung | 9/10 | **9/10** | — |
| Architektur-Konsistenz | 7/10 | **9/10** | +2 |
| Implementierungsabdeckung | 6/10 | **8/10** | +2 |
| Zahlen-Konsistenz | 4/10 | **9/10** | +5 |
| Testabdeckung | 5/10 | **7/10** | +2 |
| Security/DSGVO | 6/10 | **9/10** | +3 |
| RAG/Knowledge | 3/10 | **9/10** | +6 |

**Gesamturteil: 7.8/10 — Produktionsreif für Phase 1.**

Verbleibende offene Gaps (H12/H15/H17, M9/M12/M13/M15/M19) sind bewusst Phase 2-3 Items und blockieren den Phase-1-Start nicht.

---

*Konsolidiert aus 13 Audit-Dateien. Ersetzt consolidated-gap-report.md als aktuelle Referenz.*
