# DocSense — Verification Checklist

> Run through each item after executing `bash scripts/setup.sh` and `docker compose up -d --build`.

---

## Boot test

| # | Check | Command | Expected |
|---|-------|---------|----------|
| 1 | Setup script | `bash scripts/setup.sh` | No errors, env files created |
| 2 | Docker build | `docker compose up -d --build` | All 7 images built |
| 3 | All containers healthy | `docker compose ps` (wait 90s) | All STATUS = healthy |
| 4 | API health | `curl http://localhost/api/health` | `{"status":"ok","services":{...}}` |
| 5 | API ready | `curl http://localhost/api/ready` | `{"status":"ready"}` |
| 6 | Frontend loads | Browser: `http://localhost` | Login/Register page renders |

---

## Authentication

| # | Check | How |
|---|-------|-----|
| 7 | Register | POST `/api/auth/register` `{name,email,password}` → 201 with `{token, refreshToken, user}` |
| 8 | Login | POST `/api/auth/login` → 200 with tokens |
| 9 | Protected 401 | GET `/api/documents` without header → 401 `"Invalid token"` |
| 10 | Refresh | POST `/api/auth/refresh` `{refreshToken}` → new access token |
| 11 | Logout | POST `/api/auth/logout` → deletes refresh token from DB |
| 12 | Me endpoint | GET `/api/auth/me` → user object without password |

---

## Document pipeline

| # | Check | How |
|---|-------|-----|
| 13 | Upload PDF | POST `/api/workspaces/default/documents/upload` with `file` multipart |
| 14 | Status transitions | GET `/api/documents/:id` polls → `processing` → `ready` |
| 15 | Library shows summary | Documents page shows AI summary and topics pills |
| 16 | Delete | DELETE `/api/documents/:id` → 204 + removed from Qdrant |

---

## Query and streaming

| # | Check | How |
|---|-------|-----|
| 17 | Non-streaming query | POST `.../query` `{query, stream:false}` → `{answer, citations, qualityScore}` |
| 18 | Streaming query | POST `.../query` `{query, stream:true}` → SSE events in order |
| 19 | SSE event sequence | `plan → thinking → tool_call → tool_result → answer_chunk* → answer_complete → done` |
| 20 | Graceful degradation | Kill agent service → still returns RAG answer with `degraded:true` |
| 21 | Citations | Each citation has `{docId, docName, chunkId, text, score}` |
| 22 | Query UI streaming | Characters appear in real time in browser |
| 23 | Agent trace accordion | Reasoning steps visible on expand |

---

## Hybrid search

| # | Check | How |
|---|-------|-----|
| 24 | Hybrid search active | POST `/rag/query` `{query, alpha:0.7}` returns results |
| 25 | BM25 component | `alpha:0.0` returns keyword-biased results |
| 26 | Dense component | `alpha:1.0` returns semantic results |

---

## RAGAS evaluation

| # | Check | How |
|---|-------|-----|
| 27 | Evaluate endpoint | POST `/rag/eval` `{question, answer, contexts}` → scores with 4 metrics |
| 28 | Summary endpoint | GET `/rag/eval/summary` → `{count, faithfulness, answerRelevancy, ...}` |
| 29 | Analytics page | RAGAS table shows scores (after running some queries) |

---

## Query history

| # | Check | How |
|---|-------|-----|
| 30 | Similar queries | GET `/rag/similar-queries?q=...&workspace_id=default` → `{results:[...]}` |
| 31 | Analytics page | Similar queries shown after several queries |

---

## LangSmith (optional — requires `LANGCHAIN_TRACING_V2=true` + API key)

| # | Check | How |
|---|-------|-----|
| 32 | Traces appear | https://smith.langchain.com → project `docsense` → traces listed |

---

## Document intelligence

| # | Check | How |
|---|-------|-----|
| 33 | Summary generated | Document card shows AI summary after upload |
| 34 | Topics extracted | Topics pills appear on document card |
| 35 | Entities extracted | GET `/api/documents/:id` → `metadata.entities` populated |
| 36 | Key insights | GET `/api/documents/:id` → `metadata.keyInsights` array |
| 37 | Document type | `metadata.documentType` classified |

---

## Kubernetes (local with minikube or kind)

| # | Check | How |
|---|-------|-----|
| 38 | Copy secrets | `cp infra/k8s/01-secrets.yaml.example infra/k8s/01-secrets.yaml` + edit |
| 39 | Apply manifests | `bash infra/k8s/deploy.sh` → no errors |
| 40 | All pods running | `kubectl get pods -n docsense` → all Running |
| 41 | HPA active | `kubectl get hpa -n docsense` → api-hpa and rag-service-hpa listed |
| 42 | Ingress reachable | Update `/etc/hosts` and browse to host |

---

## GitHub Actions CI/CD

| # | Check | How |
|---|-------|-----|
| 43 | Lint passes | Push to `develop` → lint-api job green |
| 44 | Tests pass | API, RAG, agent, frontend jobs green |
| 45 | Docker build | build-docker job completes |
| 46 | Deploy on main | Merge to `main` → deploy job runs (if registry secrets set) |

---

## RAGAS benchmark results (run after seeding 5+ documents and 10+ queries)

| Metric | Score |
|--------|-------|
| Faithfulness | — |
| Answer Relevancy | — |
| Context Recall | — |
| Context Precision | — |
| Overall | — |

> Fill in after running `GET /rag/eval/summary`
