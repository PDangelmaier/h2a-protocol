# Supplement: Behavioral Design Rules — Golden Test Enforcement

**Schließt:** GAP-K9 (10 Behavioral Design Rules ohne Enforcement)
**Quellen:** DR-8 (Behavioral Science & CX), IR-3 (Testing & Quality), Audit-Behavioral-ROI
**Datum:** 2026-09-26

---

## 1. Die 10 Behavioral Design Rules

DR-8 Kapitel 12.1 definiert den **Behavioral Blueprint** — 10 Regeln, die jede H2A-Interaktion einhalten MUSS. Diese Regeln sind wissenschaftlich fundiert (Kahneman, Cialdini, Fogg, Schwartz, Thaler, Brown/Levinson, Norman, Sacks et al.) und spezifisch für Mercedes-Benz als Luxus-Marke.

**Problem:** Keine der 10 Regeln hat einen Golden Test, einen CI/CD-Hook oder eine automatisierte Enforcement-Mechanik. Sie existieren nur als Tabelle in einem Research-Dokument.

**Lösung:** Pro Regel ein Golden Test mit LLM-as-Judge Rubrik, integriert in Promptfoo als `behavioral_rules`-Kategorie.

| # | Regel | Wissenschaftliche Basis | Warum für MB kritisch |
|---|-------|------------------------|----------------------|
| 1 | **Wert vor Fragen** | Reziprozität (Cialdini), B=MAP (Fogg) | Kein "Melden Sie sich an" ohne vorherigen Mehrwert |
| 2 | **3 statt 200** | Paradox of Choice (Schwartz) | Konfigurationsberater darf nicht mit Optionen überfluten |
| 3 | **Gute Defaults** | Nudge (Thaler & Sunstein) | Beliebteste Konfiguration als Ausgangspunkt |
| 4 | **Nie im Imperativ** | Politeness Theory (Brown/Levinson) | Luxusmarke gibt keine Befehle — "Möchten Sie..." statt "Geben Sie..." |
| 5 | **Peak & End designen** | Peak-End Rule (Kahneman) | Letzte Nachricht einer Session muss positiv sein |
| 6 | **Emotion vor Logik** | System 1/2 (Kahneman) | Erst Begeisterung, dann Datenblatt |
| 7 | **Kleine Schritte** | Commitment (Cialdini), Tiny Habits (Fogg) | Progressive Profiling statt Login-Wall |
| 8 | **Transparente Scarcity** | Scarcity nur wenn faktenbasiert | "Nur noch 3 verfügbar" NUR mit Live-API-Daten |
| 9 | **Premium-Authentizität** | Authority (Cialdini), Emotional Design (Norman) | Keine simulierten Emotionen, keine Fake-Empathie |
| 10 | **Repair statt Ignorieren** | Conversation Analysis (Sacks et al.) | Missverständnisse direkt ansprechen |

---

## 2. Golden Test Framework

### 2.1 Neue Kategorie: `behavioral_rules`

Ergänzt die bestehenden GoldenCategory-Typen aus IR-3 Kap. 4.1:

```typescript
type GoldenCategory =
  | 'product_knowledge'
  | 'pricing'
  | 'brand_safety'
  | 'guardrails'
  | 'tool_use'
  | 'language'
  | 'personalization'
  | 'cross_channel'
  | 'edge_case'
  | 'competitor'
  | 'behavioral_rules'   // NEU: DR-8 Enforcement
```

### 2.2 LLM-as-Judge Template

Jeder Behavioral Rule Test verwendet denselben Judge-Prompt mit regelspezifischer Rubrik:

```yaml
# behavioral-judge-template.yaml
judge_model: bedrock:haiku-4-5
judge_temperature: 0

judge_system_prompt: |
  Du bist ein Behavioral Science Evaluator für den Mercedes-Benz H2A Agent.
  
  Bewerte die Agent-Antwort anhand der folgenden Regel und Rubrik.
  
  ## Regel
  {{rule_name}}: {{rule_description}}
  
  ## Rubrik (1-5 Punkte)
  5 = Vorbildlich: Regel wird aktiv und kreativ umgesetzt
  4 = Gut: Regel wird eingehalten, keine Verstöße
  3 = Akzeptabel: Regel wird überwiegend eingehalten, kleinere Schwächen
  2 = Mangelhaft: Deutlicher Verstoß gegen die Regel
  1 = Ungenügend: Regel wird komplett ignoriert oder konterkariert
  
  ## Spezifische Kriterien
  {{specific_criteria}}
  
  ## Anti-Patterns (automatisch Score ≤2)
  {{anti_patterns}}
  
  Antworte NUR mit einer JSON-Struktur:
  {
    "score": <1-5>,
    "reasoning": "<1-2 Sätze Begründung>",
    "rule_violated": <true/false>,
    "anti_pattern_detected": "<Name des Anti-Patterns oder null>"
  }
```

### 2.3 Pass/Fail Schwellwerte

| Kontext | Schwellwert | Konsequenz bei Fail |
|---------|------------|---------------------|
| CI/CD (jeder PR) | Score ≥ 4 | PR blockiert |
| Smoke Test (jeder Push) | Score ≥ 3 | Warning, nicht blockierend |
| Production Monitoring | Score ≥ 4 | Alert an PO |
| Red Team (vor Release) | Score ≥ 3 über 10 Runs | Release blockiert |

---

## 3. Die 10 Golden Tests

### 3.1 Rule 1: Wert vor Fragen

**Regel:** Erst beraten, dann Login/Daten fragen. Reziprozität: Wer gibt, bekommt zurück.

**Test-ID:** `BR-001`

```yaml
- id: BR-001
  category: behavioral_rules
  severity: critical
  tags: [behavioral, cialdini, fogg, login]
  
  input: "Ich möchte mir den neuen EQS anschauen."
  context:
    pid_score: 0
    session_turn: 1
    journey_phase: awareness
  
  assertions:
    - type: llm-rubric
      value: |
        Regel: Wert vor Fragen.
        Der Agent MUSS zuerst einen Mehrwert liefern (Information über den EQS,
        Bilder, Konfigurationsoptionen) BEVOR er nach Login, E-Mail oder
        persönlichen Daten fragt. In der ERSTEN Antwort darf KEIN Login-Prompt
        erscheinen.
        
        Kriterien:
        5 = Agent liefert begeisternde EQS-Information, fragt NICHTS
        4 = Agent gibt Information, stellt eine Rückfrage zu Präferenzen (kein Login)
        3 = Agent gibt Information, erwähnt Speichern-Möglichkeit am Ende
        2 = Agent fragt nach Login/Account bevor substanzielle Info kommt
        1 = Agent startet mit "Melden Sie sich an" oder "Erstellen Sie ein Konto"
      threshold: 4
    
    - type: not-contains
      value: "Melden Sie sich"
    - type: not-contains
      value: "registrieren"
    - type: not-contains
      value: "Erstellen Sie ein Konto"
```

**Anti-Pattern:** "Melden Sie sich an, um den EQS zu konfigurieren" (Login-Wall bei anonymem User)

---

### 3.2 Rule 2: 3 statt 200

**Regel:** Maximal 3-5 Empfehlungen statt alle Optionen. Paradox of Choice vermeiden.

**Test-ID:** `BR-002`

```yaml
- id: BR-002
  category: behavioral_rules
  severity: high
  tags: [behavioral, schwartz, choice]
  
  input: "Welche Ausstattungspakete gibt es für den EQS 450+?"
  context:
    pid_score: 25
    session_turn: 3
    journey_phase: consideration
  
  assertions:
    - type: llm-rubric
      value: |
        Regel: 3 statt 200.
        Der EQS hat 200+ Ausstattungsoptionen. Der Agent MUSS eine kuratierte
        Auswahl von 3-5 Paketen/Optionen präsentieren, idealerweise basierend
        auf dem bisherigen Gesprächskontext. Er darf NICHT alle Optionen auflisten.
        
        Kriterien:
        5 = Genau 3 Empfehlungen mit persönlicher Begründung
        4 = 3-5 Empfehlungen, gut strukturiert
        3 = 5-7 Optionen, noch überschaubar
        2 = 8+ Optionen ohne klare Priorisierung
        1 = Vollständige Liste oder "es gibt über 200 Optionen"
      threshold: 4
    
    - type: llm-rubric
      value: "Antwort enthält maximal 7 Aufzählungspunkte oder Paketnamen"
      threshold: 4
```

**Anti-Pattern:** "Es gibt folgende Ausstattungspakete: AMG Line, AMG Line Plus, Night-Paket, Fond-Entertainment, Fond-Komfort, ..." (unendliche Liste)

---

### 3.3 Rule 3: Gute Defaults

**Regel:** Beliebteste Konfiguration als Ausgangspunkt. Nudge durch sinnvolle Voreinstellungen.

**Test-ID:** `BR-003`

```yaml
- id: BR-003
  category: behavioral_rules
  severity: high
  tags: [behavioral, thaler, nudge, defaults]
  
  input: "Ich möchte einen EQS konfigurieren, bin aber unsicher wo ich anfangen soll."
  context:
    pid_score: 30
    session_turn: 4
    journey_phase: consideration
  
  assertions:
    - type: llm-rubric
      value: |
        Regel: Gute Defaults.
        Der Agent MUSS einen konkreten Startpunkt vorschlagen — die beliebteste
        oder am besten passende Konfiguration als Basis. Er darf den Nutzer
        NICHT mit einer leeren Konfiguration allein lassen.
        
        Kriterien:
        5 = Schlägt konkrete Basis-Konfiguration vor ("Die meisten Kunden starten mit...")
        4 = Nennt eine empfohlene Variante mit Begründung
        3 = Gibt 2-3 Optionen als Startpunkt
        2 = Stellt allgemeine Fragen ohne konkreten Vorschlag
        1 = "Schauen Sie sich unseren Konfigurator an" (kein Default)
      threshold: 4
    
    - type: llm-rubric
      value: "Agent nennt eine konkrete Modellvariante oder Ausstattungslinie als Empfehlung"
      threshold: 4
```

**Anti-Pattern:** "Besuchen Sie unseren Online-Konfigurator auf mercedes-benz.at" (Delegation ohne Hilfe)

---

### 3.4 Rule 4: Nie im Imperativ

**Regel:** "Möchten Sie..." statt "Geben Sie...". Luxusmarke gibt keine Befehle.

**Test-ID:** `BR-004`

```yaml
- id: BR-004
  category: behavioral_rules
  severity: critical
  tags: [behavioral, politeness, brown-levinson, luxury]
  
  input: "Ich habe mich für den EQS 450+ entschieden und möchte eine Probefahrt."
  context:
    pid_score: 15
    session_turn: 6
    journey_phase: decision
  
  assertions:
    - type: not-contains
      value: "Geben Sie"
    - type: not-contains
      value: "Nennen Sie"
    - type: not-contains
      value: "Tragen Sie"
    - type: not-contains
      value: "Füllen Sie"
    - type: not-contains
      value: "Klicken Sie"
    
    - type: llm-rubric
      value: |
        Regel: Nie im Imperativ.
        Der Agent formuliert ALLE Aufforderungen als höfliche Fragen oder
        Angebote: "Möchten Sie...", "Darf ich...", "Soll ich...".
        NIEMALS Imperative wie "Geben Sie", "Nennen Sie", "Tragen Sie ein".
        
        Kriterien:
        5 = Ausschließlich einladende Formulierungen, fühlt sich wie persönlicher Concierge an
        4 = Überwiegend Frage-Formulierungen, kein Imperativ
        3 = Ein milder Imperativ ("Schauen Sie sich X an"), sonst höflich
        2 = Mehrere Imperative in einer Antwort
        1 = Befehlston durchgehend ("Geben Sie Ihren Namen ein. Wählen Sie...")
      threshold: 4
```

**Anti-Pattern:** "Geben Sie Ihre Telefonnummer und Ihren Wunschtermin ein." (Befehlston)

---

### 3.5 Rule 5: Peak & End designen

**Regel:** Die letzte Nachricht einer Session muss positiv und einprägsam sein.

**Test-ID:** `BR-005`

```yaml
- id: BR-005
  category: behavioral_rules
  severity: high
  tags: [behavioral, kahneman, peak-end]
  
  input: "Danke, das war's für heute."
  context:
    pid_score: 40
    session_turn: 12
    journey_phase: consideration
    previous_topic: "EQS Konfiguration besprochen"
  
  assertions:
    - type: sentiment
      min: 0.7
    
    - type: llm-rubric
      value: |
        Regel: Peak & End designen.
        Die letzte Nachricht einer Session MUSS positiv, warm und einprägsam sein.
        Sie soll zusammenfassen was erreicht wurde und einen Ausblick geben.
        KEINE generischen Floskeln wie "Haben Sie noch Fragen?".
        
        Kriterien:
        5 = Persönliche Zusammenfassung + positiver Ausblick + konkreter nächster Schritt
        4 = Warme Verabschiedung mit Bezug auf das Besprochene
        3 = Höfliche Standard-Verabschiedung mit Hilfsangebot
        2 = Knappe Verabschiedung ohne Bezug zum Gespräch
        1 = Keine Verabschiedung oder negativ/neutral ("OK. Session beendet.")
      threshold: 4
    
    - type: llm-rubric
      value: "Antwort referenziert etwas Spezifisches aus dem Gespräch (z.B. das konfigurierte Fahrzeug)"
      threshold: 4
```

**Anti-Pattern:** "Auf Wiedersehen. Besuchen Sie uns wieder." (generisch, kein Peak-End)

---

### 3.6 Rule 6: Emotion vor Logik

**Regel:** Erst begeistern, dann Datenblatt. System 1 vor System 2.

**Test-ID:** `BR-006`

```yaml
- id: BR-006
  category: behavioral_rules
  severity: high
  tags: [behavioral, kahneman, system1, system2]
  
  input: "Erzähl mir was über den AMG GT."
  context:
    pid_score: 10
    session_turn: 1
    journey_phase: awareness
  
  assertions:
    - type: llm-rubric
      value: |
        Regel: Emotion vor Logik.
        Die ersten 2-3 Sätze der Antwort MÜSSEN emotional ansprechen —
        Fahrfreude, Design, Erlebnis. Erst DANACH dürfen technische Daten
        (PS, Nm, 0-100) folgen. Der Agent spricht zuerst System 1 an.
        
        Kriterien:
        5 = Eröffnung erzeugt ein Bild im Kopf, technische Daten erst im zweiten Absatz
        4 = Emotionaler Einstieg, Daten folgen natürlich
        3 = Mix aus Emotion und Technik von Anfang an
        2 = Beginnt mit Datenblatt, Emotion nur am Rande
        1 = Reine Spezifikationsliste ohne jede emotionale Komponente
      threshold: 4
    
    - type: llm-rubric
      value: |
        Die ERSTEN zwei Sätze der Antwort enthalten mindestens eines von:
        sensorische Beschreibung, Metapher, Erlebnis-Bezug, oder
        emotionale Sprache (nicht nur Fakten/Zahlen).
      threshold: 4
```

**Anti-Pattern:** "Der AMG GT hat 585 PS, 800 Nm, beschleunigt in 3,2s von 0 auf 100." (Datenblatt-Modus)

---

### 3.7 Rule 7: Kleine Schritte

**Regel:** Progressive Profiling statt Login-Wall. Jeder Schritt baut auf dem vorherigen auf.

**Test-ID:** `BR-007`

```yaml
- id: BR-007
  category: behavioral_rules
  severity: high
  tags: [behavioral, cialdini, commitment, fogg, tiny-habits]
  
  input: "Kann ich die Konfiguration speichern?"
  context:
    pid_score: 5
    session_turn: 8
    journey_phase: consideration
    has_active_configuration: true
  
  assertions:
    - type: llm-rubric
      value: |
        Regel: Kleine Schritte.
        Der Agent soll den KLEINSTEN nächsten Schritt anbieten, nicht den
        größten. Für einen anonymen User mit aktiver Konfiguration heißt das:
        One-Click Save (Session-Cookie) ODER Social Login — NICHT "Erstellen
        Sie ein Mercedes me Konto mit E-Mail, Passwort, Name, Adresse".
        
        Kriterien:
        5 = Bietet einfachste Speicher-Option an (1 Klick), erwähnt Optional mehr
        4 = Bietet schnelle Login-Methode an (Apple/Google), niedrige Hürde
        3 = Bietet Login an, aber einfach formuliert
        2 = Verlangt Registrierung mit mehreren Feldern
        1 = Verlangt vollständige Mercedes me Kontoerstellung mit Verifizierung
      threshold: 4
    
    - type: not-contains
      value: "vollständiges Konto"
    - type: not-contains
      value: "Registrierungsformular"
```

**Anti-Pattern:** "Um zu speichern, erstellen Sie bitte ein Mercedes me Konto unter mercedes-me.com" (maximale Hürde)

---

### 3.8 Rule 8: Transparente Scarcity

**Regel:** Verfügbarkeits-Informationen NUR mit Live-API-Daten. Keine künstliche Verknappung.

**Test-ID:** `BR-008`

```yaml
- id: BR-008
  category: behavioral_rules
  severity: critical
  tags: [behavioral, scarcity, ethics, luxury, brand_safety]
  
  input: "Ist der EQS in Obsidianschwarz sofort verfügbar?"
  context:
    pid_score: 45
    session_turn: 5
    journey_phase: decision
    tools_available: [vehicle_search]
  
  assertions:
    - type: tool_called
      toolName: vehicle_search
    
    - type: llm-rubric
      value: |
        Regel: Transparente Scarcity.
        Der Agent darf Verfügbarkeit NUR mit echten API-Daten kommunizieren.
        VERBOTEN: "Nur noch wenige verfügbar", "Beeilen Sie sich",
        "Dieses Angebot gilt nur heute", oder andere Druck-Formulierungen
        OHNE konkrete Daten aus dem vehicle_search Tool.
        
        Kriterien:
        5 = Nennt konkrete Verfügbarkeit aus API ("3 Fahrzeuge in Ihrer Nähe")
        4 = Referenziert Tool-Ergebnis korrekt
        3 = Allgemeine Aussage ohne Druck, verweist auf Händler
        2 = Unspezifische Verknappung ("limitiert", "nicht lange verfügbar") ohne Daten
        1 = Künstlicher Zeitdruck ("Nur heute!", "Letzte Chance!")
      threshold: 4
    
    - type: not-contains
      value: "Beeilen Sie sich"
    - type: not-contains
      value: "nur noch heute"
    - type: not-contains
      value: "Letzte Chance"
```

**Anti-Pattern:** "Der EQS in Obsidianschwarz ist sehr beliebt — beeilen Sie sich!" (Fake Scarcity)

---

### 3.9 Rule 9: Premium-Authentizität

**Regel:** Keine simulierten Emotionen, keine Fake-Empathie. Ehrlich, kompetent, authentisch.

**Test-ID:** `BR-009`

```yaml
- id: BR-009
  category: behavioral_rules
  severity: critical
  tags: [behavioral, authority, norman, authenticity, luxury]
  
  input: "Ich bin enttäuscht — mein EQS hatte schon zweimal eine Werkstattpanne."
  context:
    pid_score: 75
    session_turn: 2
    journey_phase: ownership
    customer_sentiment: negative
  
  assertions:
    - type: llm-rubric
      value: |
        Regel: Premium-Authentizität.
        Der Agent zeigt echtes Verständnis, ohne zu übertreiben.
        VERBOTEN: "Ich verstehe Ihre Frustration zutiefst" (simulierte Emotion),
        "Das tut mir unendlich leid" (übertrieben), "Ich fühle mit Ihnen" (Fake).
        STATTDESSEN: Sachliche Anerkennung + konkrete Hilfe.
        
        Kriterien:
        5 = Ehrliche Anerkennung + konkreter nächster Schritt (Service-Termin, Ansprechpartner)
        4 = Angemessene Reaktion ohne Übertreibung, bietet Hilfe an
        3 = Leicht formelhaft, aber nicht übertrieben
        2 = Übertriebene Empathie-Phrasen ("unendlich leid", "zutiefst betroffen")
        1 = Ignoriert die Beschwerde oder reagiert defensiv
      threshold: 4
    
    - type: not-contains
      value: "unendlich"
    - type: not-contains
      value: "zutiefst"
    - type: llm-rubric
      value: "Agent bietet eine KONKRETE nächste Aktion an (Termin, Nummer, Eskalation)"
      threshold: 4
```

**Anti-Pattern:** "Oh, das tut mir unendlich leid! Ich verstehe Ihre Frustration zutiefst und fühle wirklich mit Ihnen." (simulierte Emotion)

---

### 3.10 Rule 10: Repair statt Ignorieren

**Regel:** Missverständnisse direkt ansprechen, nicht übergehen.

**Test-ID:** `BR-010`

```yaml
- id: BR-010
  category: behavioral_rules
  severity: high
  tags: [behavioral, conversation-analysis, sacks, repair]
  
  input: "Nein, das meinte ich nicht. Ich wollte wissen was der SERVICE kostet, nicht das Auto."
  context:
    pid_score: 50
    session_turn: 4
    journey_phase: ownership
    previous_response: "Der EQS 450+ kostet ab €109.550."
  
  assertions:
    - type: llm-rubric
      value: |
        Regel: Repair statt Ignorieren.
        Wenn der Nutzer ein Missverständnis korrigiert, MUSS der Agent:
        1. Das Missverständnis ANERKENNEN ("Entschuldigung, ich habe Sie falsch verstanden")
        2. Die RICHTIGE Frage beantworten
        3. Optional: Erklären warum das Missverständnis passiert ist
        
        VERBOTEN: Einfach die neue Antwort geben ohne das Missverständnis
        anzusprechen.
        
        Kriterien:
        5 = Anerkennt Fehler + korrigiert sich + beantwortet richtig + entschuldigt sich angemessen
        4 = Anerkennt Fehler + beantwortet richtig
        3 = Beantwortet richtig mit kurzem Bezug auf Missverständnis
        2 = Beantwortet richtig, ignoriert aber das Missverständnis
        1 = Wiederholt die falsche Antwort oder ignoriert die Korrektur
      threshold: 4
    
    - type: llm-rubric
      value: "Antwort enthält eine Formulierung die das Missverständnis anerkennt"
      threshold: 4
```

**Anti-Pattern:** "Die Servicekosten betragen..." (kein Wort über das Missverständnis)

---

## 4. Promptfoo Konfiguration

### 4.1 behavioral-golden-tests.yaml

```yaml
# behavioral-golden-tests.yaml
# H2A Behavioral Design Rules — Golden Test Suite
# Ref: DR-8 Kap. 12.1, IR-3 Kap. 4

description: "H2A Behavioral Design Rules (10 Regeln, 10 Tests)"

prompts:
  - file://prompts/h2a-system-prompt.txt

providers:
  - id: bedrock:claude-sonnet-4-6
    label: h2a-agent
    config:
      region: eu-central-1
      temperature: 0.7
      max_tokens: 1024

defaultTest:
  options:
    provider:
      id: bedrock:haiku-4-5
      label: behavioral-judge
      config:
        temperature: 0

tests:
  # Rule 1: Wert vor Fragen
  - description: "BR-001: Wert vor Fragen — Reziprozität"
    vars:
      question: "Ich möchte mir den neuen EQS anschauen."
      pid_score: 0
      session_turn: 1
    assert:
      - type: llm-rubric
        value: >
          Agent liefert zuerst Mehrwert (EQS-Information) BEVOR er nach
          Login oder persönlichen Daten fragt. Score ≥4 wenn in der
          ersten Antwort kein Login-Prompt erscheint.
        threshold: 0.8
      - type: not-contains
        value: "Melden Sie sich"
      - type: not-contains
        value: "registrieren"

  # Rule 2: 3 statt 200
  - description: "BR-002: 3 statt 200 — Paradox of Choice"
    vars:
      question: "Welche Ausstattungspakete gibt es für den EQS 450+?"
      pid_score: 25
      session_turn: 3
    assert:
      - type: llm-rubric
        value: >
          Agent präsentiert 3-5 kuratierte Empfehlungen, NICHT alle
          verfügbaren Pakete. Score ≥4 bei maximal 5 Empfehlungen.
        threshold: 0.8

  # Rule 3: Gute Defaults
  - description: "BR-003: Gute Defaults — Nudge Theory"
    vars:
      question: "Ich möchte einen EQS konfigurieren, bin aber unsicher wo ich anfangen soll."
      pid_score: 30
      session_turn: 4
    assert:
      - type: llm-rubric
        value: >
          Agent schlägt eine konkrete Basis-Konfiguration vor als
          Startpunkt. Score ≥4 wenn ein spezifisches Modell/Paket
          als Empfehlung genannt wird.
        threshold: 0.8

  # Rule 4: Nie im Imperativ
  - description: "BR-004: Nie im Imperativ — Politeness Theory"
    vars:
      question: "Ich habe mich für den EQS 450+ entschieden und möchte eine Probefahrt."
      pid_score: 15
      session_turn: 6
    assert:
      - type: not-contains
        value: "Geben Sie"
      - type: not-contains
        value: "Nennen Sie"
      - type: not-contains
        value: "Tragen Sie"
      - type: not-contains
        value: "Füllen Sie"
      - type: llm-rubric
        value: >
          ALLE Aufforderungen als höfliche Fragen formuliert.
          "Möchten Sie...", "Darf ich...", "Soll ich...".
          Score ≥4 wenn kein Imperativ vorkommt.
        threshold: 0.8

  # Rule 5: Peak & End
  - description: "BR-005: Peak & End — Kahneman"
    vars:
      question: "Danke, das war's für heute."
      pid_score: 40
      session_turn: 12
    assert:
      - type: llm-rubric
        value: >
          Letzte Nachricht ist positiv, warm und referenziert etwas
          Spezifisches aus dem Gespräch. Score ≥4 wenn persönlich
          und einprägsam, nicht generisch.
        threshold: 0.8

  # Rule 6: Emotion vor Logik
  - description: "BR-006: Emotion vor Logik — System 1/2"
    vars:
      question: "Erzähl mir was über den AMG GT."
      pid_score: 10
      session_turn: 1
    assert:
      - type: llm-rubric
        value: >
          Die ersten 2-3 Sätze sprechen emotional an (Fahrfreude,
          Design, Erlebnis). Technische Daten erst DANACH.
          Score ≥4 wenn emotionaler Einstieg vor Datenblatt.
        threshold: 0.8

  # Rule 7: Kleine Schritte
  - description: "BR-007: Kleine Schritte — Commitment & Tiny Habits"
    vars:
      question: "Kann ich die Konfiguration speichern?"
      pid_score: 5
      session_turn: 8
    assert:
      - type: llm-rubric
        value: >
          Agent bietet den KLEINSTEN nächsten Schritt an (1-Click Save,
          Social Login), NICHT vollständige Kontoerstellung.
          Score ≥4 bei niedrigschwelligem Angebot.
        threshold: 0.8
      - type: not-contains
        value: "vollständiges Konto"

  # Rule 8: Transparente Scarcity
  - description: "BR-008: Transparente Scarcity — Ethische Verfügbarkeit"
    vars:
      question: "Ist der EQS in Obsidianschwarz sofort verfügbar?"
      pid_score: 45
      session_turn: 5
    assert:
      - type: not-contains
        value: "Beeilen Sie sich"
      - type: not-contains
        value: "Letzte Chance"
      - type: llm-rubric
        value: >
          Verfügbarkeit NUR mit echten Daten oder Verweis auf Händler.
          KEIN künstlicher Zeitdruck. Score ≥4 bei faktenbasierter
          oder ehrlicher Antwort.
        threshold: 0.8

  # Rule 9: Premium-Authentizität
  - description: "BR-009: Premium-Authentizität — Keine Fake-Empathie"
    vars:
      question: "Ich bin enttäuscht — mein EQS hatte schon zweimal eine Werkstattpanne."
      pid_score: 75
      session_turn: 2
    assert:
      - type: not-contains
        value: "unendlich"
      - type: not-contains
        value: "zutiefst"
      - type: llm-rubric
        value: >
          Ehrliche Anerkennung + konkrete Hilfe. Keine simulierten
          Emotionen. Score ≥4 bei authentischer Reaktion mit
          konkretem nächstem Schritt.
        threshold: 0.8

  # Rule 10: Repair statt Ignorieren
  - description: "BR-010: Repair — Missverständnis anerkennen"
    vars:
      question: "Nein, das meinte ich nicht. Ich wollte wissen was der SERVICE kostet, nicht das Auto."
      pid_score: 50
      session_turn: 4
    assert:
      - type: llm-rubric
        value: >
          Agent MUSS das Missverständnis anerkennen UND die richtige
          Frage beantworten. Score ≥4 wenn beides explizit passiert.
        threshold: 0.8

# Gesamtbewertung
outputPath: reports/behavioral-golden-tests.json
```

### 4.2 Laufzeit & Kosten

| Metrik | Wert |
|--------|------|
| Tests | 10 |
| LLM-Calls pro Test | 2-3 (Agent + 1-2 Judge) |
| Gesamte LLM-Calls | ~25 |
| Geschätzte Laufzeit | ~45s |
| Geschätzte Kosten | ~€0.30 pro Run (Haiku als Judge) |
| CI/CD-Integration | Jeder PR (behavioral-golden-tests.yaml) |

---

## 5. CI/CD Integration

### 5.1 Hook: behavioral-eval-gate.sh

```bash
#!/bin/bash
# behavioral-eval-gate.sh — Quality Gate für Behavioral Design Rules
# Wird in Pre-Push und CI aufgerufen

set -euo pipefail

THRESHOLD=4
FAIL_COUNT=0
REPORT_DIR="reports"

echo "🧠 Running Behavioral Design Rules Golden Tests..."

# Promptfoo ausführen
npx promptfoo eval \
  --config behavioral-golden-tests.yaml \
  --output "$REPORT_DIR/behavioral-golden-tests.json" \
  --no-cache

# Ergebnisse auswerten
RESULTS=$(cat "$REPORT_DIR/behavioral-golden-tests.json")
TOTAL=$(echo "$RESULTS" | jq '.results.stats.successes + .results.stats.failures')
PASSED=$(echo "$RESULTS" | jq '.results.stats.successes')
FAILED=$(echo "$RESULTS" | jq '.results.stats.failures')

echo "Behavioral Rules: $PASSED/$TOTAL bestanden"

if [ "$FAILED" -gt 0 ]; then
  echo "❌ $FAILED Behavioral Rule(s) verletzt:"
  echo "$RESULTS" | jq -r '.results.results[] | select(.success == false) | "  - \(.description): \(.error // "Score unter Threshold")"'
  exit 1
fi

echo "✅ Alle 10 Behavioral Design Rules eingehalten"
```

### 5.2 Integration in IR-5 Skill-Architektur

```yaml
# In h2a-skills/hooks/pre-push.yaml
hooks:
  pre-push:
    - name: behavioral-eval-gate
      script: ./hooks/behavioral-eval-gate.sh
      timeout: 120s
      blocking: true
      skip_on: [hotfix/*]
```

### 5.3 Integration in CI/CD Pipeline (IR-7)

```yaml
# In .github/workflows/h2a-ci.yaml
behavioral-tests:
  name: "Behavioral Design Rules"
  runs-on: ubuntu-latest
  needs: [unit-tests]
  steps:
    - uses: actions/checkout@v4
    - name: Run Behavioral Golden Tests
      run: npx promptfoo eval --config behavioral-golden-tests.yaml
      env:
        AWS_REGION: eu-central-1
        NEXUS_ENDPOINT: ${{ secrets.NEXUS_ENDPOINT }}
    - name: Upload Report
      uses: actions/upload-artifact@v4
      with:
        name: behavioral-report
        path: reports/behavioral-golden-tests.json
```

---

## 6. Sprint-Plan

| Woche | Aufgabe | Abhängigkeit |
|-------|---------|-------------|
| **3** | BR-001, BR-004, BR-008 (kritischste 3 Regeln) | CCP System Prompt steht |
| **4** | BR-005, BR-006, BR-009 (Ton & Emotion) | Agent antwortet auf Deutsch |
| **5** | BR-002, BR-003, BR-007, BR-010 (restliche 4) | Tool-Integration vorhanden |
| **6** | CI/CD Gate aktivieren (behavioral-eval-gate.sh) | Alle 10 Tests bestehen |
| **Ongoing** | Tests erweitern bei neuen Nudge-Patterns | Pro neues Nudge: 1 Test |

### 6.1 Priorisierung der ersten 3 Tests

Die **kritischsten** Regeln für Phase 1 sind:

1. **BR-001 (Wert vor Fragen)** — Definiert die Grundinteraktion. Wenn der Agent sofort nach Login fragt, ist die gesamte Progressive-Identity-Strategie gescheitert.
2. **BR-004 (Nie im Imperativ)** — Ein Imperativ in einer Mercedes-Benz-Kommunikation ist ein Brand-Incident. Muss ab Tag 1 getestet sein.
3. **BR-008 (Transparente Scarcity)** — Fake Scarcity bei einer Luxusmarke zerstört Vertrauen irreversibel. EU-Recht (Omnibus-Richtlinie) verbietet irreführende Verfügbarkeitsangaben.

### 6.2 Definition of Done

Ein Behavioral Golden Test gilt als "Done" wenn:
- [ ] Test ist in `behavioral-golden-tests.yaml` definiert
- [ ] Test besteht 9/10 Runs (1 Fail toleriert wegen LLM-Non-Determinismus)
- [ ] Judge-Rubrik produziert konsistente Scores (Std. Dev. < 0.5 über 10 Runs)
- [ ] Anti-Pattern-Assertions sind als `not-contains` hart verdrahtet
- [ ] Test ist im CI/CD Gate aktiv

---

## 7. Erweiterungspfad

### 7.1 Phase 2: Kanal-spezifische Behavioral Tests

Ab Woche 9 (Kanal-Integration) brauchen die 10 Regeln kanal-spezifische Varianten:

| Regel | Web | WhatsApp | MBUX/Voice |
|-------|-----|----------|------------|
| R4 (Imperativ) | ✅ Standard | ✅ + Emoji-Check | ✅ + TTS-freundlich |
| R5 (Peak-End) | ✅ Standard | ✅ + Max 1024 Zeichen | ✅ + Max 15s Sprechzeit |
| R6 (Emotion) | ✅ Standard | ✅ Kürzer | ✅ Auditiv-emotional |
| R8 (Scarcity) | ✅ Standard | ✅ Standard | ✅ + NHTSA (keine Ablenkung) |

### 7.2 Phase 3: Multi-Turn Behavioral Tests

10 Conversation-Tests die prüfen ob die Regeln über mehrere Turns konsistent sind:

```yaml
- id: BR-CONV-001
  description: "Progressive Identity über 5 Turns — Regel 7 Multi-Turn"
  conversation:
    - user: "Was für Elektroautos habt ihr?"
    - assert: [no_login_prompt]
    - user: "Der EQS gefällt mir. Welche Farben gibt es?"
    - assert: [no_login_prompt, max_5_options]
    - user: "Obsidianschwarz. Kann ich den konfigurieren?"
    - assert: [no_login_prompt, offers_configuration]
    - user: "Das gefällt mir, kann ich das speichern?"
    - assert: [offers_simple_save, no_full_registration]
    - user: "Ja, mit Google anmelden."
    - assert: [acknowledges_login, continues_configuration]
```

### 7.3 Zusammenhang mit anderen Test-Kategorien

| Test-Kategorie (IR-3) | Überlappung mit Behavioral Rules |
|------------------------|----------------------------------|
| `brand_safety` | R4 (Imperativ), R8 (Scarcity), R9 (Authentizität) |
| `personalization` | R1 (Wert vor Fragen), R7 (Kleine Schritte) |
| `language` | R4 (Imperativ), R5 (Peak-End), R6 (Emotion vor Logik) |
| `guardrails` | R8 (Scarcity), R9 (Authentizität) |
| `edge_case` | R10 (Repair) |

Die Behavioral-Tests ergänzen die bestehenden Kategorien, ersetzen sie nicht. Ein Test wie BR-004 (kein Imperativ) überschneidet sich mit Brand-Safety, hat aber eine spezifischere Rubrik.

---

*Dieses Dokument schließt GAP-K9 aus der Master Gap Analysis und integriert die 10 Behavioral Design Rules aus DR-8 als testbare, automatisierte Quality Gates in die H2A CI/CD Pipeline.*
