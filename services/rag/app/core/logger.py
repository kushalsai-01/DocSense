"""Structured logging for RAG service."""

import logging
import sys
from contextvars import ContextVar
from typing import Any

# Context variable for request ID (for correlation)
request_id_ctx: ContextVar[str | None] = ContextVar("request_id", default=None)


class ContextLogger(logging.LoggerAdapter):
    """Logger adapter that adds request ID to log records."""

    def process(self, msg: str, kwargs: Any) -> tuple[str, dict[str, Any]]:
        """Add request ID to log record if available."""
        request_id = request_id_ctx.get()
        if request_id:
            msg = f"[{request_id}] {msg}"
        return msg, kwargs


def get_logger(name: str) -> ContextLogger:
    """Get a logger instance with context support."""
    logger = logging.getLogger(name)
    return ContextLogger(logger, {})


def setup_logging(level: str = "INFO") -> None:
    """Configure logging for the application."""
    log_level = getattr(logging, level.upper(), logging.INFO)

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter(
            fmt="[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
    )

    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)
    root_logger.addHandler(handler)


def set_request_id(request_id: str) -> None:
    """Set request ID in context for logging correlation."""
    request_id_ctx.set(request_id)


def get_request_id() -> str | None:
    """Get current request ID from context."""
    return request_id_ctx.get()
