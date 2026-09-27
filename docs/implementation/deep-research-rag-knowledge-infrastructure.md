# Deep Research: RAG & Knowledge Infrastructure

**IR-8 — Vom Wissen zum Agenten: Vollständige RAG-Implementierung für H2A**

*Basierend auf DR-9 (Enterprise RAG & Knowledge Management, 829 Zeilen) und dem 16-Wochen-Blueprint (IR-6)*

---

## Inhaltsverzeichnis

1. [Executive Summary](#1-executive-summary)
2. [pgvector Setup & Migration](#2-pgvector)
3. [Embedding-Pipeline](#3-embedding)
4. [Hybrid Search Integration](#4-hybrid-search)
5. [reasoning.ts Integration](#5-reasoning)
6. [Data Ingest Pipeline](#6-ingest)
7. [RAGAS Quality Gates](#7-ragas)
8. [Kosten-Modell](#8-kosten)
9. [Implementierungsplan — Sprint-Einordnung](#9-sprint)
10. [Dateien & Änderungen](#10-dateien)
11. [Agent-Team](#11-agent-team)

---

## 1. Executive Summary {#1-executive-summary}

### 1.1 Warum dieses Dokument existiert

DR-9 ist mit 829 Zeilen eines der stärksten Forschungsdokumente der H2A-Doktorarbeit. Es beschreibt Vector Databases, Embedding-Modelle, Hybrid Search, Knowledge Graphs, Chunking-Strategien und Evaluation Frameworks. Aber: **Es gibt kein Implementation-Pendant.**

Das Audit (audit-rag-knowledge-gaps.md) identifiziert 17 Gaps — davon 3 KRITISCH, 5 HOCH. Dieses Dokument schließt alle 17 Gaps mit konkretem Code, SQL-Migrationen, Dateipfaden und Sprint-Zuordnungen.

### 1.2 Was gebaut wird

| Komponente | Beschreibung | Gap-Abdeckung |
|-----------|-------------|---------------|
| pgvector + HNSW | Vector-Erweiterung in Supabase, knowledge_chunks Tabelle | Gap #2 |
| Embedding-Pipeline | Amazon Titan v2 via Bedrock, Parent-Child Chunking | Gap #3, #11 |
| Hybrid Search | Dense (pgvector) + Sparse (BM25) + RRF + Cohere Rerank | Gap #4 |
| reasoning.ts RAG | Domain Classification → Retrieval → Context Injection | Gap #4, #16 |
| Data Ingest | ETL für 5 Wissensdomänen, ~165K Chunks | Gap #9 |
| RAGAS Quality Gates | 4 Metriken als CI/CD Gate, Promptfoo-Integration | Gap #8 |
| Kosten-Modell | Embedding + Reranking + Storage pro Monat | Gap #10 |
| Multi-Market RLS | Markt-Filterung auf knowledge_chunks | Gap #12 |

### 1.3 Was NICHT in diesem Dokument ist

| Feature | Warum nicht | Wann |
|---------|-----------|------|
| Knowledge Graph (Apache AGE) | Phase-3-Feature, erst nach funktionierendem RAG | Monat 5–8 |
| GraphRAG / LightRAG | Braucht funktionierenden Knowledge Graph | Monat 5–8 |
| ColPali (PDF als Bilder) | Phase-3-Optimierung, Text-Extraction reicht für MVP | Monat 5–8 |
| Semantic Caching | Optimierung, nicht MVP-kritisch | Phase 2 Ende |
| Multi-Modal RAG (Bilder) | Braucht Cohere embed-v4 Multi-Modal | Phase 3 |

### 1.4 Architektur-Einordnung

RAG ist ein neues Subsystem innerhalb der bestehenden 7-Schichten-Architektur (Part II, Kapitel 15):

```
Schicht 5 (Orchestrierung):
  reasoning.ts
    → [NEU] retrieveContext()        ← RAG Integration
    → buildNexusRequest()            ← Context Injection
    → processResponse()

Schicht 2 (Persistenz):
  Supabase (PostgreSQL)
    → [NEU] pgvector Extension
    → [NEU] knowledge_chunks Tabelle
    → [NEU] knowledge_parents Tabelle
    → [NEU] knowledge_domains Tabelle
    → [BESTEHEND] 18 Tabellen (RLS)

Schicht 1 (LLM-Gateway):
  Nexus (Bedrock Converse API)
    → [NEU] Amazon Titan v2 Embedding Calls
    → [BESTEHEND] Claude Sonnet/Opus/Haiku
```

---

## 2. pgvector Setup & Migration {#2-pgvector}

### 2.1 Extension aktivieren

Supabase bietet pgvector nativ. Die Extension muss pro Projekt einmalig aktiviert werden:

```sql
-- supabase/migrations/023_enable_pgvector.sql

-- pgvector für Vektor-Operationen
CREATE EXTENSION IF NOT EXISTS vector;

-- pg_trgm für BM25-ähnliche Textsuche (Trigram-basiert)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- unaccent für mehrsprachige Suche (ä→a, é→e)
CREATE EXTENSION IF NOT EXISTS unaccent;
```

### 2.2 knowledge_domains — Wissensdomänen

5 Domänen gemäß DR-9 §11.1:

```sql
-- supabase/migrations/024_knowledge_domains.sql

CREATE TABLE knowledge_domains (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  update_freq TEXT NOT NULL DEFAULT 'weekly',
  source_type TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO knowledge_domains (id, name, description, update_freq, source_type) VALUES
  ('product',  'Produktkatalog',     'Modelle, Varianten, Ausstattung, Preise, Farben',       'weekly',    'api'),
  ('technical','Technische Doku',    'Betriebsanleitungen, Service-Handbücher, Workshops',     'on_release','pdf'),
  ('dealer',   'Händler & Service',  'Händler-DB, Service-Buchung, Werkstatt-Auslastung',     'daily',     'api'),
  ('faq',      'FAQ & Support',      'FAQ Knowledge Base, Troubleshooting',                    'weekly',    'cms'),
  ('legal',    'Rechtsdokumente',    'AGB, Garantie, DSGVO, Nutzungsbedingungen',             'rarely',    'pdf');
```

### 2.3 knowledge_parents — Parent Chunks

Parent Chunks enthalten den vollen Kontext (bis 2000 Tokens). Sie werden dem LLM übergeben, wenn ein Child Chunk gematcht hat:

```sql
-- supabase/migrations/025_knowledge_parents.sql

CREATE TABLE knowledge_parents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id   TEXT NOT NULL REFERENCES knowledge_domains(id),
  source_id   TEXT NOT NULL,
  source_type TEXT NOT NULL,
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  market_code TEXT NOT NULL DEFAULT 'global',
  language    TEXT NOT NULL DEFAULT 'de',
  metadata    JSONB NOT NULL DEFAULT '{}',
  token_count INTEGER NOT NULL DEFAULT 0,
  version     INTEGER NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_parent_source UNIQUE (domain_id, source_id, market_code, version)
);

CREATE INDEX idx_parents_domain ON knowledge_parents(domain_id);
CREATE INDEX idx_parents_market ON knowledge_parents(market_code);
CREATE INDEX idx_parents_source ON knowledge_parents(source_id);
```

### 2.4 knowledge_chunks — Child Chunks + Vektoren

Child Chunks sind klein (200–400 Tokens) für präzises Retrieval. Jeder verweist auf seinen Parent:

```sql
-- supabase/migrations/026_knowledge_chunks.sql

CREATE TABLE knowledge_chunks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id   UUID NOT NULL REFERENCES knowledge_parents(id) ON DELETE CASCADE,
  domain_id   TEXT NOT NULL REFERENCES knowledge_domains(id),
  chunk_index INTEGER NOT NULL,
  content     TEXT NOT NULL,
  embedding   vector(1024) NOT NULL,
  market_code TEXT NOT NULL DEFAULT 'global',
  language    TEXT NOT NULL DEFAULT 'de',
  metadata    JSONB NOT NULL DEFAULT '{}',
  token_count INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_chunk_parent_index UNIQUE (parent_id, chunk_index)
);

-- HNSW Index für schnelle Nearest-Neighbor-Suche
-- ef_construction=128: Höhere Qualität beim Index-Aufbau
-- m=16: 16 Verbindungen pro Knoten (Standard, guter Tradeoff)
CREATE INDEX idx_chunks_embedding ON knowledge_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 128);

-- Compound-Indizes für gefilterte Vektor-Suche
CREATE INDEX idx_chunks_domain ON knowledge_chunks(domain_id);
CREATE INDEX idx_chunks_market ON knowledge_chunks(market_code);
CREATE INDEX idx_chunks_domain_market ON knowledge_chunks(domain_id, market_code);

-- GIN Index für BM25-ähnliche Volltextsuche
CREATE INDEX idx_chunks_content_trgm ON knowledge_chunks USING gin (content gin_trgm_ops);

-- Full-Text-Search Index (tsvector) für deutsche Texte
ALTER TABLE knowledge_chunks ADD COLUMN content_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('german', content)) STORED;
CREATE INDEX idx_chunks_fts ON knowledge_chunks USING gin (content_tsv);
```

### 2.5 Row-Level Security für Markt-Separation

Jeder Markt sieht nur seine eigenen Daten + globale Daten:

```sql
-- supabase/migrations/027_knowledge_rls.sql

ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_parents ENABLE ROW LEVEL SECURITY;

-- Service-Role hat vollen Zugriff (für Ingest-Pipeline)
CREATE POLICY "service_role_full_access" ON knowledge_chunks
  FOR ALL TO service_role USING (true);

CREATE POLICY "service_role_full_access_parents" ON knowledge_parents
  FOR ALL TO service_role USING (true);

-- Authenticated Users sehen nur ihren Markt + Global
CREATE POLICY "market_filtered_read" ON knowledge_chunks
  FOR SELECT TO authenticated
  USING (
    market_code = 'global'
    OR market_code = current_setting('app.market_code', true)
  );

CREATE POLICY "market_filtered_read_parents" ON knowledge_parents
  FOR SELECT TO authenticated
  USING (
    market_code = 'global'
    OR market_code = current_setting('app.market_code', true)
  );
```

### 2.6 Supabase RPC-Funktionen für Hybrid Search

```sql
-- supabase/migrations/028_knowledge_search_functions.sql

-- Hybrid Search: Dense (Vektor) + Sparse (BM25) in einem Call
CREATE OR REPLACE FUNCTION search_knowledge(
  query_embedding vector(1024),
  query_text TEXT,
  target_domains TEXT[] DEFAULT ARRAY['product','technical','dealer','faq','legal'],
  target_market TEXT DEFAULT 'global',
  match_count INTEGER DEFAULT 20,
  dense_weight FLOAT DEFAULT 0.6,
  sparse_weight FLOAT DEFAULT 0.4
)
RETURNS TABLE (
  chunk_id UUID,
  parent_id UUID,
  domain_id TEXT,
  chunk_content TEXT,
  parent_content TEXT,
  parent_title TEXT,
  dense_score FLOAT,
  sparse_score FLOAT,
  hybrid_score FLOAT,
  metadata JSONB
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH dense_results AS (
    SELECT
      c.id AS chunk_id,
      c.parent_id,
      c.domain_id,
      c.content AS chunk_content,
      c.metadata,
      1 - (c.embedding <=> query_embedding) AS score,
      ROW_NUMBER() OVER (ORDER BY c.embedding <=> query_embedding) AS rank
    FROM knowledge_chunks c
    WHERE c.domain_id = ANY(target_domains)
      AND (c.market_code = target_market OR c.market_code = 'global')
    ORDER BY c.embedding <=> query_embedding
    LIMIT match_count
  ),
  sparse_results AS (
    SELECT
      c.id AS chunk_id,
      c.parent_id,
      c.domain_id,
      c.content AS chunk_content,
      c.metadata,
      ts_rank_cd(c.content_tsv, plainto_tsquery('german', query_text)) AS score,
      ROW_NUMBER() OVER (
        ORDER BY ts_rank_cd(c.content_tsv, plainto_tsquery('german', query_text)) DESC
      ) AS rank
    FROM knowledge_chunks c
    WHERE c.domain_id = ANY(target_domains)
      AND (c.market_code = target_market OR c.market_code = 'global')
      AND c.content_tsv @@ plainto_tsquery('german', query_text)
    ORDER BY score DESC
    LIMIT match_count
  ),
  rrf_fusion AS (
    SELECT
      COALESCE(d.chunk_id, s.chunk_id) AS chunk_id,
      COALESCE(d.parent_id, s.parent_id) AS parent_id,
      COALESCE(d.domain_id, s.domain_id) AS domain_id,
      COALESCE(d.chunk_content, s.chunk_content) AS chunk_content,
      COALESCE(d.metadata, s.metadata) AS metadata,
      COALESCE(d.score, 0) AS dense_score,
      COALESCE(s.score, 0) AS sparse_score,
      -- RRF: 1/(k + rank), k=60 (Standard)
      dense_weight * COALESCE(1.0 / (60 + d.rank), 0)
      + sparse_weight * COALESCE(1.0 / (60 + s.rank), 0) AS hybrid_score
    FROM dense_results d
    FULL OUTER JOIN sparse_results s ON d.chunk_id = s.chunk_id
  )
  SELECT
    f.chunk_id,
    f.parent_id,
    f.domain_id,
    f.chunk_content,
    p.content AS parent_content,
    p.title AS parent_title,
    f.dense_score,
    f.sparse_score,
    f.hybrid_score,
    f.metadata
  FROM rrf_fusion f
  JOIN knowledge_parents p ON p.id = f.parent_id
  ORDER BY f.hybrid_score DESC
  LIMIT match_count;
END;
$$;
```

### 2.7 Datenbank-Monitoring-Views

```sql
-- supabase/migrations/029_knowledge_monitoring.sql

-- View: Chunks pro Domain + Markt
CREATE VIEW knowledge_stats AS
SELECT
  d.id AS domain_id,
  d.name AS domain_name,
  c.market_code,
  COUNT(c.id) AS chunk_count,
  COUNT(DISTINCT c.parent_id) AS parent_count,
  AVG(c.token_count)::INTEGER AS avg_tokens,
  MAX(c.created_at) AS last_updated
FROM knowledge_domains d
LEFT JOIN knowledge_chunks c ON c.domain_id = d.id
GROUP BY d.id, d.name, c.market_code
ORDER BY d.id, c.market_code;

-- View: Index Health
CREATE VIEW knowledge_index_health AS
SELECT
  indexname,
  pg_size_pretty(pg_relation_size(indexname::regclass)) AS index_size,
  idx_scan AS scans,
  idx_tup_read AS tuples_read,
  idx_tup_fetch AS tuples_fetched
FROM pg_stat_user_indexes
WHERE tablename = 'knowledge_chunks';
```

---

## 3. Embedding-Pipeline {#3-embedding}

### 3.1 Modell-Entscheidung: Amazon Titan v2

| Kriterium | Cohere embed-v4 | Amazon Titan v2 | Entscheidung |
|-----------|----------------|-----------------|-------------|
| MTEB Score | 0.678 | 0.645 | Cohere besser |
| Cross-Lingual (DE↔EN) | 0.887 | ~0.82 | Cohere besser |
| Latenz/1K Tokens | ~12ms | ~15ms | Ähnlich |
| Kosten/1M Tokens | $0.10 | $0.02 | **Titan 5× günstiger** |
| Infrastruktur | Externer API-Call | **Bedrock-nativ** | Titan einfacher |
| MB-Compliance | Daten an Cohere | **Daten bleiben in AWS** | Titan konformer |

**Entscheidung: Amazon Titan Text Embeddings v2 via Bedrock**

Gründe:
1. **Bedrock-nativ** — Kein zusätzlicher API-Key, keine externe Datenübertragung
2. **5× günstiger** — Bei 500K Chunks und monatlichem Re-Index relevant
3. **MB-Compliance** — Daten bleiben innerhalb der AWS-Infrastruktur hinter dem Nexus Gateway
4. **Ausreichende Qualität** — 0.645 MTEB reicht für den MVP; Upgrade auf Cohere in Phase 3 möglich

### 3.2 Embedding-Client

```typescript
// packages/mb-agent/src/rag/embedding.ts

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'

interface EmbeddingResult {
  embedding: number[]
  inputTokens: number
}

const TITAN_MODEL_ID = 'amazon.titan-embed-text-v2:0'
const EMBEDDING_DIMENSIONS = 1024

export async function embedText(
  text: string,
  client: BedrockRuntimeClient
): Promise<EmbeddingResult> {
  const response = await client.send(new InvokeModelCommand({
    modelId: TITAN_MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      inputText: text,
      dimensions: EMBEDDING_DIMENSIONS,
      normalize: true,
    }),
  }))

  const result = JSON.parse(new TextDecoder().decode(response.body))
  return {
    embedding: result.embedding,
    inputTokens: result.inputTextTokenCount,
  }
}

export async function embedBatch(
  texts: string[],
  client: BedrockRuntimeClient,
  concurrency = 5
): Promise<EmbeddingResult[]> {
  const results: EmbeddingResult[] = []
  for (let i = 0; i < texts.length; i += concurrency) {
    const batch = texts.slice(i, i + concurrency)
    const batchResults = await Promise.all(
      batch.map(text => embedText(text, client))
    )
    results.push(...batchResults)
  }
  return results
}
```

### 3.3 Chunking-Strategie: Parent-Child

Gemäß DR-9 §7.2 — kleine Chunks für Retrieval, große Chunks für LLM-Kontext:

```typescript
// packages/mb-agent/src/rag/chunking.ts

interface ParentChunk {
  content: string
  title: string
  tokenCount: number
  children: ChildChunk[]
}

interface ChildChunk {
  content: string
  chunkIndex: number
  tokenCount: number
}

const PARENT_TARGET_TOKENS = 1500
const CHILD_TARGET_TOKENS = 300
const CHILD_OVERLAP_TOKENS = 50

export function chunkDocument(
  content: string,
  title: string,
  estimateTokens: (text: string) => number
): ParentChunk[] {
  const sections = splitBySections(content)
  const parents: ParentChunk[] = []

  for (const section of sections) {
    const sectionTokens = estimateTokens(section.text)

    if (sectionTokens <= PARENT_TARGET_TOKENS) {
      parents.push(createParent(section.text, section.heading || title, estimateTokens))
    } else {
      const subSections = splitByParagraphs(section.text, PARENT_TARGET_TOKENS, estimateTokens)
      for (const sub of subSections) {
        parents.push(createParent(sub, section.heading || title, estimateTokens))
      }
    }
  }

  return parents
}

function createParent(
  content: string,
  title: string,
  estimateTokens: (text: string) => number
): ParentChunk {
  const sentences = splitBySentences(content)
  const children: ChildChunk[] = []
  let currentChild = ''
  let chunkIndex = 0

  for (const sentence of sentences) {
    const combined = currentChild ? `${currentChild} ${sentence}` : sentence
    if (estimateTokens(combined) > CHILD_TARGET_TOKENS && currentChild) {
      children.push({
        content: currentChild.trim(),
        chunkIndex,
        tokenCount: estimateTokens(currentChild.trim()),
      })
      chunkIndex++
      const overlapSentences = getOverlapSentences(currentChild, CHILD_OVERLAP_TOKENS, estimateTokens)
      currentChild = overlapSentences ? `${overlapSentences} ${sentence}` : sentence
    } else {
      currentChild = combined
    }
  }

  if (currentChild.trim()) {
    children.push({
      content: currentChild.trim(),
      chunkIndex,
      tokenCount: estimateTokens(currentChild.trim()),
    })
  }

  return {
    content,
    title,
    tokenCount: estimateTokens(content),
    children,
  }
}

function splitBySections(text: string): Array<{ heading: string; text: string }> {
  const lines = text.split('\n')
  const sections: Array<{ heading: string; text: string }> = []
  let currentHeading = ''
  let currentText = ''

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)$/)
    if (headingMatch) {
      if (currentText.trim()) {
        sections.push({ heading: currentHeading, text: currentText.trim() })
      }
      currentHeading = headingMatch[1]
      currentText = ''
    } else {
      currentText += line + '\n'
    }
  }

  if (currentText.trim()) {
    sections.push({ heading: currentHeading, text: currentText.trim() })
  }

  return sections
}

function splitBySentences(text: string): string[] {
  return text.match(/[^.!?]+[.!?]+/g) || [text]
}

function splitByParagraphs(
  text: string,
  maxTokens: number,
  estimateTokens: (text: string) => number
): string[] {
  const paragraphs = text.split(/\n\n+/)
  const result: string[] = []
  let current = ''

  for (const para of paragraphs) {
    const combined = current ? `${current}\n\n${para}` : para
    if (estimateTokens(combined) > maxTokens && current) {
      result.push(current.trim())
      current = para
    } else {
      current = combined
    }
  }

  if (current.trim()) {
    result.push(current.trim())
  }

  return result
}

function getOverlapSentences(
  text: string,
  targetTokens: number,
  estimateTokens: (text: string) => number
): string {
  const sentences = splitBySentences(text)
  let overlap = ''
  for (let i = sentences.length - 1; i >= 0; i--) {
    const candidate = sentences[i] + (overlap ? ' ' + overlap : '')
    if (estimateTokens(candidate) > targetTokens) break
    overlap = candidate
  }
  return overlap
}
```

### 3.4 Ingest-Prozess

```typescript
// packages/mb-agent/src/rag/ingest.ts

import { SupabaseClient } from '@supabase/supabase-js'
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime'
import { chunkDocument } from './chunking'
import { embedBatch } from './embedding'

interface IngestDocument {
  sourceId: string
  sourceType: string
  domainId: string
  title: string
  content: string
  marketCode: string
  language: string
  metadata: Record<string, unknown>
}

interface IngestResult {
  parentId: string
  childCount: number
  totalTokens: number
}

export async function ingestDocument(
  doc: IngestDocument,
  supabase: SupabaseClient,
  bedrock: BedrockRuntimeClient
): Promise<IngestResult[]> {
  const parents = chunkDocument(doc.content, doc.title, estimateTokens)
  const results: IngestResult[] = []

  for (const parent of parents) {
    const { data: parentRow } = await supabase
      .from('knowledge_parents')
      .upsert({
        domain_id: doc.domainId,
        source_id: doc.sourceId,
        source_type: doc.sourceType,
        title: parent.title,
        content: parent.content,
        market_code: doc.marketCode,
        language: doc.language,
        metadata: doc.metadata,
        token_count: parent.tokenCount,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'domain_id,source_id,market_code,version' })
      .select('id')
      .single()

    if (!parentRow) continue

    const childTexts = parent.children.map(c => c.content)
    const embeddings = await embedBatch(childTexts, bedrock)

    const chunkRows = parent.children.map((child, i) => ({
      parent_id: parentRow.id,
      domain_id: doc.domainId,
      chunk_index: child.chunkIndex,
      content: child.content,
      embedding: JSON.stringify(embeddings[i].embedding),
      market_code: doc.marketCode,
      language: doc.language,
      metadata: doc.metadata,
      token_count: child.tokenCount,
    }))

    await supabase
      .from('knowledge_chunks')
      .upsert(chunkRows, { onConflict: 'parent_id,chunk_index' })

    results.push({
      parentId: parentRow.id,
      childCount: parent.children.length,
      totalTokens: embeddings.reduce((sum, e) => sum + e.inputTokens, 0),
    })
  }

  return results
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5)
}
```

---

## 4. Hybrid Search Integration {#4-hybrid-search}

### 4.1 Search-Pipeline

Der Search-Prozess folgt DR-9 §4 und §12.1:

```
Query → Embed → [Dense + Sparse parallel] → RRF Fusion → Reranking → Top-5 Parents
  20ms     30ms + 10ms parallel        5ms          50ms
  ─────────────────────────────────────────────────────────────
  Gesamt: ~135ms (innerhalb des 500ms Budgets aus DR-9 §12.1)
```

### 4.2 Domain Classification

Nicht jede Frage braucht alle 5 Domänen. Ein Router klassifiziert die Frage:

```typescript
// packages/mb-agent/src/rag/domain-classifier.ts

type DomainId = 'product' | 'technical' | 'dealer' | 'faq' | 'legal'

interface ClassificationResult {
  domains: DomainId[]
  needsRag: boolean
  ragType: 'none' | 'simple' | 'multi_step'
}

const DOMAIN_PATTERNS: Record<DomainId, RegExp[]> = {
  product: [
    /modell|variante|ausstattung|farbe|motor|leistung|reichweite|verbrauch/i,
    /EQ[SABC]|AMG|GLE|GLC|CLA|S-Klasse|E-Klasse|C-Klasse|A-Klasse/i,
    /konfigurator|konfiguration|paket/i,
  ],
  technical: [
    /betriebsanleitung|handbuch|service|wartung|rückruf|workshop/i,
    /reifen|öl|bremse|batterie|laden|ladeanschluss|MBUX/i,
  ],
  dealer: [
    /händler|werkstatt|probefahrt|termin|standort|öffnungszeit/i,
    /service.?buchung|nächste.?filiale/i,
  ],
  faq: [
    /garantie.*frage|wie.*funktioniert|was.*bedeutet|problem.*mit/i,
    /warum|hilfe|support|fehlermeldung/i,
  ],
  legal: [
    /AGB|garantie.?bedingung|nutzung|dsgvo|datenschutz|widerruf/i,
    /recht|gesetz|pflicht|haftung/i,
  ],
}

const NO_RAG_PATTERNS = [
  /hallo|guten tag|tschüss|danke|bitte/i,
  /wer bist du|was kannst du/i,
  /ja|nein|ok|genau/i,
]

export function classifyDomains(query: string): ClassificationResult {
  if (NO_RAG_PATTERNS.some(p => p.test(query))) {
    return { domains: [], needsRag: false, ragType: 'none' }
  }

  const matched: DomainId[] = []
  for (const [domain, patterns] of Object.entries(DOMAIN_PATTERNS)) {
    if (patterns.some(p => p.test(query))) {
      matched.push(domain as DomainId)
    }
  }

  if (matched.length === 0) {
    return { domains: ['faq', 'product'], needsRag: true, ragType: 'simple' }
  }

  return {
    domains: matched,
    needsRag: true,
    ragType: matched.length > 2 ? 'multi_step' : 'simple',
  }
}
```

### 4.3 Search-Orchestrator

```typescript
// packages/mb-agent/src/rag/search.ts

import { SupabaseClient } from '@supabase/supabase-js'
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime'
import { embedText } from './embedding'
import { classifyDomains } from './domain-classifier'

interface SearchResult {
  chunkId: string
  parentId: string
  domainId: string
  chunkContent: string
  parentContent: string
  parentTitle: string
  hybridScore: number
  metadata: Record<string, unknown>
}

interface SearchOptions {
  market: string
  topK?: number
  denseWeight?: number
  sparseWeight?: number
}

export async function searchKnowledge(
  query: string,
  supabase: SupabaseClient,
  bedrock: BedrockRuntimeClient,
  options: SearchOptions
): Promise<SearchResult[]> {
  const classification = classifyDomains(query)
  if (!classification.needsRag) return []

  const { embedding } = await embedText(query, bedrock)

  const { data, error } = await supabase.rpc('search_knowledge', {
    query_embedding: JSON.stringify(embedding),
    query_text: query,
    target_domains: classification.domains,
    target_market: options.market,
    match_count: options.topK ?? 20,
    dense_weight: options.denseWeight ?? 0.6,
    sparse_weight: options.sparseWeight ?? 0.4,
  })

  if (error) throw new Error(`RAG search failed: ${error.message}`)

  return (data || []).map((row: Record<string, unknown>) => ({
    chunkId: row.chunk_id as string,
    parentId: row.parent_id as string,
    domainId: row.domain_id as string,
    chunkContent: row.chunk_content as string,
    parentContent: row.parent_content as string,
    parentTitle: row.parent_title as string,
    hybridScore: row.hybrid_score as number,
    metadata: row.metadata as Record<string, unknown>,
  }))
}
```

### 4.4 Reranking mit Cohere

Nach dem Hybrid Search werden die Top-20 Ergebnisse mit Cohere Rerank v3 auf Top-5 reduziert:

```typescript
// packages/mb-agent/src/rag/rerank.ts

interface RerankResult {
  index: number
  relevanceScore: number
}

const COHERE_RERANK_URL = 'https://api.cohere.com/v2/rerank'

export async function rerankResults(
  query: string,
  documents: string[],
  topN: number = 5,
  cohereApiKey: string
): Promise<RerankResult[]> {
  const response = await fetch(COHERE_RERANK_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cohereApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'rerank-v3.5',
      query,
      documents,
      top_n: topN,
      return_documents: false,
    }),
  })

  if (!response.ok) {
    throw new Error(`Cohere rerank failed: ${response.status}`)
  }

  const data = await response.json()
  return data.results.map((r: { index: number; relevance_score: number }) => ({
    index: r.index,
    relevanceScore: r.relevance_score,
  }))
}
```

---

## 5. reasoning.ts Integration {#5-reasoning}

### 5.1 Wo RAG in der Reasoning Loop sitzt

DR-9 §11.3 und Part II §15.2 definieren den Nachrichtenlebenszyklus. RAG wird **nach** `computeIntelligence()` und **vor** `buildNexusRequest()` aufgerufen:

```
reasoningLoop()
  1. loadContext()              ← BESTEHEND
  2. computeIntelligence()      ← BESTEHEND (CCP, ISP, Memory)
  3. retrieveContext()           ← NEU: RAG
  4. buildNexusRequest()         ← ÄNDERN: RAG-Kontext injizieren
  5. processResponse()           ← BESTEHEND (Tool Loop)
  6. persistTurn()               ← BESTEHEND
```

### 5.2 retrieveContext() — Neue Funktion

```typescript
// packages/mb-agent/src/rag/retrieve-context.ts

import { SupabaseClient } from '@supabase/supabase-js'
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime'
import { searchKnowledge, SearchResult } from './search'
import { rerankResults } from './rerank'

interface RetrievedContext {
  chunks: RetrievedChunk[]
  totalTokens: number
  domainsSearched: string[]
  searchLatencyMs: number
}

interface RetrievedChunk {
  parentTitle: string
  parentContent: string
  domainId: string
  relevanceScore: number
}

const MAX_CONTEXT_TOKENS = 4000
const RERANK_TOP_N = 5

export async function retrieveContext(
  query: string,
  market: string,
  supabase: SupabaseClient,
  bedrock: BedrockRuntimeClient,
  cohereApiKey: string
): Promise<RetrievedContext> {
  const start = Date.now()

  const searchResults = await searchKnowledge(query, supabase, bedrock, {
    market,
    topK: 20,
  })

  if (searchResults.length === 0) {
    return {
      chunks: [],
      totalTokens: 0,
      domainsSearched: [],
      searchLatencyMs: Date.now() - start,
    }
  }

  const reranked = await rerankResults(
    query,
    searchResults.map(r => r.chunkContent),
    RERANK_TOP_N,
    cohereApiKey
  )

  const chunks: RetrievedChunk[] = []
  let totalTokens = 0
  const domainsSearched = new Set<string>()

  for (const ranked of reranked) {
    const original = searchResults[ranked.index]
    const parentTokens = Math.ceil(original.parentContent.length / 3.5)

    if (totalTokens + parentTokens > MAX_CONTEXT_TOKENS) break

    chunks.push({
      parentTitle: original.parentTitle,
      parentContent: original.parentContent,
      domainId: original.domainId,
      relevanceScore: ranked.relevanceScore,
    })

    totalTokens += parentTokens
    domainsSearched.add(original.domainId)
  }

  return {
    chunks,
    totalTokens,
    domainsSearched: Array.from(domainsSearched),
    searchLatencyMs: Date.now() - start,
  }
}
```

### 5.3 Context Injection in buildNexusRequest()

Der abgerufene RAG-Kontext wird als eigener Block im System-Prompt eingefügt — **nach** dem CCP-Persönlichkeits-Prompt und **vor** den Tool-Definitionen:

```typescript
// Änderung in packages/mb-agent/src/reasoning.ts

function buildSystemPromptWithRag(
  ccpPrompt: string,
  ragContext: RetrievedContext
): string {
  if (ragContext.chunks.length === 0) return ccpPrompt

  const ragSection = ragContext.chunks.map(chunk => {
    const domainLabel = DOMAIN_LABELS[chunk.domainId] || chunk.domainId
    return `### ${chunk.parentTitle} [${domainLabel}]\n${chunk.parentContent}`
  }).join('\n\n')

  return `${ccpPrompt}

## Relevante Informationen aus der Mercedes-Benz Wissensdatenbank

Die folgenden Informationen wurden basierend auf der Kundenfrage abgerufen. Nutze sie für deine Antwort. Wenn die Informationen die Frage nicht beantworten, sage es ehrlich.

${ragSection}

WICHTIG: Antworte NUR auf Basis der obigen Informationen und deines Wissens. Erfinde KEINE Preise, Spezifikationen oder Verfügbarkeiten.`
}

const DOMAIN_LABELS: Record<string, string> = {
  product: 'Produktkatalog',
  technical: 'Technische Dokumentation',
  dealer: 'Händler & Service',
  faq: 'FAQ',
  legal: 'Rechtliches',
}
```

### 5.4 Self-RAG Routing (Gap #16)

Der Multi-Model-Router (router.ts aus IR-6) wird um eine RAG-Entscheidung erweitert:

```typescript
// Erweiterung in packages/mb-agent/src/router.ts

interface RoutingDecision {
  model: 'claude-opus-4-6' | 'claude-sonnet-5' | 'claude-haiku-4-5'
  useRag: boolean
  ragType: 'none' | 'simple' | 'multi_step'
  reason: string
}

export function routeRequest(
  message: string,
  ctx: CustomerContext
): RoutingDecision {
  const ragClassification = classifyDomains(message)

  if (!ragClassification.needsRag) {
    return {
      model: 'claude-haiku-4-5',
      useRag: false,
      ragType: 'none',
      reason: 'Greeting/simple question — no RAG needed',
    }
  }

  if (ragClassification.ragType === 'multi_step') {
    return {
      model: 'claude-sonnet-5',
      useRag: true,
      ragType: 'multi_step',
      reason: 'Complex multi-domain question — Sonnet + Multi-Step RAG',
    }
  }

  return {
    model: 'claude-sonnet-5',
    useRag: true,
    ragType: 'simple',
    reason: 'Standard factual question — Sonnet + Simple RAG',
  }
}
```

### 5.5 Geänderter reasoningLoop()

```typescript
// packages/mb-agent/src/reasoning.ts — Geänderter Ablauf (Pseudocode)

async function reasoningLoop(message: string, session: Session) {
  // 1. BESTEHEND: Kontext laden
  const context = await loadContext(session)

  // 2. BESTEHEND: Intelligenz berechnen (CCP, ISP, Memory)
  const intelligence = await computeIntelligence(context, session)

  // 3. NEU: Routing-Entscheidung (Modell + RAG)
  const routing = routeRequest(message, context)

  // 4. NEU: RAG Retrieval (wenn nötig)
  let ragContext: RetrievedContext = { chunks: [], totalTokens: 0, domainsSearched: [], searchLatencyMs: 0 }
  if (routing.useRag) {
    ragContext = await retrieveContext(
      message,
      context.market,
      supabase,
      bedrock,
      config.cohereApiKey
    )
  }

  // 5. GEÄNDERT: System-Prompt mit RAG-Kontext bauen
  const systemPrompt = buildSystemPromptWithRag(
    intelligence.systemPrompt,
    ragContext
  )

  // 6. BESTEHEND (+ model aus Routing): Nexus Request
  const nexusRequest = buildNexusRequest({
    systemPrompt,
    messages: session.history,
    tools: getAvailableTools(context),
    model: routing.model,
  })

  // 7. BESTEHEND: Response verarbeiten (Tool Loop)
  const response = await processResponse(nexusRequest)

  // 8. BESTEHEND: Persistieren
  await persistTurn(session, message, response, {
    ragChunks: ragContext.chunks.length,
    ragDomains: ragContext.domainsSearched,
    ragLatencyMs: ragContext.searchLatencyMs,
    ragTokens: ragContext.totalTokens,
    model: routing.model,
  })
}
```

---

## 6. Data Ingest Pipeline {#6-ingest}

### 6.1 Die 5 Wissensdomänen im Detail

| Domäne | Chunks | Quell-System | Format | Update-Frequenz | Ingest-Strategie |
|--------|--------|-------------|--------|-----------------|------------------|
| **Produktkatalog** | ~30.000 | MB Produkt-API (VAIS) | JSON | Wöchentlich | API-Pull → Transform → Embed |
| **Technische Doku** | ~100.000 | MB DMS / Xentry | PDF, HTML | Bei Model-Release | PDF-Parse → Chunk → Embed |
| **Händler & Service** | ~20.000 | MB Dealer Locator API | JSON | Täglich | API-Pull → Geo-Enrich → Embed |
| **FAQ & Support** | ~10.000 | MB FAQ CMS (Contentful) | JSON/MD | Wöchentlich | CMS-Export → Transform → Embed |
| **Rechtsdokumente** | ~5.000 | MB Legal / DMS | PDF | Selten | PDF-Parse → Chunk → Embed |

**Gesamt: ~165.000 Chunks, ~500.000 Vektoren (mit Parent-Child)**

### 6.2 Produktkatalog-Ingest

```typescript
// packages/mb-agent/src/rag/ingest/product-ingest.ts

interface VehicleData {
  modelCode: string
  modelName: string
  variant: string
  year: number
  market: string
  specs: Record<string, string>
  equipment: Array<{ code: string; name: string; price: number; required?: string[] }>
  price: { base: number; currency: string }
}

export async function ingestProductCatalog(
  vehicles: VehicleData[],
  supabase: SupabaseClient,
  bedrock: BedrockRuntimeClient
): Promise<{ ingested: number; errors: number }> {
  let ingested = 0
  let errors = 0

  for (const vehicle of vehicles) {
    const content = formatVehicleDocument(vehicle)

    try {
      await ingestDocument({
        sourceId: `${vehicle.modelCode}_${vehicle.variant}_${vehicle.market}`,
        sourceType: 'vehicle_catalog',
        domainId: 'product',
        title: `${vehicle.modelName} ${vehicle.variant} (${vehicle.year}) — ${vehicle.market}`,
        content,
        marketCode: vehicle.market,
        language: MARKET_LANGUAGE[vehicle.market] || 'de',
        metadata: {
          modelCode: vehicle.modelCode,
          variant: vehicle.variant,
          year: vehicle.year,
          basePrice: vehicle.price.base,
          currency: vehicle.price.currency,
        },
      }, supabase, bedrock)
      ingested++
    } catch (err) {
      errors++
    }
  }

  return { ingested, errors }
}

function formatVehicleDocument(v: VehicleData): string {
  const specs = Object.entries(v.specs)
    .map(([key, val]) => `- ${key}: ${val}`)
    .join('\n')

  const equipment = v.equipment
    .map(e => {
      const deps = e.required ? ` (erfordert: ${e.required.join(', ')})` : ''
      return `- ${e.name} (${e.code}): ${e.price} ${v.price.currency}${deps}`
    })
    .join('\n')

  return `# ${v.modelName} ${v.variant}

## Technische Daten
${specs}

## Grundpreis
${v.price.base} ${v.price.currency} (UPE inkl. MwSt., ${v.market})

## Sonderausstattung
${equipment}`
}

const MARKET_LANGUAGE: Record<string, string> = {
  AT: 'de', DE: 'de', CH: 'de',
  FR: 'fr', IT: 'it', ES: 'es',
  GB: 'en', US: 'en',
}
```

### 6.3 Technische Dokumentation (PDF-Ingest)

```typescript
// packages/mb-agent/src/rag/ingest/technical-ingest.ts

interface PdfDocument {
  filePath: string
  modelCode: string
  docType: 'manual' | 'service_handbook' | 'workshop'
  market: string
  language: string
}

export async function ingestTechnicalPdf(
  pdf: PdfDocument,
  supabase: SupabaseClient,
  bedrock: BedrockRuntimeClient
): Promise<{ pages: number; chunks: number }> {
  const text = await extractTextFromPdf(pdf.filePath)
  const sections = splitByHeadings(text)

  let totalChunks = 0
  for (const section of sections) {
    const results = await ingestDocument({
      sourceId: `${pdf.modelCode}_${pdf.docType}_${section.heading}`,
      sourceType: pdf.docType,
      domainId: 'technical',
      title: `${pdf.modelCode} — ${section.heading}`,
      content: section.content,
      marketCode: pdf.market,
      language: pdf.language,
      metadata: {
        modelCode: pdf.modelCode,
        docType: pdf.docType,
        pageRange: section.pageRange,
      },
    }, supabase, bedrock)
    totalChunks += results.reduce((sum, r) => sum + r.childCount, 0)
  }

  return { pages: sections.length, chunks: totalChunks }
}

async function extractTextFromPdf(filePath: string): Promise<string> {
  // pdf-parse oder pdf2json — Implementierungsdetail
  // Für Phase 3: ColPali als Alternative für Layout-bewusste Extraktion
  const { default: pdfParse } = await import('pdf-parse')
  const fs = await import('fs')
  const buffer = fs.readFileSync(filePath)
  const data = await pdfParse(buffer)
  return data.text
}

function splitByHeadings(text: string): Array<{ heading: string; content: string; pageRange: string }> {
  const sections: Array<{ heading: string; content: string; pageRange: string }> = []
  const lines = text.split('\n')
  let currentHeading = 'Einleitung'
  let currentContent = ''
  let startPage = 1
  let currentPage = 1

  for (const line of lines) {
    if (line.match(/^\f/)) currentPage++

    const headingMatch = line.match(/^(?:\d+\.)+\s+(.+)$/)
    if (headingMatch) {
      if (currentContent.trim()) {
        sections.push({
          heading: currentHeading,
          content: currentContent.trim(),
          pageRange: `${startPage}-${currentPage}`,
        })
      }
      currentHeading = headingMatch[1]
      currentContent = ''
      startPage = currentPage
    } else {
      currentContent += line + '\n'
    }
  }

  if (currentContent.trim()) {
    sections.push({
      heading: currentHeading,
      content: currentContent.trim(),
      pageRange: `${startPage}-${currentPage}`,
    })
  }

  return sections
}
```

### 6.4 Ingest-Orchestrator (Supabase Edge Function)

```typescript
// supabase/functions/knowledge-ingest/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const { domain, action, options } = await req.json()

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  switch (action) {
    case 'ingest':
      return await handleIngest(domain, options, supabase)
    case 'status':
      return await handleStatus(domain, supabase)
    case 'reindex':
      return await handleReindex(domain, options, supabase)
    default:
      return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400 })
  }
})

async function handleStatus(domain: string, supabase: SupabaseClient) {
  const { data } = await supabase
    .from('knowledge_stats')
    .select('*')
    .eq('domain_id', domain)

  return new Response(JSON.stringify({ domain, stats: data }))
}

async function handleReindex(
  domain: string,
  options: { market?: string },
  supabase: SupabaseClient
) {
  // Lösche alte Chunks und re-embedd alle Parents
  const { count } = await supabase
    .from('knowledge_chunks')
    .delete()
    .eq('domain_id', domain)
    .eq('market_code', options.market || 'global')

  return new Response(JSON.stringify({
    domain,
    deleted: count,
    message: 'Re-ingest required. Run ingest action to rebuild.',
  }))
}
```

### 6.5 Update-Strategie

| Domäne | Strategie | Implementierung |
|--------|-----------|----------------|
| **Produktkatalog** | Inkrementell — nur geänderte Modelle | Version-Column in knowledge_parents; alte Version löschen nach erfolgreichem Ingest |
| **Technische Doku** | Full Replace bei neuem Release | Domain + modelCode löschen → komplett neu ingestieren |
| **Händler** | Inkrementell — nur geänderte Einträge | Last-Modified-Header der API nutzen; nur Deltas ingestieren |
| **FAQ** | Full Replace wöchentlich | FAQ-Corpus ist klein (~10K) — komplett ersetzen ist schneller als Delta |
| **Recht** | Manueller Trigger | Änderungen selten; Legal-Team triggert Ingest manuell |

---

## 7. RAGAS Quality Gates {#7-ragas}

### 7.1 Die 4 Metriken

Gemäß DR-9 §9.1 mit H2A-spezifischen Schwellwerten:

| Metrik | Was wird gemessen | Schwellwert | Gate-Typ |
|--------|------------------|-------------|----------|
| **Faithfulness** | Antwort durch Quellen gedeckt? | ≥ 0.90 | BLOCKER |
| **Answer Relevancy** | Antwort beantwortet die Frage? | ≥ 0.80 | BLOCKER |
| **Context Precision** | Top-K Chunks sind relevant? | ≥ 0.65 | WARNING |
| **Context Recall** | Chunks decken alle Fakten ab? | ≥ 0.85 | WARNING |

**BLOCKER** = Deploy wird gestoppt.
**WARNING** = Deploy geht durch, aber Alert wird ausgelöst.

### 7.2 Golden Dataset

```typescript
// tests/rag/golden-dataset.ts

interface GoldenEntry {
  id: string
  question: string
  expectedAnswer: string
  expectedSources: string[]
  market: string
  domain: string
  category: 'pricing' | 'specs' | 'availability' | 'service' | 'config' | 'general'
}

export const GOLDEN_DATASET: GoldenEntry[] = [
  {
    id: 'pricing-001',
    question: 'Was kostet der EQS 450+ in Österreich?',
    expectedAnswer: 'Ab €109.550,- (UPE inkl. MwSt., Österreich)',
    expectedSources: ['preisliste_eqs_2026_at'],
    market: 'AT',
    domain: 'product',
    category: 'pricing',
  },
  {
    id: 'specs-001',
    question: 'Wie viel Reichweite hat der EQS 450+?',
    expectedAnswer: '568 km nach WLTP',
    expectedSources: ['eqs_450_datenblatt'],
    market: 'global',
    domain: 'product',
    category: 'specs',
  },
  {
    id: 'config-001',
    question: 'Was brauche ich für das MBUX Hyperscreen im EQS?',
    expectedAnswer: 'Energizing Comfort Paket und Burmester 4D Surround-Soundsystem',
    expectedSources: ['eqs_ausstattung', 'eqs_konfigurator'],
    market: 'global',
    domain: 'product',
    category: 'config',
  },
  {
    id: 'service-001',
    question: 'Wo ist der nächste Mercedes-Händler in Wien?',
    expectedAnswer: 'Enthält Händlernamen und Adresse in Wien',
    expectedSources: ['dealer_vienna'],
    market: 'AT',
    domain: 'dealer',
    category: 'availability',
  },
  // ... weitere 96 Einträge bis 100 für den MVP
]
```

### 7.3 RAGAS Evaluation Script

```typescript
// tests/rag/ragas-eval.ts

import { retrieveContext } from '../../src/rag/retrieve-context'
import { GOLDEN_DATASET } from './golden-dataset'

interface RagasScore {
  faithfulness: number
  answerRelevancy: number
  contextPrecision: number
  contextRecall: number
}

interface EvalResult {
  id: string
  question: string
  scores: RagasScore
  passed: boolean
  failures: string[]
}

const THRESHOLDS = {
  faithfulness: 0.90,
  answerRelevancy: 0.80,
  contextPrecision: 0.65,
  contextRecall: 0.85,
}

export async function runRagasEval(): Promise<{
  results: EvalResult[]
  summary: RagasScore
  passRate: number
}> {
  const results: EvalResult[] = []

  for (const entry of GOLDEN_DATASET) {
    const ragContext = await retrieveContext(
      entry.question,
      entry.market,
      supabase,
      bedrock,
      config.cohereApiKey
    )

    const scores = await computeRagasScores(entry, ragContext)
    const failures: string[] = []

    if (scores.faithfulness < THRESHOLDS.faithfulness) {
      failures.push(`faithfulness: ${scores.faithfulness.toFixed(3)} < ${THRESHOLDS.faithfulness}`)
    }
    if (scores.answerRelevancy < THRESHOLDS.answerRelevancy) {
      failures.push(`answerRelevancy: ${scores.answerRelevancy.toFixed(3)} < ${THRESHOLDS.answerRelevancy}`)
    }

    results.push({
      id: entry.id,
      question: entry.question,
      scores,
      passed: failures.length === 0,
      failures,
    })
  }

  const summary: RagasScore = {
    faithfulness: avg(results.map(r => r.scores.faithfulness)),
    answerRelevancy: avg(results.map(r => r.scores.answerRelevancy)),
    contextPrecision: avg(results.map(r => r.scores.contextPrecision)),
    contextRecall: avg(results.map(r => r.scores.contextRecall)),
  }

  return {
    results,
    summary,
    passRate: results.filter(r => r.passed).length / results.length,
  }
}

function avg(numbers: number[]): number {
  return numbers.reduce((a, b) => a + b, 0) / numbers.length
}
```

### 7.4 Promptfoo-Integration

```yaml
# tests/rag/promptfoo-rag.yaml
# Promptfoo Config für automatisierte RAG-Evaluation

description: "H2A RAG Quality Gate"

providers:
  - id: h2a-rag-provider
    config:
      apiBaseUrl: "http://localhost:54321/functions/v1/h2a-stream"

prompts:
  - "{{question}}"

tests:
  - vars:
      question: "Was kostet der EQS 450+ in Österreich?"
    assert:
      - type: contains
        value: "109.550"
      - type: llm-rubric
        value: "Die Antwort nennt einen konkreten Preis für den EQS 450+ in Österreich"
      - type: cost
        threshold: 0.02

  - vars:
      question: "Wie viel Reichweite hat der EQS 450+?"
    assert:
      - type: contains
        value: "568"
      - type: llm-rubric
        value: "Die Antwort nennt die WLTP-Reichweite in Kilometern"

  - vars:
      question: "Was brauche ich für das MBUX Hyperscreen?"
    assert:
      - type: llm-rubric
        value: "Die Antwort nennt Voraussetzungen/Abhängigkeiten für das Hyperscreen"
      - type: not-contains
        value: "weiß ich nicht"
```

### 7.5 CI/CD Gate Hook

```bash
#!/bin/bash
# .claude/hooks/ragas-eval-gate.sh
# Läuft vor jedem Deploy / git push auf Branches mit RAG-Änderungen

CHANGED_FILES=$(git diff --cached --name-only)

if echo "$CHANGED_FILES" | grep -q "src/rag/\|knowledge_chunks\|knowledge_parents"; then
  echo "RAG-Dateien geändert — RAGAS Evaluation läuft..."

  RESULT=$(npx tsx tests/rag/ragas-eval.ts 2>&1)
  PASS_RATE=$(echo "$RESULT" | grep "passRate" | awk -F: '{print $2}' | tr -d ' ')

  if (( $(echo "$PASS_RATE < 0.90" | bc -l) )); then
    echo "RAGAS Quality Gate FAILED: Pass Rate ${PASS_RATE} < 0.90"
    echo "Details:"
    echo "$RESULT" | grep "FAILED"
    exit 1
  fi

  echo "RAGAS Quality Gate PASSED: ${PASS_RATE}"
fi
```

### 7.6 H2A-spezifische Zusatzmetriken

Zusätzlich zu RAGAS (gemäß DR-9 §9.2):

| Metrik | Prüfung | Automatisierbar |
|--------|---------|-----------------|
| **Price Accuracy** | Preis in Antwort vs. Preis in knowledge_parents.metadata.basePrice | Ja (Regex + DB-Lookup) |
| **Spec Accuracy** | Technische Daten in Antwort vs. Datenblatt-Werte | Ja (Named Entity + DB) |
| **Market Correctness** | AT-Frage → AT-Preis (nicht DE-Preis) | Ja (Market-Code-Check) |
| **Freshness** | Quell-Dokument nicht älter als 30 Tage | Ja (Timestamp-Check) |
| **Hallucination Detection** | LLM-basiert: Behauptungen in Antwort vs. Quellen | Semi (LLM-Rubric) |

---

## 8. Kosten-Modell {#8-kosten}

### 8.1 Embedding-Kosten

```
Amazon Titan Text Embeddings v2:
  Preis: $0.02 / 1M Input Tokens

Initialer Ingest (165K Chunks):
  Durchschnitt 300 Tokens/Chunk → 49.5M Tokens
  Kosten: 49.5 × $0.02 = $0.99

Monatlicher Re-Index (10% der Chunks ändern sich):
  16.5K Chunks × 300 Tokens = 4.95M Tokens
  Kosten: 4.95 × $0.02 = $0.10/Monat

Query-Embeddings (10K Sessions/Tag × 3 RAG-Queries/Session):
  30K Queries/Tag × 50 Tokens/Query = 1.5M Tokens/Tag
  Kosten: 1.5 × $0.02 × 30 = $0.90/Monat
```

### 8.2 Reranking-Kosten (Cohere)

```
Cohere Rerank v3.5:
  Preis: $2.00 / 1000 Searches (bis 100 Docs pro Search)

Pro Tag (10K Sessions × 3 Queries = 30K Searches):
  30K / 1000 × $2.00 = $60/Tag

Pro Monat:
  $60 × 30 = $1.800/Monat
```

### 8.3 Storage-Kosten (Supabase)

```
pgvector Speicher:
  500K Vektoren × 1024 Dimensionen × 4 Bytes = ~2 GB Vektordaten
  HNSW Index: ~3× Vektorgröße = ~6 GB
  Text-Content + Metadata: ~1 GB
  Gesamt: ~9 GB

Supabase Pro ($25/Monat):
  8 GB Datenbank inklusive → Knapp ausreichend für MVP
  Supabase Pro Add-on Storage: $0.125/GB → 1 GB extra = $0.125/Monat
  
  Alternativ: Upgrade auf Team ($599/Monat) — für Production empfohlen
```

### 8.4 Gesamtkosten RAG-Subsystem

| Position | Einmalig | Monatlich (10K Sessions/Tag) |
|----------|---------|------------------------------|
| Initialer Ingest (Embedding) | $0.99 | — |
| Monatlicher Re-Index | — | $0.10 |
| Query-Embeddings | — | $0.90 |
| Cohere Reranking | — | $1.800 |
| Supabase Storage (Delta) | — | $0.13 |
| **Gesamt RAG** | **~$1** | **~$1.801/Monat** |

### 8.5 Kostenoptimierung

| Optimierung | Ersparnis | Phase |
|-------------|----------|-------|
| Semantic Caching (~30% Cache-Hit) | -$540/Monat Reranking | Phase 2 Ende |
| Domain-Routing (nur 1-2 statt alle 5 Domänen) | -30% Retrieval-Kosten | Sofort (implementiert) |
| BGE Reranker v2 (Self-hosted statt Cohere) | -$1.800/Monat | Phase 3 |
| Batch-Embedding (statt einzeln) | -20% Embedding-Kosten | Sofort |

### 8.6 Kosten pro Session (mit RAG)

```
Ohne RAG (nur LLM):
  Sonnet: ~$0.005/Session
  
Mit RAG (MVP):
  LLM:       $0.005
  Embedding: $0.00003 (3 Queries × 50 Tokens)
  Reranking: $0.006  (3 Rerank-Calls)
  ─────────────────
  Gesamt:    ~$0.011/Session

RAG-Aufschlag: +$0.006/Session (+120%)
Aber: Antwortqualität steigt massiv (Faithfulness 0.60 → 0.90+)
```

---

## 9. Implementierungsplan — Sprint-Einordnung {#9-sprint}

### 9.1 Einordnung in den 16-Wochen-Plan

RAG gehört in **Phase 2: Intelligence (Wochen 5–8)** des Blueprints (IR-6). Die Memory Extraction (Woche 4) und der Multi-Model-Router (Woche 5–6) sind Voraussetzungen.

**Anpassung des Blueprints:**

| Woche | Original (IR-6) | Angepasst (mit RAG) |
|-------|-----------------|---------------------|
| 5 | Multi-Model Router | Multi-Model Router + RAG-Routing |
| 6 | Router Integration | **pgvector Setup + Embedding-Pipeline** |
| 7 | Nudge Engine | **Hybrid Search + reasoning.ts Integration** |
| 8 | Journey Phase Detection | **Data Ingest + RAGAS Quality Gates** |

**Begründung:** Nudge Engine und Journey Phase Detection werden in Woche 9–10 verschoben (parallel zu WhatsApp). RAG hat höhere Priorität weil:
1. 3 KRITISCHE Gaps aus dem Audit
2. Antwortqualität ohne RAG ist unakzeptabel (Faithfulness ~0.60)
3. Alle anderen Intelligenz-Features (Nudge, Journey) profitieren von RAG-Kontext

### 9.2 Woche 6: pgvector + Embedding-Pipeline

| Tag | Aktivität | Agent-Setup |
|-----|-----------|-------------|
| Mo | Migrationen 023–029 ausführen, pgvector aktivieren | Coder Agent |
| Di | Embedding-Client (Titan v2), Chunking-Strategie | Coder Agent + Tests |
| Mi | Ingest-Pipeline: Produktkatalog (Erster Domäne) | Coder Agent |
| Do | Ingest: 100 Testdokumente, Vektor-Qualität prüfen | Tester Agent |
| Fr | Hybrid Search RPC-Funktion, Smoke-Tests | Coder + Tester parallel |

**Definition of Done Woche 6:**
- [ ] pgvector Extension aktiv in Supabase
- [ ] knowledge_chunks + knowledge_parents Tabellen mit RLS
- [ ] HNSW Index erstellt und funktional
- [ ] 100 Testdokumente erfolgreich eingespeist
- [ ] search_knowledge RPC liefert korrekte Ergebnisse
- [ ] Embedding-Latenz < 20ms/Chunk

### 9.3 Woche 7: Hybrid Search + reasoning.ts

| Tag | Aktivität | Agent-Setup |
|-----|-----------|-------------|
| Mo | Domain Classifier, Search Orchestrator | Coder Agent |
| Di | Cohere Reranking Integration | Coder Agent |
| Mi | retrieveContext() + reasoning.ts Integration | Coder Agent (vorsichtig — Kern-Datei) |
| Do | Golden Dataset (50 Einträge), erste RAGAS-Scores | AI-Engineer + Tester |
| Fr | Tuning: Dense/Sparse Weights, Rerank-Top-N | AI-Engineer Agent |

**Definition of Done Woche 7:**
- [ ] Hybrid Search (Dense + Sparse + RRF) funktional
- [ ] Cohere Reranking integriert
- [ ] reasoning.ts ruft RAG vor LLM-Call auf
- [ ] RAG-Kontext wird korrekt in System-Prompt injiziert
- [ ] Faithfulness ≥ 0.80 auf 50 Golden-Tests
- [ ] Retrieval-Latenz < 200ms P95

### 9.4 Woche 8: Data Ingest + Quality Gates

| Tag | Aktivität | Agent-Setup |
|-----|-----------|-------------|
| Mo | Ingest-Pipelines für alle 5 Domänen | 2x Coder parallel |
| Di | PDF-Parser für Technische Doku | Coder Agent |
| Mi | Vollständiger Ingest: Testdaten für AT-Markt | Ingest-Runner |
| Do | RAGAS Quality Gate in CI/CD, Promptfoo-Config | Tester + DevOps Agent |
| Fr | Golden Dataset auf 100 erweitern, finale Scores | AI-Engineer + Tester |

**Definition of Done Woche 8:**
- [ ] Alle 5 Domänen haben Testdaten
- [ ] RAGAS Faithfulness ≥ 0.90 (BLOCKER-Schwellwert)
- [ ] RAGAS Answer Relevancy ≥ 0.80
- [ ] RAGAS Quality Gate blockiert Deployments bei Verletzung
- [ ] 100 Golden-Test-Einträge vorhanden
- [ ] Ingest-Orchestrator als Edge Function deployed

### 9.5 Geänderter Dependency Graph

```
Phase 1 (Wochen 1-4):      Phase 2 (Wochen 5-8):        Phase 2b (Wochen 9-10):
─────────────────           ─────────────────             ──────────────────────
Tool Adapter (1-2)          Multi-Model Router (5)        Nudge Engine (9)
     │                           │                             │
     ├── Consent (3)             ├── pgvector + Embed (6)      └── Journey Phase (10)
     │                           │
     └── Memory (4)              ├── Hybrid Search +
                                 │   reasoning.ts (7)
                                 │
                                 └── Data Ingest +
                                     RAGAS Gates (8)
```

---

## 10. Dateien & Änderungen {#10-dateien}

### 10.1 Neue Dateien

| Datei | Beschreibung | Woche |
|-------|-------------|-------|
| `supabase/migrations/023_enable_pgvector.sql` | pgvector + pg_trgm Extensions | 6 |
| `supabase/migrations/024_knowledge_domains.sql` | 5 Wissensdomänen | 6 |
| `supabase/migrations/025_knowledge_parents.sql` | Parent-Chunks Tabelle | 6 |
| `supabase/migrations/026_knowledge_chunks.sql` | Child-Chunks + Vektoren + HNSW | 6 |
| `supabase/migrations/027_knowledge_rls.sql` | Row-Level Security per Markt | 6 |
| `supabase/migrations/028_knowledge_search_functions.sql` | Hybrid Search RPC | 6 |
| `supabase/migrations/029_knowledge_monitoring.sql` | Stats + Health Views | 6 |
| `packages/mb-agent/src/rag/embedding.ts` | Titan v2 Embedding Client | 6 |
| `packages/mb-agent/src/rag/chunking.ts` | Parent-Child Chunking | 6 |
| `packages/mb-agent/src/rag/ingest.ts` | Generischer Ingest-Prozess | 6 |
| `packages/mb-agent/src/rag/domain-classifier.ts` | Domain-Routing für Queries | 7 |
| `packages/mb-agent/src/rag/search.ts` | Search-Orchestrator | 7 |
| `packages/mb-agent/src/rag/rerank.ts` | Cohere Rerank Integration | 7 |
| `packages/mb-agent/src/rag/retrieve-context.ts` | Gesamt-Retrieval-Pipeline | 7 |
| `packages/mb-agent/src/rag/ingest/product-ingest.ts` | Produktkatalog ETL | 8 |
| `packages/mb-agent/src/rag/ingest/technical-ingest.ts` | PDF-Parser für Doku | 8 |
| `packages/mb-agent/src/rag/ingest/dealer-ingest.ts` | Händler-Daten ETL | 8 |
| `packages/mb-agent/src/rag/ingest/faq-ingest.ts` | FAQ CMS Export | 8 |
| `packages/mb-agent/src/rag/ingest/legal-ingest.ts` | Rechtsdokumente ETL | 8 |
| `supabase/functions/knowledge-ingest/index.ts` | Ingest Edge Function | 8 |
| `tests/rag/golden-dataset.ts` | 100 Golden-Test-Einträge | 7–8 |
| `tests/rag/ragas-eval.ts` | RAGAS Evaluation Runner | 8 |
| `tests/rag/promptfoo-rag.yaml` | Promptfoo RAG Config | 8 |
| `.claude/hooks/ragas-eval-gate.sh` | CI/CD Quality Gate | 8 |

### 10.2 Geänderte Dateien

| Datei | Änderung | Woche |
|-------|---------|-------|
| `packages/mb-agent/src/reasoning.ts` | retrieveContext() Aufruf + RAG-Context in System-Prompt | 7 |
| `packages/mb-agent/src/router.ts` | RAG-Routing-Entscheidung (useRag, ragType) | 7 |
| `packages/mb-agent/src/nexus.ts` | Titan v2 Embedding Model-ID registrieren | 6 |
| `packages/mb-agent/src/metrics.ts` | RAG-Metriken (Latenz, Chunks, Domains) | 7 |
| `packages/mb-agent/src/tracing.ts` | RAG-Spans in Langfuse Tracing | 8 |

### 10.3 Dateibaum (nur RAG)

```
packages/mb-agent/src/
└── rag/
    ├── embedding.ts           # Titan v2 Client
    ├── chunking.ts            # Parent-Child Strategie
    ├── ingest.ts              # Generischer Ingest
    ├── domain-classifier.ts   # Query → Domänen-Routing
    ├── search.ts              # Hybrid Search Orchestrator
    ├── rerank.ts              # Cohere Reranking
    ├── retrieve-context.ts    # Gesamt-Pipeline
    └── ingest/
        ├── product-ingest.ts  # MB Produkt-API
        ├── technical-ingest.ts # PDF-Parser
        ├── dealer-ingest.ts   # Händler-API
        ├── faq-ingest.ts      # CMS Export
        └── legal-ingest.ts    # Rechtsdokumente

supabase/
├── migrations/
│   ├── 023_enable_pgvector.sql
│   ├── 024_knowledge_domains.sql
│   ├── 025_knowledge_parents.sql
│   ├── 026_knowledge_chunks.sql
│   ├── 027_knowledge_rls.sql
│   ├── 028_knowledge_search_functions.sql
│   └── 029_knowledge_monitoring.sql
└── functions/
    └── knowledge-ingest/
        └── index.ts

tests/rag/
├── golden-dataset.ts
├── ragas-eval.ts
└── promptfoo-rag.yaml

.claude/hooks/
└── ragas-eval-gate.sh
```

---

## 11. Agent-Team {#11-agent-team}

### 11.1 Agent-Zuordnung pro Woche

**Woche 6: pgvector + Embedding**

```
Architect Agent:
  → Reviewt Migrationen 023-029 (Schema-Design, Index-Wahl, RLS)
  → Validiert Titan v2 als Embedding-Modell
  → Prüft HNSW-Parameter (m=16, ef_construction=128)

Coder Agent A (Worktree: rag-infra):
  → Migrationen schreiben und ausführen
  → embedding.ts + chunking.ts implementieren
  → ingest.ts Grundgerüst

Coder Agent B (Worktree: rag-search):
  → search_knowledge RPC Funktion
  → Monitoring Views

Tester Agent:
  → Migration-Smoke-Tests (Extensions aktiv?)
  → Embedding-Qualität: 10 Testdokumente, Cosine-Similarity plausibel?
  → HNSW-Performance: Latenz bei 1K, 10K, 100K Vektoren
```

**Woche 7: Hybrid Search + reasoning.ts**

```
Coder Agent A (Worktree: rag-search):
  → domain-classifier.ts
  → search.ts (Orchestrator)
  → rerank.ts (Cohere Integration)

Coder Agent B (Worktree: rag-integration):
  → retrieve-context.ts
  → reasoning.ts Änderung (VORSICHT: Kern-Datei, /careful Mode)
  → router.ts Erweiterung (RAG-Routing)

AI-Engineer Agent:
  → Golden Dataset erstellen (50 Einträge)
  → Dense/Sparse Weights tunen (0.6/0.4 als Start)
  → Rerank-Top-N optimieren (5 vs. 3 vs. 7)

Tester Agent:
  → Integration-Test: Query → Search → Rerank → Context → LLM → Answer
  → Latenz-Test: P50/P95/P99 des RAG-Pfads
  → Regression: Bestehende Conversations ohne RAG weiterhin OK?
```

**Woche 8: Data Ingest + Quality Gates**

```
Coder Agent A (Worktree: rag-ingest):
  → product-ingest.ts + dealer-ingest.ts
  → faq-ingest.ts + legal-ingest.ts

Coder Agent B (Worktree: rag-ingest-pdf):
  → technical-ingest.ts (PDF-Parser)
  → Edge Function für Ingest-Orchestrierung

AI-Engineer Agent:
  → Golden Dataset auf 100 erweitern
  → RAGAS-Scores berechnen und dokumentieren
  → Promptfoo-Config erstellen

DevOps Agent:
  → ragas-eval-gate.sh Hook konfigurieren
  → Langfuse-Spans für RAG-Metriken
  → Monitoring: knowledge_stats View in Grafana
```

### 11.2 Skill-Nutzung

| Skill | Einsatz |
|-------|---------|
| `/plan-eng-review` | Architektur-Review vor Woche 6 (Schema, Index, Embedding-Wahl) |
| `/careful` | Beim Ändern von reasoning.ts (Kern-Datei, Woche 7) |
| `/qa` | Nach jeder Woche: Funktioniert RAG im Playground? |
| `/review` | Code Review nach Woche 7 (Search-Pipeline) und Woche 8 (Ingest) |
| `/investigate` | Wenn RAGAS-Scores unter Schwellwert — Root Cause finden |
| `/browse` | Browser-Test: Agent-Antworten mit RAG-Kontext im Widget prüfen |

### 11.3 Hooks für RAG-Entwicklung

| Hook | Typ | Prüfung |
|------|-----|---------|
| `ragas-eval-gate.sh` | PreToolUse(git push) | RAGAS Faithfulness ≥ 0.90 bei RAG-Änderungen |
| `nexus-format-check.sh` | PreToolUse(Write) | Bedrock Converse Format in embedding.ts |
| `migration-order-check.sh` | PreToolUse(Write) | Migrationsnummern aufsteigend, keine Lücken |
| `vector-dimension-check.sh` | PreToolUse(Write) | Immer 1024 Dimensionen (Titan v2 Standard) |

---

## Appendix A: Latenz-Budget (Detailliert)

```
RAG-Pfad (Happy Path):

  Domain Classification:   ~2ms   (RegExp, In-Memory)
  Query Embedding:         ~20ms  (Titan v2 via Bedrock)
  Vector Search (HNSW):    ~15ms  (pgvector, 500K Vektoren)
  BM25 Search (tsvector):  ~10ms  (PostgreSQL Full-Text)
  RRF Fusion:              ~3ms   (SQL, In-Memory)
  Cohere Rerank:           ~50ms  (API-Call, EU Region)
  Parent Lookup:           ~5ms   (UUID Join)
  Network Overhead:        ~30ms  (API RTT)
  ─────────────────────────────────
  RAG Total:               ~135ms

  + CCP/ISP/Memory:        ~80ms  (bestehend, parallel)
  + Nexus LLM:             ~1500ms (Sonnet, 500 Token Output)
  + Tool Loop (optional):  ~300ms (pro Runde)
  ═══════════════════════════════
  Gesamt (mit RAG):        ~1715ms (ohne Tool)
  Gesamt (mit RAG + Tool): ~2015ms (1 Tool-Runde)

  Vergleich ohne RAG:      ~1580ms → RAG-Aufschlag: +135ms (8.5%)
```

## Appendix B: Gap-Abdeckungsmatrix

| Gap # | Beschreibung | Abschnitt | Status |
|-------|-------------|-----------|--------|
| 1 | Kein RAG-Implementierungsdokument | Dieses Dokument | GESCHLOSSEN |
| 2 | pgvector + Supabase Infrastruktur | §2 | GESCHLOSSEN |
| 3 | Embedding-Pipeline für Fahrzeugdaten | §3 | GESCHLOSSEN |
| 4 | Hybrid Search in reasoning.ts | §4, §5 | GESCHLOSSEN |
| 5 | Memory Extraction | IR-6 (Woche 4) | GEDECKT (andere Quelle) |
| 6 | Knowledge Graph (Apache AGE) | §1.3 (Phase 3) | GEPLANT |
| 7 | GraphRAG | §1.3 (Phase 3) | GEPLANT |
| 8 | RAGAS Quality Gates in CI/CD | §7 | GESCHLOSSEN |
| 9 | Automotive Knowledge Base Befüllung | §6 | GESCHLOSSEN |
| 10 | Embedding-Modell-Kosten | §8 | GESCHLOSSEN |
| 11 | Parent-Child Chunking | §3.3 | GESCHLOSSEN |
| 12 | Multi-Market-Filterung | §2.5 | GESCHLOSSEN |
| 13 | Semantic Caching | §8.5 (Phase 2 Ende) | GEPLANT |
| 14 | 5 Wissensdomänen-Indizes | §2.2, §4.2 | GESCHLOSSEN |
| 15 | ColPali für Betriebsanleitungen | §1.3 (Phase 3) | GEPLANT |
| 16 | Self-RAG Routing | §5.4 | GESCHLOSSEN |
| 17 | Latenz-Budget RAG | Appendix A | GESCHLOSSEN |

**Ergebnis: 12/17 Gaps GESCHLOSSEN, 1 GEDECKT (andere Quelle), 4 GEPLANT (Phase 3)**

## Appendix C: Referenzen

| Quelle | Beschreibung | Relevante Abschnitte |
|--------|-------------|---------------------|
| DR-9 | Enterprise RAG & Knowledge Management | §2 (pgvector), §3 (Embedding), §4 (Hybrid Search), §7 (Chunking), §9 (RAGAS), §11 (Wissensdomänen), §12 (Latenz) |
| IR-6 | Implementation Blueprint | §3 (Phase 2, Wochen 5–8), §7 (Dependency Graph) |
| Part II | Systemarchitektur | §15 (7-Schichten), §15.2 (Nachrichtenlebenszyklus) |
| Audit | RAG Knowledge Gaps | 17 identifizierte Gaps |
| Gao et al. 2024 | RAG Survey | Faithfulness-Benchmarks |
| Es et al. 2024 | RAGAS Framework | 4 Evaluation-Metriken |

---

*Dieses Dokument ist IR-8 der H2A Implementation-Doktorarbeit. Es schließt die größte Implementierungslücke: RAG fällt nicht mehr durch den 16-Wochen-Plan.*

*"Knowledge is power, but only if you can retrieve it in under 200ms." — H2A Engineering Manifesto*
