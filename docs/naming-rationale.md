# H2A vs F2A — Naming Rationale

## The Decision

**H2A (Human-to-Agent)** statt F2A (Frontend-to-Agent).

## Multi-Stakeholder Review

### Perspective: Developer (Pro F2A)
"F2A is more technically precise. I'm building a frontend. I want a frontend protocol."

**Counter:** Du baust eine Schnittstelle zwischen Mensch und Agent. Das Frontend ist nur
das aktuelle Medium. Morgen ist es ein Voice Interface, ein AR-Headset, ein CLI.
Wenn wir "F2A" sagen, müssen wir für jedes neue Medium ein neues Akronym erfinden.
H2A ist zeitlos.

### Perspective: Marketing (Pro H2A)
"H2A tells a story. MCP connects agents to tools. A2A connects agents to each other.
H2A connects agents to us. The trilogy is complete."

```
MCP = Machine Context Protocol  (Agent ↔ Maschine)
A2A = Agent-to-Agent            (Agent ↔ Agent)
H2A = Human-to-Agent            (Mensch ↔ Agent)
```

Das Narrativ schreibt sich selbst.

### Perspective: Accessibility Advocate (Pro H2A)
"F2A implies a screen. Not every human has a screen. Voice users, screen reader users,
people using CLI tools — they're all humans, but they don't have a 'frontend' in the
traditional sense. H2A includes them by definition."

### Perspective: Protocol Purist (Pro F2A)
"Protocols should describe what they connect, not who. TCP doesn't call itself
HTC (Human-to-Computer). It's about the technical boundary."

**Counter:** TCP operates at Layer 4 where humans are irrelevant. H2A operates at the
application layer where the human IS the point. The protocol exists because humans
need to interact with agents. Naming it after the human is honest.

### Perspective: Competitor (Adversarial)
"H2A sounds presumptuous. As if they own the human-agent relationship."

**Counter:** MCP 'owns' the model-context relationship. A2A 'owns' the agent-agent
relationship. Naming a protocol after the boundary it standardizes is standard practice,
not hubris. The protocol is MIT-licensed and open. Naming is not ownership.

### Perspective: Legal/IP (Neutral)
- "H2A" does not appear to be trademarked in relevant classes (software, protocols)
- "F2A" has conflicts with financial terminology (F2A = Face-to-Ace, financial advisory)
- "H2A" is clean, short, memorable, globally pronounceable

## Final Decision

**H2A — Human-to-Agent Protocol.**

The name says exactly what it is, includes all interface modalities,
completes the MCP/A2A/H2A trilogy, and puts the human at the center
where they belong.
