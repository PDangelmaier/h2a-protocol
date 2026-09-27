# H2A Doktorarbeiten — Konsolidierter Gap-Report

**Datum:** 2026-09-26
**Methodik:** 11 parallele Audit-Agents, 10 Experten-Rollen, 3 Durchgänge
**Scope:** 28 Dokumente (19 Produkt + 9 Implementation), 27.059 Zeilen

---

## Executive Summary

Beide Doktorarbeiten harmonieren auf der **Vision-Ebene** hervorragend — die 7 Gebote, 5 Säulen (PID, CCP, ISP, ATL, KAM) und die 10 Gebote der Implementation sind konsistent. Auf der **Umsetzungs-Ebene** gibt es **systematische Lücken**: Der 16-Wochen-Plan priorisiert korrekt, lässt aber ganze Subsysteme (RAG, 4 von 7 Kanälen, ML-Personalisierung) ohne konkreten Implementierungsplan. Die kritischsten Probleme sind **Zahlen-Inkonsistenzen** (CCP Layers, Consent-Typen, ROI) und **fehlende Brücken** zwischen Research-Empfehlungen und Sprint-Tasks.

---

## Kritische Gaps (MUSS vor Phase 1)

| # | Gap | Quelle | Audit | Empfehlung |
|---|-----|--------|-------|------------|
| K1 | **RAG hat kein Implementation-Dokument** — DR-9 (829 Zeilen) beschreibt vollständige RAG-Architektur. Kein IR-Pendant existiert. Keine pgvector-Migration, keine Embedding-Pipeline, keine Ingest-Pipeline für 165K Chunks. | DR-9 vs. IR-Index | RAG | **Neues IR-8 "RAG & Knowledge Infrastructure" erstellen** |
| K2 | **Prompt Injection Defense fehlt in CI/CD** — Product-Doktorarbeit beschreibt Lakera/Bedrock Guard detailliert. Implementation hat keine Runtime-Input-Sanitization, nur grep nach Secrets. | DR-5 vs. IR-7 | Security | Input-Sanitizer (Bedrock Guardrails) VOR LLM-Call implementieren |
| K3 | **PII-Filter auf Agent-Antworten fehlt** — Log-PII-Redaction existiert, aber kein Output-Filter bevor Antworten an Endnutzer gestreamt werden. | Part IV vs. IR-7 | Security | Microsoft Presidio + Custom VIN/FIN Regex als Output-Rail |
| K4 | **Consent-Check in reasoning.ts ist hardcoded** — Part IV dokumentiert den Gap explizit. Implementation-Doktorarbeit ignoriert ihn. | Part IV Kap. 29.3 | Security | Dynamische Consent-Prüfung gegen `agent_tools.requires_consent` |
| K5 | **DSFA (Datenschutz-Folgenabschätzung) fehlt** — DSGVO Art. 35 Pflicht bei Profiling (ISP-Scoring = Profiling). Muss VOR Go-Live, nicht Phase 2. | Privacy DR-10 | Security | DSFA mit MB-Datenschutzbeauftragtem VOR Go-Live erstellen |
| K6 | **Identity-Merge-Schema fehlt** — Wie werden anonyme Profile mit Mercedes-me-Accounts zusammengeführt? Keine Migration, kein Schema, keine Merge-Logik. | Part I vs. IR-6 Gap #10 | Identity | Migration + `identity_links`-Tabelle + Consent-Transfer-Logik |
| K7 | **Passkey/FIDO2 ohne Implementierungsplan** — DR-3 beschreibt WebAuthn L3 detailliert. Blueprint: nur "Phase-2-Item" ohne Dateien/Tests. | DR-3 vs. IR-6 | Identity | Passkey-Adapter als Workstream-Item in Phase 2 mit konkreten Dateien |
| K8 | **Latenz-Budget widerspricht sich** — Part II: <1200ms first-token. DR-7: <2000ms. IR-7 Canary: 5000ms. DR-7 schätzt 6300ms für 5 Tools. | Part II vs. DR-7 vs. IR-7 | Architecture | Ein einziges Latenz-SLA-Dokument als Single Source of Truth |
| K9 | **10 Behavioral Design Rules ohne Enforcement** — DR-8 definiert 10 Regeln. Keine hat einen Golden Test oder Hook. | DR-8 vs. IR-3 | Behavioral | 10 Golden Tests (einer pro Regel) + CCP Layer 8 Erweiterung |
| K10 | **ROI-Modell inkonsistent** — 5 verschiedene ROI-Zahlen (729%, 833%, 3.089%, 8.337%, >3.000%) ohne klare Unterscheidung was gemessen wird. IR-6 rechnet nur Tool-Lizenzen, keine Personalkosten. | DR-6 vs. IR-6 vs. Manifest | Cost/ROI | Einheitliches 3-Szenarien-Modell mit gleicher Kostenbasis |
| K11 | **Token-Preise veraltet** — IR-6 rechnet mit alten Modell-Preisen. Input/Output nicht getrennt. Nexus-Markup nicht einkalkuliert. | IR-6 | Cost/ROI | Aktuelle Bedrock-Preise (Haiku 4.5, Sonnet 5, Opus 4.6) einsetzen |

---

## Hohe Gaps (vor Phase 1 Start klären)

| # | Gap | Audit | Empfehlung |
|---|-----|-------|------------|
| H1 | **4 von 7 Kanälen fehlen im 16-Wochen-Plan** — Smart Storefront, Dealer-Tablet, App, Voice/Alexa nicht eingeplant | UX/Channels | Als Phase 5-Items definieren, transparent kommunizieren |
| H2 | **CCP Layer-Nummern divergieren** — Part II (9 Layer), IR-7 (9 Layer, andere Nummern), Manifest (Layer 10). 3 verschiedene Zuordnungen | Architecture | Kanonische CCP-Layer-Tabelle in Part II als Single Source |
| H3 | **Tool-Roadmap unvollständig** — Part II definiert 36 Tools, IR-6 plant nur 5 Adapter | Architecture | Tool-Implementierungs-Roadmap erstellen |
| H4 | **Memory: pgvector-Retrieval nicht eingeplant** — DR-1 empfiehlt Embedding-basiertes Retrieval, IR-6 hat nur textuelle Memories | Architecture | pgvector in Phase 2 (Woche 6) einplanen |
| H5 | **Eskalationspfad "Mit Mensch sprechen" nicht implementiert** — Product-Doktorarbeit fordert es, EU AI Act verlangt es | Security | In jedem Kanal implementieren (Pre-Launch Pflicht) |
| H6 | **Accessibility (WCAG 2.1 AA) ohne Teststrategie** — 9 Kriterien definiert, nicht als CI/CD Quality Gate | UX/Channels | axe-core + Lighthouse a11y in Pipeline |
| H7 | **ISP 22 Signale + Decay-Formel ohne Build-Task** — Formel beschrieben, aber kein Sprint-Task für Implementierung | Personalization | Expliziten Task "ISP Core" in Phase 1 erstellen |
| H8 | **Journey-Phase-Erkennung erst Woche 8** — CCP und ISP brauchen Phase ab Woche 1, bekommen sie erst Woche 8 | Personalization | Auf Woche 3-4 vorziehen oder Fallback dokumentieren |
| H9 | **Layer 10 Widerspruch** — DR-2: Layer 10 = Communication Style. Bible II: Layer 10 = Nudge | Personalization | Entscheidung treffen und konsistent dokumentieren |
| H10 | **RAGAS nicht als Quality Gate** — DR-9 definiert 4 Metriken mit Zielwerten, IR-3 erwähnt RAGAS aber nicht als CI/CD Gate | RAG | `ragas-eval-gate.sh` in IR-5 Hooks aufnehmen |
| H11 | **Hybrid Search nicht in reasoning.ts** — DR-9 beschreibt RRF-Fusion + Reranking, reasoning.ts hat keine RAG-Integration | RAG | reasoning.ts um RAG-Schritt erweitern |
| H12 | **MBUX Safety ohne NHTSA-Compliance-Tests** — NHTSA 12s-Regel referenziert, kein Test verifiziert sie | UX/Channels | MBUX-Safety-Test-Suite als eigene CI-Stage |
| H13 | **Golden Tests: keine Kanal-Differenzierung** — 100+ Tests geplant, keine differenzieren nach Kanal | Testing | Pro Kanal mindestens 10 kanal-spezifische Golden Tests |
| H14 | **Test-Pyramide: 3 verschiedene Definitionen** — Part V: 5 Schichten, IR-3: 7 Schichten, Manifest: 5 andere Schichten | Testing | Eine kanonische Pyramide (7 Layer) als Standard definieren |
| H15 | **state_delta Whitelist undefiniert** — Security-Feature erwähnt, aber keine Whitelist-Einträge spezifiziert | UX/Channels | Konfigurationsdatei mit erlaubten Selektoren/Aktionen |
| H16 | **Internationalisierung nicht im 16-Wochen-Plan** — Part III: Phase 1 DE/AT/CH, Phase 2 UK/FR/IT. IR-6: nicht erwähnt | UX/Channels | i18n von Anfang an in Architektur (locale in Session, CCP per Sprache) |
| H17 | **Device Trust Score fehlt** — DR-3 definiert 6-Faktor-Modell. Blueprint: nur Tool-Level riskLevel | Identity | Phase 2-3: `device-trust.ts` mit App Attest + Play Integrity |
| H18 | **Ingest-Pipeline für Automotive Knowledge Base fehlt** — DR-9: 165K Chunks aus 5 Domänen. Keine Datenpipeline definiert | RAG | Eigenes Kapitel "Data Ingest" mit MB-API-Endpoints |
| H19 | **ML bleibt vollständig rules-based** — DR-2 definiert 5 ML-Ansätze. Keiner im 16-Wochen-Plan. Kein Reward-Signal, kein Training-Dataset | Platform/ML | Data-Collection ab Woche 4 (`isp_signal_log`), ML als Phase 5 |
| H20 | **Conversational Design Patterns ohne Golden Tests** — Tone-of-Voice, Stille-Handling, Frustrations-Erkennung — alles ohne Tests | UX/Channels | 20+ Golden Tests für Conversational Design Patterns |

---

## Mittlere Gaps (parallel fixbar)

| # | Gap | Audit |
|---|-----|-------|
| M1 | Consent-Typen: 5 vs. 10 vs. 11 in verschiedenen Dokumenten | Cross-Reference |
| M2 | Golden Tests: 50 vs. 100+ (Part V vs. IR-3/Manifest) | Testing |
| M3 | Conversation Tests: eigene Schicht oder Teil von E2E? | Testing |
| M4 | Red Team: 20 vs. 30 Szenarien (IR-3 vs. Manifest) | Testing |
| M5 | Nexus Model-Pinning nur als Konzept, nicht als Implementierung | Architecture |
| M6 | PageObserver nur für Web, nicht für App/Storefront abstrahiert | UX/Channels |
| M7 | Breathing Agent State Machine ohne formales Modul | UX/Channels |
| M8 | Frustrationserkennung ohne ML-Modell (Phase 1: regelbasiert OK) | UX/Channels |
| M9 | WhatsApp Template-Genehmigungsprozess bei Meta nicht im Sprint-Plan | UX/Channels |
| M10 | Multi-Market CCP-Skalierung: nur AT definiert, 20+ geplant | Platform/ML |
| M11 | Event Sourcing aus DR-6/DR-7 nicht als `conversation_events`-Tabelle umgesetzt | Platform/ML |
| M12 | Continuous Authentication fehlt (Session-Risk-Scoring) | Identity |
| M13 | Consent-Versionierung nicht geplant | Identity |
| M14 | Peak-End Rule ohne UX-Implementierung | Personalization |
| M15 | A/B-Testing nur für Nudges, nicht generisch | Personalization |
| M16 | GraphRAG, Knowledge Graph, Self-RAG: nur Research | RAG |
| M17 | Embedding-Kosten nicht kalkuliert | RAG/Cost |
| M18 | Multi-Market RAG-Filterung (RLS auf knowledge_chunks) | RAG |
| M19 | Supabase Single-Region vs. Multi-Region-Anspruch | Platform |
| M20 | Skalierungskosten bei 100K+ Sessions nicht kalkuliert | Cost/ROI |

---

## Zahlen-Diskrepanzen (Harmonisierung nötig)

| Thema | Werte in Docs | Empfohlener Standard |
|-------|---------------|---------------------|
| CCP Layers | 9 (Part II) / 10 (Blueprint) / 9 andere Nummerierung (IR-7) | **10** — Part II Grafik erweitern |
| Consent-Typen | 5 (DR-10) / 10 (Manifest) / 11 (Code/Part IV) | **11** — Code ist Source of Truth |
| ROI | 729% / 833% / 3.089% / 8.337% / >3.000% | **3 gelabelte Szenarien** |
| Golden Tests | 50 (Part V) / 100+ (IR-3, Manifest) | **100+** — Part V korrigieren |
| Red Team Szenarien | 20/Release (IR-3) / 30 (Manifest) | **30** — OWASP LLM Top 10 + MB-spezifisch |
| Tools | 24 (Part II) / 36 inkl. zukünftige / 5 im Blueprint | **7 für Phase 1** (PID=0), Rest priorisiert |
| First-Token-Latenz | <1200ms (Part II) / <2000ms (DR-7) / 5000ms Canary (IR-7) | **<1500ms P95** als SLA |

---

## Fehlende Dokumente (Nacharbeit nötig)

| # | Dokument | Begründung | Priorität |
|---|----------|-----------|-----------|
| 1 | **IR-8: RAG & Knowledge Infrastructure** | Größte einzelne Lücke — DR-9 hat kein IR-Pendant | KRITISCH |
| 2 | **Latenz-SLA Appendix** | 3 verschiedene Latenz-Budgets brauchen Single Source | HOCH |
| 3 | **Tool-Implementierungs-Roadmap** | 36 Tools, nur 5 im Sprint-Plan | HOCH |
| 4 | **ROI-Modell Appendix** | 5 verschiedene ROI-Zahlen brauchen Vereinheitlichung | HOCH |
| 5 | **Kanal-Roadmap (Phase 5+)** | 4 Kanäle ohne Zeitplan | MITTEL |

---

## Gesamtbewertung

| Dimension | Score | Kommentar |
|-----------|-------|-----------|
| Vision-Harmonisierung | **9/10** | Beide Doktorarbeiten teilen dieselbe Vision, 7 Gebote + 10 Gebote ergänzen sich |
| Architektur-Konsistenz | **7/10** | Grundarchitektur stimmt, aber CCP/ISP-Detailnummern divergieren |
| Implementierungsabdeckung | **6/10** | 16-Wochen-Plan deckt ~60% der Product-Vision ab — bewusste Priorisierung, aber nicht transparent |
| Zahlen-Konsistenz | **4/10** | CCP Layers, Consent-Typen, ROI, Latenz, Golden Tests — überall Divergenzen |
| Testabdeckung | **5/10** | Test-Pyramide 3x definiert, keine Kanal-differenzierten Tests, Behavioral Rules ungetestet |
| Security/DSGVO | **6/10** | Konzepte stark, Implementierung lückenhaft (Prompt Injection, DSFA, Consent-Check) |
| RAG/Knowledge | **3/10** | Stärkstes Research-Dokument (DR-9) ohne jeglichen Implementierungsplan |

**Gesamturteil: 5.7/10 — Gute Basis, aber Nacharbeit nötig vor Phase 1 Start.**

Die Product-Doktorarbeit ist exzellent (9/10). Die Implementation-Doktorarbeit ist gut für das was sie abdeckt (8/10). Die **Brücke zwischen beiden** ist die Schwachstelle — zu viele Research-Empfehlungen landen nicht als Sprint-Tasks.

---

## Empfohlene Sofort-Aktionen (Top 5)

1. **IR-8 schreiben** — RAG & Knowledge Infrastructure (Embedding, pgvector, Ingest, RAGAS)
2. **Zahlen harmonisieren** — CCP Layers (10), Consent (11), Golden Tests (100+), Latenz (<1500ms P95)
3. **Security-Lücken schließen** — Prompt Injection Defense, PII-Filter, Consent-Check, DSFA
4. **Kanal-Roadmap erstellen** — 3 Kanäle in 16 Wochen (Web, WhatsApp, MBUX) + 4 Kanäle Phase 5+
5. **Behavioral Rules testen** — 10 Golden Tests für die 10 Design Rules aus DR-8
