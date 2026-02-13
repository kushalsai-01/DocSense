# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# DocSense Makefile
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

.PHONY: up down build logs ps health clean env

# ─── Quick Start ──────────────────────────────────

## Start all services
up:
	docker compose up -d --build

## Stop all services
down:
	docker compose down

## Rebuild without cache
build:
	docker compose build --no-cache

## Restart all services
restart: down up

# ─── Observability ────────────────────────────────

## Tail combined logs
logs:
	docker compose logs -f

## Tail specific service logs (usage: make log s=api)
log:
	docker compose logs -f $(s)

## Show running containers
ps:
	docker compose ps

## Health check all services
health:
	@echo "--- API Gateway ---"
	@curl -sf http://localhost:8080/health  | python -m json.tool 2>/dev/null || echo "UNREACHABLE"
	@echo "\n--- RAG Service ---"
	@curl -sf http://localhost:8000/health  | python -m json.tool 2>/dev/null || echo "UNREACHABLE"
	@echo "\n--- Agent Service ---"
	@curl -sf http://localhost:8100/agent/health | python -m json.tool 2>/dev/null || echo "UNREACHABLE"

# ─── Environment ──────────────────────────────────

## Copy all .env.example files to .env (will not overwrite)
env:
	@for f in infra/compose/env/*.env.example; do \
		target=$${f%.example}; \
		if [ ! -f "$$target" ]; then cp "$$f" "$$target" && echo "Created $$target"; \
		else echo "Skipped $$target (already exists)"; fi; \
	done
	@if [ ! -f .env ]; then cp .env.example .env && echo "Created .env"; \
	else echo "Skipped .env (already exists)"; fi

# ─── Cleanup ──────────────────────────────────────

## Remove all containers + volumes (DESTRUCTIVE)
clean:
	docker compose down -v --remove-orphans
	@echo "All containers and volumes removed."

## Remove dangling images
prune:
	docker image prune -f

# ─── Testing ──────────────────────────────────────

## Run all agent service tests
test-agent:
	cd services/agent && python -m pytest tests/ -v

## Run tests with coverage
test-agent-cov:
	cd services/agent && python -m pytest tests/ -v --cov=app --cov-report=html

## Run integration tests only
test-integration:
	cd services/agent && python -m pytest tests/test_integration.py -v -m integration

## Run all tests across services
test-all:
	@echo "Running Agent Service tests..."
	cd services/agent && python -m pytest tests/ -v
	@echo "\nRunning RAG Service tests..."
	cd services/rag && python -m pytest tests/ -v

## Validate agent orchestration end-to-end
test-e2e:
	@echo "Starting services..."
	@docker compose up -d
	@echo "Waiting for services to be healthy..."
	@sleep 15
	@echo "Running end-to-end test..."
	@python scripts/test_e2e.py
	@echo "Stopping services..."
	@docker compose down
