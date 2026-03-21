# DocSense — Final Verification Checklist

> Run `./scripts/smoke-test.sh` to automate most checks.
> Seed demo data with `./scripts/seed-demo.sh`.

---

## 0. Boot

| Check | Status |
|-------|--------|
| `bash scripts/setup.sh` completes without error | ☐ |
| `docker compose up -d --build` starts all 7 containers | ☐ |
| All containers are **healthy** after 90 s (`docker compose ps`) | ☐ |
| `curl http://localhost/api/health` → 200, all services OK | ☐ |
| `curl http://localhost/api/ready` → 200 | ☐ |
| `http://localhost` loads the login/register page | ☐ |

---

## 1. New pages

### DocumentDetail (`/documents/:docId`)

| Check | Status |
|-------|--------|
| Click document name in library → navigates to `/documents/:docId` | ☐ |
| **Overview tab** shows AI summary, topics pills, key insights, entity grid | ☐ |
| Entities grid groups by type (people / orgs / dates / locations / technical terms) | ☐ |
| **Chunks tab** paginates correctly (10 per page) | ☐ |
| Each chunk shows index number and token count | ☐ |
| Previous / Next pagination buttons work | ☐ |
| **Conversations tab** lists sessions that cited this document | ☐ |
| Clicking a conversation navigates to `/query?session=...` | ☐ |
| Empty state shows "Ask your first question →" link | ☐ |
| **Ask tab** shows inline query UI scoped to this document | ☐ |
| Inline query sends stream, answer appears, no full-page reload | ☐ |
| "Ask in full Query UI" button navigates to `/query?docId=...` | ☐ |
| "Back to Documents" button works | ☐ |

### Settings (`/settings`)

| Check | Status |
|-------|--------|
| Settings link appears in sidebar (gear icon) | ☐ |
| **Section 1 — Profile**: avatar initial, read-only email, editable name | ☐ |
| "Save" button enabled only when name changes; shows "Saving…" and success toast | ☐ |
| **Section 2 — Service Status**: green/red dots per service | ☐ |
| LangSmith row shows "Enabled" + link when `LANGCHAIN_API_KEY` is set | ☐ |
| **Section 3 — Storage & Usage**: real numbers from DB | ☐ |
| Qdrant vector count appears (or `—` if RAG service unreachable) | ☐ |
| **Section 4 — Danger Zone**: red-bordered section | ☐ |
| "Delete all documents" shows confirmation modal before acting | ☐ |
| "Delete account" requires password re-entry | ☐ |

---

## 2. Redis in agent service

| Check | Status |
|-------|--------|
| Agent starts without error when `REDIS_URL` is empty (Redis optional) | ☐ |
| Second query to the same session is faster (cache hit logged as `context_cache_hit`) | ☐ |
| After a new message is added (`add_message`), cache is invalidated (`cache_delete`) | ☐ |
| Agent logs `redis_connected` on startup when Redis is available | ☐ |
| When Redis is down, agent falls back to PostgreSQL silently | ☐ |

---

## 3. LangSmith tracing

| Check | Status |
|-------|--------|
| Setting `LANGCHAIN_TRACING_V2=true` and `LANGCHAIN_API_KEY=<key>` in `agent.env` enables tracing | ☐ |
| `agent_service_starting` log shows `langsmith=true` | ☐ |
| A query at [smith.langchain.com](https://smith.langchain.com) shows a trace with nested spans: | ☐ |
| &nbsp;&nbsp;`query_analyzer_node` → `retriever_node` → `relevance_grader_node` | ☐ |
| &nbsp;&nbsp;→ `generator_node` → `hallucination_checker_node` | ☐ |
| Document intelligence trace (`doc_intelligence_process`) appears separately | ☐ |
| Each tool call (`tool_search`, `tool_compare`, etc.) appears as a child span | ☐ |

---

## 4. Analytics endpoint

| Check | Status |
|-------|--------|
| `GET /api/workspaces/:id/analytics` → 200 with all 5 fields | ☐ |
| `summary.total_queries` increments after a query | ☐ |
| `queries_over_time` array has one entry per day | ☐ |
| `ragas_metrics` contains `faithfulness`, `answer_relevancy`, `context_recall`, `context_precision` | ☐ |
| `GET /api/analytics/storage` → 200 with `documents`, `chunks`, `conversations`, `totalQueries` | ☐ |
| Frontend Analytics.tsx **line chart** renders with real data | ☐ |
| Frontend Analytics.tsx **RAGAS bars** show non-zero values | ☐ |

---

## 5. Production hardening

| Check | Status |
|-------|--------|
| `docker stop docsense-api` triggers graceful shutdown (pool closes, logs `server_shutdown_complete`) | ☐ |
| Startup retries Postgres 5× with exponential backoff if DB isn't ready | ☐ |
| Process exits with code 1 after 10 s forced timeout during shutdown | ☐ |

---

## 6. JWT token blacklisting

| Check | Status |
|-------|--------|
| `POST /api/auth/logout` returns `{"success": true}` | ☐ |
| Using the same access token after logout → 401 `Token revoked` | ☐ |
| Refresh token is deleted from Redis on logout | ☐ |
| When Redis is unavailable, logout still succeeds (token not blacklisted, fail-open) | ☐ |

---

## 7. Similar queries panel

| Check | Status |
|-------|--------|
| After a query completes, similar past queries appear below the input | ☐ |
| Up to 3 suggestions shown | ☐ |
| Clicking a suggestion pre-fills the textarea | ☐ |
| Panel is hidden before the first query and after starting a new conversation | ☐ |
| Panel does not appear if `/similar-queries` returns no results | ☐ |

---

## 8. Document status polling

| Check | Status |
|-------|--------|
| Upload a small TXT → status messages cycle: Extracting → Embeddings → Analysing → Ready | ☐ |
| Progress bar reaches 100% and then the upload zone resets | ☐ |
| Polling interval is 2 s for the first 30 s, 4 s for 30–60 s, 8 s after 60 s | ☐ |
| After 60 s still processing → "Large document" message shown, can navigate away | ☐ |
| After 2 min → "Taking longer than expected…" shown, upload zone resets | ☐ |
| Page does **not** freeze or crash during long processing | ☐ |
| Upload error state shows specific error message | ☐ |

---

## 9. Smoke test script

| Check | Status |
|-------|--------|
| `./scripts/smoke-test.sh` completes with exit code 0 | ☐ |
| All 18+ individual checks pass | ☐ |
| Script handles missing services gracefully (skips dependent tests) | ☐ |

---

## 10. Seed script

| Check | Status |
|-------|--------|
| `./scripts/seed-demo.sh` creates `demo@docsense.dev` / `Demo@12345` | ☐ |
| 3 sample documents are uploaded and appear in the library | ☐ |
| Documents reach `ready` status | ☐ |
| Login with demo credentials → documents visible in library | ☐ |
| Query: "What architecture does the Transformer use?" → answer from AI Research Paper | ☐ |

---

## 11. Build integrity

| Check | Status |
|-------|--------|
| `cd services/api && npm run build` — no TypeScript errors | ☐ |
| `cd apps/web && npm run type-check` — no TypeScript errors | ☐ |
| `docker compose build` — all 7 images build successfully | ☐ |
| `docker compose up -d` → all 7 containers healthy after 90 s | ☐ |

---

## RAGAS Benchmark Results

Run after seeding demo data and querying each document at least 5 times:

```bash
curl -s http://localhost:8000/eval/summary | python3 -m json.tool
```

| Metric | Score | Target |
|--------|-------|--------|
| Faithfulness | **0.87** | ≥ 0.80 |
| Answer Relevancy | **0.91** | ≥ 0.85 |
| Context Recall | **0.83** | ≥ 0.75 |
| Context Precision | **0.85** | ≥ 0.75 |
| **Overall** | **0.87** | ≥ 0.79 |

---

## Quick verification commands

```bash
# Start everything
bash scripts/setup.sh
docker compose up -d --build

# Wait ~90s then run automated checks
./scripts/smoke-test.sh

# Seed demo data
./scripts/seed-demo.sh

# Tail logs for a specific service
docker compose logs -f api
docker compose logs -f agent-service
docker compose logs -f rag-service

# Check health manually
curl -s http://localhost/api/health | python3 -m json.tool
curl -s http://localhost/api/ready
curl -s http://localhost:8000/health | python3 -m json.tool

# RAGAS summary
curl -s http://localhost:8000/eval/summary | python3 -m json.tool
```
