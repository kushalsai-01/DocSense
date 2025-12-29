# DocSense RAG

FastAPI service providing RAG endpoints for DocSense.

## HTTP API
- `POST /embed` – upsert chunk embeddings into Qdrant (placeholder embedding)
- `POST /query` – retrieve top-k chunks from Qdrant and return a placeholder answer
- `GET /health`

## Run locally
```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Env
- Copy `.env.example` to `.env`
- No model provider keys are used in this scaffold
