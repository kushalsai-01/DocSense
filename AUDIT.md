# DocSense Codebase Audit

**Audit Date:** 2026-03-20  
**Auditor:** Senior AI/ML Platform Engineer  
**Status:** Complete overhaul in progress

---

## Executive Summary

DocSense is a multi-tenant document intelligence platform. The codebase is more advanced than the brief suggests — the API is **already Node.js (Express 5 + ESM)**, not Go. The Go code in `services/api/internal/` is a legacy stub that is not used by Docker Compose. Key gaps are: no TypeScript, no SSE streaming in agent, no RAGAS, no LangSmith, no document intelligence pipeline, no Pinecone, incomplete frontend, missing Nginx/K8s/CI config.

---

## 1. API Layer — Current State

**Location:** `services/api/src/`  
**Runtime:** Node.js 20, Express 5, ESM modules (`.js`)  
**Status:** ✅ Functional but needs TypeScript, helmet, Winston logging, missing endpoints

### Implemented Routes

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | /health | No | Returns `{status: "ok"}` |
| POST | /api/auth/register | No | bcrypt 12 rounds, creates workspace |
| POST | /api/auth/login | No | Returns JWT pair (Redis-backed) |
| POST | /api/auth/refresh | No | Verifies Redis key, issues new access token |
| GET | /api/workspaces | Yes | Lists user's workspaces |
| POST | /api/workspaces | Yes | Creates workspace + member |
| GET | /api/workspaces/:id | Yes viewer | Workspace + members |
| DELETE | /api/workspaces/:id | Yes admin | Deletes workspace |
| POST | /api/workspaces/:id/members | Yes admin | Add/update member |
| PUT | /api/workspaces/:id/members/:uid | Yes admin | Update role |
| DELETE | /api/workspaces/:id/members/:uid | Yes admin | Remove member |
| POST | /api/workspaces/:id/documents | Yes editor | Upload + chunk + embed |
| GET | /api/workspaces/:id/documents | Yes viewer | List with chunk counts |
| GET | /api/workspaces/:id/documents/:docId/status | Yes viewer | Poll status |
| DELETE | /api/workspaces/:id/documents/:docId | Yes editor | Delete + vector removal |
| POST | /api/workspaces/:id/query | Yes viewer | RAG/agent query |
| GET | /api/workspaces/:id/query/stream | Token param | SSE stream proxy |
| POST | /api/workspaces/:id/collections | Yes editor | Create collection |
| GET | /api/workspaces/:id/collections | Yes viewer | List collections |
| POST | /api/workspaces/:id/collections/:id/documents | Yes editor | Add docs to collection |
| DELETE | /api/workspaces/:id/collections/:id/documents/:docId | Yes editor | Remove doc from collection |
| GET | /api/workspaces/:id/analytics | Yes viewer | Summary + top docs + timeseries |
| GET | /api/workspaces/:id/analytics/documents/:docId | Yes viewer | Doc-level analytics |

### Missing from API

- ❌ `POST /api/auth/logout` — no refresh token revocation
- ❌ `GET /api/auth/me` — returns current user
- ❌ TypeScript — entire codebase is plain JS
- ❌ Winston structured logging
- ❌ Helmet security headers
- ❌ Compression middleware
- ❌ Request ID middleware
- ❌ `GET /api/ready` — readiness probe for K8s
- ❌ `POST /api/documents/process` — document intelligence callback
- ❌ `GET /api/analytics` (global, not workspace-scoped) — needed by frontend
- ❌ RAGAS score fields in analytics responses
- ❌ Similar queries endpoint

---

## 2. Agent Service — Current State

**Location:** `services/agent/app/`  
**Runtime:** Python 3.12, FastAPI, LangGraph StateGraph  
**Status:** ✅ Core pipeline works, missing streaming + LangSmith + document intelligence

### Implemented

| Method | Path | Notes |
|--------|------|-------|
| GET | /health | Basic health check |
| POST | /agent/query | Full LangGraph pipeline (5-node DAG) |
| GET | /agent/conversations/:session_id | Get conversation with messages |
| DELETE | /agent/conversations/:session_id | Delete conversation |
| GET | /agent/conversations/:session_id/actions | Agent action trace |
| GET | /agent/health | Detailed health (DB + RAG check) |

### LangGraph Nodes

1. `query_analyzer_node` — classifies query (factual/comparative/summarization), decomposes to sub-queries
2. `retriever_node` — calls RAG `/query-chunks` for each sub-query, deduplicates
3. `relevance_grader_node` — grades each chunk, rewrites query + retries if < 3 relevant chunks
4. `generator_node` — generates answer with inline `[chunk_id]` citations
5. `hallucination_checker_node` — verifies claims against chunks, self-corrects

### Missing from Agent

- ❌ `POST /agent/query/stream` — SSE streaming endpoint (CRITICAL)
- ❌ LangSmith tracing — `@traceable` decorators, env var wiring
- ❌ `POST /agent/documents/process` — document intelligence pipeline
- ❌ Streaming-capable node execution (nodes return synchronously, no yield)
- ❌ `LANGCHAIN_API_KEY`, `LANGCHAIN_TRACING_V2`, `LANGCHAIN_PROJECT` in config
- ❌ Document intelligence: summary, topics, entities, key_insights, document_type

---

## 3. RAG Service — Current State

**Location:** `services/rag/app/`  
**Runtime:** Python 3.12, FastAPI  
**Status:** ✅ Hybrid retrieval works (BM25 + Qdrant + Cohere rerank), missing RAGAS + Pinecone + query history

### Implemented

| Method | Path | Notes |
|--------|------|-------|
| GET | /health | Basic |
| POST | /embed | Qdrant upsert + BM25 rebuild |
| POST | /query | Full RAG pipeline with decomposition |
| POST | /query-chunks | Raw chunks for agent (no LLM) |
| POST | /reindex/:workspace_id | Manual BM25 rebuild |
| DELETE | /documents/:id/vectors | Delete vectors |

### Retrieval Architecture

- **Dense**: Qdrant with `all-MiniLM-L6-v2` (384d)
- **Sparse**: BM25 via Redis (workspace-scoped keys)
- **Fusion**: Reciprocal Rank Fusion (k=60)
- **Reranking**: Cohere `rerank-english-v3.0` (graceful degradation)

### Missing from RAG

- ❌ RAGAS evaluation (`POST /eval`, `GET /eval/summary`)
- ❌ Pinecone as alternative vector backend
- ❌ Query history stored in Qdrant (`query_history` collection)
- ❌ `GET /similar-queries?q=...` endpoint
- ❌ Redis caching for frequent query results
- ❌ `RAGAS_ENABLED`, `PINECONE_API_KEY`, `PINECONE_INDEX` env vars

---

## 4. Frontend — Current State

**Location:** `apps/web/src/`  
**Runtime:** React 18, Vite, TypeScript  
**Status:** ⚠️ Minimal — single AppHome page, Firebase auth, basic SSE

### Implemented

- `LandingPage` — marketing page
- `AuthPage` — Firebase login/register (uses Firebase, not custom JWT)
- `AppHome` — combined upload + chat interface
  - File upload with XHR progress tracking
  - Document list in sidebar
  - Chat with SSE streaming (EventSource GET, not POST)
  - Citation click → PDF viewer panel (`DocViewer`)
  - RAG/Agent mode toggle

### Issues Found in Frontend

- ❌ Uses Firebase authentication — does NOT use the Node.js API JWT
- ❌ SSE uses `EventSource` (GET only) — server uses GET `/query/stream` with `?q=` param
- ❌ No proper typed SSE events (plan, thinking, tool_call, answer_chunk)
- ❌ No Documents page, Analytics page, Document Detail page
- ❌ No React Query — manual `useState` + `useEffect` fetch patterns
- ❌ No toast notifications, no dark mode toggle, no mobile menu
- ❌ No loading skeletons, no empty states beyond inline text
- ❌ No workspace selector — uses `WORKSPACE_FALLBACK = 'default'`
- ❌ Auth token not sent in API requests (Firebase user vs JWT mismatch)

---

## 5. Database Schema — Current State

**Location:** `services/api/src/db/migrations/`

### Tables Present

| Table | Migration | Notes |
|-------|-----------|-------|
| users | 001 | id, email, password_hash, name |
| documents | 001+003 | + workspace_id via ALTER |
| document_chunks | 001+003 | + workspace_id via ALTER |
| conversations | 001 | session_id, user_id |
| messages | 001 | conversation_id, role, content, citations |
| query_analytics | 001+005 | + document_ids, citations, mode_used, workspace_id |
| agent_actions | 002 | conversation_id, action_type, tool_name |
| workspaces | 003 | id, name, slug, owner_id, qdrant_namespace |
| workspace_members | 003 | workspace_id, user_id, role |
| collections | 004 | workspace_id, name |
| collection_documents | 004 | collection_id, document_id |

### Missing Tables

- ❌ `sessions` table — refresh tokens stored in Redis only, not DB (acceptable but no DB audit trail)
- ❌ `document_metadata` table — AI-enriched fields (summary, topics, entities, key_insights, document_type)
- ❌ RAGAS scores column in `query_analytics`
- ❌ `query_analytics.ragas_scores JSONB`

---

## 6. Infrastructure — Current State

### Docker Compose
- ✅ postgres:16-alpine, redis:7-alpine, qdrant:latest
- ✅ api, rag, agent, frontend services
- ❌ No health-check conditions on rag/agent (uses `service_started`)
- ❌ No Nginx reverse proxy
- ❌ No network isolation (all on default bridge)
- ❌ Uses plain `postgres:postgres` credentials
- ❌ No multi-stage builds

### Missing Infrastructure
- ❌ `infra/nginx/nginx.conf`
- ❌ `infra/nginx/conf.d/docsense.conf`
- ❌ `infra/k8s/*.yaml` — all K8s manifests
- ❌ `.github/workflows/ci.yml`
- ❌ `scripts/setup.sh`
- ❌ `infra/compose/env/*.env.example` files

---

## 7. Environment Variables — Referenced but Missing from Examples

### Agent Service

| Variable | Used In | Status |
|----------|---------|--------|
| `LANGCHAIN_TRACING_V2` | config.py (missing) | ❌ Not in .env.example |
| `LANGCHAIN_API_KEY` | config.py (missing) | ❌ Not in .env.example |
| `LANGCHAIN_PROJECT` | config.py (missing) | ❌ Not in .env.example |
| `ENABLE_TRACE_LOGGING` | config.py | ✅ Present |

### RAG Service

| Variable | Used In | Status |
|----------|---------|--------|
| `PINECONE_API_KEY` | Not implemented | ❌ Missing |
| `PINECONE_INDEX` | Not implemented | ❌ Missing |
| `RAGAS_ENABLED` | Not implemented | ❌ Missing |
| `COHERE_API_KEY` | hybrid_retriever.py | ❌ Not in .env.example |

### API Service

| Variable | Used In | Status |
|----------|---------|--------|
| `JWT_REFRESH_SECRET` | auth.js | ❌ Uses same JWT_SECRET |
| `LOG_LEVEL` | Not implemented | ❌ Missing |
| `UPLOAD_MAX_SIZE_MB` | config.js | ❌ Not in .env.example |

---

## 8. What the Go Code Did (Legacy Reference)

The Go code in `services/api/internal/` implemented:
- `transport/http/auth/routes.go` — Register/Login endpoints
- `transport/http/documents/` — Upload, list, delete, query, handler
- `transport/http/users/` — User routes
- `transport/http/middleware/` — CORS, auth context, request ID, dev auth
- `internal/ingest/` — chunk and extract text
- `internal/adapters/` — agent client, RAG client, postgres adapter, config
- `internal/domain/` — domain objects
- `internal/ports/` — port interfaces

**All functionality has been re-implemented in Node.js and is more complete.**  
The Go code is safe to ignore (not wired into Dockerfile).

---

## 9. Missing Features vs README Promises

| Feature | README Claims | Reality |
|---------|--------------|---------|
| Hybrid search | ✅ | ✅ Vector + BM25 + Cohere rerank |
| BM25 | ✅ | ✅ Redis-backed per workspace |
| Vector embeddings | ✅ | ✅ all-MiniLM-L6-v2 |
| Reranking | ✅ | ✅ Cohere (graceful fallback) |
| LangGraph agents | ✅ | ✅ 5-node DAG |
| Hallucination checking | ✅ | ✅ Node 5 self-correction |
| Multi-tenant RBAC | ✅ | ✅ admin/editor/viewer roles |
| Citation highlighting | ✅ | ⚠️ Backend returns offsets, frontend shows basic |
| SSE streaming | ✅ | ⚠️ GET-only, no typed events (plan/thinking/tool_call) |
| Rate limiting | ✅ | ✅ Per-route in API |
| Query analytics | ✅ | ✅ Basic — no RAGAS scores |
| LangSmith observability | ❌ | ❌ Not implemented |
| RAGAS evaluation | ❌ | ❌ Not implemented |
| Pinecone support | ❌ | ❌ Not implemented (Qdrant only) |
| Query history / similar queries | ❌ | ❌ Not implemented |
| Document intelligence (summary/topics) | ❌ | ❌ Not implemented |
| Kubernetes deployment | ❌ | ❌ No manifests |
| Nginx reverse proxy | ❌ | ❌ No config |
| GitHub Actions CI/CD | ❌ | ❌ No workflows |

---

## 10. Implementation Plan (Phases)

1. ✅ **AUDIT.md** — this document
2. **API TypeScript migration** — convert src/*.js → src/*.ts, add tsconfig, helmet, winston, missing endpoints
3. **Agent SSE streaming** — `POST /agent/query/stream`, LangSmith tracing, document intelligence pipeline
4. **RAG enhancements** — RAGAS eval endpoints, Pinecone backend, query history in Qdrant, similar queries
5. **Frontend overhaul** — switch from Firebase to JWT, typed SSE events, Analytics page, proper workspace handling
6. **Docker Compose** — production-grade with Nginx, health conditions, network isolation
7. **Nginx + K8s** — nginx.conf, all K8s manifests with HPA
8. **CI/CD + Env files** — GitHub Actions, env.example files, setup.sh
9. **VERIFICATION.md** — end-to-end test checklist with results
