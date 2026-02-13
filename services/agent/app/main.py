from __future__ import annotations
import logging
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from app.api.routes import router
from app.core.config import settings
from app.core.logging import setup_logging, get_logger
from app.core.database import close_db
setup_logging(level=settings.agent_log_level)
logger = get_logger(__name__)
app = FastAPI(
    title="DocSense Agent Service",
    description="Agentic AI orchestration layer for intelligent document querying",
    version="1.0.0",
)
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error("unhandled_exception", method=request.method, path=request.url.path, error=str(exc))
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )
@app.on_event("startup")
async def on_startup() -> None:
    logger.info(
        "agent_service_starting",
        env=settings.agent_env,
        port=settings.agent_port,
        llm_provider=settings.llm_provider,
        rag_url=settings.rag_service_url,
    )
@app.on_event("shutdown")
async def on_shutdown() -> None:
    await close_db()
    logger.info("agent_service_stopped")
app.include_router(router, prefix="/agent")