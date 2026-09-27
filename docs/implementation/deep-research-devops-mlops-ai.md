# Deep Research: DevOps & MLOps für AI-First Produkte

**Wie man einen Mercedes-Benz AI-Assistenten betreibt, überwacht und skaliert**

*State of the Art — CI/CD für LLMs, Prompt Management, Model Versioning, Observability*
*Speziell für die H2A Implementierung mit Nexus Gateway & Supabase*

---

## Inhaltsverzeichnis

1. [CI/CD für LLM-Applikationen](#1-cicd)
2. [Prompt Management & Engineering](#2-prompt-management)
3. [Model Versioning & Multi-Model Routing](#3-model-routing)
4. [Observability für AI-Systeme](#4-observability)
5. [Infrastructure as Code für H2A](#5-iac)
6. [Cost Management & Optimization](#6-cost)
7. [Security in der AI-Pipeline](#7-security)
8. [Die Gurus](#8-gurus)
9. [Startup-Analyse](#9-startups)
10. [Konkreter DevOps-Plan für H2A](#10-devops-plan)

---

## 1. CI/CD für LLM-Applikationen {#1-cicd}

### 1.1 Das Problem: Prompt ist Code

In einem AI-System ist der System Prompt genauso wichtig wie der Quellcode — und muss genauso behandelt werden:

| Dimension | Traditioneller Code | AI System Prompt |
|-----------|-------------------|------------------|
| Versionierung | Git | Git + Prompt Registry |
| Review | Code Review | Prompt Review + Eval |
| Testing | Unit/Integration/E2E | Golden Tests + LLM-Judge + Red Team |
| Deployment | Build → Test → Deploy | Build → Eval → Shadow → Deploy |
| Rollback | Git Revert + Deploy | Prompt Revert + Model Pin |
| Monitoring | Error Rate, Latency | + Hallucination Rate, Tone, Quality |

### 1.2 Prompt als Code (Prompt-as-Code Pattern)

**Prinzip:** Prompts werden wie Code behandelt — versioniert, reviewed, getestet, deployed.

**Verzeichnisstruktur:**
```
packages/mb-agent/
├── src/
│   ├── prompts/
│   │   ├── system/                    # System Prompts (CCP Layers)
│   │   │   ├── layer-01-identity.ts   # Layer 1: Basis-Identität
│   │   │   ├── layer-02-brand.ts      # Layer 2: Mercedes-Benz Brand
│   │   │   ├── layer-03-persona.ts    # Layer 3: Persona-Routing
│   │   │   ├── layer-04-safety.ts     # Layer 4: Safety Rules
│   │   │   ├── layer-05-tools.ts      # Layer 5: Tool Instructions
│   │   │   ├── layer-06-context.ts    # Layer 6: Session Context
│   │   │   ├── layer-07-memory.ts     # Layer 7: User Memory
│   │   │   ├── layer-08-intent.ts     # Layer 8: Intent Signals
│   │   │   └── layer-09-nudge.ts      # Layer 9: Identity Nudge
│   │   ├── tools/                     # Tool-Beschreibungen
│   │   │   ├── configurator.ts
│   │   │   ├── dealer-search.ts
│   │   │   └── service-booking.ts
│   │   └── index.ts                   # Prompt Assembly
│   └── ...
├── prompts.test.ts                    # Prompt Unit Tests
└── evals/
    ├── golden-tests.yaml              # PromptFoo Golden Tests
    ├── red-team.yaml                  # Red Team Config
    └── regression.yaml                # Regression Tests
```

### 1.3 Prompt Diffing und Review

```typescript
// Prompt als Typed Constant (nicht String-Template)
export const BRAND_LAYER = {
  version: '2.3.1',
  lastModified: '2026-09-20',
  author: 'philipp.dangelmaier',
  content: `Du bist der Mercedes-Benz AI-Assistent.

Deine Persönlichkeit:
- Professionell und kompetent
- Warm aber nie übergriffig
- Stolz auf die Marke, nie arrogant
- Sie-Form immer, du-Form nie

Verbotene Wörter: billig, günstig, Schnäppchen, Deal
Verbotene Vergleiche: Nie direkt mit Wettbewerbern vergleichen
`
} as const;
```

**Git Diff für Prompts:**
```diff
- Stolz auf die Marke, nie arrogant
+ Stolz auf die Marke, nie arrogant oder überheblich
+ Bei technischen Fragen: Faktenbasiert antworten, nicht ausweichen
```

**Review-Checklist für Prompt-Änderungen:**
- [ ] Golden Tests laufen alle durch
- [ ] Red Team Tests bestanden
- [ ] Hallucination Rate nicht gestiegen
- [ ] Tone-Score nicht gefallen
- [ ] Token-Usage nicht signifikant gestiegen (> 20%)
- [ ] Shadow Test über 24h bestanden

### 1.4 Die CI/CD Pipeline

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   PR Push    │────→│  Gate 1:     │────→│  Gate 2:        │
│   (Code +    │     │  Type Check  │     │  Unit Tests     │
│    Prompts)  │     │  + Lint      │     │  (Vitest)       │
└─────────────┘     └──────────────┘     └─────────────────┘
                                                │
                    ┌──────────────┐     ┌──────┴──────────┐
                    │  Gate 4:     │←────│  Gate 3:        │
                    │  Red Team    │     │  Golden Tests   │
                    │  (PromptFoo) │     │  (PromptFoo)    │
                    └──────────────┘     └─────────────────┘
                           │
                    ┌──────┴──────────┐
                    │  Gate 5:        │
                    │  Hallucination  │
                    │  Detection      │
                    └─────────────────┘
                           │
                    ┌──────┴──────────┐     ┌──────────────┐
                    │  Gate 6:        │────→│  Gate 7:      │
                    │  Shadow Deploy  │     │  Canary       │
                    │  (24h parallel) │     │  (5% Traffic) │
                    └─────────────────┘     └──────────────┘
                                                   │
                                            ┌──────┴──────┐
                                            │  Production  │
                                            │  (100%)      │
                                            └─────────────┘
```

### 1.5 Canary Deployment für AI

**Traditionelles Canary:** 5% der User bekommen neue Version.
**AI Canary:** 5% der User bekommen neuen Prompt/neues Modell.

```typescript
// Canary-Konfiguration
const canaryConfig = {
  // 5% Traffic auf den neuen Prompt
  trafficSplit: { stable: 0.95, canary: 0.05 },
  
  // Rollback-Kriterien (automatic)
  rollbackConditions: [
    { metric: 'hallucination_rate', threshold: 0.08, operator: '>' },
    { metric: 'error_rate', threshold: 0.05, operator: '>' },
    { metric: 'latency_p95', threshold: 5000, operator: '>' },
    { metric: 'quality_score', threshold: 3.0, operator: '<' },
  ],
  
  // Promotion-Kriterien (nach 24h)
  promotionConditions: [
    { metric: 'hallucination_rate', threshold: 0.05, operator: '<=' },
    { metric: 'quality_score', threshold: 3.5, operator: '>=' },
    { metric: 'sample_size', threshold: 500, operator: '>=' },
  ],
  
  // Monitoring-Intervall
  checkInterval: '5 minutes',
  minDuration: '24 hours',
};
```

### 1.6 Feature Flags für Prompts

```typescript
// Feature Flag System für Prompt-Varianten
const featureFlags = {
  'h2a.prompt.nudge-v2': {
    description: 'Neue Identity-Nudge-Strategie mit softerem Ansatz',
    enabled: false,
    rollout: 0,           // 0-100%
    targeting: {
      pidTiers: ['anonymous', 'recognized'],  // Nur für niedrige Tiers
      markets: ['de', 'at'],                   // Nur DACH
    }
  },
  'h2a.model.opus-routing': {
    description: 'Komplexe Anfragen an Opus statt Sonnet routen',
    enabled: true,
    rollout: 10,           // 10% der Sessions
    targeting: {
      pidTiers: ['premium'],  // Nur Premium-Kunden
    }
  },
  'h2a.rag.graphrag': {
    description: 'GraphRAG statt Vector Search für Knowledge Base',
    enabled: false,
    rollout: 0,
  }
};
```

---

## 2. Prompt Management & Engineering {#2-prompt-management}

### 2.1 Prompt Registry Konzept

Eine Prompt Registry ist wie eine Docker Registry für Prompts:

```
Registry
├── h2a/system-prompt:v2.3.1    ← Aktuell in Production
├── h2a/system-prompt:v2.4.0    ← In Shadow Testing
├── h2a/system-prompt:v2.2.0    ← Vorherige stable Version
├── h2a/tool-configurator:v1.1  ← Tool-Beschreibung
├── h2a/tool-dealer:v1.0        ← Tool-Beschreibung
└── h2a/nudge-templates:v1.2    ← Nudge-Vorlagen
```

### 2.2 Langfuse als Prompt Registry

Langfuse bietet native Prompt-Management-Funktionalität:

```typescript
import { Langfuse } from 'langfuse';

const langfuse = new Langfuse({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
});

// Prompt laden (mit Version-Pinning)
const systemPrompt = await langfuse.getPrompt('h2a-system', {
  version: 3,           // Exakte Version (für Production)
  // Oder: label: 'production'  (für Label-basiertes Routing)
});

// Prompt als Template mit Variablen
const assembledPrompt = systemPrompt.compile({
  userName: session.user?.name || 'Gast',
  pidTier: session.pidTier,
  language: session.language,
  activeConsents: session.consents.join(', '),
});
```

### 2.3 CCP als verwaltete Konfiguration

Die 9 CCP-Layer als verwaltete, versionierte Konfiguration:

```typescript
interface CCPConfiguration {
  version: string;
  layers: {
    identity: { version: string; content: string };
    brand: { version: string; content: string };
    persona: { version: string; content: string };
    safety: { version: string; content: string };
    tools: { version: string; content: string };
    context: { version: string; template: string };  // Dynamisch
    memory: { version: string; template: string };   // Dynamisch
    intent: { version: string; template: string };   // Dynamisch
    nudge: { version: string; template: string };    // Dynamisch
  };
  assembly: {
    order: string[];           // Reihenfolge der Layer
    separator: string;         // Trennzeichen zwischen Layern
    maxTotalTokens: number;    // Maximale Gesamtlänge
  };
}
```

**Statische Layer (1-5):** Werden bei Prompt-Release geändert. Versioniert in Git + Langfuse.
**Dynamische Layer (6-9):** Werden pro Session zusammengebaut. Templates in Git, Werte aus Supabase.

### 2.4 A/B Testing von Prompts

```typescript
// Prompt A/B Test Definition
const promptExperiment = {
  name: 'Nudge Strategy Soft vs Direct',
  variants: {
    control: {
      promptVersion: 'h2a-nudge:v1.2',
      weight: 0.50,
    },
    treatment: {
      promptVersion: 'h2a-nudge:v2.0-soft',
      weight: 0.50,
    },
  },
  metrics: [
    'login_conversion_rate',
    'session_continuation_rate',
    'user_satisfaction_score',
    'nudge_acceptance_rate',
  ],
  minSampleSize: 5000,
  maxDuration: '4 weeks',
  significanceLevel: 0.05,
  
  // Automatische Entscheidung
  autoDecision: {
    promoteIf: 'treatment.login_conversion > control.login_conversion * 1.10',
    rollbackIf: 'treatment.user_satisfaction < control.user_satisfaction * 0.90',
  }
};
```

### 2.5 Prompt Migration

Wenn ein System Prompt geändert wird:

```
v2.3 (stable) → v2.4 (canary)

Migration Plan:
1. v2.4 in Shadow Deploy (0% Traffic, nur Logging)
2. v2.4 in Canary (5% Traffic, 24h)
3. Metriken vergleichen (v2.3 vs v2.4)
4. Wenn OK: Rollout 25% → 50% → 100%
5. v2.3 als Fallback behalten (30 Tage)
6. Nach 30 Tagen: v2.3 archivieren
```

---

## 3. Model Versioning & Multi-Model Routing {#3-model-routing}

### 3.1 Nexus Gateway — Multi-Model-Routing

H2A nutzt den Mercedes-Benz Nexus Gateway für LLM-Zugang. Nexus spricht **Bedrock Converse API**, nicht Anthropic Messages API.

**Verfügbare Modelle (SHORT-FORM IDs):**

| Model ID | Modell | Kosten (Input/Output per 1M Token) | Latenz | Use Case |
|----------|--------|-------------------------------------|--------|----------|
| `claude-sonnet-4-6` | Claude Sonnet 4.6 | $3 / $15 | ~1.5s | Standard-Konversation |
| `claude-opus-4-6` | Claude Opus 4.6 | $15 / $75 | ~3s | Komplexe Anfragen |
| `claude-haiku-4-5` | Claude Haiku 4.5 | $0.80 / $4 | ~0.5s | Einfache/schnelle Anfragen |

### 3.2 Routing-Strategien

```typescript
interface ModelRoutingConfig {
  rules: RoutingRule[];
  fallback: string;  // Fallback-Modell
}

const routingConfig: ModelRoutingConfig = {
  rules: [
    // Regel 1: Premium-Kunden bekommen Opus
    {
      condition: (ctx) => ctx.pidTier === 'premium' && ctx.complexity > 0.7,
      model: 'claude-opus-4-6',
      reason: 'Premium user with complex request',
    },
    // Regel 2: Einfache Anfragen → Haiku (schnell + günstig)
    {
      condition: (ctx) => ctx.complexity < 0.3 && ctx.turnNumber > 3,
      model: 'claude-haiku-4-5',
      reason: 'Simple follow-up question',
    },
    // Regel 3: Tool-Calls → Sonnet (gut bei Structured Output)
    {
      condition: (ctx) => ctx.requiresToolCall,
      model: 'claude-sonnet-4-6',
      reason: 'Tool call routing',
    },
    // Regel 4: Alles andere → Sonnet
    {
      condition: () => true,
      model: 'claude-sonnet-4-6',
      reason: 'Default routing',
    },
  ],
  fallback: 'claude-sonnet-4-6',
};
```

### 3.3 Complexity Estimation

Wie entscheidet man welches Modell eine Anfrage braucht?

```typescript
function estimateComplexity(message: string, context: SessionContext): number {
  let score = 0;
  
  // Nachrichtenlänge (längere Nachrichten = komplexer)
  if (message.length > 200) score += 0.2;
  if (message.length > 500) score += 0.1;
  
  // Mehrere Fragen in einer Nachricht
  const questionCount = (message.match(/\?/g) || []).length;
  if (questionCount > 1) score += 0.2;
  
  // Technische/spezifische Begriffe
  const technicalTerms = ['Drehmoment', 'kWh', 'Reichweite', 'WLTP', 'Konfiguration'];
  const technicalCount = technicalTerms.filter(t => message.includes(t)).length;
  score += technicalCount * 0.1;
  
  // Vergleichs-Anfragen (schwieriger)
  if (message.match(/vergleich|unterschied|besser|oder/i)) score += 0.3;
  
  // Beschwerden (braucht Empathie = Opus)
  if (message.match(/unzufrieden|beschwerde|problem|ärger/i)) score += 0.3;
  
  return Math.min(score, 1.0);
}
```

### 3.4 Fallback-Ketten

```typescript
const fallbackChain: FallbackConfig = {
  primary: {
    model: 'claude-sonnet-4-6',
    timeout: 10000,    // 10s
    retries: 1,
  },
  secondary: {
    model: 'claude-haiku-4-5',
    timeout: 5000,     // 5s
    retries: 1,
    degradedMessage: '(Hinweis: Antwort mit reduzierter Qualität)',
  },
  tertiary: {
    // Statische Fallback-Antwort wenn alle Modelle ausfallen
    staticResponse: 'Es tut mir leid, ich bin gerade nicht verfügbar. Bitte versuchen Sie es in einigen Minuten erneut oder kontaktieren Sie Ihren Mercedes-Benz Händler.',
    logEvent: 'CRITICAL_MODEL_FALLBACK',
    alertOncall: true,
  }
};
```

### 3.5 Model Performance Monitoring

```typescript
// Metriken pro Modell pro Stunde
interface ModelMetrics {
  model: string;
  period: string;           // ISO Timestamp (Stunde)
  requestCount: number;
  errorCount: number;
  avgLatency: number;       // ms
  p95Latency: number;       // ms
  avgInputTokens: number;
  avgOutputTokens: number;
  totalCost: number;        // USD
  qualityScore: number;     // 1-5 (LLM-Judge Sample)
  hallucinationRate: number; // 0-1
}

// Alert wenn ein Modell degradiert
const modelAlerts = [
  { condition: 'error_rate > 5%', action: 'switch_to_fallback + alert' },
  { condition: 'p95_latency > 10s', action: 'switch_to_fallback + alert' },
  { condition: 'quality_score < 3.0', action: 'alert_po' },
  { condition: 'hallucination_rate > 10%', action: 'switch_to_fallback + alert_security' },
];
```

---

## 4. Observability für AI-Systeme {#4-observability}

### 4.1 Die 4 Säulen der AI-Observability

| Säule | Traditionelle App | AI-System | Tool |
|-------|------------------|-----------|------|
| **Logs** | Strukturierte Logs | + Conversation Logs, Prompt Logs | ELK / Loki |
| **Metriken** | Latenz, Error Rate | + Token Usage, Quality Score, Hallucination Rate | Prometheus / Grafana |
| **Traces** | Request Traces | + LLM Call Traces, Tool Call Chains, Reasoning Steps | Langfuse |
| **Feedback** | Bug Reports | + User Ratings, Implicit Signals, LLM-Judge Scores | Langfuse |

### 4.2 Langfuse Integration

```typescript
import { Langfuse } from 'langfuse';

const langfuse = new Langfuse({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  baseUrl: 'https://langfuse.corpinter.net',  // MB-interne Instanz
});

// Trace für eine komplette Konversation
async function handleMessage(session: Session, message: string) {
  const trace = langfuse.trace({
    name: 'h2a-conversation-turn',
    sessionId: session.id,
    userId: session.userId,
    metadata: {
      pidScore: session.pidScore,
      pidTier: session.pidTier,
      market: session.market,
      channel: session.channel,
    },
    tags: ['h2a', session.channel, session.pidTier],
  });

  // Span für CCP Assembly
  const ccpSpan = trace.span({ name: 'ccp-assembly' });
  const systemPrompt = await assembleCCP(session);
  ccpSpan.end({ output: { tokenCount: countTokens(systemPrompt) } });

  // Span für ISP
  const ispSpan = trace.span({ name: 'isp-processing' });
  const intent = computeIntentScore(session, message);
  ispSpan.end({ output: intent });

  // Generation für den LLM-Call
  const generation = trace.generation({
    name: 'nexus-llm-call',
    model: selectedModel,
    modelParameters: { temperature: 0.3, maxTokens: 1024 },
    input: [
      { role: 'system', content: systemPrompt },
      ...session.messages,
      { role: 'user', content: message },
    ],
  });

  const response = await callNexus(selectedModel, messages);

  generation.end({
    output: response.content,
    usage: {
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
    },
  });

  // Scores
  trace.score({ name: 'model_used', value: selectedModel });
  trace.score({ name: 'response_length', value: response.content.length });
  
  // Asynchroner LLM-Judge Score (für 10% der Requests)
  if (Math.random() < 0.10) {
    scheduleQualityEvaluation(trace.id, message, response.content);
  }

  return response;
}
```

### 4.3 LLM-spezifische Metriken

```typescript
// Metriken die in Grafana/Prometheus landen
const aiMetrics = {
  // Performance
  'h2a.llm.latency': histogram({ buckets: [500, 1000, 2000, 3000, 5000, 10000] }),
  'h2a.llm.tokens.input': counter(),
  'h2a.llm.tokens.output': counter(),
  'h2a.llm.error_rate': gauge(),
  
  // Quality
  'h2a.quality.score': histogram({ buckets: [1, 2, 3, 4, 5] }),
  'h2a.quality.hallucination_rate': gauge(),
  'h2a.quality.tone_score': gauge(),
  'h2a.quality.faithfulness': gauge(),
  
  // Business
  'h2a.business.session_length': histogram(),
  'h2a.business.login_conversions': counter(),
  'h2a.business.tool_usage': counter({ labels: ['tool_name'] }),
  'h2a.business.nudge_acceptance': gauge(),
  
  // Cost
  'h2a.cost.per_session': histogram(),
  'h2a.cost.per_model': counter({ labels: ['model'] }),
  'h2a.cost.daily_total': gauge(),
};
```

### 4.4 Alerting-Regeln

```yaml
# alerting-rules.yaml (Prometheus/Grafana)
groups:
  - name: h2a-ai-alerts
    rules:
      - alert: HighHallucinationRate
        expr: h2a_quality_hallucination_rate > 0.08
        for: 15m
        labels:
          severity: critical
        annotations:
          summary: "Halluzinationsrate über 8% seit 15 Minuten"
          action: "Prompt-Version prüfen, ggf. Rollback"
      
      - alert: HighLatency
        expr: histogram_quantile(0.95, h2a_llm_latency_bucket) > 5000
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "P95 Latenz über 5 Sekunden"
          action: "Nexus Gateway Status prüfen"
      
      - alert: CostOverrun
        expr: h2a_cost_daily_total > 500
        for: 1h
        labels:
          severity: warning
        annotations:
          summary: "Tageskosten über $500"
          action: "Token-Usage prüfen, Cost-Throttling aktivieren"
      
      - alert: ConsentViolation
        expr: h2a_consent_violations_total > 0
        for: 0s
        labels:
          severity: critical
          team: security
        annotations:
          summary: "CONSENT VIOLATION DETECTED"
          action: "SOFORT: Feature deaktivieren, Security informieren"
      
      - alert: ModelDown
        expr: h2a_llm_error_rate > 0.20
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Modell-Fehlerrate über 20%"
          action: "Auf Fallback-Modell wechseln"
```

### 4.5 Dashboards

**Dashboard 1: AI Quality Overview**
- Hallucination Rate (Trend, letzte 7 Tage)
- Quality Score Distribution (Histogramm)
- Tone Score pro Markt (DE/AT/CH)
- Top 10 fehlgeschlagene Golden Tests

**Dashboard 2: AI Operations**
- Latenz P50/P95/P99 pro Modell
- Token Usage pro Stunde (Input + Output)
- Error Rate pro Modell
- Fallback-Aktivierungen

**Dashboard 3: AI Business**
- Sessions pro Tag (nach Channel)
- Login Conversions (PID Score Change)
- Tool Usage Verteilung (Configurator, Dealer, Service)
- Cost per Session Trend

---

## 5. Infrastructure as Code für H2A {#5-iac}

### 5.1 Supabase Edge Functions

H2A nutzt Supabase Edge Functions für serverless Backend-Logik:

```typescript
// supabase/functions/h2a-chat/index.ts
import { serve } from 'https://deno.land/std/http/server.ts';
import { createClient } from '@supabase/supabase-js';

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
  );
  
  // SSE für Streaming
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  
  // ... Chat-Logik
  
  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
});
```

**Deployment:**
```bash
# Lokale Entwicklung
supabase functions serve h2a-chat --env-file .env.local

# Deployment (CI/CD)
supabase functions deploy h2a-chat --project-ref $SUPABASE_PROJECT_ID
```

### 5.2 Secrets Management mit Doppler

**Regel: KEINE .env Dateien. NIEMALS. Alles über Doppler.**

```bash
# Doppler Projekt-Struktur
doppler projects
# → h2a-protocol/dev
# → h2a-protocol/staging
# → h2a-protocol/prod

# Secrets abrufen
doppler secrets --project h2a-protocol --config prod

# In CI/CD
doppler run --project h2a-protocol --config staging -- npm run deploy
```

**Secrets-Hierarchie:**
```
h2a-protocol/
├── dev/
│   ├── NEXUS_API_KEY          # Dev Nexus Key
│   ├── SUPABASE_URL           # Dev Supabase
│   ├── LANGFUSE_PUBLIC_KEY    # Dev Langfuse
│   └── LANGFUSE_SECRET_KEY    # Dev Langfuse
├── staging/
│   ├── NEXUS_API_KEY          # Staging Nexus Key
│   └── ...
└── prod/
    ├── NEXUS_API_KEY          # Prod Nexus Key
    └── ...
```

### 5.3 Environment-Strategie

| Environment | Zweck | Modell | Daten | Zugang |
|-------------|-------|--------|-------|--------|
| **dev** | Lokale Entwicklung | claude-haiku-4-5 | Mock/Seed | Developer |
| **staging** | Integration Testing | claude-sonnet-4-6 | Anonymisiert | Team |
| **canary** | 5% Production | claude-sonnet-4-6 | Real | Auto |
| **prod** | 100% Production | claude-sonnet-4-6 | Real | Alle |

### 5.4 Docker Multi-Stage Build

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --production=false
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS production
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Keine .env Datei! Secrets kommen von Doppler
ENV NODE_ENV=production

EXPOSE 3000
CMD ["node", "dist/server.js"]
```

### 5.5 GCP Cloud Build Pipeline

Basierend auf dem Star Assist Deployment-Pattern:

```yaml
# cloudbuild.yaml
steps:
  # Step 1: Tests
  - name: 'node:20-alpine'
    entrypoint: 'npm'
    args: ['ci']
  - name: 'node:20-alpine'
    entrypoint: 'npm'
    args: ['run', 'test']
  
  # Step 2: Golden Tests (mit Nexus)
  - name: 'node:20-alpine'
    entrypoint: 'npx'
    args: ['promptfoo', 'eval', '-c', 'evals/golden-tests.yaml']
    secretEnv: ['NEXUS_API_KEY']
  
  # Step 3: Build Docker Image
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'gcr.io/$PROJECT_ID/h2a:$SHORT_SHA', '.']
  
  # Step 4: Push
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/$PROJECT_ID/h2a:$SHORT_SHA']
  
  # Step 5: Deploy (mit Health Check)
  - name: 'gcr.io/cloud-builders/gcloud'
    args: ['run', 'deploy', 'h2a', '--image', 'gcr.io/$PROJECT_ID/h2a:$SHORT_SHA', '--region', 'europe-west1']

availableSecrets:
  secretManager:
    - versionName: projects/$PROJECT_ID/secrets/NEXUS_API_KEY/versions/latest
      env: 'NEXUS_API_KEY'
```

---

## 6. Cost Management & Optimization {#6-cost}

### 6.1 Token-Cost-Tracking

```typescript
// Kosten pro Session/User/Feature tracken
interface CostEntry {
  sessionId: string;
  userId?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;          // USD
  feature: string;       // 'chat', 'configurator', 'service'
  timestamp: Date;
}

// Kosten-Berechnung
function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing: Record<string, { input: number; output: number }> = {
    'claude-sonnet-4-6': { input: 3.0 / 1_000_000, output: 15.0 / 1_000_000 },
    'claude-opus-4-6': { input: 15.0 / 1_000_000, output: 75.0 / 1_000_000 },
    'claude-haiku-4-5': { input: 0.80 / 1_000_000, output: 4.0 / 1_000_000 },
  };
  
  const p = pricing[model];
  return inputTokens * p.input + outputTokens * p.output;
}
```

### 6.2 Prompt Caching

Bedrock/Anthropic Prompt Caching reduziert Kosten für wiederkehrende System Prompts:

```typescript
// System Prompt (CCP) wird gecached
const messages = [
  {
    role: 'system',
    content: systemPrompt,
    // Bedrock: automatisch gecached wenn identisch
    // Spart ~90% der Input-Kosten für den System Prompt Teil
  },
  ...conversationHistory,
  { role: 'user', content: userMessage },
];
```

**Einsparung durch Caching:**
- System Prompt: ~2.000 Token → Bei Cache-Hit: 0.1× Kosten
- Bei 100 Sessions/Tag mit identischem System Prompt: ~$15/Tag gespart

### 6.3 Smart Truncation

```typescript
function truncateContext(messages: Message[], maxTokens: number): Message[] {
  const systemPrompt = messages[0]; // Immer behalten
  const lastN = messages.slice(-4);  // Letzte 4 Nachrichten immer behalten
  const middle = messages.slice(1, -4);
  
  // Middle-Nachrichten zusammenfassen wenn zu lang
  if (countTokens(messages) > maxTokens) {
    const summary = await summarize(middle);
    return [systemPrompt, { role: 'system', content: `Bisheriger Gesprächsverlauf: ${summary}` }, ...lastN];
  }
  
  return messages;
}
```

### 6.4 Budget-Alerts und Auto-Throttling

```typescript
const budgetConfig = {
  daily: {
    warning: 200,    // $200/Tag → Alert an PO
    critical: 500,   // $500/Tag → Auto-Throttling
    hardLimit: 1000,  // $1000/Tag → Neues Sessions blockieren
  },
  perSession: {
    softLimit: 2.00,  // $2/Session → Warnung im Log
    hardLimit: 5.00,  // $5/Session → Session beenden
  },
  perUser: {
    daily: 10.00,     // $10/User/Tag → Rate Limiting
    monthly: 100.00,  // $100/User/Monat → Alert
  },
};
```

### 6.5 ROI-Berechnung

```
Investment:
- LLM-Kosten: ~$3.000/Monat (bei 3.000 Sessions/Tag × $0.03/Session)
- Infrastruktur: ~$500/Monat (Supabase, Langfuse, CI/CD)
- Entwicklung: 1 PO × Halbtags = ~$5.000/Monat (anteilig)
TOTAL: ~$8.500/Monat

Return:
- Lead-Generierung: +15% qualifizierte Leads → ~€50.000/Monat (bei 100 Leads × €500 CLV)
- Service-Bindung: +8% Werkstatt-Buchungen → ~€20.000/Monat
- NPS-Verbesserung: +5 NPS Punkte → langfristig €100.000+/Jahr
TOTAL: ~€70.000/Monat

ROI: ~8× (€70.000 / €8.500 = 8.2×)
```

---

## 7. Security in der AI-Pipeline {#7-security}

### 7.1 Prompt Injection Defense

**In der CI/CD Pipeline:**
```yaml
# .github/workflows/security.yml
- name: Prompt Injection Scan
  run: npx promptfoo eval -c evals/red-team.yaml --fail-on-error
  
- name: Check for Secrets in Prompts
  run: |
    # Keine API Keys, Passwörter, oder Connection Strings in Prompt-Dateien
    grep -rn "sk-\|password\|secret\|key=" src/prompts/ && exit 1 || true
```

### 7.2 PII Detection in Logs

```typescript
// PII-Filter für Langfuse Traces
function sanitizeForLogging(content: string): string {
  return content
    .replace(/\b\d{5}\b/g, '[PLZ]')
    .replace(/\b[A-Z]{2}\d{3}[A-Z]{2}\b/g, '[KENNZEICHEN]')
    .replace(/\b\d{2}\.\d{2}\.\d{4}\b/g, '[DATUM]')
    .replace(/\b\w+@\w+\.\w+\b/g, '[EMAIL]')
    .replace(/\b0[1-9]\d{1,4}[\s/-]?\d+\b/g, '[TELEFON]')
    .replace(/\bW[A-Z0-9]{16}\b/g, '[VIN]')
    .replace(/\bDE\d{2}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{2}\b/g, '[IBAN]');
}
```

### 7.3 Rate Limiting

```typescript
// Rate Limiting pro User
const rateLimits = {
  anonymous: {
    requestsPerMinute: 5,
    requestsPerHour: 30,
    tokensPerDay: 50_000,
  },
  identified: {
    requestsPerMinute: 10,
    requestsPerHour: 100,
    tokensPerDay: 200_000,
  },
  premium: {
    requestsPerMinute: 20,
    requestsPerHour: 500,
    tokensPerDay: 1_000_000,
  },
};
```

### 7.4 EU AI Act Compliance

H2A fällt unter den EU AI Act als "Limited Risk" System:

| Anforderung | Umsetzung | Status |
|-------------|-----------|--------|
| **Transparenz:** User muss wissen dass er mit AI spricht | "Ich bin der Mercedes-Benz AI-Assistent" | ✅ |
| **Logging:** AI-Entscheidungen müssen nachvollziehbar sein | Langfuse Traces mit Reasoning | ✅ |
| **Opt-Out:** User muss AI ablehnen können | "Mit einem Menschen sprechen" Button | Geplant |
| **Datenminimierung:** Nur nötige Daten verarbeiten | Consent-basierter Datenzugang | ✅ |
| **Erklärbarkeit:** Warum diese Empfehlung? | Chain-of-Thought in Traces | Geplant |

---

## 8. Die Gurus {#8-gurus}

### 8.1 Chip Huyen — ML Engineering

**Wer:** Stanford Lecturer, Autorin von "Designing Machine Learning Systems" (O'Reilly 2022). Eine der einflussreichsten Stimmen in MLOps.

**Kernthesen:**
1. "ML systems fail in production because of data, not models"
2. "Monitoring is not optional — it's the most important part of ML engineering"
3. "The gap between ML research and ML production is the biggest unsolved problem"

**Huyen's ML System Design:**
- Data → Features → Model → Inference → Monitoring → Feedback → Data (Loop)
- Jede Phase hat eigene Failure Modes
- Monitoring muss ALLE Phasen abdecken

**Für H2A:** Prompt = "Data" in Huyen's Framework. Prompt-Qualität überwachen ist genauso wichtig wie Model-Qualität.

### 8.2 Hamel Husain — LLM Ops Pioneer

**Wer:** Ehemaliger GitHub (Copilot-Team), jetzt unabhängiger Berater für LLM Operations.

**Kernbeiträge:**
- "LLM Testing: The Missing Manual"
- Evaluation-First-Ansatz: "Wenn du nicht messen kannst ob dein Prompt besser wird, ändere ihn nicht"
- Practical LLMOps Blog Series

**Husain's Golden Rules:**
1. Start with 10 eval examples
2. Automate evals in CI/CD
3. Use LLM-as-Judge for soft metrics
4. Track cost per quality unit

### 8.3 Simon Willison — LLM Tooling Guru

**Wer:** Django Co-Creator, Datasette Creator, prolifischer LLM-Blogger.

**Kernbeiträge:**
- `llm` CLI Tool für LLM-Interaktion
- Definitive Erklärung von Prompt Injection
- SQLite-basierte LLM-Workflow-Patterns
- "Things I've learned building with LLMs"

**Willison's Key Insights:**
1. "Prompt injection is not a bug, it's a fundamental limitation"
2. "Log everything. You'll need it when things go wrong."
3. "The simplest monitoring is: read 10 random conversations per day"

### 8.4 Shreya Shankar — Data Quality für ML

**Wer:** Stanford PhD, Forscherin für Data Quality in ML-Pipelines.

**Kernbeitrag:** "Operationalizing Machine Learning" — warum ML-Modelle in Production scheitern.

**Shankar's Insights:**
- Drift Detection ist wichtiger als Model Training
- Schema Enforcement für LLM-Outputs reduziert Produktions-Bugs um 60%
- "Pipeline Debt" ist realer als "Technical Debt"

### 8.5 Maxime Beauchemin — Data Pipeline Architecture

**Wer:** Creator von Apache Airflow und Apache Superset.

**Relevanz für H2A:**
- Airflow-Konzepte (DAGs, Scheduling, Retries) anwendbar auf AI-Pipelines
- "Data pipelines should be idempotent and observable"
- Monitoring-First-Design

---

## 9. Startup-Analyse {#9-startups}

### 9.1 Langfuse (Berlin)

**Was:** Open-Source LLM Observability Platform.
**Stack:** TypeScript, Next.js, PostgreSQL
**Pricing:** Self-hosted (free) oder Cloud ($$$)

**Features für H2A:**
- ✅ Traces, Spans, Generations
- ✅ Prompt Management
- ✅ Scoring & Feedback
- ✅ Datasets für Evaluation
- ✅ Self-hosted möglich (wichtig für MB)

**Empfehlung:** Primäres Observability-Tool für H2A.

### 9.2 Weights & Biases (W&B)

**Was:** ML Experiment Tracking Platform.
**Pricing:** Free tier + Enterprise

**Features:**
- ✅ Experiment Tracking
- ✅ Prompt Versioning
- ✅ Evaluation Tables
- ❌ Nicht LLM-spezifisch (generelles ML)
- ❌ Kein Prompt Management

### 9.3 Modal

**Was:** Serverless GPU Infrastructure.
**Relevanz für H2A:** Wenig direkt (wir nutzen Nexus Gateway), aber relevant für:
- Custom Embedding Models
- Fine-Tuning (wenn nötig)
- Batch Processing (Evaluation Runs)

### 9.4 Replicate

**Was:** Model Deployment as a Service.
**Relevanz:** Gering für H2A (wir nutzen Nexus), aber Konzepte (Model Versioning, API-first) sind anwendbar.

### 9.5 PromptLayer

**Was:** Prompt Management Platform.
**Features:**
- Prompt Versioning
- A/B Testing
- Analytics pro Prompt
- Template Management

**Für H2A:** Langfuse deckt dies bereits ab. PromptLayer nur als Alternative falls Langfuse nicht reicht.

### 9.6 Tool-Empfehlung für H2A

| Kategorie | Primäres Tool | Alternative |
|-----------|--------------|-------------|
| Observability | **Langfuse** (self-hosted) | Datadog LLM |
| Evaluation | **PromptFoo** (CLI) | Braintrust |
| Monitoring | **Grafana** + Prometheus | Datadog |
| Secrets | **Doppler** | GCP Secret Manager |
| CI/CD | **GCP Cloud Build** | GitHub Actions |
| Feature Flags | **LaunchDarkly** / Custom | Flagsmith |
| Cost Tracking | **Custom** (Langfuse Scores) | Helicone |

---

## 10. Konkreter DevOps-Plan für H2A {#10-devops-plan}

### 10.1 Phase 1: Foundation (Woche 1-2)

| Aufgabe | Beschreibung | Verantwortlich |
|---------|-------------|----------------|
| Langfuse Setup | Self-hosted oder Cloud, Projekt-Konfiguration | DevOps Agent |
| Doppler Setup | Projekt h2a-protocol, 3 Environments | DevOps Agent |
| CI/CD Basis | Type Check → Tests → Build → Deploy | DevOps Agent |
| Golden Tests in CI | PromptFoo in CI/CD integrieren | Tester Agent |
| Monitoring Basis | Latenz + Error Rate + Token Usage | DevOps Agent |

### 10.2 Phase 2: Quality (Woche 3-4)

| Aufgabe | Beschreibung | Verantwortlich |
|---------|-------------|----------------|
| Quality Gates | 5 Gates in CI/CD (siehe Pipeline oben) | DevOps Agent |
| Red Team in CI | PromptFoo Red Team bei jedem PR | Tester Agent |
| Hallucination Detection | Fact Verification Pipeline | Coder Agent |
| Langfuse Scoring | Automatische Quality Scores | Coder Agent |
| Cost Tracking | Token-Kosten pro Session/Feature | DevOps Agent |

### 10.3 Phase 3: Operations (Woche 5-6)

| Aufgabe | Beschreibung | Verantwortlich |
|---------|-------------|----------------|
| Alerting | 5 Alert-Regeln (siehe oben) | DevOps Agent |
| Dashboards | 3 Grafana Dashboards | DevOps Agent |
| Canary Deploy | 5% Traffic Split für Prompt-Updates | DevOps Agent |
| Shadow Testing | Neue Versionen parallel testen | DevOps Agent |
| On-Call Runbook | AI-spezifische Incident-Response | PO + DevOps |

### 10.4 Phase 4: Optimization (Woche 7-8)

| Aufgabe | Beschreibung | Verantwortlich |
|---------|-------------|----------------|
| Prompt Caching | Bedrock Caching aktivieren | Coder Agent |
| Smart Truncation | Kontext-Management optimieren | Coder Agent |
| Cost Dashboard | Tageskosten, Trends, Prognosen | DevOps Agent |
| A/B Framework | Feature Flags für Prompt-Varianten | DevOps Agent |
| Auto-Scaling | Load-basiertes Scaling der Edge Functions | DevOps Agent |

### 10.5 On-Call Runbook

```markdown
# H2A AI Incident Response Runbook

## Severity 1: Consent Violation
1. SOFORT: Feature deaktivieren (Feature Flag → off)
2. SOFORT: Security-Team informieren
3. Langfuse Trace des Incidents sichern
4. Root Cause Analysis (welcher Consent wurde verletzt?)
5. Fix + Test + Review + Deploy
6. Post-Incident Report

## Severity 2: Hallucination Spike (>10%)
1. Prompt-Version prüfen (wurde kürzlich geändert?)
2. Wenn ja: Rollback zur vorherigen Version
3. Wenn nein: Nexus Gateway Status prüfen
4. Golden Tests manuell laufen lassen
5. Langfuse Traces der halluzinierten Antworten analysieren
6. Fix identifizieren und deployen

## Severity 3: Model Down / High Error Rate
1. Nexus Gateway Status prüfen
2. Fallback-Modell automatisch aktiv? Wenn nein: manuell aktivieren
3. Bedrock Service Health Dashboard prüfen
4. Wenn Provider-Problem: Warten und Monitoring
5. Wenn eigenes Problem: Logs prüfen, Fix deployen

## Severity 4: High Latency
1. Nexus Gateway Latenz prüfen
2. Supabase Edge Function Latenz prüfen
3. Prompt-Länge prüfen (aufgebläht?)
4. Token-Usage pro Request prüfen
5. Context-Länge optimieren (Smart Truncation)
```

### 10.6 Metriken und Ziele

| Metrik | Phase 1 | Phase 4 | Messung |
|--------|---------|---------|---------|
| Deploy-Frequenz | 1×/Woche | Täglich | Git Tags |
| Lead Time (Code → Prod) | 2 Tage | 4 Stunden | CI/CD Pipeline |
| Mean Time to Recovery | 2 Stunden | 15 Minuten | Incident Logs |
| Change Failure Rate | <20% | <5% | Failed Deploys |
| Uptime | 99% | 99.9% | Monitoring |
| Cost per Session | <$0.10 | <$0.03 | Langfuse |
| Golden Test Pass Rate | >90% | >98% | CI/CD |
| Alert Response Time | <30 min | <5 min | PagerDuty |

---

## Fazit: DevOps für AI ist DevOps + Observability + Quality

Die drei Unterschiede zu klassischem DevOps:

1. **Prompts sind Infrastruktur:** Sie brauchen Versionierung, Review, Rollback und Feature Flags — genau wie Code und Konfiguration.

2. **Non-Determinismus erfordert statistische Monitoring:** Statt "Error oder kein Error" messen wir Distributions — Hallucination Rate, Quality Score, Tone Consistency. Ein einzelner fehlerhafter Request ist kein Incident; ein Trend über 15 Minuten schon.

3. **Cost ist eine First-Class Metric:** Jeder LLM-Call kostet Geld. Cost-Tracking pro Session, pro User, pro Feature ist keine Nice-to-Have sondern Pflicht. Ein Bug der zu einem Prompt-Loop führt kann in einer Stunde mehr kosten als der gesamte Monat.

**Die goldene Regel:** Deploy häufig, monitor intensiv, rollback schnell. Der beste Prompt ist der, den du vor 5 Minuten deployed hast — weil du weißt dass du ihn in 30 Sekunden zurückrollen kannst.

---

*Forschungsstand: September 2026*
*Quellen: Chip Huyen "Designing ML Systems" (2022), Hamel Husain Blog, Simon Willison Blog, Shreya Shankar Publications, Langfuse Documentation, PromptFoo Documentation, Doppler Documentation, GCP Cloud Build Documentation, Bedrock Converse API Reference, EU AI Act Text*
