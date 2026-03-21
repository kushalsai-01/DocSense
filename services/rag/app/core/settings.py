from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="", extra="ignore")

    # ── Environment ─────────────────────────────────────────────
    rag_env: str = "development"
    rag_port: int = 8000

    # ── Qdrant (vector database) ────────────────────────────────
    qdrant_url: str = "http://qdrant:6333"
    qdrant_api_key: str | None = None
    qdrant_collection: str = "docsense_chunks"
    qdrant_vector_size: int = 384

    # ── Embedding model ─────────────────────────────────────────
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"

    # ── LLM provider ────────────────────────────────────────────
    llm_provider: str = "openai"  # "openai", "gemini", or "local"
    openai_api_key: str | None = None
    openai_model: str = "gpt-4o-mini"
    openai_base_url: str | None = None
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.0-flash-exp"

    # ── Reranker ────────────────────────────────────────────────
    reranker_enabled: bool = True
    reranker_model: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"

    # ── Context budget ──────────────────────────────────────────
    max_context_tokens: int = 4000
    max_chunks: int = 5  # Raised to 5 (matches hybrid retriever top-N output)

    # ── Redis (BM25 index storage) ──────────────────────────────
    # WHY Redis?  BM25 indexes need to persist across service restarts
    # and be shared across multiple worker processes.  Redis provides
    # fast in-memory access (~1ms reads) with optional disk persistence.
    redis_url: str = "redis://redis:6379/0"

    # ── Cohere (reranking API) ──────────────────────────────────
    cohere_api_key: str | None = None

    # ── Pinecone (alternative vector backend) ───────────────────
    pinecone_api_key: str | None = None
    pinecone_index: str = "docsense-chunks"
    pinecone_environment: str = "us-east-1"
    vector_backend: str = "qdrant"  # "qdrant" or "pinecone"

    # ── RAGAS evaluation ─────────────────────────────────────────
    ragas_enabled: bool = False  # requires OPENAI_API_KEY

    # ── Query history (similar queries via Qdrant) ───────────────
    query_history_collection: str = "query_history"
    query_history_enabled: bool = True

    # ── Database (for analytics persistence) ─────────────────────
    database_url: str | None = None


settings = Settings()
