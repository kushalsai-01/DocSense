feat/restructure-repo
# DocSense - Enterprise-Grade RAG Platform

**DocSense** is a production-ready Retrieval-Augmented Generation (RAG) platform designed for enterprise document intelligence. It provides deep, backend-heavy retrieval pipelines with explainability, evaluation, and observability built-in.

## 🎯 Project Overview

DocSense enables organizations to:
- **Ingest** documents (PDF, TXT, MD)
- **Index** them into a vector store with semantic embeddings
- **Perform multi-stage retrieval** with reranking
- **Generate grounded answers** with citations
- **Track evaluation metrics** for quality assurance

This is **NOT** a demo chatbot. This is a deep, backend-heavy, enterprise-style RAG platform with explicit retrieval pipelines, explainability, and production-grade architecture.

## 🏗️ Architecture

```
┌─────────────┐
│   Frontend  │  React + TypeScript + Tailwind
│   (React)   │
└──────┬──────┘
       │ HTTP/REST
       ▼
┌─────────────────────────────────────┐
│      Go API Gateway                 │
│  (Gin Framework)                    │
│  - Document Management              │
│  - Authentication                   │
│  - Query Orchestration              │
└──────┬────────────────┬─────────────┘
       │                │
       ▼                ▼
┌──────────────┐  ┌──────────────┐
│  PostgreSQL  │  │ Python RAG   │
│  - Metadata  │  │ Service      │
│  - Chunks    │  │ (FastAPI)    │
│  - Users     │  │ - Embeddings │
└──────────────┘  │ - Retrieval  │
                  │ - Generation │
                  └──────┬───────┘
                         │
                         ▼
                  ┌──────────────┐
                  │    Qdrant    │
                  │ Vector Store │
                  └──────────────┘
```

### Core Components

1. **Go API Service** (`services/api`)
   - HTTP API gateway
   - Document upload & management
   - Query orchestration
   - User authentication
   - Clean architecture (transport → services → repositories)

2. **Python RAG Service** (`services/rag`)
   - Sentence Transformers embeddings
   - Vector similarity search
   - LLM generation (OpenAI-compatible)
   - Citation extraction
   - Qdrant integration

3. **Frontend** (`apps/web`)
   - React + TypeScript
   - Document upload UI
   - Query interface
   - Answer display with citations

4. **Data Stores**
   - **PostgreSQL**: Metadata, documents, chunks, users
   - **Qdrant**: Vector embeddings
   - **Local Storage**: Document files

## 🚀 Quick Start

> **📋 Deployment Guide**: See [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) for a comprehensive step-by-step deployment guide with troubleshooting tips.

### Prerequisites

- Docker & Docker Compose
- Go 1.24+ (for local development)
- Python 3.11+ (for local development)
- Node.js 18+ (for frontend development)

### Environment Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd DocSense
   ```

2. **Configure environment variables**

   Copy example environment files:
   ```bash
   cp infra/compose/env/api.env.example infra/compose/env/api.env
   cp infra/compose/env/rag.env.example infra/compose/env/rag.env
   cp infra/compose/env/postgres.env.example infra/compose/env/postgres.env
   cp infra/compose/env/qdrant.env.example infra/compose/env/qdrant.env
   cp infra/compose/env/web.env.example infra/compose/env/web.env
   ```

3. **Set required environment variables**

   **`infra/compose/env/rag.env`** (Required):
   ```bash
   OPENAI_API_KEY=your_openai_api_key_here
   ```

   **`infra/compose/env/api.env`** (Optional - defaults are set):
   ```bash
   APP_ENV=development
   HTTP_PORT=8080
   DB_HOST=postgres
   DB_PORT=5432
   DB_USER=docsense
   DB_PASSWORD=docsense_dev_password
   DB_NAME=docsense
   DB_SSLMODE=disable
   STORAGE_DIR=/data
   MAX_UPLOAD_BYTES=26214400
   RAG_SERVICE_URL=http://rag:8000
   RAG_SERVICE_TIMEOUT=60s
   ```

   **`infra/compose/env/rag.env`** (Full config):
   ```bash
   RAG_ENV=development
   RAG_PORT=8000
   
   QDRANT_URL=http://qdrant:6333
   QDRANT_API_KEY=
   QDRANT_COLLECTION=docsense_chunks
   QDRANT_VECTOR_SIZE=384
   
   # Embedding model
   EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
   
   # LLM settings
   LLM_PROVIDER=openai
   OPENAI_API_KEY=your_key_here
   OPENAI_MODEL=gpt-4o-mini
   OPENAI_BASE_URL=
   
   # Reranker (optional, future enhancement)
   RERANKER_ENABLED=true
   RERANKER_MODEL=cross-encoder/ms-marco-MiniLM-L-6-v2
   
   # Context budget
   MAX_CONTEXT_TOKENS=4000
   MAX_CHUNKS=10
   ```

4. **Start services**
   ```bash
   cd infra/compose
   docker-compose up -d
   ```

5. **Verify services**
   ```bash
   # Check API
   curl http://localhost:8080/health
   
   # Check RAG service
   curl http://localhost:8000/health
   
   # Check Qdrant
   curl http://localhost:6333/collections
   ```

6. **Access the frontend**
   - Open http://localhost:5173 in your browser
   - Upload documents via the UI
   - Query your documents

## 📋 Features

### ✅ Implemented Features

#### 1. Document Ingestion
- **Supported formats**: PDF, TXT, MD
- **SHA256 checksums**: Automatic checksum calculation for deduplication
- **Text extraction**: PDF via `ledongthuc/pdf`, TXT direct
- **Chunking**: Fixed-size overlapping chunks (700 tokens, 100 overlap)
- **Storage**: Local filesystem with user isolation
- **Metadata**: PostgreSQL persistence
- **Embedding**: Automatic embedding and indexing via RAG service

#### 2. Embedding & Indexing
- **Model**: Sentence Transformers (`all-MiniLM-L6-v2`)
- **Vector Store**: Qdrant with cosine similarity
- **Automatic indexing**: Chunks are embedded and indexed on upload
- **Chunk tracking**: PostgreSQL tracks chunk metadata and Qdrant point IDs

#### 3. Retrieval Pipeline
- **Vector search**: Semantic similarity search in Qdrant
- **Top-K retrieval**: Configurable number of results (default: 5, max: 50)
- **Metadata filtering**: Document and user-scoped queries (future: metadata filters)
- **Context budget management**: Intelligent chunk selection to fit token limits
- **Reranking**: Planned (cross-encoder reranker integration)

#### 4. Answer Generation
- **LLM Integration**: OpenAI-compatible API (abstracted interface)
- **Grounded answers**: Answers are based solely on retrieved context
- **Citations**: Source chunk references included in responses
- **Context budget management**: Automatic chunk selection to prevent token limit issues
- **Safety**: System prompts enforce context-only answering
- **No hallucination**: Answers refuse when context is insufficient

#### 5. API Endpoints

**Document Management:**
- `POST /api/documents/upload` - Upload a document
- `GET /api/documents` - List user's documents
- `POST /api/documents/query` - Query documents via RAG

**RAG Service:**
- `POST /embed` - Embed and index chunks
- `POST /query` - Retrieve and generate answers
- `GET /health` - Health check

#### 6. Frontend
- **Document upload**: Drag-and-drop or file picker
- **Document listing**: View uploaded documents
- **Query interface**: Ask questions about documents
- **Answer display**: View answers with citations
- **Modern UI**: Tailwind CSS, dark theme

#### 7. Observability
- **Structured logging**: Context-aware logging with request IDs
- **Request correlation**: Track requests across services via correlation IDs
- **Error logging**: Structured error logging with context

#### 8. Security
- **Input sanitization**: Query input sanitization and validation
- **Prompt injection detection**: Basic pattern-based detection
- **Filename sanitization**: Path traversal prevention
- **SQL injection prevention**: Parameterized queries throughout
- **File validation**: Type and size validation

### 🔄 Planned Enhancements

- **Advanced Chunking**: Semantic chunking, structure-aware chunking, strategy selection
- **Multi-stage Retrieval**: Cross-encoder reranking, enhanced metadata filtering, deduplication
- **RAG Evaluation**: Context relevance, faithfulness, latency metrics per stage
- **Enhanced Observability**: Metrics collection, distributed tracing, performance dashboards
- **Enhanced Security**: Rate limiting, service-to-service auth, advanced prompt injection detection
- **Document Versioning**: Track document updates, re-indexing on changes
- **Deduplication Logic**: Implement duplicate detection using SHA256 checksums

## 🔄 Data Flow

### Document Upload Flow

1. **Upload Request**
   ```
   Frontend → Go API (POST /api/documents/upload)
   ```

2. **File Storage**
   ```
   Go API → Local filesystem (user-scoped paths)
   ```

3. **Text Extraction**
   ```
   Go API → Extract text (PDF/TXT/MD)
   ```

4. **Chunking**
   ```
   Go API → Chunk text (fixed-size, overlapping)
   → Store chunks in PostgreSQL
   ```

5. **Embedding & Indexing**
   ```
   Go API → RAG Service (POST /embed)
   → RAG Service → Sentence Transformers
   → RAG Service → Qdrant (vector store)
   ```

6. **Status Update**
   ```
   Go API → PostgreSQL (status = "ready")
   ```

### Query Flow

1. **Query Request**
   ```
   Frontend → Go API (POST /api/documents/query)
   ```

2. **Retrieval**
   ```
   Go API → RAG Service (POST /query)
   → RAG Service → Embed query
   → RAG Service → Qdrant (vector search)
   → RAG Service → Retrieve top-K chunks
   ```

3. **Generation**
   ```
   RAG Service → Build context from chunks
   → RAG Service → Context budget manager (select chunks)
   → RAG Service → LLM (OpenAI API)
   → RAG Service → Extract citations
   ```

4. **Response**
   ```
   RAG Service → Go API (answer + citations + matches)
   → Go API → Frontend
   ```

## 🧠 RAG Design Decisions

### Embedding Model
- **Choice**: `sentence-transformers/all-MiniLM-L6-v2`
- **Reason**: Good balance of speed and quality, 384 dimensions
- **Tradeoff**: Smaller model for faster inference vs. larger models for better quality

### Chunking Strategy
- **Current**: Fixed-size (700 tokens) with overlap (100 tokens)
- **Reason**: Simple, deterministic, works well for most documents
- **Future**: Semantic chunking for better context boundaries

### Retrieval
- **Current**: Single-stage vector similarity search
- **Reason**: Fast and effective for MVP
- **Future**: Multi-stage with reranking for higher precision

### LLM Provider
- **Choice**: OpenAI-compatible API (abstracted)
- **Reason**: Flexibility to use OpenAI, local models, or compatible APIs
- **Tradeoff**: External dependency vs. self-hosted control

### Vector Store
- **Choice**: Qdrant
- **Reason**: Fast, scalable, open-source, good Python integration
- **Alternative**: FAISS (in-memory), Pinecone (managed)

## 📊 Database Schema

### Key Tables

- **`users`**: User accounts and authentication
- **`documents`**: Document metadata (filename, size, status, storage path, checksum)
- **`document_contents`**: Full extracted text (for debugging/small queries)
- **`document_chunks`**: Chunk metadata (index, content, token count, Qdrant point ID)

See `infra/postgres/schema.sql` for full schema.

## 🔒 Security Considerations

### Current Implementation
- **Authentication**: Dev auth middleware (non-production)
- **User isolation**: Documents are user-scoped
- **File validation**: PDF signature validation, size limits
- **Input validation**: Request validation via Gin bindings
- **Query sanitization**: Basic input sanitization and prompt injection detection
- **Filename sanitization**: Path traversal prevention
- **SQL injection prevention**: Parameterized queries throughout

### Production Recommendations
- **Authentication**: Implement proper JWT/OAuth
- **Authorization**: Role-based access control
- **Rate limiting**: Per-user rate limits (not implemented)
- **Service-to-service auth**: API keys or mutual TLS
- **Secrets management**: Use proper secrets management (not env files)
- **Enhanced prompt injection**: More sophisticated detection patterns
- **Content filtering**: Additional content moderation if needed

## 🧪 Development

### Local Development (Without Docker)

#### Backend (Go)
```bash
cd services/api
go mod download
go run cmd/api/main.go
```

#### RAG Service (Python)
```bash
cd services/rag
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

#### Frontend
```bash
cd apps/web
npm install
npm run dev
```

### Running Tests

```bash
# Python RAG service tests
cd services/rag
pytest

# Go API tests (when available)
cd services/api
go test ./...
```

## 📈 Performance Considerations

- **Embedding latency**: ~50-200ms per chunk (depends on hardware)
- **Vector search**: <100ms for thousands of documents
- **LLM generation**: 1-5s depending on model and context size
- **Chunking**: <10ms for typical documents

### Optimization Opportunities
- Batch embedding for multiple chunks
- Caching frequently accessed documents
- Async embedding for large documents
- Connection pooling for database and RAG service

## 🐛 Troubleshooting

### RAG Service Fails to Start
- Check `OPENAI_API_KEY` is set in `rag.env`
- Verify Qdrant is accessible at `QDRANT_URL`
- Check Python dependencies: `pip install -r requirements.txt`

### Documents Not Indexing
- Check RAG service logs: `docker-compose logs rag`
- Verify RAG service is accessible from API: `RAG_SERVICE_URL`
- Check Qdrant collection exists: `curl http://localhost:6333/collections`

### Query Returns No Results
- Verify documents were indexed (check Qdrant points)
- Check embedding model matches collection vector size
- Verify documents are in "ready" status

For detailed troubleshooting, see [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md).

## 📚 API Documentation

### Upload Document
```bash
curl -X POST http://localhost:8080/api/documents/upload \
  -H "X-User-Id: 00000000-0000-0000-0000-000000000001" \
  -F "file=@document.pdf"
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
  -d '{
    "query": "What is the main topic?",
    "top_k": 5
  }'
```

## 🤝 Contributing

This is an enterprise-grade project. When contributing:

1. Follow clean architecture principles
2. Maintain separation of concerns
3. Add tests for new features
4. Document design decisions
5. Keep production-readiness in mind

## 📄 License

[Add your license here]

## 🙏 Acknowledgments

- Sentence Transformers for embeddings
- Qdrant for vector storage
- OpenAI for LLM API
- Gin for Go HTTP framework
- FastAPI for Python service framework

---

**Built with ❤️ for enterprise document intelligence**

**📖 Additional Documentation:**
- [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) - Step-by-step deployment guide
- [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) - Implementation details
