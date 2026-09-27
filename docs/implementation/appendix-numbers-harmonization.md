# H2A Zahlen-Harmonisierung — Single Source of Truth

**Datum:** 2026-09-26
**Zweck:** Alle Zahlen-Divergenzen zwischen Produkt- und Implementation-Doktorarbeit bereinigen.
**Methodik:** Für jede Divergenz: Standard festlegen → Quellen auflisten → Begründung → Änderungsbedarf.

> Dieses Dokument ist die **kanonische Referenz** für alle numerischen Werte in beiden Doktorarbeiten. Bei Widersprüchen zwischen anderen Dokumenten und diesem Appendix gilt dieser Appendix.

---

## 1. CCP Layers — Kanonisch: 10

### Standard

| Layer | Name | Quelle | Beschreibung |
|-------|------|--------|-------------|
| 1 | **Persönlichkeit** | personality.systemPrompt | Basis-Persona (Tonalität, Charakter) |
| 2 | **Markt & Sprache** | market_config | DE/AT/CH, Währung, Rechtsrahmen |
| 3 | **Kanal-Regeln** | channel_config | Web: lang, WhatsApp: kurz, MBUX: Safety-First |
| 4 | **Journey-Phase** | ISP → journey_phase | Awareness/Interest/Decision/Purchase/Ownership |
| 5 | **Proaktivitäts-Regeln** | ISP → proactivity_score | Wann darf Agent initiativ werden |
| 6 | **Identitäts-Kontext** | PID Score + Tier | Was Agent über den Kunden weiß |
| 7 | **Agent-Gedächtnis** | memory_store (Top 10) | Preferences, Facts, Relationships |
| 8 | **Guardrails** | safety_config | Token-Limits, Verbotene Themen, Brand Safety |
| 9 | **Compliance** | compliance_config | DSGVO-Hinweise, Disclaimer, Rechtstext |
| 10 | **Identity Nudge** | nudge_engine | Login-Conversion-Trigger, PID-Upgrade-Strategie |

### Divergenzen

| Dokument | Zeile(n) | Aktuell | Soll |
|----------|----------|---------|------|
| Part II (Kap. 16.2) | Z.183-228 | "9 Schichten" + Hinweis auf Layer 10 | "10 Schichten" — Layer 10 ist Teil des Kerns |
| Part II (Kap. 16.7) | Z.321-334 | "Was noch fehlt: Layer 10" | Umbenennen: "Layer 10: Identity Nudge (Phase 2)" |
| IR-7 (DevOps) | varies | 9 Layer, andere Reihenfolge (Layer 3 = Persona-Routing) | An obige Tabelle angleichen |
| Manifest | Z.574 | "9 Prompt-Layer" | "10 Prompt-Layer" |
| Part II Diagramm | Z.78 | `[CCP: 9 Layer]` | `[CCP: 10 Layer]` |

### Begründung

Part II selbst beschreibt Layer 10 in Kap. 16.7 und referenziert Part I Kap. 12 (Identity Conversion). Der Layer existiert konzeptionell bereits — er wird nur als "fehlend" gelabelt, obwohl die Spezifikation vollständig ist. 10 Layer als Standard eliminiert den Widerspruch zwischen "9 Schichten" im Text und der Layer-10-Diskussion 140 Zeilen später.

---

## 2. Consent-Typen — Kanonisch: 11

### Standard (aus Part IV, Migration-Code)

| # | Enum-Wert | Beschreibung | Basis/Erweitert |
|---|-----------|-------------|-----------------|
| 1 | `ai_personalization` | Agent darf personalisierte Antworten geben | Basis |
| 2 | `cross_channel` | Daten zwischen Kanälen teilen | Basis |
| 3 | `proactive_contact` | Agent darf proaktiv Kontakt aufnehmen | Basis |
| 4 | `analytics` | Nutzungsdaten für Verbesserungen | Basis |
| 5 | `marketing` | Werbliche Kommunikation | Basis |
| 6 | `ai_autonomy` | AI-Agent darf eigenständig handeln | Migration 018 |
| 7 | `voice_recording` | Sprachaufnahmen speichern (MBUX) | Migration 018 |
| 8 | `data_retention` | Daten über Standardfrist hinaus behalten | Migration 018 |
| 9 | `profiling_art22` | Automatisierte Einzelentscheidungen (DSGVO Art. 22) | Migration 018 |
| 10 | `cross_device` | Daten zwischen Geräten synchronisieren | Migration 018 |
| 11 | `location_tracking` | Standortdaten verarbeiten | Migration 018 |

### Divergenzen

| Dokument | Aktuell | Soll |
|----------|---------|------|
| DR-10 (Privacy AI) | "5 Basis-Consent-Typen" | "5 Basis + 6 Erweitert = 11" klarstellen |
| Manifest (Z.574) | "11 Consent-Typen" ✅ | Korrekt — keine Änderung |
| Part IV (Z.148-161) | 11 Enum-Werte ✅ | Source of Truth — keine Änderung |

### Begründung

Der SQL-Code in Part IV (CREATE TYPE consent_type) definiert exakt 11 Werte: 5 Basis + 6 über Migration 018. DR-10 nennt nur die 5 Basis-Typen, weil die Studie vor der Migration-018-Erweiterung geschrieben wurde. Die 11 im Code sind die einzig gültige Zahl.

---

## 3. Latenz-SLA — Kanonisch: <1500ms P95 First-Token

### Standard

| Metrik | Wert | Kontext |
|--------|------|---------|
| **P50 First-Token** | <800ms | Normaler Fall, kein Tool |
| **P95 First-Token** | <1500ms | SLA — Alerting-Schwellwert |
| **P99 First-Token** | <3000ms | Canary-Schwellwert |
| **Hard-Limit** | 5000ms | Timeout — Fehlermeldung an Nutzer |
| **Complete (ohne Tool)** | <4000ms P95 | Volle Antwort, kein Tool-Call |
| **Complete (mit 1 Tool)** | <5000ms P95 | 1 Tool-Runde |
| **Complete (mit 5 Tools)** | <8000ms P95 | Maximum — Fortschrittsanzeige Pflicht |

### Budget-Aufschlüsselung (P95)

```
Client → Edge (Cloudflare)           10ms
Edge → Supabase Edge Function         20ms
Input Sanitization + Guardrails        15ms
Session Load / Identity Resolve        40ms
CCP Build System Prompt                10ms
ISP Compute                             5ms
Nexus/Bedrock Network                  80ms
LLM Time-to-First-Token            1.200ms  ← Dominierender Faktor
First SSE Frame → Client               30ms
─────────────────────────────────────────────
TOTAL First Token (P95)            ~1.410ms ✅ (<1.500ms)
```

### Divergenzen

| Dokument | Zeile(n) | Aktuell | Soll |
|----------|----------|---------|------|
| Part II (Z.127) | Z.117-129 | "<1200ms First-Token" (ohne Tool) | "<1500ms P95 First-Token" — der Wert aus Part II ist P50, nicht P95 |
| DR-7 (Z.520) | Z.515-545 | "<2s First Token" | "<1.5s P95 First Token" — DR-7 war konservativer, 1.5s ist der Kompromiss |
| IR-7 (Z.157) | Z.155-160 | Canary: 5000ms | Korrekt als **Hard-Limit/Timeout**, nicht als SLA |
| IR-7 (Z.596) | Z.594-601 | P95 Alert > 5000ms | Ändern auf "P95 Alert > 1500ms, P99 Alert > 3000ms" |

### Begründung

Part II nennt <1200ms als Ideal (= P50-Ziel). DR-7 schätzt ~1600ms als Actual (P95). IR-7 nutzt 5000ms als Canary-Timeout. Diese 3 Werte sind **verschiedene Perzentile und Schwellwerte**, nicht Widersprüche — sie waren nur nicht als solche gelabelt. 1500ms P95 ist der Kompromiss: realistischer als 1200ms, strenger als 2000ms.

**Mit Prompt Caching** (Quick Win aus DR-7): LLM TTFT sinkt um ~200ms → P95 ~1200ms erreichbar.

---

## 4. ROI-Modell — Kanonisch: 3 gelabelte Szenarien

### Standard: Drei Szenarien mit einheitlicher Basis

| Szenario | ROI | Basis | Scope |
|----------|-----|-------|-------|
| **Konservativ** | ~300% | 10% der DR-6-Annahmen, volle Kosten inkl. PO | Nur Lead-Conversion-Uplift |
| **Basis** | ~800% | 30% der DR-6-Annahmen, volle Kosten | Lead + Retention + Service-Deflection |
| **Optimistisch** | ~3.000% | 100% der DR-6-Annahmen, nur Betriebskosten | Vollständiger Geschäftswert |

### Einheitliche Kostenbasis (Jahreskosten)

| Posten | Monatlich | Jährlich |
|--------|-----------|----------|
| **Nexus Token-Kosten** | ~$2.500 | ~$30.000 |
| Supabase (Pro + Edge) | $350 | $4.200 |
| Monitoring (Langfuse, Grafana) | $200 | $2.400 |
| Cloudflare (Workers, R2) | $150 | $1.800 |
| **Betriebskosten gesamt** | **~$3.200** | **~$38.400** |
| PO Anteil (50% einer Vollzeitstelle) | ~$5.000 | ~$60.000 |
| **Gesamtkosten inkl. Personal** | **~$8.200** | **~$98.400** |

### Token-Preise (Stand: September 2026, Bedrock via Nexus)

| Modell (Short-Form ID) | Input (per 1M Token) | Output (per 1M Token) | Use Case |
|-------------------------|---------------------|----------------------|----------|
| `haiku-4-5` | $0.80 | $4.00 | Triage, einfache Fragen |
| `sonnet-5` | $3.00 | $15.00 | Standard-Conversations |
| `opus-4-6` | $15.00 | $75.00 | Komplexe Multi-Tool-Szenarien |
| `titan-embed-text-v2` | $0.02 | — | RAG Embedding |

**Nexus-Markup:** +15-25% auf Bedrock-Preise (intern verrechnet).

### Herkunft der bisherigen ROI-Zahlen

| Zahl | Quelle | Was gemessen wurde | Problem |
|------|--------|-------------------|---------|
| 729% | DR-6 (Z.737) | Geschäftswert €63M vs. Gesamtinvestment €7.6M (Team+Infra) | Korrekt für Vollszenario, aber unrealistisch als Versprechen |
| 833% | IR-6 (Z.1116) | "Selbst bei 10% der Wirkung" — 0.1× DR-6-Wert vs. Betriebskosten | Mischung aus konservativem Wert und niedrigerer Kostenbasis |
| 3.089% | Manifest (Z.640) | €1.7M Wert vs. €53.300 Betriebskosten (Monat-Extrapolation) | Ignoriert PO-Personalkosten |
| 8.337% | IR-6 (Z.1114) | €3.375M Wert vs. €40K reine Betriebskosten | Ignoriert Personalkosten, nutzt volle DR-6-Annahmen |
| >3.000% | Manifest (Z.819) | Gerundete Version von 3.089% | Grobe Rundung, ohne Szenario-Label |

### Divergenz-Behebung

| Dokument | Zeile(n) | Aktuell | Soll |
|----------|----------|---------|------|
| DR-6 (Z.737) | Z.730-740 | "729%" | Beibehalten, labeln als "Produkt-ROI (Vollszenario)" |
| IR-6 (Z.1101-1116) | Z.1077-1120 | "8.337%" + "833%" | Ersetzen durch 3-Szenarien-Tabelle |
| Manifest (Z.637-645) | Z.637-650 | 3 verschiedene ROI-Zahlen ohne Kontext | Ersetzen durch 3-Szenarien-Tabelle + Fußnoten |
| Manifest (Z.819) | Z.819 | ">3.000%" | "ROI je nach Szenario 300%-3.000%" |

### Kritische Korrekturen

1. **Lead-Conversion 2%→8%:** IR-6/DR-6 nimmt 4x-Uplift an. Branchenstandard: 20-50% relative Verbesserung (= 2.4%-3.0%). Konservatives Szenario nutzt 2.4%.
2. **450 inkrementelle Fahrzeuge/Monat AT:** AT-Gesamtmarkt ~2.100/Monat. +21% durch einen Chatbot ist unrealistisch. Konservatives Szenario: 50 Fahrzeuge/Monat (+2.4%).
3. **Break-Even "Tag 1":** Ignoriert Ramp-Up und den Automotive-Kaufzyklus (3-12 Monate). Realistisch: Break-Even nach 3-6 Monaten.

---

## 5. Golden Tests — Kanonisch: 100+

### Standard: 105 Tests in 7 Kategorien

| Kategorie | Anzahl | Beispiel-Themen |
|-----------|--------|-----------------|
| **Behavioral Rules** | 20 | 10 Design Rules aus DR-8 × 2 Varianten |
| **Brand Safety** | 15 | Luxury-Tonalität, Wettbewerb-Erwähnungen, Preis-Sensitivität |
| **Safety & Guardrails** | 20 | Prompt Injection, Jailbreak, PII-Leak, Hallucination |
| **Kanal-spezifisch** | 15 | 5 pro Kanal (Web, WhatsApp, MBUX) |
| **RAG Accuracy** | 15 | Fahrzeug-Specs, Service-Infos, Konfigurator-Daten |
| **Conversational Design** | 10 | Tone-of-Voice, Stille-Handling, Frustrations-Erkennung |
| **Identity & Nudge** | 10 | PID-Tier-spezifische Antworten, Nudge-Timing |
| **GESAMT** | **105** | |

### Divergenzen

| Dokument | Zeile(n) | Aktuell | Soll |
|----------|----------|---------|------|
| Part V (Z.818) | Z.615, Z.818 | "50 kanonische Fragen" | "105 Golden Tests" — Part V beschreibt einen Subset |
| IR-3 (Z.240) | Z.240 | "100+ Tests" ✅ | Korrekt — auf 105 konkretisieren |
| Manifest (Z.274) | Z.274 | "100+ Golden Tests vor Launch" ✅ | Korrekt — keine Änderung |

### Begründung

Part V wurde vor IR-3 geschrieben und definierte 50 als initiale Zielgröße. IR-3 erweiterte auf 100+ basierend auf der 7-Layer-Pyramide. Die 105 sind das konkrete Minimum: 7 Kategorien × 15 im Durchschnitt. Part V soll als "Phase 1: 50 → Launch: 105" formuliert werden.

---

## 6. Red Team Szenarien — Kanonisch: 30

### Standard

| Kategorie | Anzahl | Quelle |
|-----------|--------|--------|
| OWASP LLM Top 10 | 10 | Je 1 Szenario pro OWASP-Kategorie |
| MB-spezifisch (Brand, Wettbewerb) | 5 | Luxury-Guardrails, Konkurrenzvergleiche |
| Multi-Turn Manipulation | 5 | Gradual Escalation, Context Poisoning |
| Tool Abuse | 5 | Unauthorized Tool Access, Data Exfiltration |
| Identity/PID Exploitation | 5 | Tier-Spoofing, Consent-Bypass |
| **GESAMT** | **30** | |

### Divergenzen

| Dokument | Zeile(n) | Aktuell | Soll |
|----------|----------|---------|------|
| IR-3 (Z.248) | Z.248 | "20+ pro Release" | "30 pro Release" |
| Manifest (Z.291, Z.359) | Z.291, Z.359 | "30 Red-Team-Szenarien" ✅ | Korrekt — keine Änderung |

### Begründung

IR-3 schrieb "20+" als untere Grenze. Das Manifest konkretisierte auf 30 basierend auf OWASP LLM Top 10 (10) + 20 domänenspezifische. 30 ist der Standard.

---

## 7. Test-Pyramide — Kanonisch: 7-Layer (IR-3)

### Standard

| Layer | Name | Anzahl | CI/CD Stage | Trigger |
|-------|------|--------|-------------|---------|
| 1 | **Unit Tests** | 500+ | `ci:unit` | Jeder Commit |
| 2 | **Integration Tests** | 200+ | `ci:integration` | Jeder Commit |
| 3 | **Eval Metrics** | Continuous | `ci:eval` | Jeder Prompt-Change |
| 4 | **Golden Tests** | 105+ | `ci:golden` | Jeder Prompt-Change |
| 5 | **Conversation Tests** | 50+ | `ci:conversation` | Merge to develop |
| 6 | **Red Team Tests** | 30 | `ci:redteam` | Pre-Release |
| 7 | **Human Evaluation** | 5-10/Monat | Manual | Monthly |

### Mapping zu Part V (5-Layer-Pyramide)

| Part V Layer | Entspricht IR-3 Layer(n) |
|-------------|-------------------------|
| Unit (45%) | Layer 1 (Unit) |
| Integration (25%) | Layer 2 (Integration) |
| E2E / Conversation (15%) | Layer 3 (Eval) + Layer 5 (Conversation) |
| Golden-Response (10%) | Layer 4 (Golden) |
| Manual QA (5%) | Layer 6 (Red Team) + Layer 7 (Human) |

### Divergenzen

| Dokument | Aktuell | Soll |
|----------|---------|------|
| Part V (Z.15-34) | 5-Schichten-Pyramide (Unit/Integration/E2E/Golden/Manual) | Beibehalten als "vereinfachte Darstellung", Verweis auf IR-3 für Details |
| IR-3 (Z.118-252) | 7-Layer-Pyramide ✅ | Source of Truth |
| Manifest (Z.275) | "5-Schichten-Pyramide" | Ändern auf "7-Layer-Pyramide (siehe IR-3)" |

---

## 8. Tool-Roadmap — Kanonisch: Phasen-Plan

### Standard

**Phase 1 — MVP (Woche 1-4): 7 Core Tools**

| # | Tool ID | Beschreibung | PID min |
|---|---------|-------------|---------|
| 1 | `vehicle_catalog` | Fahrzeugsuche und -vergleich | 0 |
| 2 | `dealer_search` | Händlersuche nach PLZ/Ort | 0 |
| 3 | `configurator.get_pricing` | Preisauskunft für Konfiguration | 0 |
| 4 | `appointment.schedule` | Termin beim Händler buchen | 40 |
| 5 | `test_drive.book` | Probefahrt buchen | 30 |
| 6 | `document.generate` | Angebot als PDF erstellen | 50 |
| 7 | `human_handoff` | Eskalation an menschlichen Berater | 0 |

**Phase 2 — Intelligence (Woche 5-8): +5 Tools = 12 gesamt**

| # | Tool ID | Beschreibung | PID min |
|---|---------|-------------|---------|
| 8 | `configurator.create_config` | Neue Konfiguration erstellen | 20 |
| 9 | `configurator.modify_option` | Option in Konfiguration ändern | 20 |
| 10 | `trade_in.estimate` | Inzahlungnahme-Bewertung | 30 |
| 11 | `recall.check` | Rückrufprüfung per VIN | 30 |
| 12 | `mercedes_me.link` | Account-Verknüpfung auslösen | 20 |

**Phase 3 — Channels (Woche 9-12): +5 Tools = 17 gesamt**

| # | Tool ID | Beschreibung | PID min |
|---|---------|-------------|---------|
| 13 | `service.get_history` | Service-Historie abrufen | 60 |
| 14 | `service.estimate_cost` | Service-Kosten schätzen | 40 |
| 15 | `finance.check_eligibility` | Finanzierungscheck | 40 |
| 16 | `identity.nudge` | Login-Conversion triggern | 0 |
| 17 | `notification.subscribe` | Preis-Alert, Liefer-Update | 20 |

**Phase 4+ — Production & Beyond: bis 36 Tools**

Verbleibende 19 Tools (order.track, vehicle.remote_control, charging.*, fleet.*, etc.) werden nach Kanal-Rollout priorisiert.

### Divergenzen

| Dokument | Zeile(n) | Aktuell | Soll |
|----------|----------|---------|------|
| Part II (Z.30, Z.661) | Z.30, Z.661-692 | "24 Agent Tools" + 12 geplante = 36 | "36 Tools gesamt, 7 in Phase 1" |
| IR-6 | Blueprint | "5 Tool-Adapter" | "7 Tools in Phase 1" (2 fehlen: human_handoff, document.generate) |
| Manifest (Z.574) | Sprintplan | Keine Tool-Roadmap | Verweis auf diese Tabelle |

---

## 9. PID Score Tiers — Kanonisch: 5 Tiers

### Standard

| Tier | Score-Range | Name | Beschreibung |
|------|-------------|------|-------------|
| 0 | 0-19 | **anonymous** | Kein Datenpunkt, nur Session |
| 1 | 20-39 | **recognized** | Email oder Mercedes-me-Verknüpfung |
| 2 | 40-59 | **soft_login** | Social Login oder Telefon |
| 3 | 60-79 | **identified** | Verifizierter Mercedes-me Account |
| 4 | 80-100 | **premium** | Connected Vehicle + Full Profile |

### PID Score Gewichtung (kanonisch)

| Signal | Gewicht | Beispiel |
|--------|---------|---------|
| `hasMercedesMe` | 20 | Mercedes me Account vorhanden |
| `hasEmail` | 8 | Email verifiziert |
| `hasPhone` | 8 | Telefonnummer verifiziert |
| `socialLinkCount` | 4 × Anzahl (max 12) | Google, Apple, Facebook |
| `vehicleCount` | 12.5 × Anzahl (max 25) | Registrierte Fahrzeuge |
| `hasConnectedVehicle` | 15 | MBUX-verknüpftes Fahrzeug |
| `sessionCount` | 0.2 × Anzahl (max 5) | Wiederkehrende Besuche |
| `recentSessionsLast7Days` | 1 × Anzahl (max 5) | Engagement-Signal |
| `consentCount` | 0.5 × Anzahl (max 2) | Erteilte Einwilligungen |

**Formel:** `PID = min(100, Σ gewichtete_signale)`

### Divergenzen

| Dokument | Aktuell | Soll |
|----------|---------|------|
| Part I (Kap. 6) | 5 Tiers ✅ | Source of Truth |
| Part II (Kap. 16, CCP-Routing) | Gleiche 5 Tiers, aber Score-Ranges leicht anders | An obige Tabelle angleichen |
| Part IV (Code-Beispiele) | Gewichtungen stimmen ✅ | Keine Änderung |
| Audit: PID Tier-Namen | "tier_names divergieren" | Enum: anonymous/recognized/soft_login/identified/premium |

---

## 10. Änderungs-Checkliste

### KRITISCH (vor Phase 1)

| # | Datei | Zeile(n) | Änderung |
|---|-------|----------|----------|
| 1 | Part II | Z.78 | `[CCP: 9 Layer]` → `[CCP: 10 Layer]` |
| 2 | Part II | Z.183 | "9-Schichten System-Prompt-Architektur" → "10-Schichten" |
| 3 | Part II | Z.321 | "Was noch fehlt: Layer 10" → "Layer 10: Identity Nudge (Phase 2)" |
| 4 | IR-6 | Z.1101-1116 | ROI-Section durch 3-Szenarien-Tabelle ersetzen |
| 5 | Manifest | Z.637-650 | ROI-Section durch 3-Szenarien-Tabelle ersetzen |
| 6 | Manifest | Z.819 | "ROI >3.000%" → "ROI 300%-3.000% (je nach Szenario)" |
| 7 | Manifest | Z.574 | "9 Prompt-Layer" → "10 Prompt-Layer" |
| 8 | IR-7 | Z.596 | P95-Schwellwert 5000ms → 1500ms; P99 → 3000ms |

### HOCH (vor Phase 1 Start)

| # | Datei | Zeile(n) | Änderung |
|---|-------|----------|----------|
| 9 | Part V | Z.615, Z.818 | "50 Golden Tests" → "Phase 1: 50 → Launch: 105 Golden Tests" |
| 10 | IR-3 | Z.248 | "20+ pro Release" → "30 pro Release" |
| 11 | Manifest | Z.275 | "5-Schichten-Pyramide" → "7-Layer-Pyramide (vgl. IR-3)" |
| 12 | Part II | Z.127-129 | Latenz-Tabelle um P50/P95/P99 Spalte erweitern |
| 13 | DR-10 | Text | "5 Consent-Typen" → "5 Basis + 6 Erweitert = 11 Consent-Typen" |

### MITTEL (parallel behebbar)

| # | Datei | Änderung |
|---|-------|----------|
| 14 | IR-7 | CCP-Layer-Nummerierung an Layer-Tabelle (Abschnitt 1) angleichen |
| 15 | Part II | Tool-Zählung: "24 produktive + 12 geplante = 36" klar labeln |
| 16 | IR-6 | Blueprint: "5 Tool-Adapter" → "7 Core Tools (Phase 1)" mit Verweis auf Tool-Roadmap |

---

## Zusammenfassung

| Dimension | Alter Zustand | Neuer Standard |
|-----------|--------------|----------------|
| CCP Layers | 9 / 10 / 9-anders | **10** |
| Consent-Typen | 5 / 10 / 11 | **11** |
| Latenz-SLA | 1200 / 2000 / 5000 | **<1500ms P95** |
| ROI | 5 verschiedene Zahlen | **3 gelabelte Szenarien (300% / 800% / 3.000%)** |
| Golden Tests | 50 / 100+ | **105 (7 Kategorien)** |
| Red Team | 20 / 30 | **30** |
| Test-Pyramide | 5 Layer / 7 Layer | **7 Layer (IR-3)** |
| Tools | 24 / 36 / 5 | **7→12→17→36 (Phasen-Plan)** |
| PID Tiers | 5 (konsistent) | **5** (Formel formalisiert) |

**16 Änderungen identifiziert:** 8 KRITISCH, 5 HOCH, 3 MITTEL.

Dieses Dokument wird als `appendix-numbers-harmonization.md` in der Implementation-Doktorarbeit geführt und ist die kanonische Referenz bei Zahlenwidersprüchen.
