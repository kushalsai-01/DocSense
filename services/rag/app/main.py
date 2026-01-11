from __future__ import annotations

from fastapi import FastAPI

from app.api.routes import router
from app.core.logger import setup_logging
from app.core.settings import settings
from app.infra.qdrant.collections import ensure_collection

# Setup logging
setup_logging(level="INFO" if settings.rag_env == "production" else "DEBUG")

app = FastAPI(title="DocSense RAG Service", version="0.1.0")


@app.on_event("startup")
def on_startup() -> None:
    # Ensure Qdrant collection exists (idempotent).
    ensure_collection()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(router)
