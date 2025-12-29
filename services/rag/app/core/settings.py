from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="", extra="ignore")

    rag_env: str = "development"
    rag_port: int = 8000

    qdrant_url: str = "http://qdrant:6333"
    qdrant_api_key: str | None = None

    qdrant_collection: str = "docsense_chunks"
    qdrant_vector_size: int = 384


settings = Settings()
