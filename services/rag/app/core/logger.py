import logging
import sys
from contextvars import ContextVar
from typing import Any
request_id_ctx: ContextVar[str | None] = ContextVar("request_id", default=None)
class ContextLogger(logging.LoggerAdapter):
    def process(self, msg: str, kwargs: Any) -> tuple[str, dict[str, Any]]:
        request_id = request_id_ctx.get()
        if request_id:
            msg = f"[{request_id}] {msg}"
        return msg, kwargs
def get_logger(name: str) -> ContextLogger:
    logger = logging.getLogger(name)
    return ContextLogger(logger, {})
def setup_logging(level: str = "INFO") -> None:
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
    request_id_ctx.set(request_id)
def get_request_id() -> str | None:
    return request_id_ctx.get()
