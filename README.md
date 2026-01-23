# DocSense

Production-grade RAG system for document intelligence using polyglot services.

## What This Project Is

A reference implementation of Retrieval-Augmented Generation with clear separation between ingestion, retrieval, and generation. Built to demonstrate production patterns: explicit service boundaries, structured data flow, and engineering trade-offs documented in code.

This is not a demo. This is how RAG systems are built when clarity and maintainability matter.

## What This Project Is Not

- A chatbot template
- A minimal viable product
- Production-ready without modifications
- An all-in-one framework

## System Architecture

```mermaid
graph TB
    subgraph "Client Layer"
        Web[React Frontend<br/>TypeScript + Tailwind<br/>:5173]
    end
    
    subgraph "API Gateway Layer"
        API[Go API Service<br/>Gin Framework<br/>:8080]
    end
    
    subgraph "Data Layer"
        PG[(PostgreSQL<br/>Metadata + Chunks<br/>:5432)]
    end
    
    subgraph "RAG Pipeline"
        RAG[Python RAG Service<br/>FastAPI<br/>:8000]
        QD[(Qdrant<br/>Vector Store<br/>:6333)]
    end
    
    subgraph "External Services"
        LLM[OpenAI API<br/>or Compatible]
    end
    
    Web -->|HTTP/REST| API
    API -->|SQL| PG
    API -->|HTTP| RAG
    RAG -->|gRPC| QD
    RAG -->|HTTPS| LLM
    
    classDef client fill:#2c3e50,stroke:#34495e,color:#ecf0f1
    classDef gateway fill:#16a085,stroke:#1abc9c,color:#ecf0f1
    classDef data fill:#8e44ad,stroke:#9b59b6,color:#ecf0f1
    classDef ml fill:#e74c3c,stroke:#c0392b,color:#ecf0f1
    classDef external fill:#f39c12,stroke:#f1c40f,color:#2c3e50
    
    class Web client
    class API gateway
    class PG,QD data
    class RAG ml
    class LLM external
```

## Core Components

| Service | Stack | Responsibility |
|---------|-------|----------------|
| **Go API** | Go 1.24, Gin | HTTP gateway, document lifecycle, orchestration |
| **RAG Service** | Python 3.11, FastAPI | Embedding generation, vector retrieval, LLM calls |
| **PostgreSQL** | v16 | Relational data: users, documents, chunks, metadata |
| **Qdrant** | v1.12 | Vector similarity search with payload filtering |
| **Frontend** | React, TypeScript | Document upload, query interface |

## RAG Pipeline Flow

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant A as Go API
    participant P as PostgreSQL
    participant R as RAG Service
    participant Q as Qdrant
    participant L as LLM

    Note over C,L: Document Ingestion
    C->>A: POST /api/documents/upload
    A->>A: Validate (type, size, signature)
    A->>A: Extract text (PDF/TXT)
    A->>A: Chunk (700 tokens, 100 overlap)
    A->>P: INSERT chunks
    A->>R: POST /embed (chunks)
    R->>R: Generate embeddings<br/>(sentence-transformers)
    R->>Q: Upsert vectors + metadata
    R-->>A: Success
    A->>P: UPDATE status = 'ready'
    A-->>C: 200 OK

    Note over C,L: Query & Retrieval
    C->>A: POST /api/documents/query
    A->>R: POST /query
    R->>R: Embed query
    R->>Q: Vector search (top-k)
    Q-->>R: Scored chunks
    R->>R: Context budget manager<br/>(token limit 4000)
    R->>L: Generate with context
    L-->>R: Answer + reasoning
    R->>R: Extract citations
    R-->>A: Response
    A-->>C: Answer + citations + matches
```

## Key Design Decisions

### Polyglot Services

**Decision:** Go for API gateway, Python for ML workloads.

**Rationale:**
- Go: Fast HTTP handling, single-binary deployment, strong concurrency
- Python: First-class ML ecosystem, sentence-transformers native support

**Trade-off:** Network hop overhead vs. language-appropriate tooling.

### Embedding Model

**Choice:** `sentence-transformers/all-MiniLM-L6-v2`

- 384 dimensions
- CPU-friendly inference (~50-200ms/chunk)
- Good general-purpose semantic similarity

**Trade-off:** Larger models (mpnet-base) improve quality but require GPU.

### Chunking Strategy

**Choice:** Fixed-size chunks (700 tokens, 100-token overlap)

**Rationale:**
- Deterministic and reproducible
- Document-format agnostic
- Overlap preserves context at boundaries

**Trade-off:** Semantic chunking preserves meaning better but adds complexity.

### Vector Store

**Choice:** Qdrant

- Self-hosted, no vendor lock-in
- Payload storage with vectors
- Filtering support for multi-tenancy

**Trade-off:** Operational burden vs. control and cost.

### Synchronous Ingestion

**Decision:** Upload blocks until embedding completes.

**Rationale:** Simpler debugging, clearer data flow for learning.

**Trade-off:** Latency vs. complexity. Production systems use async queues.

### LLM Provider

**Choice:** OpenAI-compatible API (abstracted)

The `OPENAI_BASE_URL` can point to OpenAI, Azure OpenAI, local Ollama, vLLM, or any compatible endpoint.

**Trade-off:** External API dependency vs. self-hosted control and latency.

## Security & Trust Boundaries

```mermaid
graph TD
    subgraph External["External (Untrusted)"]
        U[User Uploads<br/>User Queries]
    end
    
    subgraph Perimeter["Perimeter (API Gateway)"]
        AUTH[Authentication<br/>Middleware]
        VAL[Input Validation<br/>File Validation]
        SAN[Sanitization<br/>SQL Protection]
    end
    
    subgraph Internal["Internal (Trusted Network)"]
        SVC[RAG Service<br/>PostgreSQL<br/>Qdrant]
    end
    
    subgraph ExtAPI["External API"]
        LLM[OpenAI<br/>API Key Auth]
    end
    
    U --> AUTH
    AUTH --> VAL
    VAL --> SAN
    SAN --> SVC
    SVC --> LLM
    
    classDef untrusted fill:#e74c3c,stroke:#c0392b,color:#ecf0f1
    classDef perimeter fill:#f39c12,stroke:#e67e22,color:#2c3e50
    classDef trusted fill:#27ae60,stroke:#229954,color:#ecf0f1
    classDef external fill:#3498db,stroke:#2980b9,color:#ecf0f1
    
    class U untrusted
    class AUTH,VAL,SAN perimeter
    class SVC trusted
    class LLM external
```

### Implemented Protections

- File validation: PDF signature verification, extension checks, size limits
- Input sanitization: Query validation, basic prompt injection detection
- Path traversal prevention: Filename sanitization
- SQL injection prevention: Parameterized queries only
- User isolation: Document scoping by user ID

### Production Gaps

- **Authentication:** Dev middleware only. Implement JWT/OAuth.
- **Rate limiting:** None. Add at gateway.
- **Service auth:** Internal services unauthenticated. Add mTLS or API keys.
- **Secrets management:** Environment files. Use HashiCorp Vault or cloud KMS.

## Planned Enhancements

- Two-stage retrieval with reranking
- Async embedding pipeline with message queue
- Semantic chunking for structured documents
- Multi-document cross-referencing
- Fine-tuned embedding models for domain-specific corpora

## Project Structure

```
DocSense/
├── apps/web/                # React frontend
├── services/
│   ├── api/                 # Go API gateway (clean architecture)
│   └── rag/                 # Python RAG service
├── infra/
│   ├── compose/             # Docker Compose
│   └── postgres/            # Database schema
└── docs/                    # Architecture documentation
```

## Additional Documentation

- [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)
- [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
