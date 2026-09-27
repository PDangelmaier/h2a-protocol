# Audit: ROI & Cost Gaps

**Auditor:** Cost & ROI Verification Agent
**Datum:** 2026-09-26
**Scope:** Finanzielle Behauptungen in Product- und Implementation-Doktorarbeit

---

## Zusammenfassung

Drei verschiedene ROI-Berechnungen (729%, 3.089%, 8.337%) basieren auf **grundlegend verschiedenen Annahmen** und Szenarien. Keine ist per se falsch, aber die Diskrepanzen sind nicht transparent dokumentiert. Die Token-Kosten pro Session variieren je nach Dokument um Faktor 5 (€0.03 bis €0.15). Das Solo+AI-Modell ist plausibel für Prototyp, aber fragwürdig für den 16-Wochen-Plan mit 5 parallelen Subsystemen.

---

## Gap-Tabelle

| # | Gap/Finding | Quelle | Annahme im Dokument | Realitätscheck | Schwere | Empfehlung |
|---|------------|--------|---------------------|----------------|---------|------------|
| 1 | **ROI-Diskrepanz: 729% vs. 3.089% vs. 8.337%** | DR-6 (Z.737), Manifest (Z.620), Blueprint (Z.1114) | DR-6: €63M Impact / €7.6M Kosten. Manifest: $1.7M / $53K. Blueprint: €3.375M Marge / €40K Betrieb. | Drei komplett verschiedene Scope-Ebenen (DE+AT Enterprise, Solo-Betrieb, AT-only 10% Traffic). Kein Dokument erklärt die Unterschiede oder referenziert die anderen Berechnungen. | HOCH | Einheitliche ROI-Tabelle erstellen mit klar benannten Szenarien (Pessimistisch / Realistisch / Optimistisch). Jede Berechnung muss Scope und Annahmen-Set benennen. |
| 2 | **Token-Kosten pro Session inkonsistent** | Blueprint (Z.1094): €0.08-0.14. DR-6 (Z.682): €0.15-0.50. DevOps (Z.900): $0.03. DR-6 (Z.588): €0.24. Manifest (Z.303): €0.046. | Jedes Dokument nimmt andere Session-Länge, Tool-Loops und Modell-Mix an. | Realistisch mit Sonnet, 2-3 Tool-Loops, ~3K Input + 1K Output Token/Turn, 3-5 Turns: **~€0.12-0.20/Session**. €0.03 ist zu niedrig (nur Haiku oder 1-Turn), €0.50 ist zu hoch (nur Opus). | HOCH | Kanonische Session-Profile definieren (Simple FAQ, Konfiguration, Multi-Tool-Journey) mit jeweiligen Token-Budgets. |
| 3 | **Solo+AI = 10x Team: $3.300 Entwicklungskosten** | Blueprint (Z.1089) | 1 Person + Claude Code für 16 Wochen = $3.300 total (nur Cloud-Kosten). Personalkosten = €0. | Die $3.300 ignorieren Personalkosten des PO komplett. Wenn der PO €130K/Jahr kostet, sind 4 Monate = ~€43.000. Das ist immer noch günstig vs. 5-köpfiges Team, aber 50x ist irreführend. Korrekt: ~5-10x günstiger. | MITTEL | Personalkosten des PO als separate Zeile ausweisen. "50x günstiger" → "5-10x günstiger (inkl. PO-Kosten)" |
| 4 | **Break-Even "Tag 1 nach Launch" nicht haltbar** | Blueprint (Z.1125) | Revenue-Impact >> Betriebskosten ab Tag 1. | Day-1 hat ~0 Sessions. Ramp-Up auf 10K Sessions/Tag dauert Wochen. Bei Canary (5% → 25% → 100%) vergehen mindestens 2-4 Wochen bis Volllast. Break-Even realistisch: **Monat 2-3 nach Launch**. | MITTEL | Break-Even-Kurve mit Ramp-Up-Szenario modellieren (Woche 1: 500 Sessions → Woche 8: 10K). |
| 5 | **450 inkrementelle Fahrzeugverkäufe/Monat (Blueprint)** | Blueprint (Z.1109) | 10% AT-Traffic × 8% Lead-Conversion × 5% Sale-Conversion = 450 Autos/Monat. | Mercedes-Benz verkauft in AT gesamt ~25.000 Fahrzeuge/Jahr = ~2.100/Monat. 450 inkrementelle Sales wären +21% — extrem ambitioniert für einen Chat-Agent. Realistisch: +2-5% = 40-100 inkrementelle Sales. | KRITISCH | Lead-Conversion 8% ist der schwächste Punkt. Branchenstandard für Automotive-Leads online: 1-3%. Mit AI-Qualifizierung plausibel: 3-5%, nicht 8%. Berechnung mit 3% wiederholen. |
| 6 | **DR-6: €26M/Jahr Customer-Service-Einsparung** | DR-6 (Z.729) | 350K AI-geeignete Interaktionen/Monat × €6.50 Kostenvermeidung. | 350K Interaktionen/Monat für DE+AT ist plausibel. Aber: H2A ersetzt nicht 100% der Mensch-Interaktionen. Realistische Deflection Rate: 40-60%, nicht 100%. → Einsparung: €10-16M/Jahr, nicht €26M. | HOCH | Deflection Rate als Variable einführen. Szenarien: 40% / 60% / 80% Deflection. |
| 7 | **Infrastrukturkosten nach Skalierung fehlen** | DR-6 (Z.578-584) hat Tabelle, aber Blueprint/Manifest ignorieren sie | Blueprint: €40K/Monat bei 10K Sessions/Tag. DR-6: €35K/Monat bei 1M Sessions/Monat. | Bei Erfolg und DE+AT-Rollout (5M Besucher/Monat, 10% Widget-Nutzung = 500K Sessions/Monat) steigen Kosten auf **~€80-150K/Monat** (DB + LLM + WhatsApp). Der Blueprint-ROI von 8.337% berücksichtigt nur die Initial-Phase. | MITTEL | Kostenstaffel in ROI-Berechnung einbauen: Phase 1 (AT), Phase 2 (DE+AT), Phase 3 (EU). |
| 8 | **WhatsApp Business API: €15K/Monat fehlt im Manifest** | Blueprint (Z.1097): €15K/Monat WhatsApp. Manifest (Z.598-606): nicht aufgeführt. | Manifest listet nur $4.400/Monat Gesamtkosten. | WhatsApp Template Messages kosten €0.04-0.08/Stück. Bei 10K Sessions/Tag mit WhatsApp-Anteil (30%) = ~€9-18K/Monat. Manifest unterschätzt Betriebskosten um ~3x. | HOCH | Manifest-Kostenaufstellung mit WhatsApp-Kosten aktualisieren. Gesamtkosten: ~$15-20K/Monat, nicht $4.400. |
| 9 | **Manifest vs. Blueprint: Betriebskosten differieren 10x** | Manifest: $4.400/Monat (Z.606). Blueprint: €40.000/Monat (Z.1099). | Manifest = reiner Entwicklungsbetrieb. Blueprint = Production mit 10K Sessions/Tag. | Beide sind korrekt für ihren Scope, aber der Leser merkt das nicht. Das Manifest berechnet ROI auf $4.400, Blueprint auf €40.000 — die ROI-Zahlen sind daher nicht vergleichbar. | HOCH | Klare Labels: "Development-Phase Kosten" vs. "Production-Phase Kosten (AT, 10K/Tag)" vs. "Scale-Phase Kosten (DE+AT)". |
| 10 | **Nexus Gateway Kosten "MB-intern" = Blackbox** | Manifest (Z.602), Blueprint (Z.1088) | Nexus-Kosten werden als "MB-intern" verbucht = €0. | Nexus Gateway nutzt AWS Bedrock. Claude Sonnet via Bedrock: $3/$15 per 1M Token. Bei 10K Sessions/Tag × ~4K Token avg = ~40M Token/Tag → ~$200-500/Tag = **$6-15K/Monat LLM-Kosten**. Diese werden zwar von MB getragen, aber für einen ehrlichen ROI müssen sie einkalkuliert werden. | HOCH | Nexus-LLM-Kosten schätzen und als "MB-intern getragene Kosten" ausweisen. Für externen Business Case: Full-Cost-Rechnung erstellen. |
| 11 | **Guardian Metrics: €0.15/Konversation als Threshold** | Blueprint (Z.1169) | Cost per Interaction < €0.15 als Erfolgs-Metrik. | Bei Multi-Tool-Sessions (Konfiguration, Probefahrt-Buchung) mit 5+ Turns und 2-3 Tool-Loops/Turn realistisch: €0.30-0.50/Session. €0.15 ist nur für Simple-FAQ erreichbar. Der Threshold ist zu streng für das Gesamtbild. | MITTEL | Differenzierte Thresholds: FAQ < €0.10, Beratung < €0.25, Full Journey < €0.50. Gewichteter Durchschnitt als KPI. |
| 12 | **Conversion 4x Uplift (2% → 8%) ohne Benchmarks** | Blueprint (Z.1106) | Lead Conversion Rate steigt von 2% auf 8% durch H2A. | Kein Benchmark aus der Automotive-Branche belegt 4x Uplift durch einen Chat-Agent. Klarna zeigt Effizienz, nicht Conversion-Uplift. Best-Case-Studien (Intercom, Drift) zeigen 20-50% Uplift, nicht 300%. Realistisch: 2% → 3-4%. | KRITISCH | Automotive-spezifische Benchmarks recherchieren. Klarna, Shopify Sidekick sind E-Commerce, nicht €75K-Fahrzeuge. Konservatives Szenario mit 2% → 3% rechnen. |
| 13 | **Risk Matrix: kein finanzielles Worst-Case-Szenario** | Blueprint (Z.1040), Manifest (Z.526) | "Token-Kosten explodieren" als Risiko identifiziert, aber kein Worst-Case-Budget genannt. | Ein unkontrollierter Multi-Tool-Loop (Manifest Z.303: "€50+ pro Loop") × 10K Sessions = **€500K/Tag**. Das Kill-Switch-Budget fehlt als harte Zahl. | MITTEL | Daily Hard Limit definieren: z.B. €5.000/Tag. Bei Überschreitung: automatische Abschaltung neuer Sessions. Diese Zahl muss in die Risk Matrix. |
| 14 | **Entwicklungskosten-Vergleich "50x günstiger" irreführend** | Blueprint (Z.133) | Solo+AI = $12K/Jahr vs. 5-köpfiges Team = €800K/Jahr = 50x. | Das Team produziert auch nach 16 Wochen weiter. Der Solo+AI-Ansatz skaliert nicht bei parallelen Streams (WhatsApp + MBUX + Dealer Portal gleichzeitig). Fairerer Vergleich: 1 PO + AI (~€150K/Jahr all-in) vs. 5 Devs (~€600K/Jahr) = **4x günstiger**. | MITTEL | Ehrlichen Vergleich aufstellen: PO-Kosten + Claude Code + Infra vs. äquivalentes Team. Faktor 4-6x statt 50x. |
| 15 | **Skalierungskosten DR-6 vs. DevOps-Dokument inkonsistent** | DR-6 (Z.588-590): €0.24/Session Sonnet. DevOps (Z.826): $3/$15 = ~$0.05/Session-Turn. | Verschiedene Token-Pricing-Annahmen. | DR-6 rechnet mit höherem Token-Verbrauch pro Session (~4K Token gesamt). DevOps rechnet per Turn (~1K Token). Weder referenziert den anderen. | NIEDRIG | Session-Profil standardisieren: Durchschnittliche Turns/Session, Token/Turn, Modell-Mix. Einmal berechnen, überall referenzieren. |

---

## Empfohlene Sofort-Maßnahmen

1. **Kanonisches Kosten-Modell erstellen** mit 3 Session-Profilen (FAQ, Beratung, Full Journey) und realistischen Token-Zahlen
2. **ROI-Szenarien konsolidieren** in eine Tabelle mit Pessimistisch/Realistisch/Optimistisch
3. **Conversion-Uplift-Annahme von 4x auf 1.5-2x korrigieren** (Automotive ≠ E-Commerce)
4. **Nexus-Kosten transparent ausweisen** statt "MB-intern = €0"
5. **Break-Even mit Ramp-Up-Kurve** statt "Tag 1"

## Gesamtbewertung

Die finanziellen Claims sind in der Tendenz korrekt (H2A hat massiv positiven ROI), aber die **konkreten Zahlen übertreiben um Faktor 2-5x**. Ein konservativer, ehrlicher Business Case mit ROI ~300-500% wäre genauso überzeugend und deutlich glaubwürdiger gegenüber MB-Management.
