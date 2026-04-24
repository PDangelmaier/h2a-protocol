# H2A v0.1 Gap Analysis — Brutally Honest

**Self-review from 8 adversarial perspectives.**

Status legend: CRITICAL = blocks real-world use, HIGH = blocks enterprise adoption,
MEDIUM = limits scope, LOW = nice-to-have for v1.

---

## 1. Voice & Speech Engineer

**Verdict: H2A claims to support voice but has ZERO voice-specific primitives.**

| Gap | Severity | Detail |
|-----|----------|--------|
| Turn-taking | CRITICAL | Who speaks when? Barge-in (user interrupts agent mid-speech)? Silence detection thresholds? SSE text streaming ≠ voice conversation. |
| Speech-to-Text integration | CRITICAL | Where does STT happen? Host-side? Agent-side? Streaming partial transcripts? |
| Text-to-Speech control | HIGH | Agent sends text — but which voice? Speed? Emotion? SSML markup? |
| Audio streaming | HIGH | SSE can't stream audio chunks efficiently. Need binary protocol or separate audio channel. |
| Ambient context | MEDIUM | Background noise, speaker identification, multi-speaker scenarios |
| Wake word / activation | MEDIUM | How does a voice-only host activate the agent? No keyboard, no click. |

**Fix needed:** A `voice` extension spec or H2A must explicitly say "voice is v0.2"
and stop claiming multimodal support until it's real.

---

## 2. Accessibility Auditor (WCAG 2.2 AA)

**Verdict: Section 9 lists requirements but has NO enforcement mechanism.**

| Gap | Severity | Detail |
|-----|----------|--------|
| Focus management | CRITICAL | When agent sends confirmation frame, where does keyboard focus go? No spec. |
| Live region strategy | CRITICAL | ARIA live regions for streaming text will spam screen readers. Need debounce spec. |
| Cognitive load | HIGH | 4 presence states with visual transitions — what about users with cognitive disabilities? |
| Color contrast | HIGH | Toast severity colors (red/green) — no contrast ratios specified. |
| Reduced motion spec | MEDIUM | We say "support reducedMotion" but don't define what that means per frame type. |
| Skip navigation | MEDIUM | Agent surface should be skippable. No landmark roles specified. |

**Fix needed:** Concrete ARIA patterns per frame type, focus management protocol,
streaming debounce for assistive tech.

---

## 3. Security Researcher (Pentester)

**Verdict: Good threat model but missing critical attack vectors.**

| Gap | Severity | Detail |
|-----|----------|--------|
| XSS via AgentFrame | CRITICAL | Agent sends `frameType: "text"` with format "html". Host renders it. Classic stored XSS. Content sanitization is NOT specified. |
| SSRF via state_delta | CRITICAL | `navigate` operation — even "same-origin" could hit internal admin routes (`/admin`, `/debug`). Path allowlisting needed, not just origin. |
| Replay attacks | HIGH | No nonce or signature on frames. A MITM could replay old state_deltas. |
| Session fixation | HIGH | `session.open` with attacker-chosen `sessionId` — no server-generated enforcement. |
| Denial of wallet | HIGH | Agent streams 100k frames → Host renders 100k React components → browser OOM. No max frame count per response. |
| State snapshot data leak | MEDIUM | Even with projections, timing attacks could infer data shape from snapshot frequency. |
| Prompt injection via StateSnapshot | MEDIUM | Mentioned in threat model but no concrete mitigation specified. |

**Fix needed:** Mandatory content sanitization spec, server-generated session IDs,
frame count limits, path-level navigation restrictions.

---

## 4. Enterprise Architect (Fortune 500)

**Verdict: Missing everything enterprises need before they'll touch it.**

| Gap | Severity | Detail |
|-----|----------|--------|
| Audit trail format | CRITICAL | "auditLog: true" but no log FORMAT specified. Enterprises need structured, tamper-evident logs. |
| Multi-tenancy | CRITICAL | How does one H2A agent serve multiple organizations with data isolation? |
| Role-based access | HIGH | No RBAC for who can orchestrate. Admin vs. regular user vs. viewer. |
| Compliance mapping | HIGH | No SOC2/HIPAA/PCI-DSS mapping. Enterprises need to know which controls H2A satisfies. |
| SLA / uptime spec | HIGH | No health check endpoint defined. No degraded mode spec. |
| SSO integration | MEDIUM | OAuth2 listed but no SAML, no OIDC details, no token refresh flow. |
| Data residency | MEDIUM | Where is conversation data stored? No regional routing spec. |

**Fix needed:** Audit log schema, health check endpoint, RBAC model,
compliance control mapping.

---

## 5. Mobile / Embedded Developer

**Verdict: Desktop-web bias throughout.**

| Gap | Severity | Detail |
|-----|----------|--------|
| Battery / bandwidth | CRITICAL | Constant SSE connection drains mobile battery. No adaptive polling mode. |
| State sync on constrained devices | HIGH | JSON Patch on every interaction — too chatty for IoT/embedded. Need batch/throttle spec. |
| Native rendering | HIGH | `frameType: "component"` is a stub. How does a Swift/Kotlin host render custom agent UI? |
| Offline queue | HIGH | Mobile goes into tunnel. UserSignals queue up. No offline queue spec or sync-on-reconnect. |
| Background mode | MEDIUM | Agent push notifications exist but no integration with iOS/Android lifecycle. |
| Screen size adaptation | MEDIUM | Presence states assume desktop layout (sidebar). How does orchestrating work on a 4" screen? |

**Fix needed:** Adaptive transport mode (SSE → polling → batch), offline queue spec,
native component rendering guidance.

---

## 6. Protocol Design Purist (IETF / W3C reviewer)

**Verdict: Not rigorous enough to be called a "standard."**

| Gap | Severity | Detail |
|-----|----------|--------|
| No formal grammar | CRITICAL | No ABNF, no CDDL, no formal message grammar. JSON Schema is validation, not specification. |
| No conformance levels | CRITICAL | "H2A Basic/Standard/Full" mentioned but not formally defined with MUST/SHOULD/MAY (RFC 2119). |
| No test vectors | CRITICAL | No normative examples of complete message exchanges that implementations MUST handle. |
| Ambiguous "MUST" usage | HIGH | Spec mixes normative ("MUST") and descriptive language. Need consistent RFC 2119 keywords. |
| No error state machine | HIGH | What happens after SESSION_EXPIRED? Must Host re-auth? Re-negotiate? No defined recovery. |
| No media type registration | MEDIUM | Should be `application/h2a+json` registered with IANA. |
| No extension registry | MEDIUM | `x-` prefixes without a registry → namespace collisions. |
| Version negotiation | MEDIUM | Host says "0.1", Agent says "0.2". Who downgrades? No negotiation protocol. |
| No sequence number overflow | LOW | `sequence` is integer — what at MAX_INT? Wrap? Reset? |

**Fix needed:** RFC 2119 language throughout, formal conformance levels,
normative test vectors, state machines for error recovery.

---

## 7. Open Source Community Leader

**Verdict: Great intent, weak governance.**

| Gap | Severity | Detail |
|-----|----------|--------|
| No CONTRIBUTING.md | HIGH | How do people contribute? No process defined. |
| No RFC process | HIGH | How are changes proposed, discussed, accepted? |
| No reference test suite | HIGH | "H2A compatible" is meaningless without tests. |
| No backwards-compat policy | MEDIUM | What happens when v0.2 changes a message shape? Migration path? |
| Single author risk | MEDIUM | Bus factor = 1. Needs co-maintainers from day 1. |
| No code of conduct | LOW | Required for serious open-source projects. |

---

## 8. Competing Framework Author (Honest Devil's Advocate)

**Verdict: The concept is sound. The execution is a draft, not a standard.**

"Here's what I'd say in my counter-blog-post:"

1. "H2A is a spec written by one person in one afternoon. MCP had a team.
   A2A had a team. Where's H2A's team?"
2. "The presence system is opinionated philosophy, not protocol design.
   Why are 'breathing states' in a transport protocol?"
3. "State_delta targets abstract identifiers — how does a React host
   map 'title-input' to a component? H2A punts this to the SDK."
4. "No reference implementation exists. Only example code. There's a difference."
5. "The security section lists threats but the mitigations are 'Host MUST validate.'
   That's not a security model, that's a wish list."

**All valid. All fixable.**
