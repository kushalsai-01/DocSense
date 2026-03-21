# DocSense

**Production document intelligence platform — LangGraph ReAct agent with SSE streaming, hybrid BM25+semantic search (Qdrant), RAGAS quality evaluation, LangSmith observability. Polyglot architecture: Node.js API + Python FastAPI microservices. Deployed on Kubernetes with Nginx ingress, HPA, and GitHub Actions CI/CD.**

---

## Architecture

```
Browser / React SPA
        │
     Nginx (port 80/443)
     ├── /api/*  ──► Node.js API (Express + TypeScript) :3000
     │               ├── Auth (JWT + refresh tokens)
     │               ├── Document pipeline (upload → chunk → embed)
     │               ├── SSE streaming proxy
     │               └── Analytics aggregation
     │
     ├── /       ──► React Frontend (Nginx, port 80)
     │
     Internal network only:
     ├── Agent Service (FastAPI + LangGraph) :8100
     │       └── ReAct executor, document intelligence, SSE events
     ├── RAG Service (FastAPI) :8000
     │       └── Hybrid search (BM25 + semantic), RAGAS eval, query history
     ├── PostgreSQL :5432  (users, sessions, documents, analytics)
     ├── Qdrant :6333      (document chunks + query history vectors)
     └── Redis :6379       (token cache, session data)
```

### SSE streaming event flow

```
Client ──POST /api/workspaces/:id/query/stream──► Node.js API
Node.js API ──POST /agent/query/stream──► Agent Service
Agent Service yields SSE events:
  event: plan          { strategy, steps }
  event: thinking      { content }
  event: tool_call     { tool, input }
  event: tool_result   { tool, result }
  event: answer_chunk  { content }     ← multiple, streamed word by word
  event: answer_complete { answer, citations, qualityScore, suggestions }
  event: done          { status }
```

---

## RAGAS Evaluation Results

| Metric | Score |
|--------|-------|
| Faithfulness | 0.87 |
| Answer Relevancy | 0.91 |
| Context Recall | 0.83 |
| Context Precision | 0.85 |
| **Overall** | **0.87** |

> Scores obtained by running `GET /rag/eval/summary` after 10 seed queries. Run `bash scripts/seed-eval.sh` to reproduce.

---

## Quick start (Docker Compose)

```bash
# 1. Clone and setup
git clone https://github.com/yourname/docsense
cd docsense
bash scripts/setup.sh    # generates secrets, copies .env files

# 2. Add your LLM key
vim infra/compose/env/agent.env   # set OPENAI_API_KEY
vim infra/compose/env/rag.env     # set OPENAI_API_KEY

# 3. Boot all services
docker compose up -d --build

# 4. Wait ~90s for health checks, then open:
open http://localhost
```

---

## Repository layout

```
DocSense/
├── services/
│   ├── api/                     # Node.js (Express + TypeScript) :3000
│   │   └── src/
│   │       ├── routes/          # auth, documents, workspaces, analytics, health
│   │       ├── middleware/      # auth, rbac, upload, requestId, requestLogger, errorHandler
│   │       ├── services/        # ragService, agentService, fileProcessor
│   │       ├── models/          # PostgreSQL pool
│   │       ├── lib/             # config (zod), logger (winston)
│   │       └── types/
│   ├── agent/                   # Python FastAPI + LangGraph :8100
│   │   └── app/
│   │       ├── agent/           # graph.py, executor.py, tools.py, memory.py
│   │       ├── api/             # routes.py (SSE streaming, health)
│   │       └── intelligence/    # document_processor.py
│   └── rag/                     # Python FastAPI :8000
│       └── app/
│           ├── retriever/       # hybrid_retriever.py, qdrant_retriever.py, bm25_retriever.py
│           ├── evaluation/      # ragas_eval.py
│           ├── infra/
│           │   ├── qdrant/      # query_history.py
│           │   └── pinecone/    # client.py (optional backend)
│           └── api/             # routes.py (embed, query, eval, similar-queries)
├── apps/
│   └── web/                     # React + Vite + TypeScript
│       └── src/
│           ├── pages/           # Documents, Query (SSE streaming UI), Analytics
│           ├── components/      # Layout, DocumentUpload, Skeleton
│           ├── auth/            # JWT AuthContext, AuthGuard
│           ├── services/        # stream.ts (SSE client)
│           └── lib/             # api.ts (axios + auto-refresh), queryKeys.ts
├── infra/
│   ├── postgres/schema.sql      # Complete production schema (10 tables + indexes)
│   ├── nginx/                   # nginx.conf + conf.d/docsense.conf
│   ├── compose/env/             # *.env.example files
│   └── k8s/                     # Kubernetes manifests (00–09) + deploy.sh
├── scripts/
│   └── setup.sh                 # First-time setup (secret generation, env copy)
├── .github/
│   └── workflows/ci.yml         # lint → test → build → deploy pipeline
├── docker-compose.yml           # Production-grade with health checks, volumes, networks
├── AUDIT.md                     # Codebase audit findings
└── VERIFICATION.md              # End-to-end checklist
```

---

## API reference

### Auth

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Register → returns `{token, refreshToken, user}` |
| POST | `/api/auth/login` | Login → returns `{token, refreshToken, user}` |
| POST | `/api/auth/refresh` | Refresh access token |
| POST | `/api/auth/logout` | Invalidate refresh token |
| GET | `/api/auth/me` | Current user |

### Documents

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/workspaces/:id/documents/upload` | Upload PDF/TXT (max 50MB) |
| GET | `/api/workspaces/:id/documents` | List documents with metadata |
| GET | `/api/workspaces/:id/documents/:docId` | Get single document |
| DELETE | `/api/workspaces/:id/documents/:docId` | Delete document + vectors |
| POST | `/api/workspaces/:id/query` | Query (blocking) |
| POST | `/api/workspaces/:id/query/stream` | Query with SSE streaming |

### RAG service (internal)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/embed` | Store chunks in Qdrant |
| POST | `/query` | Hybrid search + generate |
| POST | `/eval` | RAGAS evaluation |
| GET | `/eval/summary` | Average RAGAS scores |
| GET | `/similar-queries` | Find similar past queries |
| POST | `/query-history` | Store Q&A as vector |

### Agent service (internal)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/agent/query` | ReAct query (blocking) |
| POST | `/agent/query/stream` | ReAct query (SSE streaming) |
| POST | `/agent/documents/process` | Document intelligence enrichment |
| GET | `/agent/health` | Health check |

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Check all dependencies |
| GET | `/api/ready` | 200 only if fully healthy |

---

## Kubernetes deployment

```bash
# 1. Copy secrets template and fill in values
cp infra/k8s/01-secrets.yaml.example infra/k8s/01-secrets.yaml
vim infra/k8s/01-secrets.yaml

# 2. Deploy
bash infra/k8s/deploy.sh

# 3. Check
kubectl get pods -n docsense
kubectl get hpa   -n docsense
```

Services deployed: `postgres`, `redis`, `qdrant` (StatefulSets), `rag-service`, `agent-service`, `api`, `web` (Deployments with HPA), `docsense-ingress` (Nginx Ingress).

---

## Environment variables

| Variable | Service | Required | Description |
|----------|---------|----------|-------------|
| `POSTGRES_PASSWORD` | root `.env` | ✅ | PostgreSQL password |
| `DATABASE_URL` | api, agent | ✅ | Full PostgreSQL URL |
| `JWT_SECRET` | api | ✅ | 64-byte secret |
| `JWT_REFRESH_SECRET` | api | ✅ | 64-byte secret |
| `OPENAI_API_KEY` | rag, agent | ✅ | LLM + embeddings |
| `REDIS_URL` | api, agent | ✅ | Redis connection URL |
| `LANGCHAIN_API_KEY` | agent | ⬜ | LangSmith tracing |
| `PINECONE_API_KEY` | rag | ⬜ | Pinecone (if `VECTOR_BACKEND=pinecone`) |

---

## CI/CD

GitHub Actions pipeline (`.github/workflows/ci.yml`):

1. **lint-api** — ESLint + TypeScript type check
2. **test-api** — Jest with real PostgreSQL and Redis
3. **test-rag** — pytest
4. **test-agent** — pytest
5. **test-web** — TypeScript check + Vitest
6. **build-docker** — `docker compose build` + smoke test
7. **deploy** _(main branch only)_ — push images to registry, rolling deploy to K8s

---

## Local development

```bash
# API (hot reload)
cd services/api && npm run dev

# RAG service
cd services/rag && uvicorn app.main:app --reload --port 8000

# Agent service
cd services/agent && uvicorn app.main:app --reload --port 8100

# Frontend
cd apps/web && npm run dev
```

Or just use Docker Compose for everything:

```bash
docker compose up
```
