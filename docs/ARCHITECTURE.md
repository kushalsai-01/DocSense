# Architecture

This repo is a monorepo scaffold for DocSense.

## Principles

- Clear separation of concerns (transport vs application vs domain vs infrastructure).
- Explicit dependencies (domain does not depend on infrastructure).
- Container-first local dev with docker-compose.

## Backend (Go/Gin)

Suggested layers:
- `cmd/api` – entrypoint wiring
- `internal/transport/http` – Gin routes/handlers
- `internal/app` – application use-cases/services
- `internal/domain` – entities and domain logic (no external deps)
- `internal/infra` – DB repositories, clients, config, logging

## RAG Service (FastAPI)

Suggested layers:
- `app/api` – FastAPI routes
- `app/core` – settings, logging
- `app/domain` – types and domain logic
- `app/services` – orchestration/use-cases
- `app/infra` – clients (qdrant, postgres), providers

## Data stores

- Postgres for transactional data.
- Qdrant for vectors.

## Containerization

All services are defined in `docker-compose.yml` with named volumes for persistence.
