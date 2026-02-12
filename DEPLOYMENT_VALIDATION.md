# 🚀 DocSense Deployment & Validation Guide

**Complete guide for deploying and validating the DocSense RAG system with Gemini.**

---

## ⚡ QUICK START

### 1. Set Your Gemini API Key

```bash
# Navigate to compose directory
cd infra/compose

# Copy the env file
cp .env .env.backup

# Edit .env and replace YOUR_GEMINI_API_KEY_HERE with your actual key
# Get key from: https://aistudio.google.com/app/apikey
```

**Edit `infra/compose/.env`:**
```bash
GEMINI_API_KEY=AIzaSyC...your_actual_key_here
```

### 2. Start the System

```powershell
# From repository root
cd infra/compose

# Clean start (removes old data)
docker compose down -v

# Build and start all services
docker compose up --build
```

**Expected output:**
```
✓ Network compose_default          Created
✓ Volume compose_postgres-data     Created  
✓ Volume compose_qdrant-data       Created
✓ Volume compose_api-data          Created
✓ Container compose-postgres-1     Healthy
✓ Container compose-qdrant-1       Healthy
✓ Container compose-api-1          Healthy
✓ Container compose-rag-1          Healthy
✓ Container compose-web-1          Started
```

### 3. Access the Application

- **Frontend:** http://localhost:5173
- **API Docs:** http://localhost:8080/health
- **RAG Service:** http://localhost:8000/health
- **Qdrant Dashboard:** http://localhost:6333/dashboard

---

## 🔍 PHASE 2: SERVICE HEALTH VERIFICATION

### Check All Services

```powershell
# PostgreSQL
docker compose exec postgres pg_isready -U docsense

# Qdrant
curl http://localhost:6333/health

# Go API
curl http://localhost:8080/health

# Python RAG
curl http://localhost:8000/health
```

**Expected responses:**
```bash
# PostgreSQL
/var/run/postgresql:5432 - accepting connections

# Qdrant
{"title":"qdrant - vector search engine","version":"1.12.1"}

# Go API
{"status":"healthy","timestamp":"2026-02-11T..."}

# Python RAG
{"status":"healthy","environment":"production","qdrant_connected":true}
```

---

## 📄 PHASE 3: END-TO-END VALIDATION

### Step 1: Upload a PDF

Create a test file:
```powershell
# Create a sample PDF content file (tmp/sample.txt already exists)
# Or create your own test.txt
echo "Artificial Intelligence is transforming industries. Machine learning enables computers to learn from data." > test.txt
```

**Upload via API:**
```powershell
# Upload document (replace test.txt with your PDF path)
curl -X POST http://localhost:8080/api/documents `
  -F "file=@test.txt" `
  -F "title=AI Test Document" | jq
```

**Expected response:**
```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "title": "AI Test Document",
  "filename": "test.txt",
  "file_size": 156,
  "mime_type": "text/plain",
  "created_at": "2026-02-11T15:30:00Z",
  "pages_extracted": 1,
  "processing_status": "completed"
}
```

**Save the document ID** for next steps.

---

### Step 2: Verify Document Processing

```powershell
# Check document metadata
curl http://localhost:8080/api/documents/a1b2c3d4-e5f6-7890-abcd-ef1234567890 | jq

# List all documents
curl http://localhost:8080/api/documents | jq
```

**Expected:**
- `processing_status: "completed"`
- `pages_extracted` > 0
- Document appears in list

---

### Step 3: Verify Embeddings in Qdrant

```powershell
# Check collection exists and has vectors
curl http://localhost:6333/collections/docsense_chunks | jq
```

**Expected response:**
```json
{
  "result": {
    "status": "green",
    "vectors_count": 5,
    "points_count": 5,
    "segments_count": 1
  }
}
```

**Key checks:**
- ✅ `vectors_count` > 0 (means embeddings were created)
- ✅ `status: "green"` (healthy collection)

---

### Step 4: Query with Gemini

```powershell
# Ask a question about the uploaded document
curl -X POST http://localhost:8080/api/query `
  -H "Content-Type: application/json" `
  -d '{\"query\": \"What is artificial intelligence?\"}' | jq
```

**Expected response (with Gemini):**
```json
{
  "answer": "Based on the provided documents, Artificial Intelligence (AI) is described as a technology that is transforming industries. The text also mentions that machine learning, a subset of AI, enables computers to learn from data rather than being explicitly programmed.",
  "sources": [
    {
      "document_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "chunk_id": "chunk_0",
      "text": "Artificial Intelligence is transforming industries. Machine learning enables computers to learn from data.",
      "score": 0.87
    }
  ]
}
```

**Key validations:**
- ✅ `answer` is a coherent sentence (not just raw text dump)
- ✅ `sources` contains relevant chunks with scores > 0.7
- ✅ Answer cites information from uploaded document

**If Gemini fails:**
```json
{
  "answer": "LLM is not configured (set GEMINI_API_KEY). Here are the most relevant passages from your documents:\n\n[1] Artificial Intelligence is transforming industries...",
  "sources": [...]
}
```
→ Check your `GEMINI_API_KEY` in `.env` file

---

### Step 5: Restart Persistence Test

```powershell
# Restart containers (keeps volumes)
docker compose restart

# Wait 30 seconds for services to stabilize

# Query again with the same question
curl -X POST http://localhost:8080/api/query `
  -H "Content-Type: application/json" `
  -d '{\"query\": \"What is artificial intelligence?\"}' | jq
```

**Expected:**
- ✅ Same answer as before
- ✅ Same document chunks retrieved
- ✅ No re-embedding needed (vectors persisted)

---

### Step 6: Delete Document & Verify Cleanup

```powershell
# Delete the document
curl -X DELETE http://localhost:8080/api/documents/a1b2c3d4-e5f6-7890-abcd-ef1234567890

# Verify document is gone
curl http://localhost:8080/api/documents | jq
# Should return empty array or not include deleted doc

# Check Qdrant vectors were cleaned up
curl http://localhost:6333/collections/docsense_chunks | jq
# vectors_count should be 0 if no other docs exist
```

**Expected:**
- ✅ Document no longer in PostgreSQL
- ✅ Vectors removed from Qdrant
- ✅ Files removed from storage

---

## 🐛 COMMON MISCONFIGURATION MISTAKES

### 1. ❌ Gemini API Key Not Set
**Symptom:**
```json
{"answer": "LLM is not configured (set GEMINI_API_KEY)..."}
```
**Fix:**
```bash
# Edit infra/compose/.env
GEMINI_API_KEY=AIzaSyC...your_actual_key_here

# Restart RAG service only
docker compose restart rag
```

---

### 2. ❌ Qdrant Collection Not Created
**Symptom:**
```
ERROR: Collection docsense_chunks not found
```
**Fix:**
```bash
# Check RAG service logs
docker compose logs rag

# Restart to trigger collection creation
docker compose restart rag
```

---

### 3. ❌ Database Connection Failed
**Symptom:**
```
ERROR: cannot connect to postgres:5432
```
**Fix:**
```bash
# Check if postgres is healthy
docker compose ps

# Verify DB credentials match in .env
DB_USER=docsense
DB_PASSWORD=docsense_secure_password_change_in_production
POSTGRES_USER=docsense
POSTGRES_PASSWORD=docsense_secure_password_change_in_production
# ^^^^^^^ These must match exactly
```

---

### 4. ❌ File Upload Fails (Size Limit)
**Symptom:**
```
HTTP 413: Request Entity Too Large
```
**Fix:**
```bash
# Edit infra/compose/.env
MAX_UPLOAD_BYTES=52428800  # 50MB

# Restart API
docker compose restart api
```

---

### 5. ❌ Frontend Can't Reach API
**Symptom:**
- Frontend loads but shows "Network Error"
- Console shows `Failed to fetch`

**Fix:**
```bash
# Check VITE_API_PROXY_TARGET in .env
VITE_API_PROXY_TARGET=http://api:8080
# Inside Docker, must use service name "api", NOT "localhost"

# Rebuild web service
docker compose up --build web
```

---

### 6. ❌ Gemini Rate Limit Exceeded
**Symptom:**
```json
{"error": "429 Resource has been exhausted"}
```
**Fix:**
- Wait 60 seconds (Gemini free tier: 15 RPM)
- Or upgrade to paid tier
- Or switch to lower-traffic model:
  ```bash
  GEMINI_MODEL=gemini-1.5-flash  # Faster, higher quota
  ```

---

### 7. ❌ Permission Denied on /data Volume
**Symptom:**
```
ERROR: mkdir /data: permission denied
```
**Fix:**
```bash
# Remove volume and recreate
docker compose down -v
docker compose up --build
```

---

## 📊 VERIFICATION CHECKLIST

Use this checklist to confirm full system functionality:

- [ ] **1. Services Start**
  - [ ] PostgreSQL healthy
  - [ ] Qdrant healthy
  - [ ] API healthy
  - [ ] RAG healthy
  - [ ] Web accessible at http://localhost:5173

- [ ] **2. Upload Flow**
  - [ ] PDF/TXT file uploads without error
  - [ ] Document appears in list
  - [ ] `processing_status: "completed"`
  - [ ] `pages_extracted` > 0

- [ ] **3. Embedding Flow**
  - [ ] Qdrant collection exists
  - [ ] `vectors_count` > 0 after upload
  - [ ] Vectors match number of chunks

- [ ] **4. Query Flow**
  - [ ] Query returns answer (not error)
  - [ ] Answer is coherent (uses Gemini)
  - [ ] Sources include relevant chunks
  - [ ] Chunk scores > 0.7

- [ ] **5. Persistence**
  - [ ] Restart containers: `docker compose restart`
  - [ ] Query same document again
  - [ ] Same results returned

- [ ] **6. Cleanup**
  - [ ] Delete document succeeds
  - [ ] Document removed from PostgreSQL
  - [ ] Vectors removed from Qdrant
  - [ ] Files removed from /data

---

## 🎯 SYSTEM STATUS INDICATORS

### ✅ SYSTEM READY
```bash
# All checks pass:
- curl http://localhost:8080/health → 200 OK
- curl http://localhost:8000/health → 200 OK
- Upload test.txt → processing_status: "completed"
- Query "test question" → coherent answer with sources
- docker compose logs shows no ERROR lines
```

### ⚠️ SYSTEM DEGRADED
```bash
# Some features work, but:
- Query returns fallback message (LLM misconfigured)
- Upload slow (reranker loading models)
- Intermittent connection errors (network congestion)
```

### ❌ SYSTEM FAILED
```bash
# Critical issues:
- Services won't start (check logs)
- Database connection refused (check credentials)
- Qdrant unreachable (check healthcheck)
- Upload fails immediately (check volumes)
```

---

## 🔧 ADVANCED DEBUGGING

### View Service Logs
```powershell
# All services
docker compose logs -f

# Specific service
docker compose logs -f rag
docker compose logs -f api

# Last 100 lines
docker compose logs --tail 100 rag
```

### Execute Commands Inside Containers
```powershell
# PostgreSQL query
docker compose exec postgres psql -U docsense -d docsense -c "SELECT COUNT(*) FROM documents;"

# Qdrant collection info
docker compose exec qdrant curl http://localhost:6333/collections/docsense_chunks

# Python shell in RAG
docker compose exec rag python -c "from app.core.settings import settings; print(settings.gemini_api_key)"
```

### Check Environment Variables
```powershell
# API service env
docker compose exec api env | grep -E "DB_|RAG_"

# RAG service env
docker compose exec rag env | grep -E "GEMINI|LLM|QDRANT"
```

---

## 📝 PRODUCTION DEPLOYMENT NOTES

### Before Going to Production:

1. **Change Passwords:**
   ```bash
   POSTGRES_PASSWORD=<strong-random-password>
   DB_PASSWORD=<strong-random-password>
   ```

2. **Enable SSL for PostgreSQL:**
   ```bash
   DB_SSLMODE=require
   ```

3. **Set Production Environment:**
   ```bash
   APP_ENV=production
   RAG_ENV=production
   ```

4. **Configure Firebase Auth:**
   ```bash
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=...
   VITE_FIREBASE_PROJECT_ID=...
   VITE_FIREBASE_APP_ID=...
   ```

5. **Enable Qdrant Authentication:**
   ```bash
   QDRANT__SERVICE__API_KEY=<strong-random-key>
   ```

6. **Set Resource Limits:**
   - Edit `docker-compose.yml` to add CPU/memory limits
   - Monitor with `docker stats`

7. **Set Up Backups:**
   - PostgreSQL: `pg_dump` scheduled via cron
   - Qdrant: Snapshot via API
   - Files: Rsync /data volume

---

## 🎉 FINAL VALIDATION

Run this script to validate everything:

```powershell
# validate.ps1
Write-Host "🚀 DocSense System Validation" -ForegroundColor Cyan

# 1. Health checks
Write-Host "`n1️⃣ Checking service health..." -ForegroundColor Yellow
$api = (curl -s http://localhost:8080/health | ConvertFrom-Json).status
$rag = (curl -s http://localhost:8000/health | ConvertFrom-Json).status
Write-Host "API: $api | RAG: $rag"

# 2. Upload test
Write-Host "`n2️⃣ Uploading test document..." -ForegroundColor Yellow
$upload = curl -X POST http://localhost:8080/api/documents -F "file=@test.txt" -F "title=Test" | ConvertFrom-Json
$docId = $upload.id
Write-Host "Document ID: $docId"

# 3. Wait for processing
Write-Host "`n3️⃣ Waiting for processing..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# 4. Query test
Write-Host "`n4️⃣ Testing query..." -ForegroundColor Yellow
$query = curl -X POST http://localhost:8080/api/query -H "Content-Type: application/json" -d '{"query":"test"}' | ConvertFrom-Json
Write-Host "Answer: " $query.answer.Substring(0, 100) "..."

# 5. Cleanup
Write-Host "`n5️⃣ Cleaning up..." -ForegroundColor Yellow
curl -X DELETE "http://localhost:8080/api/documents/$docId"

Write-Host "`n✅ SYSTEM STATUS: READY TO RUN" -ForegroundColor Green
```

---

## 🎊 SYSTEM STATUS: READY TO RUN

If all validations pass:

✅ **Docker Compose** launches all 5 services  
✅ **PostgreSQL** stores metadata  
✅ **Qdrant** stores embeddings  
✅ **Go API** handles uploads  
✅ **Python RAG** embeds and retrieves  
✅ **Gemini** generates answers with citations  
✅ **Frontend** provides UI  
✅ **Persistence** survives restart  
✅ **Cleanup** removes vectors on delete  

**Your DocSense system is production-ready! 🚀**
