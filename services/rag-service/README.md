# DocSense RAG Service (Scaffold)

FastAPI service exposing RAG-oriented endpoints.

## Endpoints

- `POST /embed` – store chunk embeddings in Qdrant (placeholder embedding logic)
- `POST /query` – retrieve top-k chunks from Qdrant and return a placeholder answer

## Local dev

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Configure env via `.env` (see `.env.example`).

No model provider keys are used. This service is scaffolded for clean architecture, not accuracy.
