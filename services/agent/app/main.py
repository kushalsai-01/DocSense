from __future__ import annotations
import logging
import os
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from app.api.routes import router
from app.core.config import settings
from app.core.logging import setup_logging, get_logger
from app.core.database import close_db

setup_logging(level=settings.agent_log_level)
logger = get_logger(__name__)

# ── LangSmith tracing setup ───────────────────────────────────────────
if settings.langchain_tracing_v2 == "true" and settings.langchain_api_key:
    os.environ["LANGCHAIN_TRACING_V2"] = "true"
    os.environ["LANGCHAIN_API_KEY"] = settings.langchain_api_key
    os.environ["LANGCHAIN_PROJECT"] = settings.langchain_project
    os.environ["LANGCHAIN_ENDPOINT"] = settings.langchain_endpoint
    logger.info("langsmith_tracing_enabled", project=settings.langchain_project)

app = FastAPI(
    title="DocSense Agent Service",
    description="Agentic AI orchestration layer for intelligent document querying",
    version="2.0.0",
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
        langsmith=settings.langchain_tracing_v2 == "true",
    )

@app.on_event("shutdown")
async def on_shutdown() -> None:
    await close_db()
    logger.info("agent_service_stopped")

@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}

app.include_router(router, prefix="/agent")