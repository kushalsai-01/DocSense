from __future__ import annotations
from pydantic_settings import BaseSettings, SettingsConfigDict
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="", extra="ignore")
    agent_env: str = "development"
    agent_port: int = 8100
    agent_log_level: str = "INFO"
    rag_service_url: str = "http://rag:8000"
    rag_service_timeout: int = 60
    db_host: str = "postgres"
    db_port: int = 5432
    db_user: str = "docsense"
    db_password: str = "docsense_dev_password"
    db_name: str = "docsense"
    db_pool_min: int = 2
    db_pool_max: int = 10
    llm_provider: str = "openai"  # "openai" or "gemini"
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
    @property
    def database_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.db_user}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
        )
    @property
    def database_url_sync(self) -> str:
        return (
            f"postgresql://{self.db_user}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
        )
settings = Settings()
