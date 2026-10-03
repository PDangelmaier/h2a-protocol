# AWS Bedrock Listenpreise — Referenztabelle

Quelle: https://aws.amazon.com/bedrock/pricing/
Abrufdatum: 2026-10-03

Alle Preise in USD pro 1.000 Tokens (On-Demand).

| Modell | Input | Output | Cache Read | Cache Write |
|---|---|---|---|---|
| claude-sonnet-4-6 | 0.003 | 0.015 | 0.0003 | 0.00375 |
| claude-haiku-4-5 | 0.001 | 0.005 | 0.0001 | 0.00125 |

## Nexus-Aufschlag

Faktor: **1.3×** (konservative Schätzung, SPEC-005 Kontext)

| Modell | Input (1.3×) | Output (1.3×) | Cache Read (1.3×) |
|---|---|---|---|
| claude-sonnet-4-6 | 0.0039 | 0.0195 | 0.00039 |
| claude-haiku-4-5 | 0.0013 | 0.0065 | 0.00013 |

Cache-Write-Preise werden separat in SPEC-045 AC-7 behandelt.
