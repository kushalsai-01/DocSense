# DocSense Pre-Deployment Checklist

## 🔴 CRITICAL - Must Fix Before Production

### 1. Security & Authentication
- [ ] **Configure Firebase Authentication** (currently using demo login)
  - Set up Firebase project: https://console.firebase.google.com
  - Update `apps/web/.env` with Firebase credentials
  - Remove demo login code from `AuthContext.tsx` and `AuthCard.tsx`
  
- [ ] **Change Default Passwords**
  - PostgreSQL: Change `docsense_secure_password_change_in_production`
  - Update in `infra/compose/env/postgres.env` and `api.env`

- [ ] **Add JWT Secret**
  - Generate secure JWT secret for API authentication
  - Add to `api.env`

- [ ] **Rate Limiting**
  - Add API rate limits to prevent abuse
  - Implement per-user query limits

### 2. Gemini API Configuration
- [ ] **Upgrade Gemini API Key**
  - Current key hit free tier rate limits (429 errors)
  - Get production API key with higher quota: https://ai.google.dev/pricing
  - Or switch to paid tier for current key
  - Update in `infra/compose/env/rag.env`

### 3. Data Persistence
- [ ] **Configure Volume Backups**
  - PostgreSQL data: `postgres_data` volume
  - Qdrant data: `qdrant_data` volume
  - Document storage: `api_data` volume
  - Set up automated backup strategy

### 4. Environment Configuration
- [ ] **Set Production Environment**
  - Change `APP_ENV=production` in all .env files
  - Change `RAG_ENV=production` in rag.env
  - Disable debug logging

- [ ] **CORS Configuration**
  - Update allowed origins in API
  - Remove `*` wildcard, specify exact domains

### 5. Docker Configuration
- [ ] **Update Restart Policies**
  - Verify all services have `restart: unless-stopped` (already set ✓)

- [ ] **Resource Limits**
  - Add memory/CPU limits to prevent resource exhaustion
  - Example: 2GB for RAG service, 1GB for API

### 6. SSL/TLS & Domain
- [ ] **Set Up Reverse Proxy**
  - Add Nginx/Traefik for SSL termination
  - Configure Let's Encrypt certificates
  - Map to your domain

- [ ] **Update Frontend URLs**
  - Change `VITE_API_PROXY_TARGET` to production API URL
  - Update API base URL in frontend

### 7. Monitoring & Logging
- [ ] **Add Health Monitoring**
  - Set up monitoring (Prometheus + Grafana)
  - Configure alerts for service downtime
  - Add log aggregation (ELK stack or similar)

- [ ] **Error Tracking**
  - Add Sentry or similar for error tracking
  - Track RAG query failures

### 8. Performance Optimization
- [ ] **Database Indexing**
  - Verify indexes on frequently queried columns (already set ✓)
  - Add query performance monitoring

- [ ] **Qdrant Optimization**
  - Enable HNSW on-disk indexing for large datasets
  - Configure quantization if needed

- [ ] **Frontend Optimization**
  - Build production bundle: `npm run build`
  - Enable compression (gzip/brotli)
  - Add CDN for static assets

### 9. Testing
- [ ] **Load Testing**
  - Test concurrent uploads
  - Test multiple simultaneous queries
  - Verify system under load

- [ ] **Integration Tests**
  - Test full upload → embed → query pipeline
  - Test edge cases (empty PDFs, large files)

- [ ] **Security Testing**
  - Run security scan (OWASP ZAP)
  - Test authentication flows
  - Verify file upload restrictions

### 10. Documentation
- [ ] **API Documentation**
  - Document all API endpoints
  - Add Swagger/OpenAPI spec

- [ ] **Deployment Guide**
  - Document production setup steps
  - Add troubleshooting guide

---

## 🟡 RECOMMENDED - Should Do

### Feature Enhancements
- [ ] Add support for more file formats (DOCX, TXT, MD)
- [ ] Implement document versioning
- [ ] Add document sharing between users
- [ ] Implement conversation history
- [ ] Add feedback mechanism (thumbs up/down on answers)

### RAG Improvements
- [ ] Add hybrid search (keyword + semantic)
- [ ] Implement query expansion
- [ ] Add confidence scores to answers
- [ ] Implement multi-document queries

### UI/UX
- [ ] Add dark mode support
- [ ] Improve citation visualization
- [ ] Add document preview
- [ ] Show embedding/query progress indicators

---

## 🟢 OPTIONAL - Nice to Have

- [ ] Multi-language support
- [ ] Export conversation as PDF/MD
- [ ] API key management for users
- [ ] Usage analytics dashboard
- [ ] Admin panel
- [ ] Webhook notifications

---

## Current Status

✅ **Working Features:**
- Document upload and ingestion
- Vector embeddings with sentence-transformers
- Semantic search with Qdrant
- LLM generation with Gemini 2.5 Flash
- Citation and source attribution
- Demo authentication
- Docker containerization

❌ **Blocking Issues for Production:**
1. **Firebase authentication not configured** (critical security issue)
2. **Gemini API free tier quota exhausted** (429 rate limit errors)
3. **Demo credentials hardcoded** (security vulnerability)
4. **No SSL/TLS** (HTTP only)
5. **No proper secrets management** (keys in .env files)

---

## Deployment Platforms

### Quick Deploy Options:

#### 1. **Railway.app** (Easiest)
- Pros: Docker Compose support, auto SSL, built-in PostgreSQL
- Cons: Storage limits on free tier
- Steps: Connect GitHub → Select docker-compose.yml → Add env vars

#### 2. **Google Cloud Run** (Scalable)
- Pros: Auto-scaling, pay-per-use
- Cons: Need separate Cloud SQL + Qdrant deployment
- Steps: Build containers → Push to GCR → Deploy

#### 3. **AWS ECS + RDS** (Enterprise)
- Pros: Full control, enterprise features
- Cons: Complex setup, higher cost
- Steps: Create ECS cluster → Deploy task definitions → Configure ALB

#### 4. **DigitalOcean App Platform** (Balanced)
- Pros: Managed PostgreSQL, simple deployment
- Cons: Need separate Qdrant hosting
- Steps: Connect repo → Configure components → Add database

#### 5. **Self-Hosted VPS** (Full Control)
- Pros: Complete control, one-time cost
- Cons: Maintenance overhead
- Recommended: Ubuntu 22.04 + 4GB RAM + Docker
- Steps: SSH → Clone repo → docker compose up -d

---

## Quick Production Setup (30 minutes)

```bash
# 1. Configure Firebase (5 min)
# - Create project at console.firebase.google.com
# - Enable Email/Password authentication
# - Copy config to apps/web/.env

# 2. Update Secrets (2 min)
cd infra/compose/env
# Edit postgres.env - change password
# Edit api.env - change DB password, add JWT secret
# Edit rag.env - verify Gemini API key

# 3. Remove Demo Auth (3 min)
# - Edit apps/web/src/auth/AuthContext.tsx
# - Remove DEMO_EMAIL, DEMO_PASSWORD constants
# - Remove demo user logic from login/signup

# 4. Build Production Images (5 min)
docker compose -f docker-compose.yml build --no-cache

# 5. Deploy to Server (10 min)
# - Upload to VPS/cloud
# - Configure nginx reverse proxy
# - Set up SSL with certbot
# - Start services: docker compose up -d

# 6. Verify (5 min)
curl https://yourdomain.com/api/health
curl https://yourdomain.com/health  # RAG service
```

---

## Post-Deployment Monitoring

```bash
# Check service status
docker ps

# View logs
docker logs docsense-api -f
docker logs docsense-rag -f

# Check Qdrant stats
curl http://localhost:6333/collections/docsense_chunks

# Monitor resource usage
docker stats
```

---

## Need Help?
- Deployment issues: Check logs with `docker logs <container>`
- Qdrant not storing: Verify embeddings with `/embed` endpoint
- Gemini errors: Check API key quota at https://ai.dev/rate-limit
- Authentication: Ensure Firebase config is correct
