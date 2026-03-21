from __future__ import annotations
import logging
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from app.api.routes import router
from app.core.logger import setup_logging
from app.core.settings import settings
from app.infra.qdrant.collections import ensure_collection
setup_logging(level="INFO" if settings.rag_env == "production" else "DEBUG")
logger = logging.getLogger(__name__)
app = FastAPI(title="DocSense RAG Service", version="0.1.0")
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error("Unhandled exception on %s %s: %s", request.method, request.url.path, exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )
@app.on_event("startup")
def on_startup() -> None:
    logger.info("DocSense RAG service starting (env=%s, port=%d)", settings.rag_env, settings.rag_port)
    try:
        ensure_collection()
        logger.info("Qdrant collection '%s' ready", settings.qdrant_collection)
    except Exception as exc:
        logger.error("Failed to ensure Qdrant collection: %s", exc)
        raise

    if settings.query_history_enabled:
        try:
            from app.infra.qdrant.query_history import ensure_query_history_collection
            ensure_query_history_collection()
            logger.info("Query history collection ready")
        except Exception as exc:
            logger.warning("Query history collection setup failed: %s", exc)
@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
app.include_router(router)
