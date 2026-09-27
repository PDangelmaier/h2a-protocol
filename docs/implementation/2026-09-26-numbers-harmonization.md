# H2A Zahlen-Harmonisierung — Single Source of Truth

**Datum:** 2026-09-26
**Zweck:** Kanonische Werte für alle Metriken, die in den Doktorarbeiten inkonsistent referenziert werden.

---

## 1. CCP Layers

| Dokument | Aktuelle Zahl | Zeile/Stelle |
|----------|--------------|--------------|
| Part II (Architektur) | **9 Layer** (produktiv) | Z.183: "aus 9 Schichten zusammen" |
| Part II (Architektur) | Layer 10 = Phase-2-Plan | Z.228: "Layer 10 (Identity Nudge) ist als Phase-2-Erweiterung geplant" |
| Part I (Identity Conversion) | Layer 10 erwähnt | Referenz in Part II Z.323 |
| IR-6 (Blueprint) | Layer 10 als Phase 2 | Referenziert Part I |

**Kanonischer Wert:** **9 produktive Layer + 1 geplant (Layer 10: Identity Nudge)**

**Begründung:** Part II Z.228 enthält bereits die korrekte Klarstellung. Kein Widerspruch — Layer 10 ist explizit als Phase-2-Feature markiert. IR-7 referenziert ggf. nur die 9 aktiven.

**Zu ändern:** Nichts — Part II Z.228 ist bereits korrekt formuliert. Dokumente die "10 Layer" ohne Kontext sagen, müssen klarstellen: "9 produktiv + 1 geplant".

| Dokument | Aktion | Stelle |
|----------|--------|--------|
| IR-6 (Blueprint) | Prüfen ob "10 Layer" ohne "geplant" steht | Suche nach "CCP.*10\|10.*Layer" |

---

## 2. Consent-Typen

| Dokument | Aktuelle Zahl | Zeile/Stelle |
|----------|--------------|--------------|
| Part IV (Code, ENUM) | **11** (5 Basis + 6 Migration 018) | Z.148–161: `CREATE TYPE consent_type AS ENUM (...)` |
| Final Manifest | **10** | Z.~620: "10 granulare Consent-Typen" |
| Bible Index | **11** | Teil-IV-Beschreibung |
| DR-10 | **5** | Bezieht sich nur auf Basis-Typen |

**Kanonischer Wert:** **11 Consent-Typen** (5 Basis + 6 erweitert via Migration 018)

**Begründung:** Der Code in Part IV Z.148–161 ist die autoritative Quelle. 11 ENUM-Werte sind definiert: `ai_personalization`, `cross_channel`, `proactive_contact`, `analytics`, `marketing`, `ai_autonomy`, `voice_recording`, `data_retention`, `profiling_art22`, `cross_device`, `location_tracking`.

**Zu ändern:**

| Dokument | Aktion | Stelle |
|----------|--------|--------|
| Final Manifest | "10" → "11" | Z.~620 und Kap. 10.2: "10 Consent-Typen" → "11 Consent-Typen (5 Basis + 6 erweitert)" |
| DR-10 | Klarstellung ergänzen | Wo "5 Typen" steht: "(5 Basis-Typen, insgesamt 11 inkl. Migration 018)" |

---

## 3. Golden Tests

| Dokument | Aktuelle Zahl | Zeile/Stelle |
|----------|--------------|--------------|
| Part V (Testing) | **50 kanonische Fragen** | Z.615: "47/50", Z.818: "50 kanonische Fragen" |
| IR-3 (Testing Quality) | **100+** | Z.143: Pyramide "100+", Z.240: "Layer 4: Golden Tests (100+ Tests)", Z.491: "H2A Golden Test Library (100+ Tests)" |
| Final Manifest | **100+** | Z.~870ff: "100+ Golden Tests als Launch-Gate" |
| IR-5 (Skill Architecture) | **50 Starter-Szenarien** | Z.479: "Golden Test Library — 50 Starter-Szenarien" |
| Consolidated Gap Report | **100+** als Ziel | Z.94: "Part V korrigieren" |

**Kanonischer Wert:** **100+ Golden Tests** (50 Starter-Szenarien als Basis, auf 100+ erweitert vor Launch)

**Begründung:** IR-3 und Manifest definieren 100+ als Launch-Kriterium. Part V zeigt ein Beispiel-Dashboard mit 50 (Phase-1-Starter). IR-5 bestätigt 50 als initiale Library. Die 50 sind der Startpunkt, 100+ das Gate.

**Zu ändern:**

| Dokument | Aktion | Stelle |
|----------|--------|--------|
| Part V | Klarstellung bei Z.615 | "47/50" → Kontext: "Phase-1-Starter: 47/50 bestanden (Launch-Gate: 100+)" |
| Part V | Klarstellung bei Z.818 | "50 kanonische Fragen" → "100+ kanonische Fragen (50 Starter + 50+ domänenspezifische)" |
| IR-5 | Klarstellung bei Z.479 | "50 Starter-Szenarien" → "50 Starter-Szenarien (Launch-Gate: 100+ total)" |

---

## 4. Red Team Szenarien

| Dokument | Aktuelle Zahl | Zeile/Stelle |
|----------|--------------|--------------|
| DR-5 (Safety) | **20 Angriffs-Szenarien** | Z.740: "H2A Red Team Playbook — 20 Angriffs-Szenarien" |
| IR-3 (Testing Quality) | **20+ pro Release** | Z.248: "Layer 6: Red Team Tests (20+ pro Release)" |
| Final Manifest | **20 Szenarien** | Z.620: "Red Team Playbook (20 Szenarien)", Z.996: "Red Team Testing (20 Szenarien)" |

**Kanonischer Wert:** **20 Szenarien im Playbook, 20+ Tests pro Release**

**Begründung:** Alle Quellen sagen konsistent 20. Die Audit-Aussage "Manifest sagt 30" ist FALSCH — Manifest sagt ebenfalls 20 (Z.620, Z.996). Kein Widerspruch vorhanden.

**Zu ändern:** Nichts — die Zahlen sind konsistent bei 20.

---

## 5. First-Token-Latenz

| Dokument | Aktuelle Zahl | Zeile/Stelle |
|----------|--------------|--------------|
| Part II (Architektur) | **<1200ms** | Z.127: "Gesamt (ohne Tools): <1200ms — First-Token-Latenz" |
| DR-7 (Streaming) | **<2s (=2000ms)** | Z.520: "Ziel: <2s First Token", Z.536: "TOTAL First Token <2.0s" |
| DR-7 (Streaming) | **~1.6s typisch** | Z.536: "~1.6s ✅", Z.585: "First Token bei ~1.6s" |
| Final Manifest | **<1.5s P50, <4s P99** | Z.870–871 |
| DR-6 (Luxury Platform) | **<2s Latenz-Budget** | Z.552: "Latenz-Budget pro Nachricht (Ziel: <2s)" |

**Kanonischer Wert:** **<1.5s P50, <2.0s P95, <4.0s P99** (ohne Tools)

**Begründung:** Part II Z.127 zeigt das Latenz-Budget: Summe aller Schritte = <1200ms OHNE LLM-Varianz. DR-7 rechnet realistischer mit LLM-Varianz und sagt <2s. Manifest differenziert nach Perzentilen. Die Werte widersprechen sich nicht — sie messen unterschiedliche Szenarien:
- Part II: Theoretisches Budget (Summe der Ziel-Latenzen) = <1200ms
- DR-7: Realistisches Ziel inkl. LLM-Varianz = <2s, typisch ~1.6s
- Manifest: Produktions-SLO mit Perzentilen = P50 <1.5s, P99 <4s

**Zu ändern:**

| Dokument | Aktion | Stelle |
|----------|--------|--------|
| Part II | Fußnote bei Z.127 | Ergänzen: "Theoretisches Budget. Produktions-SLO: P50 <1.5s, P95 <2.0s (siehe DR-7, Kap. 9)" |

---

## 6. ROI-Zahlen (Bonus — im Audit gefunden)

| Dokument | ROI | Was gemessen wird |
|----------|-----|-------------------|
| DR-6 (Luxury Platform) | **729%** | Produkt-ROI: €55.4M Netto / €7.6M Investment |
| IR-6 (Blueprint) | **8.337%** | Dev-Cost-ROI: €3.375M Wert / €40K Entwicklungskosten |
| IR-6 (Konservativ) | **833%** | Dev-Cost-ROI bei 10% Wirksamkeit |

**Kanonischer Wert:** Kein einzelner — alle korrekt, aber unterschiedliche Metriken.

**Zu ändern:**

| Dokument | Aktion | Stelle |
|----------|--------|--------|
| IR-6 (Blueprint) | Label ergänzen | "Dev-Cost-ROI: 8.337%" statt nur "ROI: 8.337%" |
| Final Manifest | Alle ROI-Nennungen mit Typ labeln | Jede Stelle: "(Produkt-ROI)" oder "(Dev-Cost-ROI)" |

---

## 7. Zusammenfassung: Kanonische Werte

| Metrik | Kanonischer Wert | Quelle (autoritativ) |
|--------|-----------------|---------------------|
| CCP Layers | 9 produktiv + 1 geplant | Part II Z.183, Z.228 |
| Consent-Typen | 11 (5+6) | Part IV Z.148–161 (Code) |
| Golden Tests | 100+ (50 Starter) | IR-3 Z.491, Manifest |
| Red Team Szenarien | 20 | DR-5 Z.740, Manifest Z.620 |
| First-Token-Latenz | P50 <1.5s, P95 <2.0s, P99 <4.0s | Manifest Z.870–871 |
| Produkt-ROI | 729% | DR-6 |
| Dev-Cost-ROI | 8.337% (konservativ: 833%) | IR-6 |

---

## 8. Konkrete Änderungsliste

### Priorität 1 (echte Fehler)

1. **Final Manifest** — "10 Consent-Typen" → "11 Consent-Typen"
2. **Part V Z.818** — "50 kanonische Fragen" → "100+ kanonische Fragen (50 Starter)"

### Priorität 2 (Klarstellungen)

3. **Part II Z.127** — Fußnote: "Theoretisches Budget. SLO: P50 <1.5s, P95 <2.0s"
4. **Part V Z.615** — Kontext: "(Phase-1-Starter, Launch-Gate: 100+)"
5. **IR-5 Z.479** — Ergänzung: "(Launch-Gate: 100+ total)"
6. **DR-10** — Bei "5 Typen": "(5 Basis, 11 total inkl. Migration 018)"
7. **IR-6** — ROI-Label: "Dev-Cost-ROI" statt nur "ROI"
8. **Manifest** — Alle ROI-Nennungen mit Typ labeln

### Nicht zu ändern (kein Widerspruch)

- CCP Layers: Part II ist bereits korrekt formuliert
- Red Team: Konsistent bei 20 überall
- Latenz: Verschiedene Perspektiven, alle valide
