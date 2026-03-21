from __future__ import annotations

from dataclasses import dataclass
import os
from urllib.parse import urlparse


def _env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        return default


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass
class Settings:
    agent_env: str = "development"
    agent_port: int = 8100
    agent_log_level: str = "INFO"

    rag_service_url: str = "http://rag:8000"
    rag_service_timeout: int = 60

    database_url_env: str | None = None
    db_host: str = "postgres"
    db_port: int = 5432
    db_user: str = "docsense"
    db_password: str = "docsense_dev_password"
    db_name: str = "docsense"
    db_pool_min: int = 2
    db_pool_max: int = 10

    llm_provider: str = "openai"
    openai_api_key: str | None = None
    openai_model: str = "gpt-4o-mini"
    openai_base_url: str | None = None
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.0-flash-exp"

    max_reasoning_steps: int = 8
    max_sub_queries: int = 5
    default_top_k: int = 5
    enable_self_evaluation: bool = True
    enable_trace_logging: bool = True

    # LangSmith observability
    langchain_tracing_v2: str = "false"
    langchain_api_key: str | None = None
    langchain_project: str = "docsense"
    langchain_endpoint: str = "https://api.smith.langchain.com"

    def __post_init__(self) -> None:
        if not self.database_url_env:
            return

        parsed = urlparse(self.database_url_env)
        if parsed.hostname:
            self.db_host = parsed.hostname
        if parsed.port:
            self.db_port = parsed.port
        if parsed.username:
            self.db_user = parsed.username
        if parsed.password:
            self.db_password = parsed.password
        if parsed.path and parsed.path != "/":
            self.db_name = parsed.path.lstrip("/")

    @property
    def database_url(self) -> str:
        if self.database_url_env:
            return self.database_url_env.replace("postgresql://", "postgresql+asyncpg://", 1)
        return (
            f"postgresql+asyncpg://{self.db_user}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
        )

    @property
    def database_url_sync(self) -> str:
        if self.database_url_env:
            return self.database_url_env
        return (
            f"postgresql://{self.db_user}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
        )


settings = Settings(
    agent_env=os.getenv("AGENT_ENV", "development"),
    agent_port=_env_int("AGENT_PORT", _env_int("PORT", 8100)),
    agent_log_level=os.getenv("AGENT_LOG_LEVEL", "INFO"),
    rag_service_url=os.getenv("RAG_SERVICE_URL", "http://rag:8000"),
    rag_service_timeout=_env_int("RAG_SERVICE_TIMEOUT", 60),
    database_url_env=os.getenv("DATABASE_URL"),
    db_host=os.getenv("DB_HOST", "postgres"),
    db_port=_env_int("DB_PORT", 5432),
    db_user=os.getenv("DB_USER", "docsense"),
    db_password=os.getenv("DB_PASSWORD", "docsense_dev_password"),
    db_name=os.getenv("DB_NAME", "docsense"),
    db_pool_min=_env_int("DB_POOL_MIN", 2),
    db_pool_max=_env_int("DB_POOL_MAX", 10),
    llm_provider=os.getenv("LLM_PROVIDER", "openai"),
    openai_api_key=os.getenv("OPENAI_API_KEY"),
    openai_model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
    openai_base_url=os.getenv("OPENAI_BASE_URL"),
    gemini_api_key=os.getenv("GEMINI_API_KEY"),
    gemini_model=os.getenv("GEMINI_MODEL", "gemini-2.0-flash-exp"),
    max_reasoning_steps=_env_int("MAX_REASONING_STEPS", 8),
    max_sub_queries=_env_int("MAX_SUB_QUERIES", 5),
    default_top_k=_env_int("DEFAULT_TOP_K", 5),
    enable_self_evaluation=_env_bool("ENABLE_SELF_EVALUATION", True),
    enable_trace_logging=_env_bool("ENABLE_TRACE_LOGGING", True),
    langchain_tracing_v2=os.getenv("LANGCHAIN_TRACING_V2", "false"),
    langchain_api_key=os.getenv("LANGCHAIN_API_KEY"),
    langchain_project=os.getenv("LANGCHAIN_PROJECT", "docsense"),
    langchain_endpoint=os.getenv("LANGCHAIN_ENDPOINT", "https://api.smith.langchain.com"),
)
