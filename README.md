# DocSense

A backend-focused RAG (Retrieval-Augmented Generation) platform for document intelligence. Built with Go, Python, and PostgreSQL.

This project demonstrates production-style patterns for document ingestion, semantic search, and grounded answer generation—without the typical "chatbot demo" approach. The emphasis is on explicit pipelines, clear data flow, and honest trade-offs.

---

## Table of Contents

- [Architecture](#architecture)
- [Data Flow](#data-flow)
- [Design Decisions](#design-decisions)
- [Getting Started](#getting-started)
- [API Reference](#api-reference)
- [Development](#development)
- [Security](#security)
- [Known Limitations](#known-limitations)
- [License](#license)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENTS                                        │
│                                                                             │
│    ┌──────────────────┐                                                     │
│    │   React Frontend │  (TypeScript, Tailwind)                             │
│    │   localhost:5173 │                                                     │
│    └────────┬─────────┘                                                     │
│             │ HTTP/REST                                                     │
└─────────────┼───────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           API GATEWAY                                       │
│                                                                             │
│    ┌──────────────────────────────────────────────────────────────────┐     │
│    │                    Go API Service (Gin)                          │     │
│    │                       localhost:8080                             │     │
│    │                                                                  │     │
│    │   • Document upload & management                                 │     │
│    │   • Query orchestration                                          │     │
│    │   • Authentication middleware                                    │     │
│    │   • Request validation & correlation IDs                         │     │
│    └──────────┬──────────────────────────────────┬────────────────────┘     │
│               │                                  │                          │
└───────────────┼──────────────────────────────────┼──────────────────────────┘
                │                                  │
       ┌────────┴────────┐                ┌────────┴────────┐
       ▼                 │                ▼                 │
┌──────────────┐         │         ┌──────────────┐         │
│  PostgreSQL  │         │         │  RAG Service │         │
│  :5432       │         │         │  (FastAPI)   │         │
│              │         │         │  :8000       │         │
│  • Users     │         │         │              │         │
│  • Documents │         │         │  • Embedding │         │
│  • Chunks    │         │         │  • Retrieval │         │
│  • Metadata  │         │         │  • Generation│         │
└──────────────┘         │         └───────┬──────┘         │
                         │                 │                │
                         │                 ▼                │
                         │         ┌──────────────┐         │
                         │         │    Qdrant    │         │
                         │         │    :6333     │         │
                         │         │              │         │
                         │         │ Vector Store │         │
                         │         └──────────────┘         │
                         │                                  │
                         │         ┌──────────────┐         │
                         └────────►│   OpenAI     │◄────────┘
                                   │   (or compat)│
                                   │              │
                                   │  LLM API     │
                                   └──────────────┘
```

### Components

| Service | Language | Role |
|---------|----------|------|
| **Go API** | Go 1.24 / Gin | HTTP gateway, document management, orchestration |
| **RAG Service** | Python 3.11 / FastAPI | Embeddings, vector search, LLM generation |
| **PostgreSQL** | 16 | Metadata, chunks, user data |
| **Qdrant** | 1.12 | Vector similarity search |
| **Frontend** | React / TypeScript | Document upload and query interface |

---

## Data Flow

### Document Upload

```
┌──────────┐    POST /api/documents/upload    ┌──────────┐
│  Client  │ ────────────────────────────────►│  Go API  │
└──────────┘                                  └────┬─────┘
                                                   │
     ┌─────────────────────────────────────────────┼─────────────────────────┐
     │                                             ▼                         │
     │  1. Validate file (type, size, PDF signature)                         │
     │                                             │                         │
     │  2. Store file on disk (user-scoped path)   │                         │
     │                                             │                         │
     │  3. Extract text (PDF/TXT/MD)               │                         │
     │                                             │                         │
     │  4. Chunk text (700 tokens, 100 overlap)    │                         │
     │                                             │                         │
     │  5. Persist chunks to PostgreSQL            │                         │
     │                                             ▼                         │
     │                                      ┌─────────────┐                  │
     │  6. Send chunks to RAG service ─────►│ RAG Service │                  │
     │                                      └──────┬──────┘                  │
     │                                             │                         │
     │                                             ▼                         │
     │                                      ┌─────────────┐                  │
     │  7. Embed with Sentence Transformers │  Embedding  │                  │
     │                                      └──────┬──────┘                  │
     │                                             │                         │
     │                                             ▼                         │
     │                                      ┌─────────────┐                  │
     │  8. Upsert vectors to Qdrant ───────►│   Qdrant    │                  │
     │                                      └─────────────┘                  │
     │                                             │                         │
     │  9. Update document status = "ready"        │                         │
     └─────────────────────────────────────────────┴─────────────────────────┘
```

### Query & Retrieval

```
┌──────────┐    POST /api/documents/query     ┌──────────┐
│  Client  │ ────────────────────────────────►│  Go API  │
└──────────┘                                  └────┬─────┘
                                                   │
                                                   │ Validate & sanitize query
                                                   │
                                                   ▼
                                            ┌─────────────┐
                                            │ RAG Service │
                                            └──────┬──────┘
                                                   │
     ┌─────────────────────────────────────────────┼─────────────────────────┐
     │ RETRIEVAL                                   │                         │
     │                                             ▼                         │
     │  1. Embed query ───────────────────► [384-dim vector]                 │
     │                                             │                         │
     │                                             ▼                         │
     │  2. Vector search in Qdrant ────────► Top-K chunks (scored)           │
     │                                             │                         │
     │                                             ▼                         │
     │  3. Context budget manager ─────────► Select chunks within            │
     │                                       token limit (4000)              │
     └─────────────────────────────────────────────┼─────────────────────────┘
                                                   │
     ┌─────────────────────────────────────────────┼─────────────────────────┐
     │ GENERATION                                  │                         │
     │                                             ▼                         │
     │  4. Build prompt with context ──────► System + Context + Query        │
     │                                             │                         │
     │                                             ▼                         │
     │  5. Call LLM (OpenAI-compatible) ───► Grounded answer                 │
     │                                             │                         │
     │                                             ▼                         │
     │  6. Extract citations ──────────────► Chunk references                │
     └─────────────────────────────────────────────┼─────────────────────────┘
                                                   │
                                                   ▼
                                            ┌─────────────┐
                                            │  Response   │
                                            │             │
                                            │  • answer   │
                                            │  • citations│
                                            │  • matches  │
                                            └─────────────┘
```

### Service Trust Boundaries

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EXTERNAL (Untrusted)                              │
│                                                                             │
│   • User uploads (validated: type, size, signature)                         │
│   • User queries (sanitized: input validation, prompt injection check)      │
│                                                                             │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                        PERIMETER (Go API Gateway)                         │
│                                                                           │
│   ┌─────────────────────────────────────────────────────────────────┐     │
│   │ • Authentication middleware (dev auth / future: JWT)            │     │
│   │ • Request validation (Gin bindings)                             │     │
│   │ • File type validation (PDF signature, extensions)              │     │
│   │ • Size limits (configurable, default 25MB)                      │     │
│   │ • Filename sanitization (path traversal prevention)             │     │
│   │ • SQL injection prevention (parameterized queries)              │     │
│   │ • Request correlation IDs                                       │     │
│   └─────────────────────────────────────────────────────────────────┘     │
└───────────────────────────────────┬───────────────────────────────────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                         INTERNAL (Trusted Network)                        │
│                                                                           │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                   │
│   │ PostgreSQL  │    │ RAG Service │    │   Qdrant    │                   │
│   │             │    │             │    │             │                   │
│   │ No auth     │    │ No auth     │    │ No auth     │                   │
│   │ (internal)  │    │ (internal)  │    │ (internal)  │                   │
│   └─────────────┘    └──────┬──────┘    └─────────────┘                   │
│                             │                                             │
│                             ▼                                             │
│                      ┌─────────────┐                                      │
│                      │  OpenAI API │  (external, API key auth)            │
│                      └─────────────┘                                      │
└───────────────────────────────────────────────────────────────────────────┘

Production recommendations:
  • Service-to-service auth (mTLS or API keys)
  • Rate limiting at API gateway
  • Secrets management (not env files)
  • Network policies for internal services
```

---

## Design Decisions

### Why This Architecture?

The system uses a polyglot approach: Go for the API gateway, Python for ML workloads. This isn't arbitrary.

| Decision | Rationale | Trade-off |
|----------|-----------|-----------|
| **Go API Gateway** | Fast, compiles to single binary, good for I/O-bound work | Smaller ML ecosystem than Python |
| **Python RAG Service** | Rich ML libraries, first-class Sentence Transformers support | Slower cold starts, GIL limitations |
| **Separate services** | Independent scaling, language-appropriate tooling | Network overhead, operational complexity |

### Embedding Model

**Choice:** `sentence-transformers/all-MiniLM-L6-v2`

- 384 dimensions, fast inference
- Good general-purpose semantic similarity
- Small enough to run without GPU

Trade-off: Larger models (e.g., `all-mpnet-base-v2`) produce better embeddings but are slower.

### Chunking Strategy

**Current:** Fixed-size chunks (700 tokens, 100 token overlap)

This is intentionally simple. Fixed-size chunking is deterministic and works reasonably well for most document types. The overlap ensures context isn't lost at chunk boundaries.

Trade-off: Semantic or structure-aware chunking would preserve meaning better but adds complexity and document-format dependencies.

### Vector Store

**Choice:** Qdrant

- Open-source, self-hosted
- Good Python client
- Supports filtering and payload storage

Trade-off: Managed solutions (Pinecone) reduce ops burden but add vendor lock-in and cost.

### LLM Provider

**Choice:** OpenAI-compatible API (abstracted)

The code uses an interface that works with OpenAI, Azure OpenAI, or any compatible endpoint (local Ollama, vLLM, etc.). The `OPENAI_BASE_URL` can point anywhere.

Trade-off: External API dependency vs. self-hosted control and latency.

---

## Getting Started

### Prerequisites

- Docker and Docker Compose
- An OpenAI API key (or compatible endpoint)

For local development without Docker:
- Go 1.24+
- Python 3.11+
- Node.js 18+

### Quick Start

```bash
# Clone
git clone <repository-url>
cd DocSense

# Configure
cp infra/compose/env/api.env.example infra/compose/env/api.env
cp infra/compose/env/rag.env.example infra/compose/env/rag.env
cp infra/compose/env/postgres.env.example infra/compose/env/postgres.env
cp infra/compose/env/qdrant.env.example infra/compose/env/qdrant.env
cp infra/compose/env/web.env.example infra/compose/env/web.env

# Set your OpenAI key in rag.env
# OPENAI_API_KEY=sk-...

# Start
cd infra/compose
docker-compose up -d

# Verify
curl http://localhost:8080/health   # API
curl http://localhost:8000/health   # RAG
curl http://localhost:6333/collections  # Qdrant
```

Frontend is available at `http://localhost:5173`.

See [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) for detailed deployment instructions and troubleshooting.

### Environment Variables

**Required:**

| Variable | Service | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | RAG | OpenAI API key (or compatible) |

**Optional (with defaults):**

| Variable | Service | Default | Description |
|----------|---------|---------|-------------|
| `DB_HOST` | API | `postgres` | PostgreSQL host |
| `DB_PASSWORD` | API | `docsense_dev_password` | Database password |
| `RAG_SERVICE_URL` | API | `http://rag:8000` | RAG service endpoint |
| `QDRANT_URL` | RAG | `http://qdrant:6333` | Qdrant endpoint |
| `EMBEDDING_MODEL` | RAG | `sentence-transformers/all-MiniLM-L6-v2` | Embedding model |
| `OPENAI_MODEL` | RAG | `gpt-4o-mini` | LLM model |
| `MAX_CONTEXT_TOKENS` | RAG | `4000` | Context budget for LLM |

---

## API Reference

### Upload Document

```bash
curl -X POST http://localhost:8080/api/documents/upload \
  -H "X-User-Id: 00000000-0000-0000-0000-000000000001" \
  -F "file=@document.pdf"
```

Response:
```json
{"document_id": "uuid"}
```

### List Documents

```bash
curl http://localhost:8080/api/documents \
  -H "X-User-Id: 00000000-0000-0000-0000-000000000001"
```

### Query Documents

```bash
curl -X POST http://localhost:8080/api/documents/query \
  -H "Content-Type: application/json" \
  -H "X-User-Id: 00000000-0000-0000-0000-000000000001" \
  -d '{"query": "What is the main topic?", "top_k": 5}'
```

Response:
```json
{
  "answer": "Based on the documents...",
  "citations": [{"chunk_id": "...", "text_snippet": "..."}],
  "matches": [{"id": "...", "score": 0.85, "text": "..."}]
}
```

### Health Checks

```bash
curl http://localhost:8080/health  # Go API
curl http://localhost:8000/health  # RAG Service
```

---

## Development

### Project Structure

```
DocSense/
├── apps/
│   └── web/                 # React frontend
├── services/
│   ├── api/                 # Go API gateway
│   │   ├── cmd/api/         # Entrypoint
│   │   └── internal/        # Clean architecture layers
│   │       ├── transport/   # HTTP handlers
│   │       ├── app/         # Application logic
│   │       ├── domain/      # Domain types
│   │       └── adapters/    # External integrations
│   └── rag/                 # Python RAG service
│       └── app/
│           ├── api/         # FastAPI routes
│           ├── embeddings/  # Embedding logic
│           ├── retriever/   # Qdrant retrieval
│           └── generator/   # LLM generation
├── infra/
│   ├── compose/             # Docker Compose setup
│   └── postgres/            # Database schema
└── docs/                    # Additional documentation
```

### Running Locally

**Go API:**
```bash
cd services/api
go run cmd/api/main.go
```

**RAG Service:**
```bash
cd services/rag
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**Frontend:**
```bash
cd apps/web
npm install
npm run dev
```

### Tests

```bash
# RAG service
cd services/rag && pytest

# Go API
cd services/api && go test ./...
```

---

## Security

### Implemented

- **File validation:** PDF signature verification, extension checks, size limits
- **Input sanitization:** Query validation, basic prompt injection detection
- **Path traversal prevention:** Filename sanitization
- **SQL injection prevention:** Parameterized queries
- **User isolation:** Documents are scoped to user IDs

### Not Implemented (Production Recommendations)

- **Authentication:** Currently uses dev middleware. Implement JWT/OAuth for production.
- **Rate limiting:** No rate limiting. Add at API gateway level.
- **Service auth:** Internal services have no auth. Add mTLS or API keys.
- **Secrets management:** Uses environment files. Use proper secrets management.

---

## Known Limitations

This is a learning-focused project that demonstrates production patterns. Some limitations are intentional trade-offs:

| Limitation | Reason |
|------------|--------|
| Dev authentication only | Keeps focus on RAG architecture, not auth infrastructure |
| Single-stage retrieval | MVP simplicity; reranking is a planned enhancement |
| Fixed-size chunking | Deterministic and document-agnostic; semantic chunking adds complexity |
| No async embedding | Synchronous processing simplifies debugging and flow understanding |
| Placeholder generator fallback | Works without OpenAI key for testing retrieval pipeline |

### Performance Notes

- **Embedding latency:** ~50-200ms per chunk (CPU)
- **Vector search:** <100ms for typical workloads
- **LLM generation:** 1-5s depending on context size and model

---

## Documentation

- [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) — Step-by-step deployment guide
- [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) — Implementation details
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — Architecture principles

---

## License

[Add license]

---

## Closing Notes

DocSense is a portfolio project that prioritizes clarity over cleverness. The goal was to build a RAG system the way you'd build it at work—with explicit data flow, clear service boundaries, and honest documentation of trade-offs.

It's not a production system. It's a demonstration of how to think about production systems.

If you're evaluating this code, I'd point you to:
- The chunking and context budget logic in the RAG service
- The clean architecture layering in the Go API
- The data flow diagrams above

Questions or feedback welcome.
