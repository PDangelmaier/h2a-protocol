## H2A Spec-Driven-Prozess (PROCESS v2.1) — gilt in jeder Session

Drive-Sync: `$HOME/Library/CloudStorage/GoogleDrive-*/Meine Ablage/Claude-Sync/h2a`
Pflichtlektüre vor jeder Arbeit: `PROCESS.md`, `INVARIANTS.md`, `CODEMAP.md`, neue Dateien in `decisions/` und `reviews/`.
Nie ändern: `specs/`, `decisions/`, `reviews/`, `BACKLOG.md`, `INVARIANTS.md`, `PROCESS.md`. Du schreibst: `journal/`, `STATUS.md`, `CODEMAP.md`.

### Status — wer darf was
- PROPOSED → READY: du, nach Spec-Check ohne offene Fragen (R2)
- READY → IN_PROGRESS: du, nur wenn alle depends_on **DONE und in main gemergt** sind
- IN_PROGRESS → REVIEW: du, wenn alle AC mit Test grün und Evidence vollständig
- REVIEW → DONE: **nur Claude.AI** per REVIEW-Datei. Du setzt nie DONE.
- Merge nach main: nur nach REVIEW mit `merge_allowed` nicht `false` und grüner Gesamtsuite.

### Spec-Check (vor jeder Umsetzung)
Lies die Spec gegen Code, CODEMAP und INVARIANTS. Schreibe in `journal/SPEC-NNN.md` Abschnitt "Spec-Check": Pfade, Widersprüche, offene Fragen, Aufwand. Offene Fragen → Status bleibt PROPOSED, nicht raten.

### Acceptance Criteria
- AC werden **wörtlich** aus der Spec zitiert, mit ID (AC-1 … AC-n). Nie umformulieren, nie zusammenfassen, nie weglassen.
- Jedes AC braucht mindestens einen benannten Test. Kein Test = nicht erfüllt.
- Nicht messbar (z. B. fehlendes Token) = **NICHT GEPRÜFT**, nie "erfüllt".

### Evidence pro Spec: `journal/SPEC-NNN.md`
Frontmatter: spec, spec_version, status, branch, base_commit, head_commit, last_updated.
Abschnitte: Spec-Check · AC-Nachweis · Test-Lauf (Befehl + gekürzte Ausgabe) · Diff-Übersicht (`git diff --stat base..head`) · Invarianten-Check (INV-IDs) · Abweichungen · Commits · Offene Punkte.
Zeitstempel ausschließlich: `TZ=Europe/Berlin date -Iseconds`.
`journal/journal.md` ist nur die Übersicht: eine Zeile pro Spec + Verweis. Frontmatter bei jeder Änderung aktualisieren.

### Parallelität
- Worktrees nur von aktuellem `main`.
- Hotspot-Dateien laut CODEMAP.md (z. B. Agentic Loop, Edge-Function-Einstieg, model-config, Exports): Specs, die dieselbe Hotspot-Datei ändern, laufen nacheinander.
- WIP-Limit 3, aber erst nach bestandenem Probelauf.
- Nach jedem Merge: andere Branches rebasen, Gesamtsuite, CODEMAP aktualisieren.

### Autonomie
| Situation | Verhalten |
|---|---|
| Code-Style, Test-Strategie | selbst entscheiden |
| Architektur-Detail innerhalb INVARIANTS | entscheiden, als AUTO_LOG in der Evidence |
| Widerspruch zu INVARIANTS oder AC | STOPP, Anomalie + Entscheidungsvorlage |
| Änderung außerhalb scope_paths | nur mit Eintrag unter "Abweichungen"; eigenständige Fixes als eigener Branch |
| Bug außerhalb der Spec | Anomalie + Backlog-Vorschlag, NICHT fixen |
| Neue Migration | fortlaufende Nummer nach der höchsten existierenden |
| Security, Secrets, destruktive DB-Operation außerhalb lokal | STOPP, PO fragen |
| Entscheidungsvorlage | immer mit `timeout_allowed: true/false`; true nur, wenn Produktionsverhalten unverändert bleibt |

### Merge-Ablauf (SPEC-034, INV-34)
1. Arbeit auf Feature-Branch, nie direkt auf main.
2. PR gegen main öffnen → CI läuft automatisch (`tests`, `db-verify`, `merge-gate`).
3. CC wartet auf Label `merge-allowed` — **CC setzt dieses Label nie selbst**. Nur PO oder CA.
4. Nach Label + grünen Checks: Merge per PR (Squash oder Merge-Commit nach Präferenz).
5. Nach Merge: andere Branches rebasen, CODEMAP aktualisieren.

### Secrets / Doppler (SPEC-037)

Benötigte Doppler-Keys für `h2a/dev`:
- `NEXUS_PRD_KEY` — Nexus API Key
- `NEXUS_ENDPOINT` — Nexus Gateway URL
- `SUPABASE_URL` — Supabase Project URL
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase Service Role
- `LANGFUSE_PUBLIC_KEY` — (optional) Langfuse
- `LANGFUSE_SECRET_KEY` — (optional) Langfuse
- `LANGFUSE_BASE_URL` — (optional) Langfuse

Live-Test: `pnpm test:live` (erfordert Doppler-CLI + `h2a/dev` Config)

### Hooks (Pflicht)
- `scope-check` (pre-commit): geänderte Dateien gegen scope_paths der aktiven Spec; außerhalb → Commit nur mit Vermerk.
- `ac-check` (pre-push): Anzahl und IDs der AC in Spec und `journal/SPEC-NNN.md` müssen übereinstimmen; jedes AC hat einen Testnamen.
- `migration-check` (pre-commit): neue Migrationsnummer > höchste existierende.
- `secret-scan` (pre-commit): prüft Staged Files auf bekannte Secret-Patterns.

### Datenbank-Sicherheit (SPEC-044)
- Jede neue Tabelle **muss** eine RLS-Policy mit `FOR ALL TO service_role USING (true) WITH CHECK (true)` haben. Policies ohne `TO service_role` sind verboten (anon/authenticated hätten Zugriff).
- Jede neue Funktion **muss** `REVOKE EXECUTE ... FROM anon, authenticated;` enthalten. Die CI-Stubs replizieren Supabase-Default-Grants inklusive Funktionen.
- Verboten: `USING (current_setting('request.jwt.claim.role') = 'service_role')` — service_role hat BYPASSRLS, die Policy feuert nie.
- CI (`db-verify.yml`) prüft generisch alle Tabellen/Funktionen gegen anon/authenticated. Fehlschlag = PR blockiert.
