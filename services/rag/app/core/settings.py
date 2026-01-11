from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="", extra="ignore")

    rag_env: str = "development"
    rag_port: int = 8000

    qdrant_url: str = "http://qdrant:6333"
    qdrant_api_key: str | None = None

    qdrant_collection: str = "docsense_chunks"
    qdrant_vector_size: int = 384

    # Embedding model settings
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"

    # LLM settings (abstracted - supports OpenAI or local)
    llm_provider: str = "openai"  # "openai" or "local"
    openai_api_key: str | None = None
    openai_model: str = "gpt-4o-mini"
    openai_base_url: str | None = None  # For OpenAI-compatible APIs

    # Reranker settings
    reranker_enabled: bool = True
    reranker_model: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"

    # Context budget settings
    max_context_tokens: int = 4000
    max_chunks: int = 10


settings = Settings()
