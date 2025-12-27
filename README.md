# DocSense

DocSense is a production-grade monorepo scaffold for an AI SaaS that provides **grounded answers from your documents**.

This repository focuses on clean architecture, service boundaries, and an operational local stack (Postgres + Qdrant) via Docker Compose. Some endpoints/UI are scaffolded to demonstrate the intended flow, but the product is not fully implemented.

## Architecture (text diagram)

```
						  +-----------------------------+
						  |        Web Frontend         |
						  |  React + Vite + Tailwind    |
						  +--------------+--------------+
											  |
											  | HTTPS/JSON
											  v
						  +--------------+--------------+
						  |        API Backend          |
						  |        Go (Gin)             |
						  |  auth, users, documents     |
						  +-------+--------------+-------+
									 |              |
						 SQL (metadata)   HTTP (RAG)
									 |              |
									 v              v
						  +-------+----+   +-----+----------------+
						  |  Postgres   |   |   RAG Service        |
						  |  (relational|   | Python (FastAPI)     |
						  |  metadata)  |   | /embed, /query       |
						  +------------+   +-----+----------------+
															|
												  Vector search / upsert
															v
														+--+------+
														| Qdrant   |
														| (vectors)|
														+---------+
```

## Tech stack

- **Frontend**: React + Vite + Tailwind CSS
  - Dark, minimal landing page
  - Firebase Authentication UI + route guard
  - Chat-style UI scaffold (streaming-ready placeholder)
- **Backend API**: Go + Gin
  - Clean internal package boundaries (`auth`, `users`, `documents`, `middleware`, `config`)
  - PostgreSQL connectivity via `database/sql`
  - File upload endpoint saving PDFs to a mounted volume (no binaries in Postgres)
- **RAG Service**: Python + FastAPI
  - `/embed` and `/query` endpoints
  - Qdrant client integration
  - Deterministic placeholder embedder + placeholder answer generator (no model keys)
- **Data stores**:
  - PostgreSQL for transactional metadata
  - Qdrant for vector storage and similarity search
- **Infra**: Docker + docker-compose

## Why Go + Python split?

DocSense separates concerns to keep each service strong at its job:

- **Go for the API backend**: strong concurrency model, predictable performance, fast builds, and a solid fit for request/response APIs, uploads, and operational reliability.
- **Python for RAG/ML**: best ecosystem for embeddings, retrievers, vector DB tooling, and rapid iteration in AI workflows.

This split reduces coupling: the API remains stable and operationally simple, while the RAG service can evolve quickly (swap embedding models, add rerankers, add streaming) without impacting core API concerns.

## RAG workflow (high level)

1) **Upload**: user uploads a PDF to the Go API.
	- File bytes are stored on disk (mounted volume)
	- Postgres stores only metadata + storage path
2) **Chunk & embed**: document text is chunked and sent to the RAG service.
	- RAG `/embed` creates vectors and upserts them into Qdrant
3) **Query**: user asks a question.
	- RAG `/query` embeds the question, searches Qdrant, and returns top-k matches
4) **Generate**: an answer is produced using retrieved context.
	- Current repo uses a placeholder generator (no model provider keys)

## Running with Docker

Prereqs: Docker Desktop (Windows/macOS) or Docker Engine (Linux).

1) Create local environment file:

```bash
cp .env.example .env
```

2) Start the stack:

```bash
docker compose up --build
```

3) Validate services (default ports):

- Frontend: http://localhost:5173
- Go backend: http://localhost:8080/health
- RAG service: http://localhost:8000/health
- Qdrant: http://localhost:6333
- Postgres: localhost:5432

## Repo structure

- `apps/frontend` – React/Vite/Tailwind frontend (auth UI + chat UI scaffold)
- `services/backend-go` – Go Gin backend (upload + metadata persistence scaffold)
- `services/rag-service` – FastAPI RAG service (embed/query scaffold + Qdrant integration)
- `infra/postgres` – Postgres schema
- `docs` – architecture notes

## Future improvements

- Replace placeholder embedding/generation with real providers (OpenAI, Azure OpenAI, local models), including streaming output.
- Add background ingestion pipeline (async chunking + embedding jobs, retries, observability).
- Add migrations tooling (e.g., goose, atlas, or golang-migrate) and versioned schema management.
- Add robust auth/authorization across services (JWT validation, multi-tenant orgs, RBAC).
- Add observability (structured logs, metrics, tracing) and production config (secrets, TLS, health/readiness probes).
- Add CI/CD (lint, tests, security scanning, container publishing) and environment promotion.
