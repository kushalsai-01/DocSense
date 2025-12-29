# DocSense

Monorepo scaffold for an AI SaaS that serves grounded answers from user documents.

## Architecture

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

## Components

- **Web** (React/Vite): auth UI + basic chat scaffold
- **API** (Go/Gin): upload + metadata persistence scaffolding
- **RAG** (FastAPI): `/embed` + `/query` with placeholder embed/generation
- **Postgres**: transactional metadata
- **Qdrant**: vector storage/search

## Workflow (high level)

1) **Upload**: user uploads a PDF to the Go API.
	- File bytes are stored on disk (mounted volume)
	- Postgres stores only metadata + storage path
2) **Chunk & embed**: document text is chunked and sent to the RAG service.
	- RAG `/embed` creates vectors and upserts them into Qdrant
3) **Query**: user asks a question.
	- RAG `/query` embeds the question, searches Qdrant, and returns top-k matches
4) **Generate**: an answer is produced using retrieved context.
	- Current repo uses a placeholder generator (no model provider keys)

## Run locally (Docker Compose)

Prereqs: Docker Desktop (Windows/macOS) or Docker Engine (Linux).

1) Create local environment file (optional for compose project naming):

```bash
cp .env.example .env
```

2) Start the stack:

```bash
docker compose -f infra/compose/docker-compose.yml up --build
```

3) Validate (default ports):

- Frontend: http://localhost:5173
- Go backend: http://localhost:8080/health
- RAG service: http://localhost:8000/health
- Qdrant: http://localhost:6333
- Postgres: localhost:5432

## Repo structure

- `apps/web` – React/Vite/Tailwind frontend (auth UI + chat UI scaffold)
- `services/api` – Go Gin backend (upload + metadata persistence scaffold)
- `services/rag` – FastAPI RAG service (embed/query scaffold + Qdrant integration)
- `infra/compose` – Docker Compose + per-service env examples
- `infra/postgres` – Postgres schema
- `docs` – architecture notes

## Notes
- This repo is a scaffold: placeholder AI components are intentional.
