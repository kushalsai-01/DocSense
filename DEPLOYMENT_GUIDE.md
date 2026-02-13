# DocSense - Complete Deployment Guide

## 🎉 System Status: FULLY WORKING

All services are running and operational:
- ✅ Frontend (React + Vite)
- ✅ API Gateway (Go)
- ✅ RAG Service (Python + Gemini)
- ✅ Agent Service (Python + LangGraph + Gemini)
- ✅ PostgreSQL Database
- ✅ Qdrant Vector DB

---

## 🤖 RAG vs Agent Mode - Explained

### **RAG Mode** (Basic Pipeline)
```
User Query → Embed Query → Search Vectors → Retrieve Top-K → LLM Answer
```

**Best for:**
- Simple factual questions: "What is X?"
- Quick lookups: "Who is the author?"
- Direct information retrieval

**Example:**
```
Q: "What is artificial intelligence?"
A: Based on the documents, AI is... [retrieves top 5 chunks, generates answer]
```

---

### **Agent Mode** (Agentic AI Orchestration) 🆕

```
User Query → Planning → Strategy Selection → Multi-Step Execution → Synthesis → Evaluation
```

#### **Architecture:**

1. **Planning Phase** (Planner):
   - Analyzes query complexity
   - Detects intent (comparison, summary, extraction, etc.)
   - Selects optimal strategy
   - Creates execution plan with multiple steps

2. **Execution Phase** (Executor):
   - Runs ReAct loop (Reasoning + Acting)
   - Calls multiple tools based on plan
   - Handles failures and retries
   - Adapts strategy dynamically

3. **Synthesis Phase**:
   - Combines results from multiple retrievals
   - Creates comprehensive answer
   - Structures information logically

4. **Evaluation Phase** (Evaluator):
   - Validates answer quality
   - Checks groundedness (citations)
   - Verifies completeness
   - Self-corrects if needed

#### **Available Strategies:**

| Strategy | When Used | Example Query |
|----------|-----------|---------------|
| **direct** | Simple factual questions | "What is AI?" |
| **decompose** | Multi-part questions | "Explain chapters 1-3 and their connection" |
| **compare** | Comparison queries | "Compare CNN vs RNN" |
| **summarize** | Overview requests | "Summarize the entire course" |
| **extract** | Specific data extraction | "List all assignments mentioned" |

#### **Agent Tools:**

1. **search**: Vector search across documents
2. **compare**: Side-by-side comparison of concepts
3. **summarize**: Broad retrieval + synthesis
4. **extract**: Targeted data extraction

#### **Benefits Over Basic RAG:**

✅ **Query Understanding**: Breaks down complex questions  
✅ **Multi-Step Reasoning**: Executes multiple searches  
✅ **Context Aggregation**: Combines results intelligently  
✅ **Self-Evaluation**: Validates quality before responding  
✅ **Conversation Memory**: Tracks context across turns  
✅ **Adaptive Behavior**: Changes strategy based on query  

#### **Example Comparison:**

**Query:** "Compare the main topics in Chapter 1 and Chapter 2 of the AI course"

**RAG Mode:**
- Searches: "chapter 1 chapter 2"
- Returns: Top 5 random chunks mentioning both
- Answer: Generic, may miss specific comparisons

**Agent Mode:**
1. **Planning**: Detects "compare" intent, creates plan
2. **Execution**: 
   - Tool 1: `search("Chapter 1 topics")`
   - Tool 2: `search("Chapter 2 topics")`
   - Tool 3: `compare(results_1, results_2)`
3. **Synthesis**: Structures comparison with bullet points
4. **Evaluation**: Ensures both chapters are covered
5. **Answer**: Detailed side-by-side comparison

---

## 🚀 Deployment Steps

### **Option 1: Deploy to Hugging Face Spaces**

#### **Requirements:**
- Hugging Face account
- Docker support enabled (GPU Space)

#### **Steps:**

1. **Prepare Repository:**
```bash
cd DocSense

# Create Dockerfile for Hugging Face
cat > Dockerfile.huggingface << 'EOF'
FROM nginx:alpine

# Copy static files
COPY apps/web/dist /usr/share/nginx/html

# Copy Nginx config
COPY infra/nginx/nginx.conf /etc/nginx/nginx.conf

EXPOSE 7860

CMD ["nginx", "-g", "daemon off;"]
EOF

# Create requirements.txt for backend services
cat > requirements-backend.txt << 'EOF'
# Combine all service requirements
-r services/rag/requirements.txt
-r services/agent/requirements.txt
EOF
```

2. **Build Production Frontend:**
```bash
cd apps/web
npm run build
cd ../..
```

3. **Create Hugging Face Space:**
```bash
# Install HF CLI
pip install huggingface-hub

# Login
huggingface-cli login

# Create new Space
huggingface-cli repo create docsense --type space --space_sdk docker

# Clone Space repo
git clone https://huggingface.co/spaces/YOUR_USERNAME/docsense
cd docsense

# Copy files
cp -r ../DocSense/apps/web/dist ./frontend
cp -r ../DocSense/services ./
cp -r ../DocSense/infra ./
cp ../DocSense/docker-compose.yml ./
cp ../DocSense/Dockerfile.huggingface ./Dockerfile

# Create README.md
cat > README.md << 'EOF'
---
title: DocSense
emoji: 📚
colorFrom: blue
colorTo: purple
sdk: docker
pinned: false
---

# DocSense - AI-Powered Document Intelligence

Multi-agent RAG system with query planning and reasoning.
EOF

# Push to HF
git add .
git commit -m "Initial deployment"
git push
```

4. **Configure Environment Variables in HF Space:**
   - Go to Space Settings → Variables
   - Add:
     - `GEMINI_API_KEY`: Your Gemini API key
     - `DATABASE_URL`: PostgreSQL connection string
     - `QDRANT_URL`: Qdrant instance URL

---

### **Option 2: Deploy to Vercel**

#### **Frontend Only (Vercel) + Backend (Railway/Render)**

**Frontend (Vercel):**

1. **Prepare Frontend:**
```bash
cd apps/web

# Update API URLs in code
# Edit src/routes/AppHome.tsx:
# Change localhost URLs to production URLs

# Build
npm run build
```

2. **Deploy to Vercel:**
```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel

# Or via GitHub:
# 1. Push to GitHub
# 2. Connect repo in Vercel dashboard
# 3. Set build command: cd apps/web && npm run build
# 4. Set output directory: apps/web/dist
```

3. **Configure Environment Variables in Vercel:**
   - Go to Project Settings → Environment Variables
   - Add:
     - `VITE_API_URL`: Your backend API URL
     - `VITE_RAG_URL`: Your RAG service URL
     - `VITE_AGENT_URL`: Your Agent service URL

**Backend Services (Railway/Render):**

**Option A: Railway**

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Create project
railway init

# Deploy services
railway up --service api -d services/api
railway up --service rag -d services/rag
railway up --service agent -d services/agent

# Add environment variables in Railway dashboard
```

**Option B: Render**

1. **Create render.yaml:**
```yaml
services:
  - type: web
    name: docsense-api
    env: go
    buildCommand: cd services/api && go build -o api cmd/api/main.go
    startCommand: ./services/api/api
    envVars:
      - key: DATABASE_URL
        sync: false
      - key: QDRANT_URL
        sync: false

  - type: web
    name: docsense-rag
    env: python
    buildCommand: cd services/rag && pip install -r requirements.txt
    startCommand: cd services/rag && uvicorn app.main:app --host 0.0.0.0 --port $PORT
    envVars:
      - key: GEMINI_API_KEY
        sync: false

  - type: web
    name: docsense-agent
    env: python
    buildCommand: cd services/agent && pip install -r requirements.txt
    startCommand: cd services/agent && uvicorn app.main:app --host 0.0.0.0 --port $PORT
    envVars:
      - key: GEMINI_API_KEY
        sync: false
      - key: DATABASE_URL
        sync: false

databases:
  - name: docsense-postgres
    databaseName: docsense
    user: docsense

  - name: qdrant
    dockerfilePath: ./infra/qdrant/Dockerfile
```

2. **Push to GitHub and connect in Render dashboard**

---

### **Option 3: Full Docker Deployment (Single VPS)**

**For: DigitalOcean, AWS EC2, Google Cloud VM**

1. **Prepare Server:**
```bash
# SSH into server
ssh user@your-server-ip

# Install Docker & Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

2. **Clone Repository:**
```bash
git clone https://github.com/YOUR_USERNAME/docsense
cd docsense
```

3. **Configure Environment:**
```bash
# Copy example env files
cp infra/compose/env/api.env.example infra/compose/env/api.env
cp infra/compose/env/rag.env.example infra/compose/env/rag.env
cp infra/compose/env/agent.env.example infra/compose/env/agent.env

# Edit with your values
nano infra/compose/env/rag.env
# Add: GEMINI_API_KEY=your_key_here

nano infra/compose/env/agent.env
# Add: GEMINI_API_KEY=your_key_here
```

4. **Deploy:**
```bash
# Build and start all services
docker compose up -d --build

# Check status
docker compose ps

# View logs
docker compose logs -f
```

5. **Setup Nginx Reverse Proxy:**
```bash
# Install Nginx
sudo apt install nginx

# Create config
sudo nano /etc/nginx/sites-available/docsense

# Add:
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:5173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /api/ {
        proxy_pass http://localhost:8080/api/;
    }

    location /rag/ {
        proxy_pass http://localhost:8000/;
    }

    location /agent/ {
        proxy_pass http://localhost:8100/agent/;
    }
}

# Enable site
sudo ln -s /etc/nginx/sites-available/docsense /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Setup SSL with Certbot
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## 🔐 Adding JWT Authentication

### **1. Update Go API:**

```go
// services/api/internal/transport/http/middleware/auth.go
package middleware

import (
    "net/http"
    "strings"
    "github.com/gin-gonic/gin"
    "github.com/golang-jwt/jwt/v5"
)

func JWTAuth(secret string) gin.HandlerFunc {
    return func(c *gin.Context) {
        authHeader := c.GetHeader("Authorization")
        if authHeader == "" {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "no authorization header"})
            c.Abort()
            return
        }

        tokenString := strings.TrimPrefix(authHeader, "Bearer ")
        token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
            return []byte(secret), nil
        })

        if err != nil || !token.Valid {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
            c.Abort()
            return
        }

        if claims, ok := token.Claims.(jwt.MapClaims); ok {
            c.Set("user_id", claims["sub"])
            c.Set("email", claims["email"])
        }

        c.Next()
    }
}
```

### **2. Update React Frontend:**

```typescript
// apps/web/src/auth/useAuth.ts
export function useAuth() {
    const getToken = async () => {
        const user = auth.currentUser
        if (!user) return null
        return await user.getIdToken()
    }

    const authenticatedFetch = async (url: string, options: RequestInit = {}) => {
        const token = await getToken()
        return fetch(url, {
            ...options,
            headers: {
                ...options.headers,
                Authorization: `Bearer ${token}`,
            },
        })
    }

    return { authenticatedFetch }
}
```

---

## 📊 Monitoring & Logs

```bash
# View all logs
docker compose logs -f

# View specific service
docker compose logs -f agent

# Check resource usage
docker stats

# Restart service
docker compose restart agent

# Scale services
docker compose up -d --scale rag=2
```

---

## 🎯 Quick Test Script

```bash
# Test RAG Pipeline
curl -X POST http://localhost:8000/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is AI?",
    "user_id": "00000000-0000-0000-0000-000000000001",
    "top_k": 5
  }'

# Test Agent Pipeline
curl -X POST http://localhost:8100/agent/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Compare the topics in Chapter 1 and Chapter 2",
    "user_id": "00000000-0000-0000-0000-000000000001",
    "session_id": "test-session-1",
    "enable_planning": true
  }'
```

---

## ✅ Deployment Checklist

- [ ] Update all localhost URLs to production URLs
- [ ] Configure environment variables (API keys, DB connections)
- [ ] Setup SSL certificates (Let's Encrypt)
- [ ] Configure CORS for production domains
- [ ] Setup database backups
- [ ] Configure monitoring (Prometheus/Grafana)
- [ ] Setup error tracking (Sentry)
- [ ] Enable rate limiting
- [ ] Configure CDN for static assets
- [ ] Setup CI/CD pipeline (GitHub Actions)
- [ ] Write API documentation (Swagger)
- [ ] Setup staging environment
- [ ] Perform load testing
- [ ] Configure log aggregation (ELK/Loki)

---

## 🎉 You're Ready!

**Current Status:**
- ✅ All services running locally
- ✅ Agent orchestration working
- ✅ Delete documents feature added
- ✅ RAG/Agent toggle functional

**Next Steps:**
1. Choose deployment platform (Vercel + Railway recommended)
2. Update API URLs in frontend
3. Configure production environment variables
4. Deploy and test!

Good luck! 🚀
