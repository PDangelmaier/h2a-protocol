---
spec: SPEC-017
spec_version: 1
status: IN_PROGRESS
branch: feat/spec017-adversarial-multiturn
base_commit: 4fac97f
head_commit: null
last_updated: "2026-10-01T13:50:56+02:00"
---

# SPEC-017: Mehrstufige Angriffs-Tests gegen Abwehrschichten

## Spec-Check

- **depends_on:** SPEC-038 ✅ (GEMERGT bfc747d), SPEC-039 ✅ (GEMERGT bb6bac4), SPEC-014 ✅ (GEMERGT 7c0c19a) — alle in main
- **scope_paths:** packages/mb-agent/src/, packages/mb-agent/golden/ — eingehalten
- **Widersprüche:** Keine. Spec sagt explizit: keine neuen Abwehrschichten bauen; Lücken als Anomalie melden, nicht fixen.
- **Offene Fragen:** Keine.
  - 5 Abwehrschichten vorhanden: input-sanitizer.ts (Schicht 1), output-validator.ts (Schicht 3 Canary + System-Prompt-Leak), pii-filter.ts (PII), consent.ts (Consent-Gate), step-up-auth.ts (Step-Up)
  - supplement-red-team-playbook.md hat 30 Szenarien in 6 Kategorien (A–F)
  - AC-1 fordert ≥10 Multi-Turn-Gespräche mit je 5–10 Turns
  - AC-2 fordert pro Testcase den Namen der erwarteten Abwehrschicht
  - AC-3 fordert deterministische CI-Tests mit Mock-Modell
  - AC-4 fordert Live-Modus nur via test:live
  - golden-mock-pipeline.ts (SPEC-011) bietet das Pattern für deterministisches Testen
- **Aufwand:** ~0.7d (unter Schätzung 1.0d)
- **Relevante Invarianten:** INV-10 (Max 5 Tool-Runden), INV-13 (Consent-Records), INV-20 (PII-Filter vor SSE), INV-21 (3 Schichten Prompt-Injection-Abwehr), INV-22 (keine Secrets im Code), INV-31 (€0.50 Limit)
