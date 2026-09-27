# Audit: Security & DSGVO -- Lueckenanalyse

## Rollen: Security Engineer + Privacy Officer/DSGVO
## Datum: 2026-09-26
## Dokumente geprueft:
- Part IV: Datenmodell, Sicherheit, DSGVO & Enterprise-Integration (Product Bible Kap. 28-30)
- Deep Research: Safety, Alignment, Guardrails & Enterprise Compliance
- Deep Research: Privacy-Preserving AI & DSGVO-native Design
- Deep Research: DevOps & MLOps (Security-Abschnitte)
- Deep Research: Testing & Quality Engineering (Security-Testing-Abschnitte)

## Status: 27 Gaps identifiziert (6 Kritisch, 9 Hoch, 8 Mittel, 4 Niedrig)

---

## A. Kritische Gaps (MUSS vor Go-Live)

### GAP-K1: Kein Input-Sanitizer fuer Prompt Injection
- **Quelle:** Safety-Research Kap. 2.1-2.2, OWASP LLM01
- **Product-Doktorarbeit:** Beschreibt das Risiko ausfuehrlich (Direct + Indirect Injection), empfiehlt Lakera/Bedrock Input Guard, listet 20 Red-Team-Szenarien
- **Implementation-Doktorarbeit:** Kein Abschnitt zu Input-Sanitization in der CI/CD-Pipeline. DevOps-Dokument erwaehnt nur `grep` nach Secrets in Prompt-Dateien, nicht Laufzeit-Input-Filterung
- **Risiko:** OWASP LLM01. System-Prompt-Extraktion, Identitaetsmissbrauch, falsche Produktversprechen
- **Behebung:** Bedrock Guardrails oder Lakera Guard als Input-Rail VOR dem LLM-Call. Muss in der CI/CD-Pipeline (DevOps-Dokument Kap. 7.1) UND im Laufzeit-Flow integriert werden

### GAP-K2: Kein Output-Sanitizer / PII-Filter auf Agent-Antworten
- **Quelle:** Safety-Research Kap. 3.4, Privacy-Research Kap. 7, OWASP LLM02 + LLM06
- **Product-Doktorarbeit:** Listet PII-Filter als Pre-Launch-MUSS (3 Tage Aufwand), empfiehlt Microsoft Presidio, definiert Custom Regex fuer VIN/Kundennummer/FIN
- **Implementation-Doktorarbeit:** DevOps-Dokument Kap. 7.2 hat eine `sanitizeForLogging()` Funktion fuer LOGS -- aber keinen Output-Filter fuer AGENT-ANTWORTEN an den Endnutzer
- **Risiko:** PII-Leak in Echtzeit-Antworten. Agent koennte versehentlich VIN, E-Mail, Telefonnummer anderer Kunden ausgeben
- **Behebung:** Zwei separate Filter: (1) Output-PII-Filter auf Agent-Antworten BEVOR sie an den Client gestreamt werden, (2) Log-PII-Redaction (bereits skizziert). Presidio + Custom Patterns implementieren

### GAP-K3: Kein HITL (Human-in-the-Loop) fuer kritische Tool-Aktionen
- **Quelle:** Safety-Research Kap. 1.3, 4.4, OWASP LLM08
- **Product-Doktorarbeit:** Definiert `vehicle.remote_control` als "Kritisch" (physische Sicherheit), fordert "PID >= 80 + Consent + Safety Check + HITL mit PIN/Biometrie"
- **Implementation-Doktorarbeit:** Testing-Dokument hat Tests fuer Tool-Aufrufe (TU-001 bis TU-003), aber keinen Test fuer HITL-Bestaetigung. DevOps-Dokument erwaehnt kein Approval-Gate fuer kritische Tools
- **Risiko:** Fahrzeug-Fernsteuerung ohne menschliche Bestaetigung = Sicherheitsrisiko + ISO 21434 Verstoss
- **Behebung:** Explizites HITL-Gate fuer `vehicle.send_command`, `subscription.manage`, `store.checkout`. PIN/Biometrie-Dialog im Widget. Tests in Golden-Test-Suite aufnehmen

### GAP-K4: Consent-Check in reasoning.ts ist hardcoded
- **Quelle:** Part IV Kap. 29.3 ("Bekannter Gap")
- **Product-Doktorarbeit:** Dokumentiert den Gap explizit: "In der aktuellen reasoning.ts ist der Consent-Check teilweise hardcoded auf ['ai_personalization']. Fuer Production muss dies durch die dynamische Pruefung aus agent_tools.requires_consent ersetzt werden."
- **Implementation-Doktorarbeit:** Gap wird NICHT erwaehnt. Kein Ticket, keine Implementierungsplanung, kein Test dafuer
- **Risiko:** Tools werden ohne korrekten Consent ausgefuehrt. DSGVO Art. 6/7 Verstoss. Consent-Violation-Alert (DevOps Kap. 4.4) wuerde nicht greifen, weil die Pruefung selbst fehlerhaft ist
- **Behebung:** Dynamische Consent-Pruefung gegen `agent_tools.requires_consent` implementieren. Unit-Test und Golden-Test dafuer. Als Blocker fuer Go-Live markieren

### GAP-K5: Keine Datenschutz-Folgenabschaetzung (DSFA)
- **Quelle:** Privacy-Research Kap. 6.2, DSGVO Art. 35
- **Product-Doktorarbeit:** Safety-Research listet DSFA als Phase-2-Massnahme (15 Tage). Privacy-Research beschreibt den Inhalt einer DSFA detailliert (Beschreibung, Zweck, Rechtsgrundlage, Notwendigkeitspruefung, Risikobewertung, Schutzmassnahmen)
- **Implementation-Doktorarbeit:** Nicht erwaehnt
- **Risiko:** DSGVO Art. 35 PFLICHT bei Profiling (ISP-Scoring ist Profiling). Fehlen = Bussgeld bis 10 Mio. EUR / 2% Jahresumsatz
- **Behebung:** DSFA muss VOR Go-Live erstellt werden, nicht Phase 2. Ist eine rechtliche Pflicht, keine optionale Massnahme. Einbeziehung des MB-Datenschutzbeauftragten notwendig

### GAP-K6: Kein Eskalationspfad "Mit Mensch sprechen"
- **Quelle:** Safety-Research Kap. 4.4, 6.4; EU AI Act Art. 50
- **Product-Doktorarbeit:** Definiert ausfuehrlich wann Eskalation stattfinden muss (Beschwerde >= 3/5, Sicherheitsrelevant, 3x Nachfrage, Finanztransaktion > 1000 EUR, Notfall). Fordert: "Ich moechte mit einem Menschen sprechen" = SOFORT verbinden, KEINE Gegenfragen
- **Implementation-Doktorarbeit:** DevOps-Dokument Kap. 7.4 listet "Opt-Out: Mit einem Menschen sprechen Button" als "Geplant". Testing-Dokument hat Conversation-Test CONV-002 der Eskalation prueft -- aber der Test kann nicht bestehen wenn der Eskalationspfad nicht implementiert ist
- **Risiko:** EU AI Act Transparenzpflicht, Kundenverlust bei Premium-Marke, Air-Canada-Praezedenzfall
- **Behebung:** Eskalations-Endpoint implementieren. In JEDEM Kanal (Web Widget, WhatsApp, App, MBUX) muss ein Weg zum menschlichen Agenten existieren. Pre-Launch Pflicht

---

## B. Hohe Gaps (SOLLTE in Phase 1-2)

### GAP-H1: Tool-Output-Sanitizer fehlt (Indirect Injection)
- **Quelle:** Safety-Research Kap. 2.2 (Greshake et al. 2023), OWASP LLM07
- **Product-Doktorarbeit:** Beschreibt Indirect Injection ausfuehrlich (z.B. vergiftete Ladestation-API). Listet 5 Gegenmassnahmen (Input Sanitization, Delimiter-Strategie, Privilegien-Trennung, Content-Type-Validierung, Anomalie-Erkennung)
- **Implementation-Doktorarbeit:** Nicht adressiert. DevOps-Dokument behandelt nur Prompt-Dateien, nicht Tool-Outputs zur Laufzeit
- **Risiko:** 24 Tools mit externen Datenquellen. Besonders `charging.find_station` und `dealer_finder` (externe Betreiber pflegen eigene Daten)
- **Behebung:** Tool-Outputs in XML-Tags einkapseln, Laengenlimits, Regex-Pruefung auf Instruktionsmuster

### GAP-H2: Kein Privacy Dashboard / Datenauskunft (Art. 15, 20 DSGVO)
- **Quelle:** Privacy-Research Kap. 1.3
- **Product-Doktorarbeit:** Part IV Kap. 29.1 listet Art. 15 (Auskunftsrecht) mit "Export-Endpoint: alle Daten eines Profils als JSON" und Art. 20 (Datenportabilitaet) mit "JSON-Export in maschinenlesbarem Format"
- **Implementation-Doktorarbeit:** Nicht adressiert. Kein Endpoint, kein UI, kein Test dafuer
- **Risiko:** DSGVO-Verstoss. Anfragen der Datenschutzbehoerde koennen nicht automatisiert beantwortet werden. Max. Schrems / noyb-Klagen zeigen dass durchgesetzt wird
- **Behebung:** Privacy Dashboard (Phase 1, 10 Tage lt. Privacy-Research). Datenexport-API (5 Tage). Self-Service Loesch-Flow

### GAP-H3: Log-Verschluesselung fehlt
- **Quelle:** Privacy-Research Kap. 1.1 (Prinzip 5: End-to-End Security)
- **Product-Doktorarbeit:** Part IV Kap. 29.4 listet "Sensitive Felder die zusaetzlich verschluesselt werden sollten (Phase 3)": email, phone, mercedes_me_id, external_id, ip_address. Privacy-Research bewertet "Logs nicht verschluesselt" als fehlend
- **Implementation-Doktorarbeit:** DevOps-Dokument Kap. 7.2 hat PII-Redaction fuer Logs (sanitizeForLogging), aber keine Verschluesselung der gespeicherten Conversation-Logs
- **Risiko:** Conversation Logs enthalten PII (Name, E-Mail, Adresse, VIN). Ohne Verschluesselung at-rest: Daten bei DB-Breach im Klartext
- **Behebung:** (1) PII-Felder in customer_profiles mit pgcrypto verschluesseln (Phase 1). (2) Conversation-Logs mit separatem Encryption Key verschluesseln. (3) Log-Retention-Policy automatisieren

### GAP-H4: Finanzierungs-Disclaimer fehlt
- **Quelle:** Safety-Research Kap. 4.2, 4.4; DSGVO Art. 22
- **Product-Doktorarbeit:** Safety-Research listet als Pre-Launch Punkt 7: "Unverbindlich, nur vom Haendler" bei finance.check_eligibility (1 Tag Aufwand). Warnt vor Air-Canada-Praezedenzfall
- **Implementation-Doktorarbeit:** Nicht adressiert. Weder im Guardrail-Layer noch in Test-Suite
- **Risiko:** Rechtliche Bindungswirkung von Agent-Aussagen (Air Canada vs. Moffatt). MB-Markenwert $56,1 Mrd
- **Behebung:** CCP-Guardrail-Layer um Finanzierungs-Disclaimer erweitern. Golden-Test PR-001/PR-002 aus Testing-Dokument aufnehmen

### GAP-H5: Audit-Log (Migration 020) nicht in Implementation eingeplant
- **Quelle:** Part IV Kap. 29.9, DSGVO Art. 30
- **Product-Doktorarbeit:** Definiert `audit_log` Tabelle detailliert (actor_type, action, resource_type, before_state, after_state). "Geplant fuer Migration 020"
- **Implementation-Doktorarbeit:** DevOps-Dokument hat Langfuse-Tracing und analytics_events -- aber kein dediziertes PII-Zugriffs-Audit-Log. Das sind verschiedene Dinge: Langfuse tracet LLM-Calls, Audit-Log tracet DATEN-Zugriffe
- **Risiko:** DSGVO Art. 30 (Verzeichnis von Verarbeitungstaetigkeiten). Beweissicherung bei Datenschutzverletzung (Art. 33/34)
- **Behebung:** Migration 020 priorisieren. Audit-Log muss VOR Go-Live existieren, nicht "geplant"

### GAP-H6: EU AI Act Hochrisiko-Teilfunktionen nicht separat behandelt
- **Quelle:** Safety-Research Kap. 4.2
- **Product-Doktorarbeit:** Identifiziert Finanzierungsberechnung als "Moeglicherweise Hochrisiko" (Art. 6(2) + Anhang III Nr. 5(b)) und Fahrzeug-Fernsteuerung als "Sicherheitsrelevant"
- **Implementation-Doktorarbeit:** DevOps-Dokument Kap. 7.4 behandelt ALLES als "Limited Risk". Keine differenzierte Betrachtung
- **Risiko:** Hochrisiko-AI-Systeme haben strengere Anforderungen (Risikomanagement, Datenqualitaet, technische Dokumentation, Human Oversight, Logging). Falsche Einstufung = Compliance-Verstoss
- **Behebung:** Separate Risikobewertung fuer finance.check_eligibility und vehicle.send_command. Ggf. separate Compliance-Massnahmen

### GAP-H7: Guardrail-Layer hat nur 4 Regeln statt empfohlene 14
- **Quelle:** Safety-Research Kap. 3.4, 9.4
- **Product-Doktorarbeit:** Listet aktuell 4 Regeln in buildGuardrailLayer(). Identifiziert 10 fehlende Regeln mit Priorisierung. Liefert konkreten Code-Vorschlag fuer erweiterten Layer
- **Implementation-Doktorarbeit:** Testing-Dokument hat Guardrail-Tests (GR-001 bis GR-004) die die erweiterten Regeln VORAUSSETZEN -- aber die Implementierung der erweiterten Regeln ist nicht geplant
- **Risiko:** Fehlende Regeln betreffen: Autonomes Fahren (KRITISCH/rechtlich), medizinische Ratschlaege, System-Prompt-Offenlegung, Identitaetsbestaetigung
- **Behebung:** 14-Regel-Layer implementieren (Safety-Research Kap. 9.4 hat den Code). 2 Tage Aufwand laut Schaetzung

### GAP-H8: TARA fuer Fahrzeugsteuerung fehlt
- **Quelle:** Safety-Research Kap. 4.5 (ISO/SAE 21434)
- **Product-Doktorarbeit:** Listet als Phase-2-Massnahme (10 Tage). UNECE WP.29 R155/R156 erfordert CSMS
- **Implementation-Doktorarbeit:** Nicht erwaehnt
- **Risiko:** Fahrzeugsteuerung ueber H2A ohne TARA = Automotive-Compliance-Verstoss
- **Behebung:** TARA durchfuehren bevor vehicle.send_command live geht. Kann ggf. als separater Meilenstein NACH Go-Live behandelt werden, wenn vehicle.send_command erst spaeter aktiviert wird

### GAP-H9: Consent-Typen unvollstaendig
- **Quelle:** Privacy-Research Kap. 9.1
- **Product-Doktorarbeit:** Part IV definiert 11 consent_types im Schema (inkl. profiling_art22, location_tracking, etc.). Privacy-Research identifiziert 5 fehlende Typen (profiling_art22 fehlt in der Code-Ebene, location_tracking, cross_device, third_party_sharing, memory_storage)
- **Implementation-Doktorarbeit:** Keine Erwaehnung der Consent-Architektur
- **Risiko:** Unvollstaendige Consent-Abfrage = DSGVO-Verstoss. Besonders Art. 22 (Profiling) ist kritisch weil ISP-Scoring definitiv Profiling ist
- **Behebung:** Consent-Typen auf Vollstaendigkeit pruefen. profiling_art22 Consent muss fuer finance.check_eligibility enforced werden

---

## C. Mittlere Gaps (Phase 3+)

### GAP-M1: Kein Self-Critique-Pass fuer sicherheitskritische Antworten
- **Quelle:** Safety-Research Kap. 1.1 (Constitutional AI)
- **Beschreibung:** Optionaler zweiter LLM-Call zur Bewertung der eigenen Antwort bei Fahrzeugsteuerung, Finanzen, PII. Phase 2 empfohlen (10 Tage)

### GAP-M2: Bias-Testing-Suite fehlt
- **Quelle:** Safety-Research Kap. 5.2
- **Beschreibung:** 4 Testtypen (Namens-Swap, Preis-Neutralitaet, Sprach-Varianten, Gender-Neutralitaet) sind definiert aber nicht implementiert. Testing-Dokument erwaehnt BiasMetric von DeepEval, aber keine konkreten H2A-spezifischen Tests

### GAP-M3: Bedrock Guardrails nicht konfiguriert
- **Quelle:** Safety-Research Kap. 3.2
- **Beschreibung:** Product-Doktorarbeit liefert komplette Konfiguration (Content Filter, Denied Topics, PII Detection, Word Filters). Implementation nutzt nur Nexus-Durchleitung ohne Guardrails-Konfiguration

### GAP-M4: Drift Detection nicht implementiert
- **Quelle:** Safety-Research Kap. 6.3, Testing-Dokument Kap. 3.6
- **Beschreibung:** Woechentliche Checks definiert (Antwortlaenge, Tool-Nutzung, Eskalationsrate). Phoenix/Arize empfohlen. Nicht in Implementation eingeplant

### GAP-M5: Retention-Policy nicht automatisiert
- **Quelle:** Privacy-Research Kap. 8.1
- **Beschreibung:** TTL-basierte Retention definiert (Conversations 90 Tage, Sessions 30 Tage, Analytics 12 Monate) aber keine automatisierte Umsetzung (Cronjob, Supabase Function)

### GAP-M6: EUDI Wallet Integration nicht vorbereitet
- **Quelle:** Privacy-Research Kap. 5.2
- **Beschreibung:** eIDAS 2.0 (2024/1183) erfordert ab 2026-2027 Akzeptanz durch grosse Plattformen. H2A sollte Wallet-Login vorbereiten. Nicht in Roadmap

### GAP-M7: Incident Response Plan fuer AI-Vorfaelle fehlt
- **Quelle:** Safety-Research Kap. 9.1 (#10)
- **Beschreibung:** DevOps-Dokument hat ein On-Call-Runbook (Kap. 10.5) -- aber dieses deckt nur technische Incidents ab. Kein Prozess fuer: DSGVO-Datenschutzverletzung (72h Meldefrist, Art. 33), AI-Safety-Incident (z.B. Agent macht falsche Zusage), PR-Krise durch Agent-Fehlverhalten

### GAP-M8: Verschluesselung sensitiver PII-Felder (Phase 3)
- **Quelle:** Part IV Kap. 29.4
- **Beschreibung:** email, phone, mercedes_me_id, external_id, ip_address sollen mit pgcrypto verschluesselt werden. In Product-Doktorarbeit als "Phase 3" eingeplant, in Implementation nicht erwaehnt

---

## D. Niedrige Gaps

### GAP-N1: Model Pinning nur in DevOps, nicht in Security-Kontext
- **Quelle:** Safety-Research Kap. 9.1 (#10), DevOps Kap. 3.1
- **Beschreibung:** DevOps-Dokument erwaehnt Modell-Versionen, aber kein explizites Security-Gate: "Kein Claude-Update in Production ohne vorherigen Red-Team-Test gegen die neue Version"

### GAP-N2: Differential Privacy fuer Analytics nicht eingeplant
- **Quelle:** Privacy-Research Kap. 2, 10
- **Beschreibung:** DP mit epsilon=2 empfohlen fuer Tool-Usage- und Session-Analytics. Nicht in Implementation

### GAP-N3: k-Anonymity fuer Conversation Logs
- **Quelle:** Privacy-Research Kap. 10.1
- **Beschreibung:** k=5 Anonymisierung fuer Conversation Logs, damit sie intern sicher geteilt werden koennen

### GAP-N4: Unicode-Normalisierung auf Input
- **Quelle:** Safety-Research Kap. 7.2 (Red Team Szenario #19)
- **Beschreibung:** Unicode-Tricks (unsichtbare Zeichen, RTL-Override) koennen fuer Angriffe genutzt werden. Kein Unicode-Normalisierungs-Schritt in der Pipeline

---

## E. Harmonisierungsbewertung: Product-Doktorarbeit <-> Implementation-Doktorarbeit

### Was gut harmonisiert ist

| Bereich | Product | Implementation | Bewertung |
|---------|---------|----------------|-----------|
| Langfuse Tracing | Safety Kap. 6.1 empfiehlt | DevOps Kap. 4.2 implementiert | HARMONISIERT |
| Golden Tests | Safety Kap. 9.1 empfiehlt | Testing Kap. 4 definiert 100+ Tests | HARMONISIERT |
| Red Teaming | Safety Kap. 7 definiert 20 Szenarien | Testing Kap. 6.4 hat Promptfoo-Config | HARMONISIERT |
| Hallucination Detection | Safety Kap. 6.2 empfiehlt | Testing Kap. 6 implementiert | HARMONISIERT |
| Rate Limiting | Part IV Kap. 29.7 beschreibt | DevOps Kap. 7.3 implementiert | HARMONISIERT |
| Cost Management | Safety erwaehnt Kosten | DevOps Kap. 6 detailliert | HARMONISIERT |
| CI/CD Pipeline | Safety fordert Quality Gates | DevOps Kap. 1.4 + Testing Kap. 9.1 | HARMONISIERT |

### Was NICHT harmonisiert ist (kritische Luecken)

| Bereich | Product fordert | Implementation hat | Luecke |
|---------|----------------|-------------------|--------|
| Input Sanitizer | Pre-Launch MUSS (3 Tage) | Nicht vorhanden | KRITISCH |
| Output PII-Filter | Pre-Launch MUSS (3 Tage) | Nur fuer Logs, nicht fuer Antworten | KRITISCH |
| HITL fuer vehicle_control | Pre-Launch MUSS (3 Tage) | Nicht vorhanden | KRITISCH |
| Hardcoded Consent-Check | "Bekannter Gap" dokumentiert | Nicht adressiert | KRITISCH |
| DSFA | Art. 35 Pflicht | Nicht erwaehnt | KRITISCH |
| Eskalationspfad | Pre-Launch MUSS (5 Tage) | "Geplant" | KRITISCH |
| 14-Regel-Guardrail | Konkreter Code geliefert | Nicht aufgenommen | HOCH |
| Audit-Log | Migration 020 definiert | Nicht priorisiert | HOCH |
| Privacy Dashboard | Phase 1 (10 Tage) | Nicht vorhanden | HOCH |
| Finanzierungs-Disclaimer | Pre-Launch (1 Tag) | Nicht vorhanden | HOCH |
| Tool-Output-Sanitizer | Pre-Launch MUSS (2 Tage) | Nicht vorhanden | HOCH |
| Consent-Typ-Erweiterung | 5 fehlende Typen | Nicht adressiert | HOCH |

### Neue Gaps die NUR in der Implementation-Doktorarbeit sichtbar werden

| Gap | Beschreibung | Quelle |
|-----|-------------|--------|
| Security als Nachgedanke | DevOps Kap. 7 ("Security in der AI-Pipeline") ist nur 2 von 10 Kapiteln. Security ist nicht in JEDER Phase integriert | DevOps-Dokument |
| Kein Security-Gate in CI/CD | Die 7-Gate-Pipeline (DevOps Kap. 1.4) hat keinen dedizierten Security-Gate. Red Team ist erst im Release Gate | DevOps + Testing |
| PII in Langfuse Traces | Langfuse Integration (DevOps Kap. 4.2) loggt volle Konversationen. Wenn PII drin ist, sind die Traces auch betroffen | DevOps-Dokument |
| Doppler-Secrets nicht rotiert | Secrets Management beschrieben, aber keine Rotations-Policy | DevOps-Dokument |
| Canary ohne Security-Metriken | Canary-Rollback-Kriterien (DevOps Kap. 1.5) enthalten hallucination_rate und error_rate, aber NICHT consent_violation_rate oder pii_leak_rate | DevOps-Dokument |

---

## F. EU AI Act Bewertung

### "Limited Risk" Einstufung -- Teilweise korrekt

Die Einstufung als "Limited Risk" (Art. 50) ist fuer den Grossteil von H2A korrekt. ABER:

1. **finance.check_eligibility** koennte unter Art. 6(2) + Anhang III Nr. 5(b) als Hochrisiko eingestuft werden ("AI-Systeme die zur Bewertung der Kreditwuerdigkeit verwendet werden"). Empfehlung: Rechtliche Pruefung ob die H2A-Funktion eine "Bewertung" im Sinne des Gesetzes darstellt
2. **vehicle.send_command** ist sicherheitsrelevant (Tueren, Klima, Motor). Nicht direkt in Anhang III gelistet, aber ueber Produktsicherheitsrecht und UNECE WP.29 reguliert
3. **Profiling via ISP-Score** faellt unter DSGVO Art. 22, nicht primaer EU AI Act -- aber die Wechselwirkung ist zu beachten

### Fehlende Transparenzpflichten

| Pflicht | Status | Massnahme |
|---------|--------|-----------|
| "Powered by AI" Label im Widget | Geplant (Safety Kap. 4.3) | Implementieren |
| AI-Content-Kennzeichnung (Metadata) | Geplant (aiGenerated: true) | Implementieren |
| Erklaerbarkeit auf Anfrage | Nicht vorhanden | CCP Layer 10 (Transparency) einfuegen |
| Opt-Out zum Menschen | Geplant | Siehe GAP-K6 |

---

## G. Consent-System Bewertung

### Bekannter Gap: Hardcoded Consent-Check

- **Status:** In Product-Doktorarbeit als "Bekannter Gap" dokumentiert (Part IV Kap. 29.3)
- **Plan zur Behebung:** KEINER in der Implementation-Doktorarbeit. Das ist die groesste Luecke
- **Empfehlung:** Sofort als Blocker-Ticket erstellen. Ohne dynamischen Consent-Check ist das gesamte Consent-System wirkungslos

### Consent-Architektur: Schema vs. Code

- **Schema (Migration 018):** 11 Consent-Typen definiert, granular, mit Legal Basis und Autonomie-Stufen -- SEHR GUT
- **Laufzeit-Code (reasoning.ts):** Hardcoded auf ['ai_personalization'] -- SCHLECHT
- **Differenz:** Das Schema ist Production-ready, der Code ist es nicht. Die Implementation-Doktorarbeit muesste diesen Gap explizit als Sprint-0-Item listen

---

## H. Verschluesselung: Phase-3-Plan Bewertung

### Product-Doktorarbeit (Part IV Kap. 29.4):
- TLS 1.3 in Transit: vorhanden
- AES-256 at Rest (Supabase Default): vorhanden
- pgcrypto fuer sensitive Felder: Phase 3 geplant
- PII-Hashing (SHA-256): fuer Consent-Text und IPs vorhanden

### Implementation-Doktorarbeit:
- Phase-3-Verschluesselung wird NICHT erwaehnt
- Kein Zeitplan, kein Ticket, kein Aufwand geschaetzt
- Privacy-Research schaetzt 5 Tage fuer "Encrypted Agent Memories" (Phase 2)

### Empfehlung:
- Phase-3-Verschluesselung muss in die Implementation-Roadmap aufgenommen werden
- Mindestens: pgcrypto fuer email, phone, mercedes_me_id in Phase 1-2 (nicht Phase 3)
- Agent Memories mit separatem Encryption Key: Phase 2

---

## Zusammenfassung fuer das Team-Lead

| Kategorie | Anzahl | Wichtigste |
|-----------|--------|-----------|
| Kritisch (vor Go-Live) | 6 | Input/Output Sanitizer, HITL, Consent-Fix, DSFA, Eskalation |
| Hoch (Phase 1-2) | 9 | Tool-Sanitizer, Privacy Dashboard, Log-Verschluesselung, Guardrail-Erweiterung |
| Mittel (Phase 3+) | 8 | Self-Critique, Bias-Tests, Bedrock Guardrails, Retention |
| Niedrig | 4 | Model Pinning, DP, k-Anonymity, Unicode |

### Geschaetzter Aufwand fuer kritische Gaps:
- GAP-K1 (Input Sanitizer): 3 Tage
- GAP-K2 (Output PII-Filter): 3 Tage
- GAP-K3 (HITL): 3 Tage
- GAP-K4 (Consent-Fix): 2 Tage
- GAP-K5 (DSFA): 10 Tage (mit Datenschutzbeauftragtem)
- GAP-K6 (Eskalationspfad): 5 Tage
- **TOTAL kritisch: ~26 Personentage**

### Kernbotschaft:
Die Product-Doktorarbeit (Safety + Privacy Research) ist EXZELLENT -- sie identifiziert alle relevanten Risiken, liefert konkrete Massnahmen mit Aufwandschaetzungen, und priorisiert korrekt. Die Implementation-Doktorarbeit (DevOps + Testing) ist STARK in Observability, CI/CD und Testing -- aber sie hat die Security- und DSGVO-Massnahmen aus der Product-Doktorarbeit NICHT systematisch uebernommen. Das Delta zwischen "was die Product-Seite fordert" und "was die Implementation-Seite einplant" ist der groesste Risikofaktor fuer das Projekt.
