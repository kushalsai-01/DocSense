# 📄 DocSense – AI-Powered Document Intelligence Platform (RAG)

DocSense is a **production-grade, full-stack AI document assistant** that enables users to upload documents and interact with them using natural language. It leverages **Retrieval-Augmented Generation (RAG)** to deliver accurate, context-aware answers grounded strictly in user-uploaded data.

Built with a **high-performance Go backend**, a **dedicated ML service**, and a **modern React frontend**, DocSense demonstrates real-world system design, scalable backend architecture, and applied AI engineering.

---

## 🚀 Key Features

- 📂 Multi-document upload and management  
- 🔍 Semantic search using vector embeddings  
- 🤖 RAG-based question answering (hallucination-resistant)  
- 🧠 Intelligent chunking, embedding, and retrieval pipeline  
- 🔐 Authentication with secure document isolation  
- ⚡ High-performance Go backend using Gin  
- 📊 Metadata-aware document retrieval  
- 🧩 Modular, microservice-friendly architecture  

---

## 🧠 How It Works (RAG Pipeline)

### 1. Document Ingestion
- Users upload PDFs or text documents  
- Documents are intelligently chunked  
- Metadata (document ID, user ID, chunk index) is stored  

### 2. Embedding Generation
- Text chunks are converted into vector embeddings  
- Stored in a vector database for fast semantic similarity search  

### 3. Query Processing
- User queries are embedded  
- Top-K relevant chunks are retrieved using cosine similarity  

### 4. Answer Generation
- Retrieved context + user query are passed to the LLM  
- Responses are strictly grounded in retrieved document content  

---

## 🏗️ System Architecture

### Backend (Go)
- REST APIs built with **Gin**
- Responsibilities:
  - Authentication and authorization
  - Document upload and metadata storage
  - Query orchestration and request handling
- Optimized for low latency and high concurrency  

### ML Service (FastAPI)
- Responsibilities:
  - Text chunking
  - Embedding generation
  - RAG prompt construction
- Isolated AI layer for scalability and easy replacement  

### Frontend (React)
- Clean, responsive user interface
- Features:
  - Document upload
  - Chat-based interaction
  - Conversation history
- Integrated with Firebase Authentication  

---

## 🛠️ Tech Stack

### Frontend
- React
- Tailwind CSS
- Firebase Authentication

### Backend
- Golang
- Gin
- RESTful APIs

### AI / ML
- Retrieval-Augmented Generation (RAG)
- Vector embeddings
- Prompt engineering

### Databases
- PostgreSQL  (metadata storage)
- Vector database (semantic search)

### DevOps
- Docker
- Environment-based configuration
- Service separation (Backend ↔ ML)

---

## 🔐 Security & Design Considerations

- User-level document isolation
- No cross-user data leakage
- Stateless backend services
- Secure environment-based secrets
- Scalable, microservice-ready architecture


## 🧪 Future Enhancements

- Streaming LLM responses
- Role-Based Access Control (RBAC)
- OCR support for scanned PDFs
- Hybrid search (BM25 + vector search)
- Multi-tenant SaaS deployment
