# Audit: RAG & Knowledge Systems — Gap-Analyse

**Produkt-Doktorarbeit (WAS) vs. Implementation-Doktorarbeit (WIE)**

| # | Gap / Finding | Quelle (Produkt) | Quelle (Implementation) | Schwere | Empfehlung |
|---|--------------|-------------------|-------------------------|---------|------------|
| 1 | **Kein RAG-Implementierungsdokument** — DR-9 beschreibt 14 Kapitel RAG-Architektur (Vector DB, Embedding, Hybrid Search, GraphRAG, Chunking, Evaluation). Im IR-Index existiert kein IR-Pendant für RAG/Knowledge Systems. | DR-9 (800 Zeilen) | **FEHLT** — kein IR-Dokument | KRITISCH | Neues IR-8: "RAG & Knowledge Infrastructure" erstellen mit konkretem Code-Plan, Dateien, Migrationen |
| 2 | **pgvector + Supabase Infrastruktur** — DR-9 §2 empfiehlt pgvector/HNSW in Supabase. Kein Implementierungsplan: keine Migration, keine Tabellen-Definition, kein Index-Setup. | DR-9 §2.2: "pgvector + Supabase" als Empfehlung | IR-6: Nicht erwähnt, Part IV §28 zeigt 18 Tabellen — **keine davon für Vektoren** | KRITISCH | Migration 020: `CREATE EXTENSION vector; CREATE TABLE knowledge_chunks(...)` mit HNSW Index definieren |
| 3 | **Embedding-Pipeline für Fahrzeugdaten** — DR-9 §3 vergleicht 6 Modelle, empfiehlt Cohere embed-v4 oder Amazon Titan v2. Kein konkreter Ingest-Plan für MB-Produktkatalog. | DR-9 §3.2: Cohere/Titan v2, §11.3: Ingest Pipeline Diagramm | IR-6 §2.1 (Woche 1-2): Nur Tool Adapter, **kein Embedding-Ingest** | HOCH | In Phase 2 (Woche 5-8) Embedding-Pipeline einplanen: MB-API → ETL → Chunking → Embedding → pgvector |
| 4 | **Hybrid Search (Dense+Sparse)** — DR-9 §4 definiert RRF-Fusion, Reranking mit Cohere. Keine Integration in den reasoning.ts Tool Loop. | DR-9 §4.2: RRF, §4.3: Cohere Rerank v3 | IR-6: reasoning.ts Änderungen nur für Tool Adapter + Consent + Memory — **kein RAG-Integration-Schritt** | HOCH | reasoning.ts erweitern: vor LLM-Call → Domain Classification → Parallel Hybrid Search → RRF → Rerank → Context Injection |
| 5 | **Memory Extraction** — Part II §19.7 identifiziert `newMemories: []` als kritische Lücke. Blueprint hat konkreten Plan (Woche 4). | Part II §19.7: 2 Strategien (Post-Turn + Tool-basiert) | IR-6 §2.3 (Woche 4): memory-extractor.ts, Haiku-Call, DoD definiert | GEDECKT | Plan vorhanden. Precision >0.85, Recall >0.70 als Quality Gate im IR-3 verankern |
| 6 | **Knowledge Graph (Apache AGE)** — DR-9 §5 beschreibt ausführlich Automotive KG mit Cypher-Queries. Nur als "Phase 3" ohne Wochen-Plan. | DR-9 §5.3: Vollständiges Schema (7 Node-Typen, 7 Edge-Typen), Cypher-Beispiele | DR-9 §14.3: "Phase 3, Monat 5-8, 15+10 Tage" — **kein IR-Dokument** | MITTEL | In Roadmap als Phase 3 belassen, aber Voraussetzungen (Apache AGE Extension, Schema-Migration) bereits in Phase 1 dokumentieren |
| 7 | **GraphRAG für MB-Produktkatalog** — DR-9 §6 beschreibt Microsofts GraphRAG + LightRAG Alternative. Rein Research, kein Umsetzungsplan. | DR-9 §6.2-6.3: Local vs. Global Questions, LightRAG als leichtgewichtige Alternative | Nicht vorhanden | MITTEL | Als Phase-3-Feature im Blueprint kennzeichnen. LightRAG als bevorzugte Implementierung wegen 50% weniger Token-Verbrauch |
| 8 | **RAGAS Evaluation** — DR-9 §9 definiert 4 Metriken mit H2A-Zielwerten. IR-3 erwähnt RAGAS aber nicht als Quality Gate in CI/CD. | DR-9 §9.1: Faithfulness ≥0.95, Answer Relevancy ≥0.85, Context Precision ≥0.70, Context Recall ≥0.90 | IR-3 §3.1: RAGAS beschrieben, aber **nicht als Gate in CI/CD Pipeline** definiert | HOCH | RAGAS-Metriken als Quality Gate in IR-5 (Hooks) + IR-7 (CI/CD) verankern: `ragas-eval-gate.sh` vor jedem Deploy |
| 9 | **Automotive Knowledge Base Befüllung** — DR-9 §11 zeigt 5 Wissensdomänen mit ~165K Chunks. Keine Datenpipeline für initialen Import. | DR-9 §11.1: 30K Produkt + 100K Technik + 20K Händler + 10K FAQ + 5K Recht | Keine Ingest-Pipeline, kein ETL-Plan, **keine Datenquellen-Anbindung** | KRITISCH | Eigenes Kapitel "Data Ingest Pipeline" mit konkreten MB-API-Endpoints, PDF-Parser-Setup, Update-Frequenzen |
| 10 | **Embedding-Modell-Kosten** — DR-9 §3 vergleicht Modelle. Titan v2 ist Bedrock-nativ (kein externer API-Call), Cohere hat bessere Cross-Lingual-Performance. Keine Kostenrechnung im Blueprint. | DR-9 §3.1-3.2: Titan v2 vs. Cohere embed-v4, Cross-Lingual Benchmarks | IR-6 §1.4: Nur LLM-Kosten (Opus/Sonnet/Haiku), **keine Embedding-Kosten** | MITTEL | Kostenrechnung ergänzen: 500K Vektoren × Embedding-Kosten + monatliche Re-Index-Kosten + Reranking-Kosten |
| 11 | **Parent-Child Chunking** — DR-9 §7.2 empfiehlt Parent-Child für H2A (kleine Chunks retrieven, große an LLM). Kein Code-Plan. | DR-9 §7.2: Detailliertes Beispiel mit EQS-Datenblatt | Nicht vorhanden | HOCH | Chunking-Strategie als konkreten Code-Plan in IR-8 definieren: `chunk_document(doc) → parent_chunks + child_chunks` |
| 12 | **Multi-Market-Filterung** — DR-9 §11.2 zeigt Multi-Index per Domain, Part IV zeigt RLS per Markt. Integration fehlt. | DR-9 §11.2: 5 spezialisierte Indizes; Part IV: RLS auf customer_profiles | IR-6: Keine Erwähnung von Markt-Filterung im RAG-Kontext | MITTEL | RLS-Policies auf knowledge_chunks Tabelle definieren: `market_code` Column + RLS = AT/DE/CH Separation |
| 13 | **Semantic Caching** — DR-9 §12.3 beschreibt Query-Cache mit Cosine Similarity >0.92 + 24h TTL. Kein Implementierungsplan. | DR-9 §12.3: Redis/KV + pgvector Cache-Tabelle | Nicht vorhanden | NIEDRIG | Phase-2-Feature. enrichment_cache Tabelle aus Part IV §28 könnte erweitert werden |
| 14 | **5 Wissensdomänen-Indizes** — DR-9 §11 definiert separate Indizes für Produkt/Technik/Händler/FAQ/Recht. Keine Umsetzung geplant. | DR-9 §11.1-11.2: Multi-Index mit Domain-Router | IR-6: Kein Multi-Index-Plan | HOCH | Domain Classification + Multi-Index als Phase-2-Meilenstein in Blueprint aufnehmen |
| 15 | **ColPali für Betriebsanleitungen** — DR-9 §8.3 empfiehlt ColPali für PDF-Seiten als Bilder. Kein Implementierungsplan. | DR-9 §8.3: Vision-Language-Modell für Dokument-RAG | Nicht vorhanden | NIEDRIG | Phase-3-Feature. Für MVP reicht Text-Extraction aus PDFs |
| 16 | **Self-RAG Routing** — DR-9 §1.3 beschreibt Self-RAG (Agent entscheidet ob RAG nötig). Nicht in reasoning.ts Refactor-Plan. | DR-9 §1.3: Asai et al. 2024, 4 Prüfschritte | IR-6 §3.1 (Woche 5-6): Multi-Model-Routing, aber **kein RAG-Routing** | MITTEL | In Multi-Model-Router (router.ts) auch RAG-Entscheidung integrieren: Direct LLM vs. Simple RAG vs. Multi-Step RAG |
| 17 | **Latenz-Budget RAG** — DR-9 §12.1 definiert <500ms Budget mit Aufschlüsselung. Nicht in Performance-Anforderungen des Blueprints. | DR-9 §12.1: 145ms Gesamt (Embed 20ms + Search 30ms + BM25 10ms + Rerank 50ms) | IR-6: Keine RAG-Latenz-Anforderung | MITTEL | Latenz-Budget in IR-7 (DevOps) als SLO definieren: RAG Retrieval P99 <500ms |

## Zusammenfassung

- **3 KRITISCH**: Kein RAG-IR-Dokument, keine Vector-DB-Migration, keine Ingest-Pipeline
- **5 HOCH**: Kein Hybrid Search in reasoning.ts, kein RAGAS Quality Gate, kein Chunking-Plan, kein Multi-Index-Plan, Embedding-Pipeline fehlt
- **6 MITTEL**: GraphRAG, Self-RAG, Kosten, Multi-Market, Latenz-SLO, Knowledge Graph Vorarbeit
- **2 NIEDRIG**: Semantic Caching, ColPali
- **1 GEDECKT**: Memory Extraction (Woche 4 im Blueprint)

**Haupterkenntnis**: Die Product-Doktorarbeit (DR-9) ist eines der stärksten Dokumente mit 800+ Zeilen konkreter Architektur. Die Implementation-Doktorarbeit hat **kein Pendant** — RAG fällt komplett durch den 16-Wochen-Plan. Das ist die größte einzelne Lücke im gesamten Audit.

**Empfehlung**: Neues IR-8 "RAG & Knowledge Infrastructure" mit:
1. pgvector Migration + Schema
2. Embedding-Pipeline (Titan v2 via Bedrock)
3. Hybrid Search Integration in reasoning.ts
4. Parent-Child Chunking Strategie
5. RAGAS Quality Gates in CI/CD
6. Data Ingest Pipeline für 5 Wissensdomänen
7. Kosten-Modell für Embeddings + Reranking
