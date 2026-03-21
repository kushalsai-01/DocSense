.PHONY: dev dev-down logs migrate smoke seed deploy-api deploy-rag deploy-agent deploy-web deploy-all health

dev:
	docker-compose up --build

dev-down:
	docker-compose down

logs:
	docker-compose logs -f

migrate:
	cd services/api && node src/db/migrate.js

deploy-api:
	cd services/api && railway up

deploy-rag:
	cd services/rag && railway up

deploy-agent:
	cd services/agent && railway up

deploy-web:
	cd apps/web && vercel --prod

deploy-all: deploy-api deploy-rag deploy-agent deploy-web

smoke:
	bash scripts/smoke-test.sh

seed:
	bash scripts/seed-demo.sh

health:
	@curl -s $${API_URL:-http://localhost/api}/health | python3 -m json.tool
	@curl -s $${RAG_URL:-http://localhost:8000}/health | python3 -m json.tool
	@curl -s $${AGENT_URL:-http://localhost:8100}/health | python3 -m json.tool
