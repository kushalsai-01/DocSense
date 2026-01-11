# DocSense Deployment Checklist

Use this checklist to ensure a smooth deployment of DocSense.

## Pre-Deployment

### 1. Environment Configuration

- [ ] Copy all `.env.example` files to `.env` files in `infra/compose/env/`
- [ ] Set `OPENAI_API_KEY` in `infra/compose/env/rag.env` (REQUIRED)
- [ ] Review and adjust database credentials in `infra/compose/env/postgres.env`
- [ ] Verify `RAG_SERVICE_URL` in `infra/compose/env/api.env` matches service name
- [ ] Check all port configurations match your infrastructure

### 2. Required Environment Variables

**RAG Service** (`infra/compose/env/rag.env`):
```bash
OPENAI_API_KEY=your_key_here  # REQUIRED
LLM_PROVIDER=openai
OPENAI_MODEL=gpt-4o-mini
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
```

**API Service** (`infra/compose/env/api.env`):
```bash
RAG_SERVICE_URL=http://rag:8000
DB_HOST=postgres
DB_USER=docsense
DB_PASSWORD=docsense_dev_password
DB_NAME=docsense
```

### 3. Prerequisites

- [ ] Docker and Docker Compose installed
- [ ] At least 4GB RAM available for services
- [ ] Network access for OpenAI API (if using cloud)
- [ ] Ports available: 8080 (API), 8000 (RAG), 5173 (Web), 5432 (Postgres), 6333 (Qdrant)

## Deployment Steps

### 1. Start Infrastructure

```bash
cd infra/compose
docker-compose up -d postgres qdrant
```

Wait for services to be healthy:
```bash
docker-compose ps
```

### 2. Verify Database Schema

The schema is automatically applied via init scripts, but verify:
```bash
docker-compose exec postgres psql -U docsense -d docsense -c "\dt"
```

### 3. Start Application Services

```bash
docker-compose up -d api rag web
```

### 4. Verify Services

**API Service:**
```bash
curl http://localhost:8080/health
# Expected: {"status":"ok"}
```

**RAG Service:**
```bash
curl http://localhost:8000/health
# Expected: {"status":"ok"}
```

**Qdrant:**
```bash
curl http://localhost:6333/collections
# Should return JSON with collections
```

### 5. Test Document Upload

```bash
curl -X POST http://localhost:8080/api/documents/upload \
  -H "X-User-Id: 00000000-0000-0000-0000-000000000001" \
  -F "file=@test.pdf"
```

### 6. Test Query

```bash
curl -X POST http://localhost:8080/api/documents/query \
  -H "Content-Type: application/json" \
  -H "X-User-Id: 00000000-0000-0000-0000-000000000001" \
  -d '{"query": "What is this document about?", "top_k": 5}'
```

### 7. Access Frontend

Open browser: http://localhost:5173

## Common Issues

### RAG Service Fails to Start

**Symptom**: Container exits with error about OpenAI API key

**Solution**: 
- Verify `OPENAI_API_KEY` is set in `rag.env`
- Check logs: `docker-compose logs rag`
- Ensure API key is valid

### Embedding Model Download Fails

**Symptom**: RAG service starts but embeddings fail

**Solution**:
- First run downloads model (~90MB) - be patient
- Check network connectivity
- Verify disk space available
- Check logs for specific error

### Database Connection Errors

**Symptom**: API service can't connect to PostgreSQL

**Solution**:
- Verify `DB_HOST=postgres` (use service name, not localhost)
- Check PostgreSQL is running: `docker-compose ps postgres`
- Verify credentials match in `postgres.env` and `api.env`
- Check logs: `docker-compose logs api`

### Qdrant Collection Not Created

**Symptom**: Queries fail with collection not found

**Solution**:
- Check RAG service started successfully
- Verify Qdrant is accessible: `curl http://localhost:6333/collections`
- Check RAG service logs for collection creation errors
- Collection is created on first RAG service startup

### Documents Not Indexing

**Symptom**: Uploads succeed but queries return no results

**Solution**:
- Check RAG service logs for embedding errors
- Verify chunks were created: Check PostgreSQL `document_chunks` table
- Check Qdrant has points: Query Qdrant API
- Verify document status is "ready" in database

## Production Recommendations

Before deploying to production:

- [ ] Change all default passwords
- [ ] Use proper secrets management (not env files)
- [ ] Enable SSL/TLS for all services
- [ ] Set up proper authentication (replace dev auth)
- [ ] Configure backup strategy for PostgreSQL
- [ ] Set up monitoring and alerting
- [ ] Configure log aggregation
- [ ] Set up rate limiting
- [ ] Review and adjust resource limits
- [ ] Set up health check endpoints monitoring
- [ ] Configure CORS properly for frontend
- [ ] Review security settings

## Monitoring

### Health Checks

All services expose `/health` endpoints:
- API: http://localhost:8080/health
- RAG: http://localhost:8000/health

### Logs

View logs:
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f rag
docker-compose logs -f api
```

### Database

Check document count:
```bash
docker-compose exec postgres psql -U docsense -d docsense \
  -c "SELECT COUNT(*) FROM documents;"
```

Check chunk count:
```bash
docker-compose exec postgres psql -U docsense -d docsense \
  -c "SELECT COUNT(*) FROM document_chunks;"
```

### Qdrant

Check collection info:
```bash
curl http://localhost:6333/collections/docsense_chunks
```

## Scaling Considerations

- **RAG Service**: Can scale horizontally (stateless)
- **API Service**: Can scale horizontally (stateless)
- **PostgreSQL**: Requires connection pooling or read replicas
- **Qdrant**: Check Qdrant scaling documentation
- **Frontend**: Served statically, can use CDN

## Backup Strategy

### Database Backup

```bash
docker-compose exec postgres pg_dump -U docsense docsense > backup.sql
```

### Qdrant Backup

See Qdrant documentation for snapshot/backup procedures.

### Document Files

Backup the `api_data` volume or mounted storage directory.

---

**Ready for Deployment!** ✅
